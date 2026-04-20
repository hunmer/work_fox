import { defineStore } from 'pinia'
import { ref, computed, watch, inject, provide, type Ref, type App } from 'vue'
import type { Workflow, WorkflowFolder, WorkflowNode, ExecutionLog } from '@/lib/workflow/types'
import { WorkflowEngine, type EngineStatus } from '@/lib/workflow/engine'
import { getNodeDefinition } from '@/lib/workflow/nodeRegistry'
import { executeRendererWorkflowTool } from '@/lib/agent/workflow-renderer-tools'
import type { WorkflowToolExecuteRequest } from '../../preload'
import { useAgentSettingsStore, createWorkflowAgentConfigFromGlobal } from './agent-settings'

export interface WorkflowChanges {
  upsertNodes: any[]
  deleteNodeIds: string[]
  upsertEdges: any[]
  deleteEdgeIds: string[]
}

export type WorkflowStore = ReturnType<typeof createWorkflowStore>

// ====== 纯函数 ======

function validateWorkflowExecution(workflow: Workflow): string | null {
  const nodes = workflow.nodes
  const startNodes = nodes.filter((n) => n.type === 'start')
  const endNodes = nodes.filter((n) => n.type === 'end')
  if (startNodes.length === 0) return '缺少「开始」节点'
  if (endNodes.length === 0) return '缺少「结束」节点'
  if (startNodes.length > 1) return '只能有一个「开始」节点'
  if (endNodes.length > 1) return '只能有一个「结束」节点'

  const visited = new Set<string>([startNodes[0].id])
  const queue = [startNodes[0].id]
  while (queue.length > 0) {
    const current = queue.shift()!
    for (const edge of workflow.edges) {
      if (edge.source === current && !visited.has(edge.target)) {
        visited.add(edge.target)
        queue.push(edge.target)
      }
    }
  }
  return visited.has(endNodes[0].id) ? null : '「开始」与「结束」节点未连通'
}

function summarizeChanges(changes: WorkflowChanges): string {
  const parts: string[] = []
  if (changes.upsertNodes.length) parts.push(`+${changes.upsertNodes.length}节点`)
  if (changes.deleteNodeIds.length) parts.push(`-${changes.deleteNodeIds.length}节点`)
  if (changes.upsertEdges.length) parts.push(`+${changes.upsertEdges.length}连线`)
  if (changes.deleteEdgeIds.length) parts.push(`-${changes.deleteEdgeIds.length}连线`)
  return parts.join(' ') || '无变更'
}

// ====== Undo/Redo 管理器 ======

