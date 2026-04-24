import { randomUUID } from 'node:crypto'
import dagre from '@dagrejs/dagre'
import type { EmbeddedWorkflow, NodeTypeDefinition, Workflow, WorkflowEdge, WorkflowNode } from '../../shared/workflow-types'
import { builtinNodeDefinitions } from '../../electron/services/builtin-nodes'
import type { BackendWorkflowStore } from '../storage/workflow-store'
import type { BackendPluginRegistry } from '../plugins/plugin-registry'
import type { ConnectionManager } from '../ws/connection-manager'
import type { ClientNodeCache } from './client-node-cache'
import { normalizeEmbeddedWorkflow } from '../../shared/embedded-workflow'

export interface ToolResult {
  success: boolean
  message: string
  data?: any
}

export interface WorkflowChanges {
  upsertNodes: WorkflowNode[]
  deleteNodeIds: string[]
  upsertEdges: WorkflowEdge[]
  deleteEdgeIds: string[]
}

interface SearchFilters {
  keyword?: string
  type?: string
  label?: string
  category?: string
  description?: string
}

interface ToolContext {
  args: any
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  changes: WorkflowChanges
}

interface ToolHandlerResult {
  result: ToolResult
  mutated: boolean
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
}

type ToolHandler = (ctx: ToolContext) => ToolHandlerResult

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

function hasSearchFilters(args: any): args is SearchFilters {
  return ['keyword', 'type', 'label', 'category', 'description']
    .some((key) => typeof args?.[key] === 'string' && args[key].trim())
}

function matchesNodeDefinition(def: any, args: SearchFilters): boolean {
  const keyword = normalizeText(args.keyword)
  const type = normalizeText(args.type)
  const label = normalizeText(args.label)
  const category = normalizeText(args.category)
  const description = normalizeText(args.description)

  if (keyword) {
    const haystack = [def.type, def.label, def.category, def.description].map(normalizeText).join('\n')
    if (!haystack.includes(keyword)) return false
  }
  if (type && !normalizeText(def.type).includes(type)) return false
  if (label && !normalizeText(def.label).includes(label)) return false
  if (category && !normalizeText(def.category).includes(category)) return false
  if (description && !normalizeText(def.description).includes(description)) return false
  return true
}

function buildNodeUsageNotes(def: any): string[] {
  const notes = [
    '写入节点 data 前先核对 properties 字段定义，不要臆造字段名。',
    '字符串字段支持变量引用，纯变量会保留原始类型，变量与文本混排会转成字符串。',
    '嵌套对象字段和数组项中的字符串字段也支持变量引用。',
    '上游节点输出优先使用 {{ __data__["节点ID"].字段路径 }}；上下文路径可用 {{ context.some.path }}。',
  ]

  if (def.type === 'run_code') {
    notes.push('run_code.code 是 JavaScript 代码，不要在 code 字段里写 {{ }} 插值。')
    notes.push('run_code 必须定义 main 函数，推荐写成 async function main({ params, context }) { ... }。执行器会调用 main，函数返回值会作为该节点输出。')
    notes.push('run_code 可通过 params 读取节点输入字段，也可通过 context 读取上游节点结果；应在 main 函数里 return 给下游消费的结构化结果。')
    notes.push('更新 run_code.code 后，要同步用 update_node 设置 data.outputs，声明返回对象的字段结构；否则变量选择器和下游字段映射无法准确感知输出。')
  }

  return notes
}

function buildNodeUsageExamples(def: any): Array<Record<string, any>> {
  if (def.type === 'run_code') {
    return [{
      scene: '在两个节点之间插入 JS 做结构映射',
      data: {
        code: 'async function main({ params, context }) {\n  const upstream = context["上游节点ID"] || {}\n  return { value: upstream.value, input: params.input }\n}',
        outputs: [
          { key: 'value', type: 'any' },
          { key: 'input', type: 'any' },
        ],
      },
    }]
  }
  return []
}

function emptyChanges(): WorkflowChanges {
  return {
    upsertNodes: [],
    deleteNodeIds: [],
    upsertEdges: [],
    deleteEdgeIds: [],
  }
}

