import { defineStore } from 'pinia'
import { ref, computed, watch, inject, provide, type Ref, type App } from 'vue'
import type { Workflow, WorkflowFolder, WorkflowNode, ExecutionLog, EmbeddedWorkflow, WorkflowGroup } from '@/lib/workflow/types'
import type { EngineStatus } from '@shared/workflow-types'
import { getNodeDefinition } from '@/lib/workflow/nodeRegistry'
import { executeRendererWorkflowTool } from '@/lib/agent/workflow-renderer-tools'
import { ensureWorkflowInteractionHandler } from '@/lib/backend-api/interaction'
import { createWorkflowDomainApi } from '@/lib/backend-api/workflow-domain'
import { wsBridge } from '@/lib/ws-bridge'
import { useAgentSettingsStore, createWorkflowAgentConfigFromGlobal } from './agent-settings'
import type {
  ExecutionEventChannel,
  ExecutionEventMap,
  ExecutionRecoveryState,
} from '@shared/execution-events'
import {
  findCompositeChildByRole,
  findWorkflowNode,
  getCompositeParentId,
  getCompositeRootId,
  isGeneratedWorkflowNode,
  isHiddenWorkflowEdge,
  isHiddenWorkflowNode,
  isLockedWorkflowEdge,
  isScopeBoundaryWorkflowNode,
  LOOP_BODY_ROLE,
  LOOP_NODE_TYPE,
  LOOP_BODY_SOURCE_HANDLE,
} from '@shared/workflow-composite'

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
    return JSON.stringify({
      nodes: currentWorkflow.value.nodes,
      edges: currentWorkflow.value.edges,
      groups: currentWorkflow.value.groups || []
    })
  }

  function applySnapshot(snapshot: string): void {
    if (!currentWorkflow.value || !snapshot) return
    const parsed = JSON.parse(snapshot)
    currentWorkflow.value.nodes = parsed.nodes
    currentWorkflow.value.edges = parsed.edges
    currentWorkflow.value.groups = parsed.groups || []
  }

  function pushUndo(description: string): void {
    const snapshot = captureSnapshot()
    if (!snapshot) return
    undoStack.value.push(snapshot)
    if (undoStack.value.length > MAX_HISTORY) undoStack.value.shift()
    redoStack.value = []
    const entry: { description: string; timestamp: number; snapshot?: string } = {
      description,
      timestamp: Date.now(),
      snapshot,
    }
    operationLog.value.unshift(entry)
    if (operationLog.value.length > MAX_HISTORY) operationLog.value.length = MAX_HISTORY
    persistLog()
  }

  async function restoreToStep(index: number): Promise<void> {
    if (index < 0 || !currentWorkflow.value) return
    const entry = operationLog.value[index]
    if (!entry?.snapshot) return
    applySnapshot(entry.snapshot)
    operationLog.value.splice(0, index + 1)
    undoStack.value = []
    redoStack.value = []
    persistLog()
  }

  function undo(): void {
    if (undoStack.value.length === 0) return
    const snapshot = captureSnapshot()
    redoStack.value.push(captureSnapshot())
    applySnapshot(undoStack.value.pop()!)
    operationLog.value.unshift({ description: '撤销操作', timestamp: Date.now(), snapshot })
    if (operationLog.value.length > MAX_HISTORY) operationLog.value.length = MAX_HISTORY
    persistLog()
  }

  function redo(): void {
    if (redoStack.value.length === 0) return
    const snapshot = captureSnapshot()
    undoStack.value.push(captureSnapshot())
    applySnapshot(redoStack.value.pop()!)
    operationLog.value.unshift({ description: '重做操作', timestamp: Date.now(), snapshot })
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
        a.operationHistory.save(currentWorkflow.value!.id, JSON.parse(JSON.stringify(operationLog.value)))
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

  async function clearHistory(): Promise<void> {
    const workflowId = currentWorkflow.value?.id
    if (!workflowId) return
    await api().operationHistory.clear(workflowId)
  }

  return {
    undoStack, redoStack, operationLog, pushUndo, undo, redo, restoreToStep,
    reset: () => { undoStack.value = []; redoStack.value = []; operationLog.value = [] },
    loadOperationHistory: loadFromDisk,
    clearOperationHistory: clearHistory,
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

  function appendCompletedLog(log: ExecutionLog, workflowId: string, snapshot?: { nodes: any[]; edges: any[] }) {
    if (!log.id) {
      log.id = `exec-${Date.now()}`
    }
    log.workflowId = workflowId
    if (snapshot) log.snapshot = JSON.parse(JSON.stringify(snapshot))
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
      if (currentWorkflow.value?.id === plain.id) currentWorkflow.value.updatedAt = now
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
  selectedNodeIds: Ref<string[]>,
  executionStatus: Ref<EngineStatus>,
  executionLog: Ref<ExecutionLog | null>,
  executionContext: Ref<Record<string, any>>,
  undoRedo: ReturnType<typeof createUndoRedoManager>,
  groupActions: ReturnType<typeof createGroupActions>,
) {
  interface AddNodeOptions {
    sourceNodeId?: string | null
    sourceHandle?: string | null
    scopeNodeId?: string | null
  }

  function cloneData<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T
  }

  function getNode(nodeId: string): WorkflowNode | undefined {
    return currentWorkflow.value?.nodes.find((node) => node.id === nodeId)
  }

  function getEdge(edgeId: string) {
    return currentWorkflow.value?.edges.find((edge) => edge.id === edgeId)
  }

  function isNodeManaged(nodeId: string): boolean {
    const node = getNode(nodeId)
    return !!node && isGeneratedWorkflowNode(node)
  }

  function canDeleteNode(nodeId: string): boolean {
    const node = getNode(nodeId)
    if (!node) return false
    return !isGeneratedWorkflowNode(node)
  }

  function canCloneNode(nodeId: string): boolean {
    return canDeleteNode(nodeId)
  }

  function canEditNodeLabel(nodeId: string): boolean {
    const node = getNode(nodeId)
    if (!node) return false
    return !node.composite?.generated
  }

  function canDeleteEdge(edgeId: string): boolean {
    const edge = getEdge(edgeId)
    if (!edge) return false
    return !isLockedWorkflowEdge(edge)
  }

  function canCreateNode(type: string): boolean {
    const def = getNodeDefinition(type)
    return def?.manualCreate !== false
  }

  function createNodeData(type: string): Record<string, any> {
    const def = getNodeDefinition(type)
    const data: Record<string, any> = {}
    if (def?.properties?.length) {
      for (const prop of def.properties) {
        if (prop.default !== undefined) data[prop.key] = cloneData(prop.default)
      }
    }
    if (def?.outputs?.length) data.outputs = cloneData(def.outputs)
    return data
  }

  function getScopeOwnerNode(nodeId: string): WorkflowNode | null {
    const node = getNode(nodeId)
    if (!node) return null

    if (isScopeBoundaryWorkflowNode(node)) {
      return node
    }

    let current: WorkflowNode | undefined = node
    while (current) {
      const parentId = getCompositeParentId(current)
      if (!parentId) return null
      const parent = getNode(parentId)
      if (!parent) return null
      if (isScopeBoundaryWorkflowNode(parent)) {
        return parent
      }
      current = parent
    }

    return null
  }

  function getScopeOwnerId(nodeId: string): string | null {
    return getScopeOwnerNode(nodeId)?.id ?? null
  }

  function getInsertScopeNode(sourceNodeId?: string | null, sourceHandle?: string | null, scopeNodeId?: string | null): WorkflowNode | null {
    if (scopeNodeId) {
      return getNode(scopeNodeId) || null
    }
    if (!sourceNodeId) return null
    if (sourceHandle === LOOP_BODY_SOURCE_HANDLE) {
      return findLoopBodyNode(sourceNodeId) || null
    }
    return getScopeOwnerNode(sourceNodeId)
  }

  function getConnectionScopeOwnerId(sourceId: string, sourceHandle: string | null = null): string | null {
    const scopedNode = getInsertScopeNode(sourceId, sourceHandle, null)
    if (scopedNode) return scopedNode.id
    return getScopeOwnerId(sourceId)
  }

  function canConnectNodes(sourceId: string, targetId: string, sourceHandle: string | null = null): { ok: boolean; reason?: string } {
    const source = getNode(sourceId)
    const target = getNode(targetId)
    if (!source || !target) return { ok: false, reason: '连线节点不存在' }

    const sourceScopeId = getConnectionScopeOwnerId(sourceId, sourceHandle)
    const targetScopeId = getScopeOwnerId(targetId)
    if (sourceScopeId !== targetScopeId) {
      return { ok: false, reason: '不能跨循环体边界连线' }
    }

    if (target.composite?.generated && target.id !== source.id) {
      return { ok: false, reason: '内部锚点节点不允许手动作为连线目标' }
    }

    return { ok: true }
  }

  function appendNode(node: WorkflowNode): WorkflowNode {
    currentWorkflow.value!.nodes.push(node)
    return node
  }

  function appendEdge(edge: Workflow['edges'][number]): void {
    currentWorkflow.value!.edges.push(edge)
  }

  function createCompoundNodes(
    type: string,
    position: { x: number; y: number },
    options?: AddNodeOptions,
  ): WorkflowNode[] {
    const def = getNodeDefinition(type)
    if (!def?.compound) {
      const scopeNode = getInsertScopeNode(options?.sourceNodeId, options?.sourceHandle, options?.scopeNodeId)
      const nextPosition = scopeNode
        ? {
            x: position.x - scopeNode.position.x,
            y: position.y - scopeNode.position.y,
          }
        : position
      const node: WorkflowNode = {
        id: crypto.randomUUID(),
        type,
        label: def?.label || type,
        position: nextPosition,
        data: createNodeData(type),
        composite: scopeNode
          ? {
              rootId: scopeNode.composite?.rootId || scopeNode.id,
              parentId: scopeNode.id,
              generated: false,
              hidden: false,
            }
          : undefined,
      }
      appendNode(node)
      return [node]
    }

    const roleMap = new Map<string, WorkflowNode>()
    const rootRole = def.compound.rootRole || def.compound.children[0]?.role
    if (!rootRole) return []

    for (const childDef of def.compound.children) {
      const isRoot = childDef.role === rootRole
      const nodeType = childDef.type
      const nodeDefinition = getNodeDefinition(nodeType)
      const baseLabel = childDef.label || nodeDefinition?.label || nodeType
      const offset = childDef.offset || { x: 0, y: 0 }
      const node: WorkflowNode = {
        id: crypto.randomUUID(),
        type: nodeType,
        label: isRoot ? (def.label || baseLabel) : baseLabel,
        position: {
          x: position.x + offset.x,
          y: position.y + offset.y,
        },
        data: {
          ...createNodeData(nodeType),
          ...(childDef.data ? cloneData(childDef.data) : {}),
        },
        composite: {
          role: childDef.role,
          generated: !isRoot,
          hidden: !!childDef.hidden,
          scopeBoundary: !!childDef.scopeBoundary,
        },
      }
      roleMap.set(childDef.role, appendNode(node))
    }

    const rootNode = roleMap.get(rootRole)
    if (!rootNode) return []
    rootNode.composite = {
      ...(rootNode.composite || {}),
      rootId: rootNode.id,
      parentId: null,
      generated: false,
      hidden: false,
    }

    for (const childDef of def.compound.children) {
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

    for (const edgeDef of def.compound.edges || []) {
      const sourceNode = roleMap.get(edgeDef.sourceRole)
      const targetNode = roleMap.get(edgeDef.targetRole)
      if (!sourceNode || !targetNode) continue
      appendEdge({
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

    return [rootNode, ...currentWorkflow.value!.nodes.filter((node) => node.composite?.rootId === rootNode.id && node.id !== rootNode.id)]
  }

  function findLoopBodyNode(loopNodeId: string): WorkflowNode | undefined {
    if (!currentWorkflow.value) return undefined
    return findCompositeChildByRole(currentWorkflow.value.nodes, loopNodeId, LOOP_BODY_ROLE)
  }

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
    selectedNodeIds.value = []
    executionStatus.value = 'idle'
    executionLog.value = null
    executionContext.value = {}
  }

  function addNode(type: string, position: { x: number; y: number }, options?: AddNodeOptions): WorkflowNode {
    undoRedo.pushUndo(`添加节点: ${type}`)
    if (!canCreateNode(type)) {
      throw new Error(`节点类型 ${type} 不允许手动创建`)
    }
    const createdNodes = createCompoundNodes(type, position, options)
    const rootNode = createdNodes[0]
    if (!rootNode) {
      throw new Error(`节点类型 ${type} 创建失败`)
    }
    return rootNode
  }

  function removeNode(nodeId: string): void {
    if (!currentWorkflow.value) return
    if (!canDeleteNode(nodeId)) return
    undoRedo.pushUndo('删除节点')
    const rootNode = getNode(nodeId)
    if (!rootNode) return
    const rootId = getCompositeRootId(rootNode)
    const deleteNodeIds = new Set(
      currentWorkflow.value.nodes
        .filter((node) => getCompositeRootId(node) === rootId)
        .map((node) => node.id),
    )
    // 清理分组引用
    for (const did of deleteNodeIds) {
      groupActions.cleanupGroupOnNodeDelete(did)
    }
    currentWorkflow.value.nodes = currentWorkflow.value.nodes.filter((node) => !deleteNodeIds.has(node.id))
    currentWorkflow.value.edges = currentWorkflow.value.edges.filter(
      (edge) => !deleteNodeIds.has(edge.source) && !deleteNodeIds.has(edge.target) && edge.composite?.rootId !== rootId,
    )
    selectedNodeIds.value = selectedNodeIds.value.filter((id) => !deleteNodeIds.has(id))
  }

  function cloneNode(nodeId: string): WorkflowNode | null {
    if (!currentWorkflow.value) return null
    if (!canCloneNode(nodeId)) return null
    undoRedo.pushUndo('克隆节点')
    const source = currentWorkflow.value.nodes.find((n) => n.id === nodeId)
    if (!source) return null
    const def = getNodeDefinition(source.type)
    if (def?.compound) {
      const createdNodes = createCompoundNodes(source.type, {
        x: source.position.x + 30,
        y: source.position.y + 30,
      })
      const cloned = createdNodes[0]
      if (!cloned) return null
      cloned.data = cloneData(source.data)
      cloned.label = source.label
      const sourceChildren = currentWorkflow.value.nodes.filter((node) => node.composite?.rootId === source.id)
      const createdChildren = createdNodes.filter((node) => node.id !== cloned.id)
      for (const createdChild of createdChildren) {
        const role = createdChild.composite?.role
        if (!role) continue
        const sourceChild = sourceChildren.find((node) => node.composite?.role === role)
        if (!sourceChild) continue
        createdChild.data = cloneData(sourceChild.data)
        createdChild.label = sourceChild.label
      }
      return cloned
    }
    const cloned: WorkflowNode = {
      id: crypto.randomUUID(),
      type: source.type,
      label: source.label,
      position: { x: source.position.x + 30, y: source.position.y + 30 },
      data: cloneData(source.data),
      composite: source.composite ? cloneData(source.composite) : undefined,
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

  function updateEmbeddedWorkflow(
    nodeId: string,
    embeddedWorkflow: EmbeddedWorkflow,
    options?: { pushUndo?: boolean; description?: string },
  ): void {
    const node = currentWorkflow.value?.nodes.find((n) => n.id === nodeId)
    if (!node) return
    if (options?.pushUndo !== false) {
      undoRedo.pushUndo(options?.description || '')
    }
    node.data = {
      ...node.data,
      bodyWorkflow: embeddedWorkflow,
    }
  }

  function updateNodeLabel(nodeId: string, label: string): void {
    if (!canEditNodeLabel(nodeId)) return
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
    const connectCheck = canConnectNodes(source, target, sourceHandle)
    if (!connectCheck.ok) return
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
    if (!canDeleteEdge(edgeId)) return
    undoRedo.pushUndo('删除连线')
    currentWorkflow.value.edges = currentWorkflow.value.edges.filter((e) => e.id !== edgeId)
  }

  return {
    newWorkflow,
    addNode,
    removeNode,
    cloneNode,
    updateNodeData,
    updateEmbeddedWorkflow,
    updateNodePosition,
    updateNodeLabel,
    updateNodeState,
    addEdge,
    removeEdge,
    canDeleteNode,
    canCloneNode,
    canEditNodeLabel,
    canDeleteEdge,
    canConnectNodes,
    canCreateNode,
    isNodeManaged,
    findLoopBodyNode,
  }
}

// ====== 执行控制 ======

function createExecutionActions(
  currentWorkflow: Ref<Workflow | null>,
  executionStatus: Ref<EngineStatus>,
  executionLog: Ref<ExecutionLog | null>,
  executionContext: Ref<Record<string, any>>,
  execLogMgr: ReturnType<typeof createExecutionLogManager>,
  loadData: () => Promise<void>,
  saveWorkflow: (workflow: Workflow) => Promise<void>,
) {
  let currentExecutionId: string | null = null
  let startingExecution = false
  const backendConnectionState = ref<'idle' | 'connected' | 'reconnecting' | 'error'>('idle')
  const backendReconnectAttempt = ref(0)
  const backendLastError = ref<string | null>(null)

  function applyLogSnapshot(log: ExecutionLog | null | undefined): void {
    if (!log?.snapshot || !currentWorkflow.value) return
    currentWorkflow.value.nodes = JSON.parse(JSON.stringify(log.snapshot.nodes))
    currentWorkflow.value.edges = JSON.parse(JSON.stringify(log.snapshot.edges))
  }

  async function recoverExecutionState(): Promise<void> {
    const workflowId = currentWorkflow.value?.id
    if (!workflowId) return
    if (!currentExecutionId && executionStatus.value === 'idle') return

    try {
      const response = await createWorkflowDomainApi().workflow.getExecutionRecovery(workflowId, currentExecutionId)
      if (!response.found || !response.execution) {
        if (executionStatus.value === 'running' || executionStatus.value === 'paused') {
          executionStatus.value = 'error'
          backendLastError.value = '执行恢复失败：后端未找到对应 execution snapshot'
        }
        return
      }

      applyRecoveredExecution(response.execution)
    } catch (error) {
      backendLastError.value = error instanceof Error ? error.message : String(error)
    }
  }

  function applyRecoveredExecution(recovery: ExecutionRecoveryState): void {
    currentExecutionId = recovery.executionId
    executionStatus.value = recovery.status
    executionLog.value = recovery.log
    executionContext.value = recovery.context as Record<string, any>
    applyLogSnapshot(recovery.log)

    if (!recovery.active && (recovery.status === 'completed' || recovery.status === 'error')) {
      if (execLogMgr.selectedExecutionLogId.value !== recovery.log.id) {
        execLogMgr.selectedExecutionLogId.value = recovery.log.id
      }
      void execLogMgr.loadExecutionLogs().catch(() => {})
    }
  }

  function handleExecutionEvent(channel: ExecutionEventChannel, payload: ExecutionEventMap[ExecutionEventChannel]) {
    const workflowId = currentWorkflow.value?.id
    if (workflowId && payload.workflowId && payload.workflowId !== workflowId) return

    switch (channel) {
      case 'workflow:started':
        currentExecutionId = payload.executionId
        executionStatus.value = 'running'
        executionLog.value = null
        executionContext.value = {}
        execLogMgr.selectedExecutionLogId.value = null
        break
      case 'workflow:paused':
        executionStatus.value = 'paused'
        break
      case 'workflow:resumed':
        executionStatus.value = 'running'
        break
      case 'execution:log':
        executionLog.value = (payload as ExecutionEventMap['execution:log']).log
        applyLogSnapshot(executionLog.value)
        break
      case 'execution:context':
        executionContext.value = (payload as ExecutionEventMap['execution:context']).context as Record<string, any>
        break
      case 'workflow:completed':
        currentExecutionId = payload.executionId
        executionStatus.value = 'completed'
        executionLog.value = (payload as ExecutionEventMap['workflow:completed']).log
        executionContext.value = (payload as ExecutionEventMap['workflow:completed']).context as Record<string, any>
        applyLogSnapshot(executionLog.value)
        if (currentWorkflow.value) {
          const { nodes, edges } = currentWorkflow.value
          execLogMgr.appendCompletedLog((payload as ExecutionEventMap['workflow:completed']).log, currentWorkflow.value.id, { nodes, edges })
        }
        break
      case 'workflow:error':
        currentExecutionId = payload.executionId
        executionStatus.value = 'error'
        if ((payload as ExecutionEventMap['workflow:error']).log) {
          executionLog.value = (payload as ExecutionEventMap['workflow:error']).log || null
          applyLogSnapshot(executionLog.value)
          if (currentWorkflow.value) {
            const { nodes, edges } = currentWorkflow.value
            execLogMgr.appendCompletedLog((payload as ExecutionEventMap['workflow:error']).log!, currentWorkflow.value.id, { nodes, edges })
          }
        }
        break
      default:
        break
    }
  }

  const executionChannels: ExecutionEventChannel[] = [
    'workflow:started',
    'workflow:paused',
    'workflow:resumed',
    'workflow:completed',
    'workflow:error',
    'node:start',
    'node:progress',
    'node:complete',
    'node:error',
    'execution:log',
    'execution:context',
  ]

  ensureWorkflowInteractionHandler()
  for (const channel of executionChannels) {
    wsBridge.on(channel, (data) => handleExecutionEvent(channel, data as ExecutionEventMap[typeof channel]))
  }
  wsBridge.on('ws:connected', () => {
    backendConnectionState.value = 'connected'
    backendReconnectAttempt.value = 0
    backendLastError.value = null
    void loadData().catch((error) => {
      backendLastError.value = error instanceof Error ? error.message : String(error)
    })
    void recoverExecutionState()
  })
  wsBridge.on('ws:reconnected', () => {
    backendConnectionState.value = 'connected'
    backendLastError.value = null
    void loadData().catch((error) => {
      backendLastError.value = error instanceof Error ? error.message : String(error)
    })
    void recoverExecutionState()
  })
  wsBridge.on('ws:reconnecting', (payload) => {
    const state = payload as { attempt?: number }
    backendConnectionState.value = 'reconnecting'
    backendReconnectAttempt.value = state.attempt || 0
  })
  wsBridge.on('ws:error', (error) => {
    backendConnectionState.value = 'error'
    backendLastError.value = error instanceof Error
      ? error.message
      : typeof error === 'object' && error && 'message' in error
        ? String((error as { message?: unknown }).message)
        : String(error)
  })

  async function startExecution(): Promise<{ executionId: string | null; status: EngineStatus }> {
    if (!currentWorkflow.value || startingExecution) {
      return { executionId: null, status: executionStatus.value }
    }

    startingExecution = true
    try {
      backendLastError.value = null
      await saveWorkflow(currentWorkflow.value)
      const result = await createWorkflowDomainApi().workflow.execute(currentWorkflow.value.id)
      currentExecutionId = result.executionId
      executionStatus.value = result.status as EngineStatus
      return { executionId: currentExecutionId, status: executionStatus.value }
    } catch (error) {
      backendLastError.value = error instanceof Error ? error.message : String(error)
      executionStatus.value = 'error'
      return { executionId: currentExecutionId, status: executionStatus.value }
    } finally {
      startingExecution = false
    }
  }

  function pauseExecution(): void {
    if (!currentExecutionId) return
    createWorkflowDomainApi().workflow.pause(currentExecutionId)
  }

  async function resumeExecution(): Promise<void> {
    if (!currentExecutionId) return
    const result = await createWorkflowDomainApi().workflow.resume(currentExecutionId)
    currentExecutionId = result.executionId
    executionStatus.value = result.status as EngineStatus
  }

  async function stopExecution(): Promise<void> {
    if (!currentExecutionId) return
    const result = await createWorkflowDomainApi().workflow.stop(currentExecutionId)
    currentExecutionId = result.executionId
    executionStatus.value = result.status as EngineStatus
  }

  return {
    startExecution,
    pauseExecution,
    resumeExecution,
    stopExecution,
    backendConnectionState,
    backendReconnectAttempt,
    backendLastError,
  }
}

// ====== 单节点调试 ======

function createDebugActions(
  currentWorkflow: Ref<Workflow | null>,
  executionContext: Ref<Record<string, any>>,
) {
  const debugNodeStatus = ref<'idle' | 'running' | 'completed' | 'error'>('idle')
  const debugNodeResult = ref<{ status: 'completed' | 'error'; output?: any; error?: string; duration: number } | null>(null)
  const debugNodeId = ref<string | null>(null)

  async function debugSingleNode(nodeId: string, embeddedNode?: WorkflowNode): Promise<void> {
    if (!currentWorkflow.value) return
    const node = embeddedNode ?? currentWorkflow.value.nodes.find((n) => n.id === nodeId)
    if (!node) return

    debugNodeStatus.value = 'running'
    debugNodeResult.value = null
    debugNodeId.value = nodeId

    const result = await createWorkflowDomainApi().workflow.debugNode(currentWorkflow.value.id, nodeId, {
      context: executionContext.value,
      snapshot: {
        nodes: currentWorkflow.value.nodes,
        edges: currentWorkflow.value.edges,
      },
      embeddedNode,
    })

    debugNodeResult.value = result
    debugNodeStatus.value = result.status
  }

  function cancelDebug() {
    debugNodeStatus.value = 'idle'
    debugNodeResult.value = null
    debugNodeId.value = null
  }

  return { debugNodeStatus, debugNodeResult, debugNodeId, debugSingleNode, cancelDebug }
}

// ====== 分组管理 ======

const GRID_GAP = 30
const ARRANGE_PADDING = 20
const ARRANGE_HEADER_HEIGHT = 32
const GROUP_PADDING = 20
const GROUP_HEADER_HEIGHT = 32
const DEFAULT_NODE_WIDTH = 220
const DEFAULT_NODE_HEIGHT = 120

function createGroupActions(
  currentWorkflow: Ref<Workflow | null>,
  undoRedo: ReturnType<typeof createUndoRedoManager>,
) {
  // ── 辅助：确保 groups 数组存在 ──
  function ensureGroups(): WorkflowGroup[] {
    if (!currentWorkflow.value) return []
    if (!currentWorkflow.value.groups) {
      currentWorkflow.value.groups = []
    }
    return currentWorkflow.value.groups
  }

  function getNodeSize(node: WorkflowNode): { width: number; height: number } {
    return {
      width: typeof node.data?.width === 'number' ? node.data.width : DEFAULT_NODE_WIDTH,
      height: typeof node.data?.height === 'number' ? node.data.height : DEFAULT_NODE_HEIGHT,
    }
  }

  function computeNodeBounds(nodeIds: string[]): { x: number; y: number; width: number; height: number } | null {
    const workflow = currentWorkflow.value
    if (!workflow) return null
    const nodes = nodeIds
      .map(id => workflow.nodes.find(n => n.id === id))
      .filter((node): node is WorkflowNode => !!node)
    if (nodes.length === 0) return null

    const minX = Math.min(...nodes.map(node => node.position.x))
    const minY = Math.min(...nodes.map(node => node.position.y))
    const maxX = Math.max(...nodes.map(node => {
      const size = getNodeSize(node)
      return node.position.x + size.width
    }))
    const maxY = Math.max(...nodes.map(node => {
      const size = getNodeSize(node)
      return node.position.y + size.height
    }))

    return {
      x: minX - GROUP_PADDING,
      y: minY - GROUP_HEADER_HEIGHT - GROUP_PADDING,
      width: Math.max(100, maxX - minX + GROUP_PADDING * 2),
      height: Math.max(60, maxY - minY + GROUP_HEADER_HEIGHT + GROUP_PADDING * 2),
    }
  }

  function computeGroupBounds(group: WorkflowGroup): { x: number; y: number; width: number; height: number } | null {
    if (typeof group.x === 'number' && typeof group.y === 'number' && typeof group.width === 'number' && typeof group.height === 'number') {
      return { x: group.x, y: group.y, width: group.width, height: group.height }
    }

    const nodeBounds = computeNodeBounds(getDescendantNodeIds(group.id))
    if (!nodeBounds) return null
    return nodeBounds
  }

  function computeGroupItemBounds(nodeIds: string[], groupIds: string[]): { x: number; y: number; width: number; height: number } | null {
    const nodeBounds = computeNodeBounds(nodeIds)
    const boxes = [
      ...(nodeBounds ? [nodeBounds] : []),
      ...groupIds
        .map(id => getGroupById(id))
        .filter((group): group is WorkflowGroup => !!group)
        .map(group => computeGroupBounds(group))
        .filter((bounds): bounds is { x: number; y: number; width: number; height: number } => !!bounds),
    ]
    if (boxes.length === 0) return null

    const minX = Math.min(...boxes.map(box => box.x))
    const minY = Math.min(...boxes.map(box => box.y))
    const maxX = Math.max(...boxes.map(box => box.x + box.width))
    const maxY = Math.max(...boxes.map(box => box.y + box.height))

    return {
      x: minX - GROUP_PADDING,
      y: minY - GROUP_HEADER_HEIGHT - GROUP_PADDING,
      width: Math.max(100, maxX - minX + GROUP_PADDING * 2),
      height: Math.max(60, maxY - minY + GROUP_HEADER_HEIGHT + GROUP_PADDING * 2),
    }
  }

  // ── 查询方法 ──

  function getGroupOfNode(nodeId: string): WorkflowGroup | undefined {
    return (currentWorkflow.value?.groups || []).find(g => g.childNodeIds.includes(nodeId))
  }

  function getGroupById(groupId: string): WorkflowGroup | undefined {
    return (currentWorkflow.value?.groups || []).find(g => g.id === groupId)
  }

  function getParentGroup(groupId: string): WorkflowGroup | undefined {
    return (currentWorkflow.value?.groups || []).find(g => g.childGroupIds.includes(groupId))
  }

  function getDescendantNodeIds(groupId: string): string[] {
    const groups = currentWorkflow.value?.groups || []
    const group = groups.find(g => g.id === groupId)
    if (!group) return []
    const result = [...group.childNodeIds]
    for (const childGroupId of group.childGroupIds) {
      result.push(...getDescendantNodeIds(childGroupId))
    }
    return result
  }

  function getDescendantGroupIds(groupId: string): string[] {
    const groups = currentWorkflow.value?.groups || []
    const group = groups.find(g => g.id === groupId)
    if (!group) return []
    const result = [...group.childGroupIds]
    for (const childGroupId of group.childGroupIds) {
      result.push(...getDescendantGroupIds(childGroupId))
    }
    return result
  }

  // ── CRUD ──

  function createGroup(nodeIds: string[], name?: string): void {
    if (!currentWorkflow.value) return
    if (nodeIds.length === 0) return
    undoRedo.pushUndo('创建分组')

    const groups = ensureGroups()
    const groupId = 'group_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)
    const newGroup: WorkflowGroup = {
      id: groupId,
      name: name || `分组 ${groups.length + 1}`,
      childNodeIds: [],
      childGroupIds: [],
      locked: false,
      disabled: false,
      savedNodeStates: {},
    }

    const childGroupIds = new Set<string>()

    // 已经属于分组的节点不拆出原分组，而是把原分组嵌套到新分组中
    for (const nodeId of nodeIds) {
      const oldGroup = getGroupOfNode(nodeId)
      if (oldGroup) {
        childGroupIds.add(oldGroup.id)
        continue
      }
      newGroup.childNodeIds.push(nodeId)
    }

    for (const childGroupId of childGroupIds) {
      const parentGroup = getParentGroup(childGroupId)
      if (parentGroup) {
        parentGroup.childGroupIds = parentGroup.childGroupIds.filter(id => id !== childGroupId)
      }
      newGroup.childGroupIds.push(childGroupId)
    }

    const bounds = computeGroupItemBounds(newGroup.childNodeIds, newGroup.childGroupIds)
    if (bounds) {
      Object.assign(newGroup, bounds)
    }

    groups.push(newGroup)
  }

  function ungroup(groupId: string): void {
    if (!currentWorkflow.value) return
    const group = getGroupById(groupId)
    if (!group || group.locked) return
    undoRedo.pushUndo('解除分组')

    const groups = ensureGroups()
    const parentGroup = getParentGroup(groupId)

    // 子分组提升到父分组或顶层
    if (parentGroup) {
      for (const childGroupId of group.childGroupIds) {
        if (!parentGroup.childGroupIds.includes(childGroupId)) {
          parentGroup.childGroupIds.push(childGroupId)
        }
      }
      // 子节点的分组关系不变（它们仍由各自分组管理）
    }

    // 移除该分组
    currentWorkflow.value.groups = groups.filter(g => g.id !== groupId)
  }

  function deleteGroup(groupId: string): void {
    if (!currentWorkflow.value) return
    const group = getGroupById(groupId)
    if (!group) return
    undoRedo.pushUndo('删除分组')

    // 递归删除子分组
    for (const childGroupId of [...group.childGroupIds]) {
      deleteGroup(childGroupId)
    }

    // 删除子节点
    const nodesToRemove = new Set(group.childNodeIds)
    currentWorkflow.value.nodes = currentWorkflow.value.nodes.filter(n => !nodesToRemove.has(n.id))
    currentWorkflow.value.edges = currentWorkflow.value.edges.filter(
      e => !nodesToRemove.has(e.source) && !nodesToRemove.has(e.target)
    )

    // 从父分组中移除引用
    const parentGroup = getParentGroup(groupId)
    if (parentGroup) {
      parentGroup.childGroupIds = parentGroup.childGroupIds.filter(id => id !== groupId)
    }

    // 从 groups 数组中移除
    currentWorkflow.value.groups = (currentWorkflow.value.groups || []).filter(g => g.id !== groupId)
  }

  function addNodesToGroup(groupId: string, nodeIds: string[]): void {
    if (!currentWorkflow.value) return
    const group = getGroupById(groupId)
    if (!group) return
    undoRedo.pushUndo('加入分组')

    for (const nodeId of nodeIds) {
      // 从旧分组中移除（一对一关系）
      const oldGroup = getGroupOfNode(nodeId)
      if (oldGroup && oldGroup.id !== groupId) {
        oldGroup.childNodeIds = oldGroup.childNodeIds.filter(id => id !== nodeId)
      }
      // 加入新分组（避免重复）
      if (!group.childNodeIds.includes(nodeId)) {
        group.childNodeIds.push(nodeId)
      }
    }
  }

  function removeNodesFromGroup(groupId: string, nodeIds: string[]): void {
    if (!currentWorkflow.value) return
    const group = getGroupById(groupId)
    if (!group) return
    undoRedo.pushUndo('移出分组')
    group.childNodeIds = group.childNodeIds.filter(id => !nodeIds.includes(id))
  }

  function renameGroup(groupId: string, name: string): void {
    const group = getGroupById(groupId)
    if (!group) return
    undoRedo.pushUndo('重命名分组')
    group.name = name
  }

  function updateGroupBounds(groupId: string, bounds: { x?: number; y?: number; width?: number; height?: number }): void {
    const group = getGroupById(groupId)
    if (!group) return

    if (typeof bounds.x === 'number' && Number.isFinite(bounds.x)) {
      group.x = bounds.x
    }
    if (typeof bounds.y === 'number' && Number.isFinite(bounds.y)) {
      group.y = bounds.y
    }
    if (typeof bounds.width === 'number' && Number.isFinite(bounds.width)) {
      group.width = bounds.width
    }
    if (typeof bounds.height === 'number' && Number.isFinite(bounds.height)) {
      group.height = bounds.height
    }
  }

  const updateGroupSize = updateGroupBounds

  function updateGroupColor(groupId: string, color?: string): void {
    const group = getGroupById(groupId)
    if (!group) return
    undoRedo.pushUndo('修改分组颜色')
    group.color = color
  }

  // ── 状态切换 ──

  function toggleGroupLock(groupId: string): void {
    const group = getGroupById(groupId)
    if (!group) return
    undoRedo.pushUndo(group.locked ? '解除固定' : '固定分组')
    group.locked = !group.locked
  }

  function toggleGroupDisabled(groupId: string): void {
    if (!currentWorkflow.value) return
    const group = getGroupById(groupId)
    if (!group) return
    undoRedo.pushUndo(group.disabled ? '启用分组' : '禁用分组')

    if (!group.disabled) {
      // 禁用：记忆状态，设为 disabled
      group.savedNodeStates = {}
      const allNodeIds = getDescendantNodeIds(groupId)
      for (const nodeId of allNodeIds) {
        const node = currentWorkflow.value.nodes.find(n => n.id === nodeId)
        if (node) {
          group.savedNodeStates[nodeId] = node.nodeState || 'normal'
          node.nodeState = 'disabled'
        }
      }
      group.disabled = true
    } else {
      // 恢复：从 savedNodeStates 还原
      for (const [nodeId, state] of Object.entries(group.savedNodeStates)) {
        const node = currentWorkflow.value.nodes.find(n => n.id === nodeId)
        if (node) {
          node.nodeState = state
        }
      }
      group.savedNodeStates = {}
      group.disabled = false
    }
  }

  // ── 网格排列 ──

  function arrangeGroupNodes(groupId: string): void {
    if (!currentWorkflow.value) return
    const group = getGroupById(groupId)
    if (!group) return
    undoRedo.pushUndo('整理节点')

    const workflow = currentWorkflow.value

    // 获取直接子节点和子分组
    const childNodes = group.childNodeIds
      .map(id => workflow.nodes.find(n => n.id === id))
      .filter((n): n is NonNullable<typeof n> => !!n)

    if (childNodes.length === 0) return

    // 计算当前分组的 bounding box 作为可用区域
    const childGroupBoxes = group.childGroupIds
      .map(gid => getGroupById(gid))
      .filter(Boolean)
      .map(g => {
        const ids = getDescendantNodeIds(g!.id)
        const nodes = ids.map(id => workflow.nodes.find(n => n.id === id)).filter(Boolean)
        if (nodes.length === 0) return null
        return {
          id: g!.id,
          x: Math.min(...nodes.map(n => n!.position.x)),
          y: Math.min(...nodes.map(n => n!.position.y)),
          width: Math.max(...nodes.map(n => n!.position.x + Number(n!.data?.width || 220))) - Math.min(...nodes.map(n => n!.position.x)),
          height: Math.max(...nodes.map(n => n!.position.y + Number(n!.data?.height || 120))) - Math.min(...nodes.map(n => n!.position.y)),
        }
      })
      .filter(Boolean) as { id: string; x: number; y: number; width: number; height: number }[]

    // 计算起始位置（分组当前位置）
    const allItems = [
      ...childNodes.map(n => ({
        id: n.id,
        width: Number(n.data?.width || 220),
        height: Number(n.data?.height || 120),
      })),
      ...childGroupBoxes.map(b => ({ id: b.id, width: b.width, height: b.height })),
    ]

    if (allItems.length === 0) return

    // 计算可用宽度（基于当前最宽子节点的范围）
    const avgWidth = allItems.reduce((sum, item) => sum + item.width, 0) / allItems.length
    const groupLeft = Math.min(
      ...childNodes.map(n => n.position.x),
      ...(childGroupBoxes.length > 0 ? childGroupBoxes.map(b => b.x) : [Infinity])
    )
    const groupRight = Math.max(
      ...childNodes.map(n => n.position.x + Number(n.data?.width || 220)),
      ...(childGroupBoxes.length > 0 ? childGroupBoxes.map(b => b.x + b.width) : [-Infinity])
    )
    const availableWidth = Math.max((groupRight - groupLeft) || (avgWidth + GRID_GAP) * 2, avgWidth + GRID_GAP)

    // 确定列数
    const columns = Math.max(1, Math.floor((availableWidth + GRID_GAP) / (avgWidth + GRID_GAP)))

    // 起始位置
    const startX = groupLeft
    const startY = Math.min(
      ...childNodes.map(n => n.position.y),
      ...(childGroupBoxes.length > 0 ? childGroupBoxes.map(b => b.y) : [Infinity])
    )

    // 按网格排列
    allItems.forEach((item, index) => {
      const col = index % columns
      const row = Math.floor(index / columns)
      const cellWidth = (availableWidth + GRID_GAP) / columns
      const x = startX + col * cellWidth + (cellWidth - item.width) / 2
      const y = startY + row * (Math.max(...allItems.map(i => i.height)) + GRID_GAP)

      // 更新节点或子分组位置
      const node = workflow.nodes.find(n => n.id === item.id)
      if (node) {
        node.position = { x, y }
      } else {
        // 子分组：移动所有子孙节点
        const descendantIds = getDescendantNodeIds(item.id)
        const dx = x - (childGroupBoxes.find(b => b.id === item.id)?.x ?? 0)
        const dy = y - (childGroupBoxes.find(b => b.id === item.id)?.y ?? 0)
        for (const did of descendantIds) {
          const dnode = workflow.nodes.find(n => n.id === did)
          if (dnode) {
            dnode.position = { x: dnode.position.x + dx, y: dnode.position.y + dy }
          }
        }
      }
    })
  }

  // ── 节点删除时的分组清理 ──

  function cleanupGroupOnNodeDelete(nodeId: string): void {
    const group = getGroupOfNode(nodeId)
    if (!group) return
    group.childNodeIds = group.childNodeIds.filter(id => id !== nodeId)
    // 清理 savedNodeStates
    if (group.savedNodeStates[nodeId] !== undefined) {
      delete group.savedNodeStates[nodeId]
    }
  }

  return {
    getGroupOfNode,
    getGroupById,
    getParentGroup,
    getDescendantNodeIds,
    getDescendantGroupIds,
    createGroup,
    ungroup,
    deleteGroup,
    addNodesToGroup,
    removeNodesFromGroup,
    renameGroup,
    updateGroupBounds,
    updateGroupSize,
    updateGroupColor,
    toggleGroupLock,
    toggleGroupDisabled,
    arrangeGroupNodes,
    cleanupGroupOnNodeDelete,
  }
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
    const handler = (data: any) => {
      console.log('[workflow store] received workflow:updated:', data)
      if (data.workflowId === currentWorkflow.value?.id && data.changes) {
        console.log('[workflow store] merging changes:', data.changes)
        mergeWorkflowChanges(data.changes)
      } else {
        console.log('[workflow store] skipped:', { eventWorkflowId: data.workflowId, currentId: currentWorkflow.value?.id, hasChanges: !!data.changes })
      }
    }
    if (wsBridge.isConnected() || !navigator.userAgent.includes('Electron')) {
      wsBridge.on('workflow:updated', handler)
      return () => wsBridge.off('workflow:updated', handler)
    }
    return (window as any).api.on('workflow:updated', handler)
  }

  function listenForWorkflowToolRequests() {
    return () => {}
  }

  return { mergeWorkflowChanges, listenForFileUpdates, listenForWorkflowToolRequests }
}

// ====== 工厂函数 ======

export function createWorkflowStore(tabId: string) {
  const storeId = `workflow-tab-${tabId}`
  const useStore = defineStore(storeId, () => {
    const api = () => createWorkflowDomainApi()

    const workflows = ref<Workflow[]>([])
    const workflowFolders = ref<WorkflowFolder[]>([])
    const currentWorkflow = ref<Workflow | null>(null)
    const loadState = ref<'idle' | 'loading' | 'loaded' | 'error'>('idle')
    const loadError = ref<string | null>(null)
    const selectedNodeIds = ref<string[]>([])
    const selectedEmbeddedNode = ref<{
      hostNodeId: string
      nodeId: string
      node: WorkflowNode
    } | null>(null)
    const rightPanelTab = ref('properties')
    const executionStatus = ref<EngineStatus>('idle')
    const executionLog = ref<ExecutionLog | null>(null)
    const executionContext = ref<Record<string, any>>({})

    // 通用前端 UI interaction 状态（通过 ws-bridge 事件从 interaction.ts 注入）
    const pendingInteraction = ref<{
      interactionType: string
      executionId: string
      workflowId: string
      nodeId: string
      schema: unknown
    } | null>(null)

    function listenForUIInteractions(): () => void {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const handler = (data: any) => {
        pendingInteraction.value = data
      }
      wsBridge.on('interaction:ui_required', handler)
      return () => wsBridge.off('interaction:ui_required', handler)
    }

    const undoRedo = createUndoRedoManager(currentWorkflow, api)
    const execLogMgr = createExecutionLogManager(currentWorkflow, api)
    const versionMgr = createVersionManager(currentWorkflow, api)
    const dirtyTracker = createDirtyTracker()
    const crudActions = createCrudActions(workflows, workflowFolders, currentWorkflow, api, dirtyTracker, versionMgr)
    const groupActions = createGroupActions(currentWorkflow, undoRedo)
    const editActions = createEditActions(currentWorkflow, selectedNodeIds, executionStatus, executionLog, executionContext, undoRedo, groupActions)
    const execActions = createExecutionActions(
      currentWorkflow,
      executionStatus,
      executionLog,
      executionContext,
      execLogMgr,
      crudActions.loadData,
      crudActions.saveWorkflow,
    )
    const debugActions = createDebugActions(currentWorkflow, executionContext)
    const aiActions = createAIActions(currentWorkflow, undoRedo)

    const isPreview = ref(false)
    let _prePreviewWorkflow: Workflow | null = null

    const rootFolders = computed(() =>
      workflowFolders.value.filter((f) => f.parentId === null).sort((a, b) => a.order - b.order),
    )
    const selectedNodeId = computed(() => selectedNodeIds.value[0] ?? null)
    const selectedNode = computed(() => {
      if (selectedEmbeddedNode.value) return selectedEmbeddedNode.value.node
      if (!selectedNodeId.value || !currentWorkflow.value) return null
      return currentWorkflow.value.nodes.find((n) => n.id === selectedNodeId.value) || null
    })
    const effectiveSelectedNodeId = computed(() => selectedEmbeddedNode.value?.nodeId ?? selectedNodeId.value)
    const selectedNodes = computed(() => {
      if (!selectedNodeIds.value.length || !currentWorkflow.value) return []
      return selectedNodeIds.value
        .map((id) => currentWorkflow.value!.nodes.find((n) => n.id === id))
        .filter(Boolean) as WorkflowNode[]
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
      selectedEmbeddedNode.value = null
      execLogMgr.loadExecutionLogs()
      versionMgr.loadVersions()
      undoRedo.reset()
      undoRedo.loadOperationHistory()
    })

    return {
      tabId,
      rightPanelTab,
      workflows, workflowFolders, currentWorkflow, loadState, loadError, selectedNodeId, selectedNodeIds,
      selectedEmbeddedNode,
      effectiveSelectedNodeId,
      rootFolders, selectedNode, selectedNodes, executionValidationError,
      executionStatus, executionLog, executionContext,
      executionLogs: execLogMgr.executionLogs,
      selectedExecutionLogId: execLogMgr.selectedExecutionLogId,
      selectedExecutionLog,
      isPreview,
      enterPreview: (log: ExecutionLog) => {
        if (isPreview.value) return
        if (!log.snapshot || !currentWorkflow.value) return
        _prePreviewWorkflow = JSON.parse(JSON.stringify(currentWorkflow.value))
        currentWorkflow.value.nodes = JSON.parse(JSON.stringify(log.snapshot.nodes))
        currentWorkflow.value.edges = JSON.parse(JSON.stringify(log.snapshot.edges))
        isPreview.value = true
      },
      exitPreview: () => {
        if (!isPreview.value) return
        if (_prePreviewWorkflow && currentWorkflow.value) {
          currentWorkflow.value.nodes = _prePreviewWorkflow.nodes
          currentWorkflow.value.edges = _prePreviewWorkflow.edges
          _prePreviewWorkflow = null
        }
        execLogMgr.selectedExecutionLogId.value = null
        isPreview.value = false
      },
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
      pushUndo: undoRedo.pushUndo,
      redo: undoRedo.redo,
      canUndo: undoRedo.canUndo,
      canRedo: undoRedo.canRedo,
      undoStack: undoRedo.undoStack,
      redoStack: undoRedo.redoStack,
      operationLog: undoRedo.operationLog,
      restoreToStep: undoRedo.restoreToStep,
      clearOperationHistory: undoRedo.clearOperationHistory,
      versions: versionMgr.versions,
      loadVersions: versionMgr.loadVersions,
      saveVersion: versionMgr.saveVersion,
      deleteVersion: versionMgr.deleteVersion,
      restoreVersion: (versionId: string) => versionMgr.restoreVersion(versionId, undoRedo.pushUndo),
      isDirty: dirtyTracker.isDirty,
      markDirty: dirtyTracker.markDirty,
      pendingInteraction,
      listenForUIInteractions,
      ...aiActions,
      ...groupActions,
    }
  })
  return useStore()
}

// ====== Provide / Inject ======

// HMR 时 Symbol 会重新创建导致 inject 失败，用全局注册表复用同一个 key
export const WORKFLOW_STORE_KEY: symbol = (globalThis as any).__WORKFLOW_STORE_KEY__
  ?? ((globalThis as any).__WORKFLOW_STORE_KEY__ = Symbol('workflowStore'))

export function provideWorkflowStore(store: WorkflowStore) {
  provide(WORKFLOW_STORE_KEY, store)
}

export function useWorkflowStore(): WorkflowStore {
  const store = inject<WorkflowStore>(WORKFLOW_STORE_KEY)
  if (!store) {
    throw new Error('useWorkflowStore() must be called inside a WorkflowEditor')
  }
  return store
}