function createUndoRedoManager(currentWorkflow: Ref<Workflow | null>, api: () => any) {
  const MAX_HISTORY = 1000
  const undoStack = ref<string[]>([])
  const redoStack = ref<string[]>([])
  const operationLog = ref<{ description: string; timestamp: number; snapshot?: string }[]>([])

  function captureSnapshot(): string {
    if (!currentWorkflow.value) return ''
    return JSON.stringify({ nodes: currentWorkflow.value.nodes, edges: currentWorkflow.value.edges })
  }

  function applySnapshot(snapshot: string): void {
    if (!currentWorkflow.value || !snapshot) return
    const parsed = JSON.parse(snapshot)
    currentWorkflow.value.nodes = parsed.nodes
    currentWorkflow.value.edges = parsed.edges
  }

  function pushUndo(description: string): void {
    const snapshot = captureSnapshot()
    if (!snapshot) return
    undoStack.value.push(snapshot)
    if (undoStack.value.length > MAX_HISTORY) undoStack.value.shift()
    redoStack.value = []
    operationLog.value.unshift({ description, timestamp: Date.now(), snapshot })
    if (operationLog.value.length > MAX_HISTORY) operationLog.value.length = MAX_HISTORY
    persistLog()
  }

  function restoreToStep(index: number): void {
    const entry = operationLog.value[index]
    if (!entry?.snapshot) return
    undoStack.value.push(captureSnapshot())
    redoStack.value = []
    applySnapshot(entry.snapshot)
    operationLog.value.unshift({
      description: `恢复到: ${entry.description}`,
      timestamp: Date.now(),
      snapshot: captureSnapshot(),
    })
    if (operationLog.value.length > MAX_HISTORY) operationLog.value.length = MAX_HISTORY
    persistLog()
  }

  function undo(): void {
    if (undoStack.value.length === 0) return
    redoStack.value.push(captureSnapshot())
    applySnapshot(undoStack.value.pop()!)
    operationLog.value.unshift({ description: '撤销操作', timestamp: Date.now(), snapshot: captureSnapshot() })
    if (operationLog.value.length > MAX_HISTORY) operationLog.value.length = MAX_HISTORY
    persistLog()
  }

  function redo(): void {
    if (redoStack.value.length === 0) return
    undoStack.value.push(captureSnapshot())
    applySnapshot(redoStack.value.pop()!)
    operationLog.value.unshift({ description: '重做操作', timestamp: Date.now(), snapshot: captureSnapshot() })
    if (operationLog.value.length > MAX_HISTORY) operationLog.value.length = MAX_HISTORY
    persistLog()
  }

  const canUndo = computed(() => undoStack.value.length > 0)
  const canRedo = computed(() => redoStack.value.length > 0)

  let saveTimer: ReturnType<typeof setTimeout> | null = null
  function scheduleSave(): void {
    if (!currentWorkflow.value?.id) return
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      const a = api()
      if (a?.operationHistory?.save) {
        const entries = operationLog.value.map(({ snapshot: _s, ...rest }) => rest)
        a.operationHistory.save(currentWorkflow.value!.id, entries)
      }
    }, 500)
  }

  function persistLog(): void {
    operationLog.value = [...operationLog.value]
    scheduleSave()
  }

  async function loadFromDisk(): Promise<void> {
    const a = api()
    if (!a?.operationHistory?.load || !currentWorkflow.value?.id) return
    try {
      const entries = await a.operationHistory.load(currentWorkflow.value.id)
      if (entries?.length) operationLog.value = entries
    } catch { /* ignore */ }
  }

  return {
    undoStack, redoStack, operationLog, pushUndo, undo, redo, restoreToStep,
    reset: () => { undoStack.value = []; redoStack.value = []; operationLog.value = [] },
    loadOperationHistory: loadFromDisk,
    canUndo, canRedo,
  }
}

// ====== 执行历史管理 ======

function createExecutionLogManager(currentWorkflow: Ref<Workflow | null>, api: () => any) {
  const executionLogs = ref<ExecutionLog[]>([])
  const selectedExecutionLogId = ref<string | null>(null)

  async function loadExecutionLogs(): Promise<void> {
    const workflowId = currentWorkflow.value?.id
    if (!workflowId) { executionLogs.value = []; return }
    executionLogs.value = await api().executionLog.list(workflowId)
    if (selectedExecutionLogId.value && !executionLogs.value.find((l) => l.id === selectedExecutionLogId.value)) {
      selectedExecutionLogId.value = null
    }
  }

  async function deleteExecutionLog(logId: string): Promise<void> {
    const workflowId = currentWorkflow.value?.id
    if (!workflowId) return
    await api().executionLog.delete(workflowId, logId)
    executionLogs.value = executionLogs.value.filter((l) => l.id !== logId)
    if (selectedExecutionLogId.value === logId) selectedExecutionLogId.value = null
  }

  async function clearExecutionLogs(): Promise<void> {
    const workflowId = currentWorkflow.value?.id
    if (!workflowId) return
    await api().executionLog.clear(workflowId)
    executionLogs.value = []
    selectedExecutionLogId.value = null
  }

  function appendCompletedLog(log: ExecutionLog, workflowId: string) {
    log.id = `exec-${Date.now()}`
    log.workflowId = workflowId
    executionLogs.value.unshift(log)
    if (executionLogs.value.length > 100) executionLogs.value.length = 100
    selectedExecutionLogId.value = log.id
    try {
      const serializable = JSON.parse(JSON.stringify(log))
      api().executionLog.save(workflowId, serializable).catch(() => {})
    } catch { /* serialization failed, skip persist */ }
  }

  return { executionLogs, selectedExecutionLogId, loadExecutionLogs, deleteExecutionLog, clearExecutionLogs, appendCompletedLog }
}