function autoLayout(nodes: WorkflowNode[], edges: WorkflowEdge[]): WorkflowNode[] {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'LR', nodesep: 60, ranksep: 80 })

  for (const node of nodes) {
    g.setNode(node.id, { width: 200, height: 80 })
  }
  for (const edge of edges) {
    g.setEdge(edge.source, edge.target)
  }

  dagre.layout(g)
  return nodes.map((node) => {
    const pos = g.node(node.id)
    return {
      ...node,
      position: {
        x: pos.x - 100,
        y: pos.y - 40,
      },
    }
  })
}

function createNodeData(definition?: NodeTypeDefinition, overrideData?: Record<string, unknown>): Record<string, unknown> {
  const data: Record<string, unknown> = {}
  for (const prop of definition?.properties || []) {
    if (prop.default !== undefined) data[prop.key] = cloneJson(prop.default)
  }
  if (definition?.outputs?.length) {
    data.outputs = cloneJson(definition.outputs)
  }
  if (overrideData && typeof overrideData === 'object') {
    Object.assign(data, overrideData)
  }
  return data
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

interface WorkflowTarget {
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  hostNode?: WorkflowNode
}

export class ChatWorkflowToolExecutor {
  constructor(
    private workflowStore: BackendWorkflowStore,
    private pluginRegistry: BackendPluginRegistry,
    private clientNodeCache: ClientNodeCache,
    private connections: ConnectionManager,
  ) {}

  getAllNodeTypeDefinitions(): NodeTypeDefinition[] {
    const builtin = builtinNodeDefinitions as unknown as NodeTypeDefinition[]
    const serverPluginNodes = this.pluginRegistry.listWorkflowPlugins()
      .flatMap((plugin) => this.pluginRegistry.getWorkflowNodes(plugin.id).nodes)
    const clientPluginNodes = this.clientNodeCache.getAllNodes()
    return [...builtin, ...serverPluginNodes, ...clientPluginNodes]
  }

  async executeTool(name: string, args: any, workflowId: string, clientId?: string): Promise<ToolResult> {
    if (name === 'get_workflow') {
      return this.executeGetWorkflow(args)
    }

    const workflow = this.workflowStore.getWorkflow(workflowId)
    if (!workflow) {
      return { success: false, message: `工作流 ${workflowId} 不存在` }
    }

    let nodes = cloneJson(workflow.nodes)
    let edges = cloneJson(workflow.edges)
    const changes: WorkflowChanges = {
      upsertNodes: [],
      deleteNodeIds: [],
      upsertEdges: [],
      deleteEdgeIds: [],
    }

    const handler = this.getHandlers().get(name)
    if (!handler) {
      return { success: false, message: `未知工作流工具: ${name}` }
    }

    const handlerResult = handler({ args, nodes, edges, changes })
    nodes = handlerResult.nodes
    edges = handlerResult.edges

    if (handlerResult.mutated) {
      this.workflowStore.updateWorkflow(workflowId, { nodes, edges, updatedAt: Date.now() })
      this.notifyRenderer(workflowId, changes, clientId)
    }

    return handlerResult.result
  }

  private executeGetWorkflow(args: any): ToolResult {
    const workflowId = typeof args?.workflow_id === 'string'
      ? args.workflow_id
      : (typeof args?.workflowId === 'string' ? args.workflowId : '')
    if (!workflowId) return { success: false, message: '缺少必填参数: workflow_id' }

    const workflow = this.workflowStore.getWorkflow(workflowId)
    if (!workflow) return { success: false, message: `工作流 ${workflowId} 不存在` }

    const nodes = cloneJson(workflow.nodes)
    const edges = cloneJson(workflow.edges)
    const summarize = args?.summarize !== false

    if (summarize) {
      return {
        success: true,
        message: '工作流文件摘要',
        data: {
          workflow: {
            id: workflow.id,
            name: workflow.name,
            description: workflow.description,
            folderId: workflow.folderId,
            nodeCount: nodes.length,
            edgeCount: edges.length,
            createdAt: workflow.createdAt,
            updatedAt: workflow.updatedAt,
            nodes: nodes.map((n) => ({ id: n.id, type: n.type, label: n.label, nodeState: n.nodeState })),
            edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle, targetHandle: e.targetHandle })),
          },
        },
      }
    }

    return { success: true, message: '工作流文件完整数据', data: { workflow } }
  }

  private notifyRenderer(workflowId: string, changes: WorkflowChanges, clientId?: string): void {
    const payload = { workflowId, changes }
    if (clientId) {
      this.connections.sendToClient(clientId, { channel: 'workflow:updated', type: 'event', data: payload })
      return
    }
    this.connections.emit('workflow:updated', payload)
  }

  private resolveWorkflowTarget(ctx: ToolContext): WorkflowTarget | ToolResult {
    const embeddedInNodeId = typeof ctx.args?.embeddedInNodeId === 'string' ? ctx.args.embeddedInNodeId : ''
    if (!embeddedInNodeId) {
      return {
        nodes: ctx.nodes,
        edges: ctx.edges,
      }
    }

    const hostNode = ctx.nodes.find((node) => node.id === embeddedInNodeId)
    if (!hostNode) {
      return { success: false, message: `宿主节点 ${embeddedInNodeId} 不存在` }
    }

    const embeddedWorkflow = normalizeEmbeddedWorkflow(hostNode.data?.bodyWorkflow, () => randomUUID())
    return {
      nodes: cloneJson(embeddedWorkflow.nodes),
      edges: cloneJson(embeddedWorkflow.edges),
      hostNode,
    }
  }

  private commitWorkflowTarget(ctx: ToolContext, target: WorkflowTarget): { nodes: WorkflowNode[], edges: WorkflowEdge[] } {
    if (!target.hostNode) {
      return { nodes: target.nodes, edges: target.edges }
    }

    const embeddedWorkflow: EmbeddedWorkflow = {
      nodes: target.nodes,
      edges: target.edges,
    }
    const updatedHostNode: WorkflowNode = {
      ...target.hostNode,
      data: {
        ...target.hostNode.data,
        bodyWorkflow: embeddedWorkflow,
      },
    }
    const nextNodes = ctx.nodes.map((node) => (node.id === updatedHostNode.id ? updatedHostNode : node))
    ctx.changes.upsertNodes.push(updatedHostNode)
    return {
      nodes: nextNodes,
      edges: ctx.edges,
    }
  }

  private createNodesByDefinition(
    typeDef: NodeTypeDefinition,
    label?: string,
    data?: Record<string, unknown>,
  ): { rootNode: WorkflowNode, nodes: WorkflowNode[], edges: WorkflowEdge[] } {
    if (!typeDef.compound) {
      const rootNode: WorkflowNode = {
        id: randomUUID(),
        type: typeDef.type,
        label: label || typeDef.label,
        position: { x: 0, y: 0 },
        data: createNodeData(typeDef, data),
      }
      return { rootNode, nodes: [rootNode], edges: [] }
    }

    const roleMap = new Map<string, WorkflowNode>()
    const rootRole = typeDef.compound.rootRole || typeDef.compound.children[0]?.role
    if (!rootRole) {
      throw new Error(`节点类型 ${typeDef.type} 的 compound 缺少 rootRole`)
    }

    for (const childDef of typeDef.compound.children) {
      const isRoot = childDef.role === rootRole
      const childTypeDef = this.getAllNodeTypeDefinitions().find((d) => d.type === childDef.type)
      const baseLabel = childDef.label || childTypeDef?.label || childDef.type
      const node: WorkflowNode = {
        id: randomUUID(),
        type: childDef.type,
        label: isRoot ? (label || typeDef.label || baseLabel) : baseLabel,
        position: childDef.offset ? cloneJson(childDef.offset) : { x: 0, y: 0 },
        data: createNodeData(
          childTypeDef,
          isRoot
            ? data
            : (childDef.data as Record<string, unknown> | undefined),
        ),
        composite: {
          role: childDef.role,
          generated: !isRoot,
          hidden: !!childDef.hidden,
          scopeBoundary: !!childDef.scopeBoundary,
        },
      }
      roleMap.set(childDef.role, node)
    }

    const rootNode = roleMap.get(rootRole)
    if (!rootNode) {
      throw new Error(`节点类型 ${typeDef.type} 创建失败: 未生成根节点`)
    }

    rootNode.composite = {
      ...(rootNode.composite || {}),
      rootId: rootNode.id,
      parentId: null,
      generated: false,
      hidden: false,
    }

    for (const childDef of typeDef.compound.children) {
      const node = roleMap.get(childDef.role)
      if (!node || node.id === rootNode.id) continue
      const parentRole = childDef.parentRole || rootRole
      const parentNode = roleMap.get(parentRole)
      node.composite = {
        ...(node.composite || {}),
        rootId: rootNode.id,
        parentId: parentNode?.id || rootNode.id,
      }
    }

    const edges: WorkflowEdge[] = []
    for (const edgeDef of typeDef.compound.edges || []) {
      const sourceNode = roleMap.get(edgeDef.sourceRole)
      const targetNode = roleMap.get(edgeDef.targetRole)
      if (!sourceNode || !targetNode) continue
      edges.push({
        id: `e-${sourceNode.id}-${edgeDef.sourceHandle ?? 'default'}-${targetNode.id}-${edgeDef.targetHandle ?? 'default'}`,
        source: sourceNode.id,
        target: targetNode.id,
        sourceHandle: edgeDef.sourceHandle ?? null,
        targetHandle: edgeDef.targetHandle ?? null,
        composite: {
          rootId: rootNode.id,
          parentId: sourceNode.id,
          generated: true,
          hidden: !!edgeDef.hidden,
          locked: !!edgeDef.locked,
        },
      })
    }

    return { rootNode, nodes: Array.from(roleMap.values()), edges }
  }

  private getHandlers(): Map<string, ToolHandler> {
    return new Map<string, ToolHandler>([
      ['get_current_workflow', () => ({
        result: { success: false, message: 'get_current_workflow 只能通过 chat_tool interaction 在渲染进程执行' },
        mutated: false,
        nodes: [],
        edges: [],
      })],
      ['list_node_types', (ctx) => {
        const allTypes = this.getAllNodeTypeDefinitions()
        const categories = Array.from(new Set(allTypes.map((d) => d.category)))
        const filtered = ctx.args?.category ? allTypes.filter((d) => d.category === ctx.args.category) : allTypes
        return {
          result: { success: true, message: `共 ${filtered.length} 种节点类型`, data: { nodeTypes: filtered, categories } },
          mutated: false,
          nodes: ctx.nodes,
          edges: ctx.edges,
        }
      }],
      ['create_node', (ctx) => {
        const { type, label } = ctx.args || {}
        if (!type) return { result: { success: false, message: '缺少必填参数: type' }, mutated: false, nodes: ctx.nodes, edges: ctx.edges }
        const typeDef = this.getAllNodeTypeDefinitions().find((d) => d.type === type)
        if (!typeDef) {
          return {
            result: { success: false, message: `未知节点类型: ${type}` },
            mutated: false,
            nodes: ctx.nodes,
            edges: ctx.edges,
          }
        }
        const target = this.resolveWorkflowTarget(ctx)
        if ('success' in target) {
          return { result: target, mutated: false, nodes: ctx.nodes, edges: ctx.edges }
        }
        const created = this.createNodesByDefinition(typeDef, label, ctx.args?.data)
        target.nodes.push(...created.nodes)
        target.edges.push(...created.edges)
        let nextNodes = ctx.nodes
        let nextEdges = ctx.edges
        if (target.hostNode) {
          const committed = this.commitWorkflowTarget(ctx, target)
          nextNodes = committed.nodes
          nextEdges = committed.edges
        } else {
          ctx.changes.upsertNodes.push(...created.nodes)
          ctx.changes.upsertEdges.push(...created.edges)
          nextNodes = target.nodes
          nextEdges = target.edges
        }
        return {
          result: {
            success: true,
            message: `节点已创建: ${created.rootNode.label} (${created.rootNode.id})`,
            data: {
              nodeId: created.rootNode.id,
              createdNodeIds: created.nodes.map((node) => node.id),
              createdEdgeIds: created.edges.map((edge) => edge.id),
              embeddedInNodeId: target.hostNode?.id,
            },
          },
          mutated: true,
          nodes: nextNodes,
          edges: nextEdges,
        }
      }],
      ['update_node', (ctx) => {
        const { nodeId, data } = ctx.args || {}
        if (!nodeId) return { result: { success: false, message: '缺少必填参数: nodeId' }, mutated: false, nodes: ctx.nodes, edges: ctx.edges }
        const target = this.resolveWorkflowTarget(ctx)
        if ('success' in target) {
          return { result: target, mutated: false, nodes: ctx.nodes, edges: ctx.edges }
        }
        const idx = target.nodes.findIndex((n) => n.id === nodeId)
        if (idx === -1) return { result: { success: false, message: `节点 ${nodeId} 不存在` }, mutated: false, nodes: ctx.nodes, edges: ctx.edges }
        if (ctx.args?.label) target.nodes[idx].label = ctx.args.label
        if (data) target.nodes[idx].data = { ...target.nodes[idx].data, ...data }
        let nextNodes = ctx.nodes
        let nextEdges = ctx.edges
        if (target.hostNode) {
          const committed = this.commitWorkflowTarget(ctx, target)
          nextNodes = committed.nodes
          nextEdges = committed.edges
        } else {
          ctx.changes.upsertNodes.push(target.nodes[idx])
          nextNodes = target.nodes
          nextEdges = target.edges
        }
        return {
          result: { success: true, message: `节点已更新: ${nodeId}`, data: { node: target.nodes[idx], embeddedInNodeId: target.hostNode?.id } },
          mutated: true,
          nodes: nextNodes,
          edges: nextEdges,
        }
      }],
      ['delete_node', (ctx) => {
        const nodeId = ctx.args?.nodeId
        if (!nodeId) return { result: { success: false, message: '缺少必填参数: nodeId' }, mutated: false, nodes: ctx.nodes, edges: ctx.edges }
        const target = this.resolveWorkflowTarget(ctx)
        if ('success' in target) {
          return { result: target, mutated: false, nodes: ctx.nodes, edges: ctx.edges }
        }
        const idx = target.nodes.findIndex((n) => n.id === nodeId)
        if (idx === -1) return { result: { success: false, message: `节点 ${nodeId} 不存在` }, mutated: false, nodes: ctx.nodes, edges: ctx.edges }
        target.nodes.splice(idx, 1)
        const relatedEdges = target.edges.filter((e) => e.source === nodeId || e.target === nodeId)
        target.edges = target.edges.filter((e) => e.source !== nodeId && e.target !== nodeId)
        let nextNodes = ctx.nodes
        let nextEdges = ctx.edges
        if (target.hostNode) {
          const committed = this.commitWorkflowTarget(ctx, target)
          nextNodes = committed.nodes
          nextEdges = committed.edges
        } else {
          ctx.changes.deleteNodeIds.push(nodeId)
          ctx.changes.deleteEdgeIds.push(...relatedEdges.map((e) => e.id))
          nextNodes = target.nodes
          nextEdges = target.edges
        }
        return {
          result: { success: true, message: `节点 ${nodeId} 已删除，同时删除 ${relatedEdges.length} 条关联边`, data: { embeddedInNodeId: target.hostNode?.id } },
          mutated: true,
          nodes: nextNodes,
          edges: nextEdges,
        }
      }],
      ['create_edge', (ctx) => {
        const { source, target, sourceHandle, targetHandle } = ctx.args || {}
        if (!source || !target) return { result: { success: false, message: '缺少必填参数: source, target' }, mutated: false, nodes: ctx.nodes, edges: ctx.edges }
        const targetWorkflow = this.resolveWorkflowTarget(ctx)
        if ('success' in targetWorkflow) {
          return { result: targetWorkflow, mutated: false, nodes: ctx.nodes, edges: ctx.edges }
        }
        if (!targetWorkflow.nodes.find((n) => n.id === source)) return { result: { success: false, message: `源节点 ${source} 不存在` }, mutated: false, nodes: ctx.nodes, edges: ctx.edges }
        if (!targetWorkflow.nodes.find((n) => n.id === target)) return { result: { success: false, message: `目标节点 ${target} 不存在` }, mutated: false, nodes: ctx.nodes, edges: ctx.edges }
        const edgeId = `e-${source}-${sourceHandle || 'default'}-${target}-${targetHandle || 'default'}`
        const edge: WorkflowEdge = { id: edgeId, source, target, sourceHandle: sourceHandle || 'default', targetHandle: targetHandle || 'default' }
        targetWorkflow.edges.push(edge)
        let nextNodes = ctx.nodes
        let nextEdges = ctx.edges
        if (targetWorkflow.hostNode) {
          const committed = this.commitWorkflowTarget(ctx, targetWorkflow)
          nextNodes = committed.nodes
          nextEdges = committed.edges
        } else {
          ctx.changes.upsertEdges.push(edge)
          nextNodes = targetWorkflow.nodes
          nextEdges = targetWorkflow.edges
        }
        return {
          result: { success: true, message: `边已创建: ${edgeId}`, data: { edgeId, embeddedInNodeId: targetWorkflow.hostNode?.id } },
          mutated: true,
          nodes: nextNodes,
          edges: nextEdges,
        }
      }],
      ['delete_edge', (ctx) => {
        const edgeId = ctx.args?.edgeId
        if (!edgeId) return { result: { success: false, message: '缺少必填参数: edgeId' }, mutated: false, nodes: ctx.nodes, edges: ctx.edges }
        const target = this.resolveWorkflowTarget(ctx)
        if ('success' in target) {
          return { result: target, mutated: false, nodes: ctx.nodes, edges: ctx.edges }
        }
        const nextTargetEdges = target.edges.filter((e) => e.id !== edgeId)
        if (nextTargetEdges.length === target.edges.length) return { result: { success: false, message: `边 ${edgeId} 不存在` }, mutated: false, nodes: ctx.nodes, edges: ctx.edges }
        target.edges = nextTargetEdges
        let nextNodes = ctx.nodes
        let nextEdges = ctx.edges
        if (target.hostNode) {
          const committed = this.commitWorkflowTarget(ctx, target)
          nextNodes = committed.nodes
          nextEdges = committed.edges
        } else {
          ctx.changes.deleteEdgeIds.push(edgeId)
          nextNodes = target.nodes
          nextEdges = target.edges
        }
        return {
          result: { success: true, message: `边 ${edgeId} 已删除`, data: { embeddedInNodeId: target.hostNode?.id } },
          mutated: true,
          nodes: nextNodes,
          edges: nextEdges,
        }
      }],
      ['insert_node', (ctx) => {
        const { edgeId, type, label } = ctx.args || {}
        if (!edgeId || !type) return { result: { success: false, message: '缺少必填参数: edgeId, type' }, mutated: false, nodes: ctx.nodes, edges: ctx.edges }
        const target = this.resolveWorkflowTarget(ctx)
        if ('success' in target) {
          return { result: target, mutated: false, nodes: ctx.nodes, edges: ctx.edges }
        }
        const edge = target.edges.find((item) => item.id === edgeId)
        if (!edge) return { result: { success: false, message: `边 ${edgeId} 不存在` }, mutated: false, nodes: ctx.nodes, edges: ctx.edges }
        const typeDef = this.getAllNodeTypeDefinitions().find((d) => d.type === type)
        if (!typeDef) return { result: { success: false, message: `未知节点类型: ${type}` }, mutated: false, nodes: ctx.nodes, edges: ctx.edges }
        const created = this.createNodesByDefinition(typeDef, label, ctx.args?.data)
        const nodeId = created.rootNode.id
        const remainingEdges = target.edges.filter((item) => item.id !== edgeId)
        const edge1: WorkflowEdge = { id: `e-${edge.source}-${edge.sourceHandle || 'default'}-${nodeId}-default`, source: edge.source, target: nodeId, sourceHandle: edge.sourceHandle || 'default', targetHandle: 'default' }
        const edge2: WorkflowEdge = { id: `e-${nodeId}-default-${edge.target}-${edge.targetHandle || 'default'}`, source: nodeId, target: edge.target, sourceHandle: 'default', targetHandle: edge.targetHandle || 'default' }
        target.nodes.push(...created.nodes)
        target.edges = remainingEdges
        target.edges.push(...created.edges, edge1, edge2)
        let nextNodes = ctx.nodes
        let nextEdges = ctx.edges
        if (target.hostNode) {
          const committed = this.commitWorkflowTarget(ctx, target)
          nextNodes = committed.nodes
          nextEdges = committed.edges
        } else {
          ctx.changes.upsertNodes.push(...created.nodes)
          ctx.changes.deleteEdgeIds.push(edgeId)
          ctx.changes.upsertEdges.push(...created.edges, edge1, edge2)
          nextNodes = target.nodes
          nextEdges = target.edges
        }
        return {
          result: {
            success: true,
            message: `已在边 ${edgeId} 上插入节点 ${created.rootNode.label} (${nodeId})`,
            data: {
              nodeId,
              createdNodeIds: created.nodes.map((node) => node.id),
              createdEdgeIds: created.edges.map((item) => item.id).concat([edge1.id, edge2.id]),
              embeddedInNodeId: target.hostNode?.id,
            },
          },
          mutated: true,
          nodes: nextNodes,
          edges: nextEdges,
        }
      }],
      ['batch_update', (ctx) => {
        const operations = Array.isArray(ctx.args?.operations) && ctx.args.operations.length > 0
          ? ctx.args.operations
          : [
              ...(Array.isArray(ctx.args?.createNodes)
                ? ctx.args.createNodes.map((item: any) => ({ tool: 'create_node', args: item }))
                : []),
              ...(Array.isArray(ctx.args?.deleteNodeIds)
                ? ctx.args.deleteNodeIds.map((nodeId: string) => ({ tool: 'delete_node', args: { nodeId } }))
                : []),
              ...(Array.isArray(ctx.args?.createEdges)
                ? ctx.args.createEdges.map((item: any) => ({
                  tool: 'create_edge',
                  args: {
                    source: item.source ?? item.sourceId,
                    target: item.target ?? item.targetId,
                    sourceHandle: item.sourceHandle,
                    targetHandle: item.targetHandle,
                  },
                }))
                : []),
              ...(Array.isArray(ctx.args?.deleteEdgeIds)
                ? ctx.args.deleteEdgeIds.map((edgeId: string) => ({ tool: 'delete_edge', args: { edgeId } }))
                : []),
            ]

        if (operations.length === 0) {
          return {
            result: { success: false, message: '缺少批量操作内容：请传 operations，或旧格式 createNodes/deleteNodeIds/createEdges/deleteEdgeIds' },
            mutated: false,
            nodes: ctx.nodes,
            edges: ctx.edges,
          }
        }

        let nodes = ctx.nodes
        let edges = ctx.edges
        const batchChanges = emptyChanges()
        const batchResults: ToolResult[] = []

        for (const operation of operations) {
          const tool = typeof operation?.tool === 'string' ? operation.tool : ''
          if (!tool || tool === 'batch_update' || tool === 'get_workflow' || tool === 'get_current_workflow') {
            return {
              result: { success: false, message: `批量操作中断: 不支持的操作 ${String(tool || '(empty)')}`, data: { results: batchResults } },
              mutated: false,
              nodes: ctx.nodes,
              edges: ctx.edges,
            }
          }

          const handler = this.getHandlers().get(tool)
          if (!handler) {
            return {
              result: { success: false, message: `批量操作中断: 未知工具 ${tool}`, data: { results: batchResults } },
              mutated: false,
              nodes: ctx.nodes,
              edges: ctx.edges,
            }
          }

          const result = handler({
            args: operation.args || {},
            nodes,
            edges,
            changes: batchChanges,
          })
          batchResults.push(result.result)
          if (!result.result.success) {
            return {
              result: { success: false, message: `批量操作中断: ${result.result.message}`, data: { results: batchResults } },
              mutated: false,
              nodes: ctx.nodes,
              edges: ctx.edges,
            }
          }
          nodes = result.nodes
          edges = result.edges
        }

        ctx.changes.upsertNodes.push(...batchChanges.upsertNodes)
        ctx.changes.deleteNodeIds.push(...batchChanges.deleteNodeIds)
        ctx.changes.upsertEdges.push(...batchChanges.upsertEdges)
        ctx.changes.deleteEdgeIds.push(...batchChanges.deleteEdgeIds)

        return {
          result: { success: true, message: `批量操作完成，共 ${operations.length} 个操作`, data: { results: batchResults } },
          mutated: true,
          nodes,
          edges,
        }
      }],
      ['auto_layout', (ctx) => {
        const target = this.resolveWorkflowTarget(ctx)
        if ('success' in target) {
          return { result: target, mutated: false, nodes: ctx.nodes, edges: ctx.edges }
        }
        target.nodes = autoLayout(target.nodes, target.edges)
        let nextNodes = ctx.nodes
        let nextEdges = ctx.edges
        if (target.hostNode) {
          const committed = this.commitWorkflowTarget(ctx, target)
          nextNodes = committed.nodes
          nextEdges = committed.edges
        } else {
          ctx.changes.upsertNodes.push(...target.nodes)
          nextNodes = target.nodes
          nextEdges = target.edges
        }
        return {
          result: {
            success: true,
            message: `自动布局完成，${target.nodes.length} 个节点已重新排列`,
            data: { nodes: target.nodes, embeddedInNodeId: target.hostNode?.id },
          },
          mutated: true,
          nodes: nextNodes,
          edges: nextEdges,
        }
      }],
      ['search_nodes', (ctx) => {
        if (!hasSearchFilters(ctx.args)) {
          return { result: { success: false, message: '至少需要一个搜索条件：keyword/type/label/category/description' }, mutated: false, nodes: ctx.nodes, edges: ctx.edges }
        }
        const defs = new Map(this.getAllNodeTypeDefinitions().map((def) => [def.type, def]))
        const matches = ctx.nodes.filter((node) => matchesNodeDefinition({
          ...node,
          category: defs.get(node.type)?.category,
          description: defs.get(node.type)?.description,
        }, ctx.args))
        return {
          result: { success: true, message: `匹配到 ${matches.length} 个节点`, data: { nodes: matches } },
          mutated: false,
          nodes: ctx.nodes,
          edges: ctx.edges,
        }
      }],
      ['search_node_usage', (ctx) => {
        if (!hasSearchFilters(ctx.args)) {
          return { result: { success: false, message: '至少需要一个搜索条件：keyword/type/label/category/description' }, mutated: false, nodes: ctx.nodes, edges: ctx.edges }
        }
        const matches = this.getAllNodeTypeDefinitions().filter((def) => matchesNodeDefinition(def, ctx.args))
        return {
          result: {
            success: true,
            message: `匹配到 ${matches.length} 种节点类型`,
            data: {
              nodeTypes: matches.map((def) => ({
                ...def,
                variableSupport: {
                  stringFields: true,
                  nestedObjectFields: true,
                  arrayItemStringFields: true,
                  syntax: {
                    upstream: '{{ __data__["节点ID"].字段路径 }}',
                    context: '{{ context.some.path }}',
                  },
                },
                usageNotes: buildNodeUsageNotes(def),
                examples: buildNodeUsageExamples(def),
              })),
            },
          },
          mutated: false,
          nodes: ctx.nodes,
          edges: ctx.edges,
        }
      }],
    ])
  }
}
