import { randomUUID } from 'crypto'
import { BrowserWindow } from 'electron'
import dagre from '@dagrejs/dagre'
import { getWorkflow, updateWorkflow } from './workflow-store'
import { workflowNodeRegistry } from './workflow-node-registry'

interface SearchFilters {
  keyword?: string
  type?: string
  label?: string
  category?: string
  description?: string
}

/** 从 registry 获取所有节点类型定义的完整信息（内置 + 插件） */
function getAllNodeTypeDefinitions() {
  return workflowNodeRegistry.getAllPluginNodes()
    .flatMap((entry) => entry.nodes.map((n) => ({
      ...n,
      label: n.label || n.type,
      category: n.category || '插件',
      description: n.description || `插件 ${entry.pluginId} 提供的节点`,
      source: entry.pluginId,
    })))
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
    const haystack = [def.type, def.label, def.category, def.description]
      .map(normalizeText)
      .join('\n')
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
    notes.push('run_code 应直接读取 context，并通过 return 返回给下游节点消费的结构化结果。')
  }

  if (Array.isArray(def.properties) && def.properties.some((prop: any) => prop.type === 'array')) {
    notes.push('array 类型字段应保持数组结构，在数组项的字符串字段中写变量。')
  }

  if (def.type === 'gallery_preview') {
    notes.push('gallery_preview.items 是数组；数组项通常包含 src、thumb、type、caption。')
    notes.push('若上游输出结构不一致，建议先插入 run_code 节点做映射，再由 gallery_preview 逐字段引用。')
  }

  return notes
}

function buildNodeUsageExamples(def: any): Array<Record<string, any>> {
  const examples: Array<Record<string, any>> = []

  if (def.type === 'run_code') {
    examples.push({
      scene: '在两个节点之间插入 JS 做资源结构映射',
      data: {
        code: 'const upstream = context["上游节点ID"] || {}\nconst list = Array.isArray(upstream.items) ? upstream.items : []\nreturn {\n  items: list.map((item) => ({\n    src: item.src || item.url || "",\n    thumb: item.thumb || item.cover || "",\n    type: item.type || "image",\n    caption: item.caption || item.title || ""\n  }))\n}',
      },
    })
  }

  if (def.type === 'gallery_preview') {
    examples.push({
      scene: '引用上游 JS 节点输出的第一个资源',
      data: {
        items: [
          {
            src: '{{ __data__["js-node-id"].items.0.src }}',
            thumb: '{{ __data__["js-node-id"].items.0.thumb }}',
            type: '{{ __data__["js-node-id"].items.0.type }}',
            caption: '{{ __data__["js-node-id"].items.0.caption }}',
          },
        ],
      },
    })
  }

  return examples
}

// ====== 接口定义 ======

export interface ToolResult {
  success: boolean
  message: string
  data?: any
}

export interface WorkflowChanges {
  upsertNodes: any[]
  deleteNodeIds: string[]
  upsertEdges: any[]
  deleteEdgeIds: string[]
}

interface ToolContext {
  args: any
  nodes: any[]
  edges: any[]
  changes: WorkflowChanges
}

interface ToolHandlerResult {
  result: ToolResult
  mutated: boolean
  nodes: any[]
  edges: any[]
}

type ToolHandler = (ctx: ToolContext) => ToolHandlerResult

function getArgWorkflowId(args: any): string {
  return typeof args?.workflow_id === 'string'
    ? args.workflow_id
    : (typeof args?.workflowId === 'string' ? args.workflowId : '')
}

function executeGetWorkflow(args: any): ToolResult {
  const workflowId = getArgWorkflowId(args)
  if (!workflowId) {
    return { success: false, message: '缺少必填参数: workflow_id' }
  }

  const workflow = getWorkflow(workflowId)
  if (!workflow) {
    return { success: false, message: `工作流 ${workflowId} 不存在` }
  }

  const nodes = JSON.parse(JSON.stringify(workflow.nodes))
  const edges = JSON.parse(JSON.stringify(workflow.edges))
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
          nodes: nodes.map((n: any) => ({
            id: n.id,
            type: n.type,
            label: n.label,
            nodeState: n.nodeState,
          })),
          edges: edges.map((e: any) => ({
            id: e.id,
            source: e.source,
            target: e.target,
            sourceHandle: e.sourceHandle,
            targetHandle: e.targetHandle,
          })),
        },
      },
    }
  }

  return {
    success: true,
    message: '工作流文件完整数据',
    data: {
      workflow: {
        ...workflow,
        nodes,
        edges,
      },
    },
  }
}