// ====== 版本管理 ======

function createVersionManager(currentWorkflow: Ref<Workflow | null>, api: () => any) {
  const versions = ref<any[]>([])

  async function loadVersions(): Promise<void> {
    const workflowId = currentWorkflow.value?.id
    if (!workflowId) { versions.value = []; return }
    versions.value = await api().workflowVersion.list(workflowId)
  }

  async function saveVersion(name?: string): Promise<void> {
    const wf = currentWorkflow.value
    if (!wf) return
    const versionName = name || await api().workflowVersion.nextName(wf.id)
    const version = await api().workflowVersion.add(
      wf.id, versionName,
      JSON.parse(JSON.stringify(wf.nodes)),
      JSON.parse(JSON.stringify(wf.edges)),
    )
    versions.value.unshift(version)
  }

  async function deleteVersion(versionId: string): Promise<void> {
    const workflowId = currentWorkflow.value?.id
    if (!workflowId) return
    await api().workflowVersion.delete(workflowId, versionId)
    versions.value = versions.value.filter((v) => v.id !== versionId)
  }

  async function restoreVersion(versionId: string, pushUndo: (desc: string) => void): Promise<void> {
    const workflowId = currentWorkflow.value?.id
    if (!workflowId) return
    const version = await api().workflowVersion.get(workflowId, versionId)
    if (!version) return
    pushUndo('恢复版本')
    currentWorkflow.value!.nodes = JSON.parse(JSON.stringify(version.snapshot.nodes))
    currentWorkflow.value!.edges = JSON.parse(JSON.stringify(version.snapshot.edges))
  }

  return { versions, loadVersions, saveVersion, deleteVersion, restoreVersion }
}

// ====== 脏标记（仅内存） ======

function createDirtyTracker() {
  const isDirty = ref(false)
  function markDirty(): void { isDirty.value = true }
  function markClean(): void { isDirty.value = false }
  return { isDirty, markDirty, markClean }
}

// ====== 数据 CRUD ======

function createCrudActions(
  workflows: Ref<Workflow[]>,
  workflowFolders: Ref<WorkflowFolder[]>,
  currentWorkflow: Ref<Workflow | null>,
  api: () => any,
  dirtyTracker: ReturnType<typeof createDirtyTracker>,
  versionMgr: ReturnType<typeof createVersionManager>,
) {
  async function loadData() {
    workflows.value = await api().workflow.list()
    workflowFolders.value = await api().workflowFolder.list()
  }

  async function saveWorkflow(workflow: Workflow): Promise<void> {
    const plain = JSON.parse(JSON.stringify(workflow)) as Workflow
    const existing = workflows.value.find((w) => w.id === plain.id)
    const now = Date.now()
    if (existing) {
      await api().workflow.update(plain.id, { ...plain, updatedAt: now })
      Object.assign(existing, { ...plain, updatedAt: now })
    } else {
      const created = await api().workflow.create({ ...plain, createdAt: now, updatedAt: now })
      workflows.value.push(created)
      currentWorkflow.value = created
    }
    dirtyTracker.markClean()
  }

  async function deleteWorkflow(id: string): Promise<void> {
    await api().workflow.delete(id)
    workflows.value = workflows.value.filter((w) => w.id !== id)
    if (currentWorkflow.value?.id === id) {
      currentWorkflow.value = null
      dirtyTracker.markClean()
    }
  }

  async function createFolder(name: string, parentId: string | null = null): Promise<void> {
    const folder = await api().workflowFolder.create({
      name, parentId,
      order: workflowFolders.value.filter((f) => f.parentId === parentId).length,
      createdAt: Date.now(),
    })
    workflowFolders.value.push(folder)
  }

  async function deleteFolder(id: string): Promise<void> {
    await api().workflowFolder.delete(id)
    workflowFolders.value = workflowFolders.value.filter((f) => f.id !== id)
  }

  async function updateFolder(id: string, data: Partial<WorkflowFolder>): Promise<void> {
    await api().workflowFolder.update(id, data)
    const idx = workflowFolders.value.findIndex((f) => f.id === id)
    if (idx !== -1) Object.assign(workflowFolders.value[idx], data)
  }

  return { loadData, saveWorkflow, deleteWorkflow, createFolder, deleteFolder, updateFolder }
}

