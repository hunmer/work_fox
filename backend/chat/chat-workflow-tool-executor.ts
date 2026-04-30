import { randomUUID } from 'node:crypto'
import dagre from '@dagrejs/dagre'
import type { EmbeddedWorkflow, ExecutionLog, NodeTypeDefinition, OutputField, Workflow, WorkflowEdge, WorkflowNode } from '../../shared/workflow-types'
import { builtinNodeDefinitions } from '../../electron/services/builtin-nodes'
import type { BackendWorkflowStore } from '../storage/workflow-store'
import type { BackendPluginRegistry } from '../plugins/plugin-registry'
import type { ConnectionManager } from '../ws/connection-manager'
import type { ClientNodeCache } from './client-node-cache'
import { normalizeEmbeddedWorkflow } from '../../shared/embedded-workflow'
import type { BackendWorkflowExecutionManager } from '../workflow/execution-manager'
import type { BackendExecutionLogStore } from '../storage/execution-log-store'

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
    '变量引用中的节点 ID / 配置 key 统一使用双引号写法，不要写成单引号版本。',
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

function previewJson(value: unknown, maxLength = 500): string {
  try {
    const text = JSON.stringify(value)
    if (!text) return String(value)
    return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text
  } catch {
    return String(value)
  }
}

function normalizeHandleId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed || trimmed === 'default') return null
  return trimmed
}

function getEdgeId(source: string, sourceHandle: string | null, target: string, targetHandle: string | null): string {
  return `e-${source}-${sourceHandle ?? 'default'}-${target}-${targetHandle ?? 'default'}`
}

function sameHandle(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? null) === (b ?? null)
}

function validateCreateEdge(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  source: string,
  target: string,
  sourceHandle: string | null,
  targetHandle: string | null,
): ToolResult | null {
  if (source === target) {
    return { success: false, message: '不能创建节点到自身的连线' }
  }
  if (!nodes.find((n) => n.id === source)) {
    return { success: false, message: `源节点 ${source} 不存在` }
  }
  if (!nodes.find((n) => n.id === target)) {
    return { success: false, message: `目标节点 ${target} 不存在` }
  }

  const duplicate = edges.find((edge) =>
    edge.source === source
    && edge.target === target
    && sameHandle(edge.sourceHandle, sourceHandle)
    && sameHandle(edge.targetHandle, targetHandle),
  )
  if (duplicate) {
    return { success: false, message: `连线已存在: ${duplicate.id}`, data: { edgeId: duplicate.id } }
  }

  const occupiedTarget = edges.find((edge) =>
    edge.target === target && sameHandle(edge.targetHandle, targetHandle),
  )
  if (occupiedTarget) {
    return {
      success: false,
      message: `目标节点 ${target} 的输入连接点 ${targetHandle ?? 'default'} 已被连线 ${occupiedTarget.id} 占用，请先删除旧连线或选择其他输入连接点`,
      data: { existingEdgeId: occupiedTarget.id },
    }
  }

  return null
}