// ====== Dagre 自动布局 ======

function autoLayout(nodes: any[], edges: any[]): any[] {
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

// ====== 渲染进程通知 ======

function notifyRenderer(
  mainWindow: BrowserWindow,
  workflowId: string,
  changes: WorkflowChanges,
): void {
  if (!mainWindow.isDestroyed()) {
    console.log('[workflow-tool-executor] notifyRenderer:', { workflowId, upsertNodes: changes.upsertNodes.length, deleteNodeIds: changes.deleteNodeIds.length, upsertEdges: changes.upsertEdges.length, deleteEdgeIds: changes.deleteEdgeIds.length })
    mainWindow.webContents.send('workflow:updated', { workflowId, changes })
  }
}

// ====== 各工具处理函数 ======

function handleGetCurrentWorkflow(): ToolHandlerResult {
  return {
    result: {
      success: false,
      message: 'get_current_workflow 只能在渲染进程直接读取当前画布数据',
    },
    mutated: false,
    nodes: [],
    edges: [],
  }
}

function handleListNodeTypes(ctx: ToolContext): ToolHandlerResult {
  const { args } = ctx
  const allTypes = getAllNodeTypeDefinitions()
  const categories = Array.from(new Set(allTypes.map((d) => d.category)))
  const filtered = args?.category
    ? allTypes.filter((d) => d.category === args.category)
    : allTypes
  return {
    result: {
      success: true,
      message: `共 ${filtered.length} 种节点类型`,
      data: { nodeTypes: filtered, categories },
    },
    mutated: false,
    nodes: ctx.nodes,
    edges: ctx.edges,
  }
}

/** 查找节点类型定义（内置 + 插件） */
function findNodeType(type: string): { label: string; category: string; description: string } | undefined {
  return getAllNodeTypeDefinitions().find((d) => d.type === type)
}

function handleCreateNode(ctx: ToolContext): ToolHandlerResult {
  const { args, nodes, changes } = ctx
  const { type, label } = args || {}
  if (!type) {
    return { result: { success: false, message: '缺少必填参数: type' }, mutated: false, nodes, edges: ctx.edges }
  }
  const typeDef = findNodeType(type)
  if (!typeDef) {
    return {
      result: {
        success: false,
        message: `未知节点类型: ${type}，可用类型: ${getAllNodeTypeDefinitions().map((d) => d.type).join(', ')}`,
      },
      mutated: false,
      nodes,
      edges: ctx.edges,
    }
  }
  const nodeId = randomUUID()
  const newNode = {
    id: nodeId,
    type,
    label: label || typeDef.label,
    position: { x: 0, y: 0 },
    data: args?.data || {},
  }
  nodes.push(newNode)
  changes.upsertNodes.push(newNode)
  console.log('[handleCreateNode] node created:', { id: nodeId, type, label: newNode.label, position: newNode.position })
  return {
    result: { success: true, message: `节点已创建: ${newNode.label} (${nodeId})`, data: { nodeId } },
    mutated: true,
    nodes,
    edges: ctx.edges,
  }
}

function handleUpdateNode(ctx: ToolContext): ToolHandlerResult {
  const { args, nodes, changes } = ctx
  const { nodeId, data } = args || {}
  if (!nodeId) {
    return { result: { success: false, message: '缺少必填参数: nodeId' }, mutated: false, nodes, edges: ctx.edges }
  }
  const nodeIdx = nodes.findIndex((n: any) => n.id === nodeId)
  if (nodeIdx === -1) {
    return { result: { success: false, message: `节点 ${nodeId} 不存在` }, mutated: false, nodes, edges: ctx.edges }
  }
  if (args?.label) {
    nodes[nodeIdx].label = args.label
  }
  if (data) {
    nodes[nodeIdx].data = { ...nodes[nodeIdx].data, ...data }
  }
  changes.upsertNodes.push(nodes[nodeIdx])
  return {
    result: {
      success: true,
      message: `节点已更新: ${nodeId}`,
      data: { node: nodes[nodeIdx] },
    },
    mutated: true,
    nodes,
    edges: ctx.edges,
  }
}

function handleDeleteNode(ctx: ToolContext): ToolHandlerResult {
  const { args, nodes, changes } = ctx
  let { edges } = ctx
  const { nodeId: delNodeId } = args || {}
  if (!delNodeId) {
    return { result: { success: false, message: '缺少必填参数: nodeId' }, mutated: false, nodes, edges }
  }
  const delNodeIdx = nodes.findIndex((n: any) => n.id === delNodeId)
  if (delNodeIdx === -1) {
    return { result: { success: false, message: `节点 ${delNodeId} 不存在` }, mutated: false, nodes, edges }
  }
  // 移除节点
  nodes.splice(delNodeIdx, 1)
  // 移除关联的边
  const relatedEdges = edges.filter(
    (e: any) => e.source === delNodeId || e.target === delNodeId,
  )
  edges = edges.filter((e: any) => e.source !== delNodeId && e.target !== delNodeId)
  changes.deleteNodeIds.push(delNodeId)
  changes.deleteEdgeIds.push(...relatedEdges.map((e: any) => e.id))
  return {
    result: {
      success: true,
      message: `节点 ${delNodeId} 已删除，同时删除 ${relatedEdges.length} 条关联边`,
      data: { deletedNodeId: delNodeId, deletedEdgeIds: relatedEdges.map((e: any) => e.id) },
    },
    mutated: true,
    nodes,
    edges,
  }
}

function handleCreateEdge(ctx: ToolContext): ToolHandlerResult {
  const { args, nodes, edges, changes } = ctx
  const { source, target, sourceHandle, targetHandle } = args || {}
  if (!source || !target) {
    return { result: { success: false, message: '缺少必填参数: source, target' }, mutated: false, nodes, edges }
  }
  // 验证 source/target 节点存在
  if (!nodes.find((n: any) => n.id === source)) {
    return { result: { success: false, message: `源节点 ${source} 不存在` }, mutated: false, nodes, edges }
  }
  if (!nodes.find((n: any) => n.id === target)) {
    return { result: { success: false, message: `目标节点 ${target} 不存在` }, mutated: false, nodes, edges }
  }
  // 检查重复边
  const sh = sourceHandle || 'default'
  const th = targetHandle || 'default'
  const duplicate = edges.find(
    (e: any) =>
      e.source === source &&
      e.target === target &&
      (e.sourceHandle || 'default') === sh &&
      (e.targetHandle || 'default') === th,
  )
  if (duplicate) {
    return { result: { success: false, message: `边已存在: ${duplicate.id}`, data: { edgeId: duplicate.id } }, mutated: false, nodes, edges }
  }
  const edgeId = `e-${source}-${sh}-${target}-${th}`
  const newEdge = { id: edgeId, source, target, sourceHandle: sh, targetHandle: th }
  edges.push(newEdge)
  changes.upsertEdges.push(newEdge)
  return {
    result: { success: true, message: `边已创建: ${edgeId}`, data: { edgeId } },
    mutated: true,
    nodes,
    edges,
  }
}

function handleDeleteEdge(ctx: ToolContext): ToolHandlerResult {
  const { args, nodes, edges, changes } = ctx
  const { edgeId } = args || {}
  if (!edgeId) {
    return { result: { success: false, message: '缺少必填参数: edgeId' }, mutated: false, nodes, edges }
  }
  const edgeIdx = edges.findIndex((e: any) => e.id === edgeId)
  if (edgeIdx === -1) {
    return { result: { success: false, message: `边 ${edgeId} 不存在` }, mutated: false, nodes, edges }
  }
  edges.splice(edgeIdx, 1)
  changes.deleteEdgeIds.push(edgeId)
  return {
    result: { success: true, message: `边 ${edgeId} 已删除`, data: { deletedEdgeId: edgeId } },
    mutated: true,
    nodes,
    edges,
  }
}

function handleBatchUpdate(ctx: ToolContext): ToolHandlerResult {
  const { args, nodes, edges } = ctx
  const operations = Array.isArray(args?.operations) && args.operations.length > 0
    ? args.operations
    : [
        ...(Array.isArray(args?.createNodes)
          ? args.createNodes.map((item: any) => ({ tool: 'create_node', args: item }))
          : []),
        ...(Array.isArray(args?.deleteNodeIds)
          ? args.deleteNodeIds.map((nodeId: string) => ({ tool: 'delete_node', args: { nodeId } }))
          : []),
        ...(Array.isArray(args?.createEdges)
          ? args.createEdges.map((item: any) => ({
            tool: 'create_edge',
            args: {
              source: item.source ?? item.sourceId,
              target: item.target ?? item.targetId,
              sourceHandle: item.sourceHandle,
              targetHandle: item.targetHandle,
            },
          }))
          : []),
        ...(Array.isArray(args?.deleteEdgeIds)
          ? args.deleteEdgeIds.map((edgeId: string) => ({ tool: 'delete_edge', args: { edgeId } }))
          : []),
      ]

  if (operations.length === 0) {
    return { result: { success: false, message: '缺少批量操作内容：请传 operations，或旧格式 createNodes/deleteNodeIds/createEdges/deleteEdgeIds' }, mutated: false, nodes, edges }
  }
  // 事务性执行：收集所有变更，全部成功后一次性写入
  const batchChanges: WorkflowChanges = {
    upsertNodes: [],
    deleteNodeIds: [],
    upsertEdges: [],
    deleteEdgeIds: [],
  }
  const batchResults: any[] = []
  try {
    for (const op of operations) {
      if (!op.tool) {
        throw new Error(`操作缺少 tool 字段: ${JSON.stringify(op)}`)
      }
      const opResult = executeSingleOp(op.tool, op.args || {}, nodes, edges, batchChanges)
      batchResults.push(opResult)
      if (!opResult.success) {
        throw new Error(`操作 ${op.tool} 失败: ${opResult.message}`)
      }
    }
  } catch (err: any) {
    return {
      result: { success: false, message: `批量操作中断: ${err.message}`, data: { results: batchResults } },
      mutated: false,
      nodes,
      edges,
    }
  }
  // 全部成功，应用变更
  ctx.changes.upsertNodes.push(...batchChanges.upsertNodes)
  ctx.changes.deleteNodeIds.push(...batchChanges.deleteNodeIds)
  ctx.changes.upsertEdges.push(...batchChanges.upsertEdges)
  ctx.changes.deleteEdgeIds.push(...batchChanges.deleteEdgeIds)
  return {
    result: {
      success: true,
      message: `批量操作完成，共 ${operations.length} 个操作`,
      data: { results: batchResults },
    },
    mutated: true,
    nodes,
    edges,
  }
}

function handleInsertNode(ctx: ToolContext): ToolHandlerResult {
  const { args, nodes, edges, changes } = ctx
  const { edgeId, type, label } = args || {}
  if (!edgeId || !type) {
    return { result: { success: false, message: '缺少必填参数: edgeId, type' }, mutated: false, nodes, edges }
  }
  // 查找原边
  const edgeIdx = edges.findIndex((e: any) => e.id === edgeId)
  if (edgeIdx === -1) {
    return { result: { success: false, message: `边 ${edgeId} 不存在` }, mutated: false, nodes, edges }
  }
  const originalEdge = edges[edgeIdx]
  // 验证节点类型
  const typeDef = findNodeType(type)
  if (!typeDef) {
    return { result: { success: false, message: `未知节点类型: ${type}` }, mutated: false, nodes, edges }
  }
  // 创建新节点
  const nodeId = randomUUID()
  const newNode = {
    id: nodeId,
    type,
    label: label || typeDef.label,
    position: { x: 0, y: 0 },
    data: args?.data || {},
  }
  nodes.push(newNode)
  changes.upsertNodes.push(newNode)
  // 删除原边
  edges.splice(edgeIdx, 1)
  changes.deleteEdgeIds.push(edgeId)
  // 创建 source → 新节点
  const sh = originalEdge.sourceHandle || 'default'
  const edge1Id = `e-${originalEdge.source}-${sh}-${nodeId}-default`
  const edge1 = { id: edge1Id, source: originalEdge.source, target: nodeId, sourceHandle: sh, targetHandle: 'default' }
  edges.push(edge1)
  changes.upsertEdges.push(edge1)
  // 创建 新节点 → target
  const th = originalEdge.targetHandle || 'default'
  const edge2Id = `e-${nodeId}-default-${originalEdge.target}-${th}`
  const edge2 = { id: edge2Id, source: nodeId, target: originalEdge.target, sourceHandle: 'default', targetHandle: th }
  edges.push(edge2)
  changes.upsertEdges.push(edge2)
  return {
    result: {
      success: true,
      message: `已在边 ${edgeId} 上插入节点 ${newNode.label} (${nodeId})`,
      data: { nodeId, edge1Id, edge2Id },
    },
    mutated: true,
    nodes,
    edges,
  }
}

function handleSearchNodes(ctx: ToolContext): ToolHandlerResult {
  const { args, nodes } = ctx
  if (!hasSearchFilters(args)) {
    return { result: { success: false, message: '至少需要一个搜索条件：keyword/type/label/category/description' }, mutated: false, nodes, edges: ctx.edges }
  }
  const nodeDefs = new Map(getAllNodeTypeDefinitions().map((def) => [def.type, def]))
  const matches = nodes.filter((n: any) =>
    matchesNodeDefinition({
      ...n,
      category: nodeDefs.get(n.type)?.category,
      description: nodeDefs.get(n.type)?.description,
    }, args)
  )
  return {
    result: {
      success: true,
      message: `匹配到 ${matches.length} 个节点`,
      data: {
        nodes: matches.map((node: any) => ({
          ...node,
          category: nodeDefs.get(node.type)?.category,
          description: nodeDefs.get(node.type)?.description,
        })),
      },
    },
    mutated: false,
    nodes,
    edges: ctx.edges,
  }
}

function handleSearchNodeUsage(ctx: ToolContext): ToolHandlerResult {
  const { args } = ctx
  if (!hasSearchFilters(args)) {
    return { result: { success: false, message: '至少需要一个搜索条件：keyword/type/label/category/description' }, mutated: false, nodes: ctx.nodes, edges: ctx.edges }
  }
  const allTypes = getAllNodeTypeDefinitions()
  const matches = allTypes.filter((d) => matchesNodeDefinition(d, args))
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
}

function handleAutoLayout(ctx: ToolContext): ToolHandlerResult {
  let { nodes, edges, changes } = ctx
  if (nodes.length === 0) {
    return { result: { success: true, message: '工作流没有节点，无需布局', data: {} }, mutated: false, nodes, edges }
  }
  nodes = autoLayout(nodes, edges)
  changes.upsertNodes.push(...nodes)
  return {
    result: {
      success: true,
      message: `自动布局完成，${nodes.length} 个节点已重新排列`,
      data: { nodes },
    },
    mutated: true,
    nodes,
    edges,
  }
}

// ====== Handler Map ======

const WORKFLOW_TOOL_HANDLERS = new Map<string, ToolHandler>([
  ['get_current_workflow', () => handleGetCurrentWorkflow()],
  ['list_node_types', handleListNodeTypes],
  ['create_node', handleCreateNode],
  ['update_node', handleUpdateNode],
  ['delete_node', handleDeleteNode],
  ['create_edge', handleCreateEdge],
  ['delete_edge', handleDeleteEdge],
  ['insert_node', handleInsertNode],
  ['batch_update', handleBatchUpdate],
  ['auto_layout', handleAutoLayout],
  ['search_nodes', handleSearchNodes],
  ['search_node_usage', handleSearchNodeUsage],
])

// ====== 主入口：执行工作流工具 ======

export async function executeWorkflowTool(
  name: string,
  args: any,
  workflowId: string,
  mainWindow: BrowserWindow,
): Promise<ToolResult> {
  if (name === 'get_workflow') {
    return executeGetWorkflow(args)
  }

  // 1. 获取工作流
  const workflow = getWorkflow(workflowId)
  if (!workflow) {
    return { success: false, message: `工作流 ${workflowId} 不存在` }
  }

  // 2. 深拷贝节点和边
  let nodes = JSON.parse(JSON.stringify(workflow.nodes))
  let edges = JSON.parse(JSON.stringify(workflow.edges))

  // 3. 初始化变更收集器
  const changes: WorkflowChanges = {
    upsertNodes: [],
    deleteNodeIds: [],
    upsertEdges: [],
    deleteEdgeIds: [],
  }

  // 4. 查找并执行对应 handler
  const handler = WORKFLOW_TOOL_HANDLERS.get(name)
  let result: ToolResult
  let mutated: boolean

  if (handler) {
    const handlerResult = handler({ args, nodes, edges, changes })
    result = handlerResult.result
    mutated = handlerResult.mutated
    nodes = handlerResult.nodes
    edges = handlerResult.edges
  } else {
    result = { success: false, message: `未知工作流工具: ${name}` }
    mutated = false
  }

  // 5. 如果有变更，持久化并通知渲染进程
  if (mutated) {
    updateWorkflow(workflowId, { nodes, edges, updatedAt: Date.now() })
    notifyRenderer(mainWindow, workflowId, changes)
  }

  return result
}

// ====== 单个操作执行（供 batch_update 使用） ======

function executeSingleOp(
  tool: string,
  args: any,
  nodes: any[],
  edges: any[],
  changes: WorkflowChanges,
): ToolResult {
  switch (tool) {
    case 'create_node': {
      const { type, label } = args || {}
      if (!type) return { success: false, message: '缺少必填参数: type' }
      const typeDef = findNodeType(type)
      if (!typeDef) {
        return { success: false, message: `未知节点类型: ${type}` }
      }
      const nodeId = randomUUID()
      const newNode = {
        id: nodeId,
        type,
        label: label || typeDef.label,
        position: { x: 0, y: 0 },
        data: args?.data || {},
      }
      nodes.push(newNode)
      changes.upsertNodes.push(newNode)
      return { success: true, message: `节点已创建: ${newNode.label}`, data: { nodeId } }
    }

    case 'update_node': {
      const { nodeId, data } = args || {}
      if (!nodeId) return { success: false, message: '缺少必填参数: nodeId' }
      const nodeIdx = nodes.findIndex((n: any) => n.id === nodeId)
      if (nodeIdx === -1) return { success: false, message: `节点 ${nodeId} 不存在` }
      if (args?.label) nodes[nodeIdx].label = args.label
      if (data) nodes[nodeIdx].data = { ...nodes[nodeIdx].data, ...data }
      changes.upsertNodes.push(nodes[nodeIdx])
      return { success: true, message: `节点已更新: ${nodeId}`, data: { node: nodes[nodeIdx] } }
    }

    case 'delete_node': {
      const { nodeId } = args || {}
      if (!nodeId) return { success: false, message: '缺少必填参数: nodeId' }
      const nodeIdx = nodes.findIndex((n: any) => n.id === nodeId)
      if (nodeIdx === -1) return { success: false, message: `节点 ${nodeId} 不存在` }
      nodes.splice(nodeIdx, 1)
      const relatedEdgeIds: string[] = []
      for (let i = edges.length - 1; i >= 0; i--) {
        if (edges[i].source === nodeId || edges[i].target === nodeId) {
          relatedEdgeIds.push(edges[i].id)
          edges.splice(i, 1)
        }
      }
      changes.deleteNodeIds.push(nodeId)
      changes.deleteEdgeIds.push(...relatedEdgeIds)
      return {
        success: true,
        message: `节点 ${nodeId} 已删除`,
        data: { deletedNodeId: nodeId, deletedEdgeIds: relatedEdgeIds },
      }
    }

    case 'create_edge': {
      const { source, target, sourceHandle, targetHandle } = args || {}
      if (!source || !target) return { success: false, message: '缺少必填参数: source, target' }
      if (!nodes.find((n: any) => n.id === source)) return { success: false, message: `源节点 ${source} 不存在` }
      if (!nodes.find((n: any) => n.id === target)) return { success: false, message: `目标节点 ${target} 不存在` }
      const sh = sourceHandle || 'default'
      const th = targetHandle || 'default'
      const duplicate = edges.find(
        (e: any) =>
          e.source === source &&
          e.target === target &&
          (e.sourceHandle || 'default') === sh &&
          (e.targetHandle || 'default') === th,
      )
      if (duplicate) return { success: false, message: `边已存在: ${duplicate.id}` }
      const edgeId = `e-${source}-${sh}-${target}-${th}`
      const newEdge = { id: edgeId, source, target, sourceHandle: sh, targetHandle: th }
      edges.push(newEdge)
      changes.upsertEdges.push(newEdge)
      return { success: true, message: `边已创建: ${edgeId}`, data: { edgeId } }
    }

    case 'delete_edge': {
      const { edgeId } = args || {}
      if (!edgeId) return { success: false, message: '缺少必填参数: edgeId' }
      const edgeIdx = edges.findIndex((e: any) => e.id === edgeId)
      if (edgeIdx === -1) return { success: false, message: `边 ${edgeId} 不存在` }
      edges.splice(edgeIdx, 1)
      changes.deleteEdgeIds.push(edgeId)
      return { success: true, message: `边 ${edgeId} 已删除`, data: { deletedEdgeId: edgeId } }
    }

    default:
      return { success: false, message: `批量操作不支持的工具: ${tool}` }
  }
}