// ====== 编辑操作 ======

function createEditActions(
  currentWorkflow: Ref<Workflow | null>,
  selectedNodeId: Ref<string | null>,
  executionStatus: Ref<EngineStatus>,
  executionLog: Ref<ExecutionLog | null>,
  executionContext: Ref<Record<string, any>>,
  undoRedo: ReturnType<typeof createUndoRedoManager>,
) {
  function newWorkflow(folderId: string | null, name = '新工作流') {
    const startNodeId = crypto.randomUUID()
    const endNodeId = crypto.randomUUID()
    const workflowId = crypto.randomUUID()
    const agentSettingsStore = useAgentSettingsStore()
    currentWorkflow.value = {
      id: workflowId, name, folderId,
      nodes: [
        { id: startNodeId, type: 'start', label: '开始', position: { x: 100, y: 250 }, data: {} },
        { id: endNodeId, type: 'end', label: '结束', position: { x: 600, y: 250 }, data: {} },
      ],
      edges: [], createdAt: Date.now(), updatedAt: Date.now(),
      agentConfig: createWorkflowAgentConfigFromGlobal(
        workflowId,
        JSON.parse(JSON.stringify(agentSettingsStore.globalSettings)),
      ),
    }
    selectedNodeId.value = null
    executionStatus.value = 'idle'
    executionLog.value = null
    executionContext.value = {}
  }

  function addNode(type: string, position: { x: number; y: number }): WorkflowNode {
    undoRedo.pushUndo(`添加节点: ${type}`)
    const def = getNodeDefinition(type)
    const label = def?.label || type
    const data: Record<string, any> = {}
    if (def?.outputs?.length) data.outputs = JSON.parse(JSON.stringify(def.outputs))
    const node: WorkflowNode = { id: crypto.randomUUID(), type, label, position, data }
    currentWorkflow.value!.nodes.push(node)
    return node
  }

  function removeNode(nodeId: string): void {
    if (!currentWorkflow.value) return
    undoRedo.pushUndo('删除节点')
    currentWorkflow.value.nodes = currentWorkflow.value.nodes.filter((n) => n.id !== nodeId)
    currentWorkflow.value.edges = currentWorkflow.value.edges.filter(
      (e) => e.source !== nodeId && e.target !== nodeId,
    )
    if (selectedNodeId.value === nodeId) selectedNodeId.value = null
  }

  function cloneNode(nodeId: string): WorkflowNode | null {
    if (!currentWorkflow.value) return null
    undoRedo.pushUndo('克隆节点')
    const source = currentWorkflow.value.nodes.find((n) => n.id === nodeId)
    if (!source) return null
    const cloned: WorkflowNode = {
      id: crypto.randomUUID(), type: source.type, label: source.label,
      position: { x: source.position.x + 30, y: source.position.y + 30 },
      data: JSON.parse(JSON.stringify(source.data)),
    }
    currentWorkflow.value.nodes.push(cloned)
    return cloned
  }

  function updateNodeData(nodeId: string, data: Record<string, any>): void {
    undoRedo.pushUndo('修改节点属性')
    const node = currentWorkflow.value?.nodes.find((n) => n.id === nodeId)
    if (node) node.data = { ...node.data, ...data }
  }

  function updateNodePosition(nodeId: string, position: { x: number; y: number }): void {
    const node = currentWorkflow.value?.nodes.find((n) => n.id === nodeId)
    if (node) node.position = position
  }

  function updateNodeLabel(nodeId: string, label: string): void {
    undoRedo.pushUndo('修改节点标签')
    const node = currentWorkflow.value?.nodes.find((n) => n.id === nodeId)
    if (node) node.label = label
  }

  function updateNodeState(nodeId: string, nodeState: import('@/lib/workflow/types').NodeRunState): void {
    undoRedo.pushUndo('修改节点状态')
    const node = currentWorkflow.value?.nodes.find((n) => n.id === nodeId)
    if (node) node.nodeState = nodeState
  }

  function addEdge(source: string, target: string, sourceHandle: string | null = null, targetHandle: string | null = null): void {
    if (!currentWorkflow.value) return
    if (currentWorkflow.value.edges.some(
      (e) => e.source === source && e.target === target
        && (e.sourceHandle ?? null) === sourceHandle && (e.targetHandle ?? null) === targetHandle,
    )) return
    undoRedo.pushUndo('添加连线')
    currentWorkflow.value.edges.push({
      id: `e-${source}-${sourceHandle ?? 'default'}-${target}-${targetHandle ?? 'default'}`,
      source, target, sourceHandle, targetHandle,
    })
  }

  function removeEdge(edgeId: string): void {
    if (!currentWorkflow.value) return
    undoRedo.pushUndo('删除连线')
    currentWorkflow.value.edges = currentWorkflow.value.edges.filter((e) => e.id !== edgeId)
  }

  return { newWorkflow, addNode, removeNode, cloneNode, updateNodeData, updateNodePosition, updateNodeLabel, updateNodeState, addEdge, removeEdge }
}