function buildBatchOperationHelp(operation: unknown, index: number, tool: string): { message: string, data: Record<string, unknown> } {
  const operationKeys = operation && typeof operation === 'object' ? Object.keys(operation as Record<string, unknown>) : []
  const reason = !tool
    ? '当前操作缺少 tool 字段，或 tool 不是字符串。'
    : `当前操作的 tool=${tool} 不允许在 batch_update 中执行。`
  const message = [
    `批量操作中断: 第 ${index + 1} 个操作不支持 (${tool || 'empty'})。`,
    reason,
    '请使用格式 { "tool": "create_node|update_node|delete_node|create_edge|delete_edge", "args": { ... } }。',
    '如果使用旧格式，请改传 createNodes/deleteNodeIds/createEdges/deleteEdgeIds。',
  ].join(' ')

  return {
    message,
    data: {
      failedOperationIndex: index,
      failedOperationNumber: index + 1,
      receivedTool: tool || null,
      receivedOperationType: Array.isArray(operation) ? 'array' : typeof operation,
      receivedOperationKeys: operationKeys,
      receivedOperationPreview: previewJson(operation),
      expectedOperationExample: { tool: 'update_node', args: { nodeId: '节点ID', data: { key: 'value' } } },
      supportedToolExamples: ['create_node', 'update_node', 'delete_node', 'create_edge', 'delete_edge'],
      unsupportedToolsInBatch: ['batch_update', 'get_workflow', 'get_current_workflow'],
    },
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

const OUTPUT_FIELD_TYPES = new Set(['string', 'number', 'boolean', 'object', 'any'])

function findInvalidVariableTemplate(value: string): string | null {
  if (/\{\{\s*__data__\['[^']+'\]/.test(value)) return '检测到 __data__ 使用了单引号节点 ID，请改成 {{ __data__["节点ID"].字段路径 }}'
  if (/\{\{\s*__inputs__\['[^']+'\]/.test(value)) return '检测到 __inputs__ 使用了单引号节点 ID，请改成 {{ __inputs__["节点ID"].字段路径 }}'
  if (/\{\{\s*__config__\['[^']+'\]\['[^']+'\]/.test(value)) return '检测到 __config__ 使用了单引号 key，请改成 {{ __config__["插件ID"]["key"] }}'
  return null
}

function validateOutputFields(value: unknown, path: string): string[] {
  if (!Array.isArray(value)) {
    return [`${path} 必须是数组`]
  }

  const errors: string[] = []
  value.forEach((field, index) => {
    const fieldPath = `${path}[${index}]`
    if (!isRecord(field)) {
      errors.push(`${fieldPath} 必须是对象`)
      return
    }

    if (typeof field.key !== 'string' || field.key.trim() === '') {
      errors.push(`${fieldPath}.key 必须是非空字符串`)
    }

    if (typeof field.type !== 'string' || !OUTPUT_FIELD_TYPES.has(field.type)) {
      errors.push(`${fieldPath}.type 必须是 string/number/boolean/object/any 之一`)
      return
    }

    if (field.type === 'object') {
      if ('value' in field && field.value !== undefined) {
        errors.push(`${fieldPath}.value 在 object 类型下不应设置`)
      }
      if (field.children !== undefined) {
        errors.push(...validateOutputFields(field.children, `${fieldPath}.children`))
      }
      return
    }

    if ('children' in field && field.children !== undefined) {
      errors.push(`${fieldPath}.children 仅 object 类型可设置`)
    }

    if ('value' in field && field.value !== undefined && typeof field.value !== 'string') {
      errors.push(`${fieldPath}.value 必须是字符串`)
      return
    }

    if (typeof field.value === 'string') {
      const variableError = findInvalidVariableTemplate(field.value)
      if (variableError) {
        errors.push(`${fieldPath}.value ${variableError}`)
      }
    }
  })

  return errors
}

interface WorkflowTarget {
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  hostNode?: WorkflowNode
}

export class ChatWorkflowToolExecutor {
  constructor(
    private workflowStore: BackendWorkflowStore,
    private executionManager: BackendWorkflowExecutionManager,
    private executionLogStore: BackendExecutionLogStore,
    private pluginRegistry: BackendPluginRegistry,
    private clientNodeCache: ClientNodeCache,
    private connections: ConnectionManager,
  ) {}

  async executeWorkflowAgentTool(name: string, args: any, ownerClientId = 'chat'): Promise<ToolResult> {
    switch (name) {
      case 'list_workflows':
        return this.executeListWorkflows(args)
      case 'search_workflow':
        return this.executeSearchWorkflow(args)
      case 'execute_workflow_sync':
        return this.executeWorkflowByIdSync(args, ownerClientId)
      case 'execute_workflow_async':
        return this.executeWorkflowByIdAsync(args, ownerClientId)
      case 'get_workflow_result':
        return this.getWorkflowExecutionResult(args)
      default:
        return { success: false, message: `未知工作流执行工具: ${name}` }
    }
  }

  private executeListWorkflows(args: any): ToolResult {
    const rawPage = typeof args?.page === 'number' ? args.page : 1
    const rawPageSize = typeof args?.page_size === 'number' ? args.page_size : 10
    const page = Math.max(1, Math.floor(rawPage))
    const pageSize = Math.min(50, Math.max(1, Math.floor(rawPageSize)))

    const workflows = this.workflowStore
      .listWorkflows()
      .sort((a, b) => b.updatedAt - a.updatedAt)

    const total = workflows.length
    const totalPages = Math.max(1, Math.ceil(total / pageSize))
    const currentPage = Math.min(page, totalPages)
    const start = (currentPage - 1) * pageSize
    const items = workflows
      .slice(start, start + pageSize)
      .map((workflow) => {
        const startNode = workflow.nodes.find((node) => node.type === 'start')
        const inputFields = Array.isArray(startNode?.data?.inputFields)
          ? cloneJson(startNode.data.inputFields as OutputField[])
          : []

        return {
          workflow_id: workflow.id,
          title: workflow.name,
          description: workflow.description ?? '',
          inputFields,
          updatedAt: workflow.updatedAt,
        }
      })

    return {
      success: true,
      message: `第 ${currentPage} 页，共 ${totalPages} 页`,
      data: {
        page: currentPage,
        page_size: pageSize,
        total,
        total_pages: totalPages,
        workflows: items,
      },
    }
  }

  private executeSearchWorkflow(args: any): ToolResult {
    const keyword = typeof args?.keyword === 'string' ? args.keyword.trim().toLowerCase() : ''
    if (!keyword) {
      return { success: false, message: '缺少必填参数: keyword' }
    }

    const rawPage = typeof args?.page === 'number' ? args.page : 1
    const rawPageSize = typeof args?.page_size === 'number' ? args.page_size : 10
    const page = Math.max(1, Math.floor(rawPage))
    const pageSize = Math.min(50, Math.max(1, Math.floor(rawPageSize)))

    const workflows = this.workflowStore.listWorkflows()
    const matches = workflows
      .filter((workflow) => {
        const haystack = [workflow.name, workflow.description ?? '']
          .join('\n')
          .toLowerCase()
        return haystack.includes(keyword)
      })
      .map((workflow) => {
        const startNode = workflow.nodes.find((node) => node.type === 'start')
        const inputFields = Array.isArray(startNode?.data?.inputFields)
          ? cloneJson(startNode.data.inputFields as OutputField[])
          : []
        return {
          workflow_id: workflow.id,
          title: workflow.name,
          description: workflow.description ?? '',
          inputFields,
          updatedAt: workflow.updatedAt,
        }
      })
      .sort((a, b) => b.updatedAt - a.updatedAt)

    const total = matches.length
    const totalPages = Math.max(1, Math.ceil(total / pageSize))
    const currentPage = Math.min(page, totalPages)
    const start = (currentPage - 1) * pageSize
    const items = matches.slice(start, start + pageSize)

    return {
      success: true,
      message: `找到 ${total} 个匹配工作流，第 ${currentPage} 页，共 ${totalPages} 页`,
      data: {
        page: currentPage,
        page_size: pageSize,
        total,
        total_pages: totalPages,
        workflows: items,
      },
    }
  }

  private async executeWorkflowByIdSync(args: any, ownerClientId: string): Promise<ToolResult> {
    const workflowId = this.resolveWorkflowId(args)
    if (!workflowId) {
      return { success: false, message: '缺少必填参数: workflow_id' }
    }
    const workflow = this.workflowStore.getWorkflow(workflowId)
    if (!workflow) {
      return { success: false, message: `工作流不存在: ${workflowId}` }
    }

    const input = isRecord(args?.input) ? args.input : {}
    const result = await this.executionManager.execute({ workflowId, input }, ownerClientId)
    const recovery = this.executionManager.getExecutionRecovery({ workflowId, executionId: result.executionId }, ownerClientId)
    const log = recovery.execution?.log ?? this.findExecutionLog(workflowId, result.executionId)

    return {
      success: true,
      message: `工作流已执行完成，状态: ${log?.status ?? result.status}`,
      data: {
        workflow_id: workflowId,
        executionId: result.executionId,
        status: log?.status ?? result.status,
        steps: log ? this.formatExecutionSteps(log) : [],
      },
    }
  }

  private async executeWorkflowByIdAsync(args: any, ownerClientId: string): Promise<ToolResult> {
    const workflowId = this.resolveWorkflowId(args)
    if (!workflowId) {
      return { success: false, message: '缺少必填参数: workflow_id' }
    }
    const workflow = this.workflowStore.getWorkflow(workflowId)
    if (!workflow) {
      return { success: false, message: `工作流不存在: ${workflowId}` }
    }

    const input = isRecord(args?.input) ? args.input : {}
    const result = await this.executionManager.execute({ workflowId, input }, ownerClientId)
    return {
      success: true,
      message: '工作流已开始异步执行',
      data: {
        workflow_id: workflowId,
        executionId: result.executionId,
        status: result.status,
      },
    }
  }

  private async getWorkflowExecutionResult(args: any): Promise<ToolResult> {
    const executionId = typeof args?.execution_id === 'string' ? args.execution_id : ''
    if (!executionId) {
      return { success: false, message: '缺少必填参数: execution_id' }
    }

    const workflowId = this.resolveWorkflowId(args)
    if (workflowId) {
      const log = this.findExecutionLog(workflowId, executionId)
      if (log) {
        const nodeId = typeof args?.node_id === 'string' ? args.node_id : undefined
        return {
          success: true,
          message: `执行状态: ${log.status}`,
          data: {
            workflow_id: workflowId,
            executionId,
            status: log.status,
            steps: this.formatExecutionSteps(log, nodeId),
          },
        }
      }
    }

    const workflows = this.workflowStore.listWorkflows()
    for (const workflow of workflows) {
      const log = this.findExecutionLog(workflow.id, executionId)
      if (!log) continue
      const nodeId = typeof args?.node_id === 'string' ? args.node_id : undefined
      return {
        success: true,
        message: `执行状态: ${log.status}`,
        data: {
          workflow_id: workflow.id,
          executionId,
          status: log.status,
          steps: this.formatExecutionSteps(log, nodeId),
        },
      }
    }

    return { success: false, message: `未找到执行记录: ${executionId}` }
  }

  private resolveWorkflowId(args: any): string {
    if (typeof args?.workflow_id === 'string') return args.workflow_id
    if (typeof args?.workflowId === 'string') return args.workflowId
    return ''
  }

  private findExecutionLog(workflowId: string, executionId: string): ExecutionLog | null {
    return this.executionLogStore.list(workflowId).find((item) => item.id === executionId) ?? null
  }

  private formatExecutionSteps(log: ExecutionLog, nodeId?: string) {
    return log.steps
      .filter((step) => !nodeId || step.nodeId === nodeId)
      .map((step) => ({
        nodeId: step.nodeId,
        nodeLabel: step.nodeLabel,
        status: step.status,
        startedAt: step.startedAt,
        finishedAt: step.finishedAt,
        duration: step.finishedAt ? step.finishedAt - step.startedAt : undefined,
        input: step.input,
        output: step.output,
        error: step.error,
      }))
  }

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

  private validateUpdateNodeData(node: WorkflowNode, data: unknown): string[] {
    if (!isRecord(data)) {
      return ['data 必须是对象']
    }

    const errors: string[] = []
    const nodeDef = this.getAllNodeTypeDefinitions().find((def) => def.type === node.type)
    const propertyKeys = new Set(nodeDef?.properties.map((prop) => prop.key) ?? [])

    for (const [key, value] of Object.entries(data)) {
      if (typeof value === 'string') {
        const variableError = findInvalidVariableTemplate(value)
        if (variableError) errors.push(`data.${key} ${variableError}`)
      }

      if (node.type === 'start' && key === 'outputs' && value !== undefined) {
        errors.push('开始节点不支持 data.outputs；请把入口参数写到 data.inputFields')
        continue
      }

      if (node.type === 'end' && key === 'inputFields' && value !== undefined) {
        errors.push('结束节点不支持 data.inputFields；请把返回值写到 data.outputs')
        continue
      }

      if ((key === 'outputs' || key === 'inputFields') && value !== undefined) {
        errors.push(...validateOutputFields(value, `data.${key}`))
        continue
      }

      if (Array.isArray(value)) {
        value.forEach((item, index) => {
          if (typeof item === 'string') {
            const variableError = findInvalidVariableTemplate(item)
            if (variableError) errors.push(`data.${key}[${index}] ${variableError}`)
          }
        })
        continue
      }

      if (isRecord(value)) {
        for (const [nestedKey, nestedValue] of Object.entries(value)) {
          if (typeof nestedValue !== 'string') continue
          const variableError = findInvalidVariableTemplate(nestedValue)
          if (variableError) errors.push(`data.${key}.${nestedKey} ${variableError}`)
        }
      }

      if (key === 'outputs' || key === 'inputFields' || key === 'bodyWorkflow' || propertyKeys.has(key)) continue

      if (node.type === 'end') {
        errors.push(`结束节点不支持字段 data.${key}；请把返回值写到 data.outputs`)
      }
    }

    return errors
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
        if (data !== undefined) {
          const errors = this.validateUpdateNodeData(target.nodes[idx], data)
          if (errors.length) {
            return {
              result: {
                success: false,
                message: `update_node 参数校验失败:\n- ${errors.join('\n- ')}`,
              },
              mutated: false,
              nodes: ctx.nodes,
              edges: ctx.edges,
            }
          }
        }
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
        const { source, target } = ctx.args || {}
        const sourceHandle = normalizeHandleId(ctx.args?.sourceHandle)
        const targetHandle = normalizeHandleId(ctx.args?.targetHandle)
        if (!source || !target) return { result: { success: false, message: '缺少必填参数: source, target' }, mutated: false, nodes: ctx.nodes, edges: ctx.edges }
        const targetWorkflow = this.resolveWorkflowTarget(ctx)
        if ('success' in targetWorkflow) {
          return { result: targetWorkflow, mutated: false, nodes: ctx.nodes, edges: ctx.edges }
        }
        const validationError = validateCreateEdge(targetWorkflow.nodes, targetWorkflow.edges, source, target, sourceHandle, targetHandle)
        if (validationError) return { result: validationError, mutated: false, nodes: ctx.nodes, edges: ctx.edges }
        const edgeId = getEdgeId(source, sourceHandle, target, targetHandle)
        const edge: WorkflowEdge = { id: edgeId, source, target, sourceHandle, targetHandle }
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
        const edge1SourceHandle = normalizeHandleId(edge.sourceHandle)
        const edge2TargetHandle = normalizeHandleId(edge.targetHandle)
        const edge1: WorkflowEdge = {
          id: getEdgeId(edge.source, edge1SourceHandle, nodeId, null),
          source: edge.source,
          target: nodeId,
          sourceHandle: edge1SourceHandle,
          targetHandle: null,
        }
        const edge2: WorkflowEdge = {
          id: getEdgeId(nodeId, null, edge.target, edge2TargetHandle),
          source: nodeId,
          target: edge.target,
          sourceHandle: null,
          targetHandle: edge2TargetHandle,
        }
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

        for (const [index, operation] of operations.entries()) {
          const tool = typeof operation?.tool === 'string' ? operation.tool : ''
          if (!tool || tool === 'batch_update' || tool === 'get_workflow' || tool === 'get_current_workflow') {
            const help = buildBatchOperationHelp(operation, index, tool)
            return {
              result: { success: false, message: help.message, data: { results: batchResults, ...help.data } },
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