// ====== 执行控制 ======

function createExecutionActions(
  currentWorkflow: Ref<Workflow | null>,
  executionStatus: Ref<EngineStatus>,
  executionLog: Ref<ExecutionLog | null>,
  executionContext: Ref<Record<string, any>>,
  engine: Ref<WorkflowEngine | null>,
  execLogMgr: ReturnType<typeof createExecutionLogManager>,
) {
  async function startExecution(): Promise<void> {
    if (!currentWorkflow.value) return
    executionStatus.value = 'running'
    executionLog.value = null
    executionContext.value = {}

    engine.value = new WorkflowEngine(currentWorkflow.value.nodes, currentWorkflow.value.edges, {
      onLogUpdate: (log) => { executionLog.value = { ...log } },
      onNodeStatusChange: () => {},
    }, {
      workflowId: currentWorkflow.value.id,
      workflowName: currentWorkflow.value.name,
      workflowDescription: currentWorkflow.value.description,
      enabledPlugins: currentWorkflow.value.enabledPlugins || [],
    })

    const log = await engine.value.start()
    executionStatus.value = engine.value.status as EngineStatus
    executionContext.value = engine.value.currentContext
    executionLog.value = log

    if ((log.status === 'completed' || log.status === 'error') && currentWorkflow.value) {
      execLogMgr.appendCompletedLog(log, currentWorkflow.value.id)
    }
  }

  function pauseExecution(): void { engine.value?.pause() }

  async function resumeExecution(): Promise<void> {
    if (!engine.value) return
    const log = await engine.value.resume()
    executionStatus.value = engine.value.status as EngineStatus
    executionContext.value = engine.value.currentContext
    executionLog.value = log

    if ((log.status === 'completed' || log.status === 'error') && currentWorkflow.value) {
      execLogMgr.appendCompletedLog(log, currentWorkflow.value!.id)
    }
  }

  function stopExecution(): void { engine.value?.stop() }

  return { startExecution, pauseExecution, resumeExecution, stopExecution }
}

// ====== 单节点调试 ======

function createDebugActions(
  currentWorkflow: Ref<Workflow | null>,
  executionContext: Ref<Record<string, any>>,
) {
  const debugNodeStatus = ref<'idle' | 'running' | 'completed' | 'error'>('idle')
  const debugNodeResult = ref<{ status: 'completed' | 'error'; output?: any; error?: string; duration: number } | null>(null)
  const debugNodeId = ref<string | null>(null)
  let debugEngine: WorkflowEngine | null = null

  async function debugSingleNode(nodeId: string): Promise<void> {
    if (!currentWorkflow.value) return
    const node = currentWorkflow.value.nodes.find((n) => n.id === nodeId)
    if (!node) return

    debugNodeStatus.value = 'running'
    debugNodeResult.value = null
    debugNodeId.value = nodeId

    debugEngine = new WorkflowEngine([node], [], undefined, {
      workflowId: currentWorkflow.value.id,
      workflowName: currentWorkflow.value.name,
      workflowDescription: currentWorkflow.value.description,
      enabledPlugins: currentWorkflow.value.enabledPlugins || [],
    })
    const result = await debugEngine.debugSingleNode(node, executionContext.value)
    debugEngine = null

    debugNodeResult.value = result
    debugNodeStatus.value = result.status
  }

  function cancelDebug() {
    if (debugEngine) {
      debugEngine.stop()
      debugEngine = null
    }
    debugNodeStatus.value = 'idle'
    debugNodeResult.value = null
    debugNodeId.value = null
  }

  return { debugNodeStatus, debugNodeResult, debugNodeId, debugSingleNode, cancelDebug }
}

// ====== AI 增量更新 ======

function createAIActions(
  currentWorkflow: Ref<Workflow | null>,
  undoRedo: ReturnType<typeof createUndoRedoManager>,
) {
  function mergeWorkflowChanges(changes: WorkflowChanges) {
    if (!currentWorkflow.value) return
    undoRedo.pushUndo('AI 修改: ' + summarizeChanges(changes))

    for (const node of changes.upsertNodes) {
      const idx = currentWorkflow.value.nodes.findIndex(n => n.id === node.id)
      if (idx >= 0) currentWorkflow.value.nodes[idx] = node
      else currentWorkflow.value.nodes.push(node)
    }

    if (changes.deleteNodeIds.length > 0) {
      currentWorkflow.value.nodes = currentWorkflow.value.nodes.filter(n => !changes.deleteNodeIds.includes(n.id))
    }

    for (const edge of changes.upsertEdges) {
      const idx = currentWorkflow.value.edges.findIndex(e => e.id === edge.id)
      if (idx >= 0) currentWorkflow.value.edges[idx] = edge
      else currentWorkflow.value.edges.push(edge)
    }

    if (changes.deleteEdgeIds.length > 0) {
      currentWorkflow.value.edges = currentWorkflow.value.edges.filter(e => !changes.deleteEdgeIds.includes(e.id))
    }
  }

  function listenForFileUpdates() {
    return (window as any).api.on('workflow:updated', (data: any) => {
      console.log('[workflow store] received workflow:updated:', data)
      if (data.workflowId === currentWorkflow.value?.id && data.changes) {
        console.log('[workflow store] merging changes:', data.changes)
        mergeWorkflowChanges(data.changes)
      } else {
        console.log('[workflow store] skipped:', { eventWorkflowId: data.workflowId, currentId: currentWorkflow.value?.id, hasChanges: !!data.changes })
      }
    })
  }

  function listenForWorkflowToolRequests() {
    return (window as any).api.on('workflow-tool:execute', async (request: WorkflowToolExecuteRequest) => {
      const result = await executeRendererWorkflowTool(request.name, request.args || {})
      try {
        await (window as any).api.workflowTool.respond(request.requestId, result)
      } catch (error) {
        console.error('[workflow-store] failed to respond workflow tool request', error)
      }
    })
  }

  return { mergeWorkflowChanges, listenForFileUpdates, listenForWorkflowToolRequests }
}

// ====== 工厂函数 ======

export function createWorkflowStore(tabId: string) {
  const storeId = `workflow-tab-${tabId}`
  const useStore = defineStore(storeId, () => {
    const api = () => (window as any).api

    const workflows = ref<Workflow[]>([])
    const workflowFolders = ref<WorkflowFolder[]>([])
    const currentWorkflow = ref<Workflow | null>(null)
    const selectedNodeId = ref<string | null>(null)
    const executionStatus = ref<EngineStatus>('idle')
    const executionLog = ref<ExecutionLog | null>(null)
    const executionContext = ref<Record<string, any>>({})
    const engine = ref<WorkflowEngine | null>(null)

    const undoRedo = createUndoRedoManager(currentWorkflow, api)
    const execLogMgr = createExecutionLogManager(currentWorkflow, api)
    const versionMgr = createVersionManager(currentWorkflow, api)
    const dirtyTracker = createDirtyTracker()
    const crudActions = createCrudActions(workflows, workflowFolders, currentWorkflow, api, dirtyTracker, versionMgr)
    const editActions = createEditActions(currentWorkflow, selectedNodeId, executionStatus, executionLog, executionContext, undoRedo)
    const execActions = createExecutionActions(currentWorkflow, executionStatus, executionLog, executionContext, engine, execLogMgr)
    const debugActions = createDebugActions(currentWorkflow, executionContext)
    const aiActions = createAIActions(currentWorkflow, undoRedo)

    const rootFolders = computed(() =>
      workflowFolders.value.filter((f) => f.parentId === null).sort((a, b) => a.order - b.order),
    )
    const selectedNode = computed(() => {
      if (!selectedNodeId.value || !currentWorkflow.value) return null
      return currentWorkflow.value.nodes.find((n) => n.id === selectedNodeId.value) || null
    })
    const selectedExecutionLog = computed<ExecutionLog | null>(() => {
      const id = execLogMgr.selectedExecutionLogId.value
      if (!id) return executionLog.value
      return execLogMgr.executionLogs.value.find((l) => l.id === id) || executionLog.value
    })
    const executionValidationError = computed<string | null>(() => {
      if (!currentWorkflow.value) return '未加载工作流'
      return validateWorkflowExecution(currentWorkflow.value)
    })

    watch(() => currentWorkflow.value?.id, () => {
      execLogMgr.loadExecutionLogs()
      versionMgr.loadVersions()
      undoRedo.reset()
      undoRedo.loadOperationHistory()
    })

    return {
      tabId,
      workflows, workflowFolders, currentWorkflow, selectedNodeId,
      rootFolders, selectedNode, executionValidationError,
      executionStatus, executionLog, executionContext,
      executionLogs: execLogMgr.executionLogs,
      selectedExecutionLogId: execLogMgr.selectedExecutionLogId,
      selectedExecutionLog,
      loadExecutionLogs: execLogMgr.loadExecutionLogs,
      deleteExecutionLog: execLogMgr.deleteExecutionLog,
      clearExecutionLogs: execLogMgr.clearExecutionLogs,
      ...crudActions,
      ...editActions,
      ...execActions,
      debugNodeStatus: debugActions.debugNodeStatus,
      debugNodeResult: debugActions.debugNodeResult,
      debugNodeId: debugActions.debugNodeId,
      debugSingleNode: debugActions.debugSingleNode,
      cancelDebug: debugActions.cancelDebug,
      undo: undoRedo.undo,
      redo: undoRedo.redo,
      canUndo: undoRedo.canUndo,
      canRedo: undoRedo.canRedo,
      undoStack: undoRedo.undoStack,
      redoStack: undoRedo.redoStack,
      operationLog: undoRedo.operationLog,
      restoreToStep: undoRedo.restoreToStep,
      versions: versionMgr.versions,
      loadVersions: versionMgr.loadVersions,
      saveVersion: versionMgr.saveVersion,
      deleteVersion: versionMgr.deleteVersion,
      restoreVersion: (versionId: string) => versionMgr.restoreVersion(versionId, undoRedo.pushUndo),
      isDirty: dirtyTracker.isDirty,
      markDirty: dirtyTracker.markDirty,
      ...aiActions,
    }
  })
  return useStore()
}

// ====== Provide / Inject ======

const WORKFLOW_STORE_KEY = Symbol('workflowStore')

export function provideWorkflowStore(store: WorkflowStore) {
  provide(WORKFLOW_STORE_KEY, store)
}

export function useWorkflowStore(): WorkflowStore {
  const store = inject<WorkflowStore>(WORKFLOW_STORE_KEY)
  if (!store) throw new Error('useWorkflowStore() must be called inside a WorkflowEditor')
  return store
}
