import { type Ref } from 'vue'
import type { Workflow, WorkflowNode, EmbeddedWorkflow, OutputField, NodeBreakpoint } from '@/lib/workflow/types'
import type { EngineStatus, ExecutionLog } from '@shared/workflow-types'
import { getNodeDefinition } from '@/lib/workflow/nodeRegistry'
import { createWorkflowDomainApi } from '@/lib/backend-api/workflow-domain'
import { useAgentSettingsStore, createWorkflowAgentConfigFromGlobal } from '@/stores/agent-settings'
import {
  findCompositeChildByRole,
  getCompositeParentId,
  getCompositeRootId,
  isGeneratedWorkflowNode,
  isLockedWorkflowEdge,
  isScopeBoundaryWorkflowNode,
  LOOP_BODY_ROLE,
  LOOP_NODE_TYPE,
  LOOP_BODY_SOURCE_HANDLE,
  LOOP_NEXT_SOURCE_HANDLE,
} from '@shared/workflow-composite'
import type { createUndoRedoManager } from './undo-redo'
import type { createGroupActions } from './group'

interface AddNodeOptions {
  sourceNodeId?: string | null
  sourceHandle?: string | null
  scopeNodeId?: string | null
}

export function createEditActions(
  currentWorkflow: Ref<Workflow | null>,
  workflows: Ref<Workflow[]>,
  selectedNodeIds: Ref<string[]>,
  executionStatus: Ref<EngineStatus>,
  executionLog: Ref<ExecutionLog | null>,
  executionContext: Ref<Record<string, any>>,
  undoRedo: ReturnType<typeof createUndoRedoManager>,
  groupActions: ReturnType<typeof createGroupActions>,
) {
  function cloneData<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T
  }

  function makeInputReference(nodeId: string, fieldPath: string): string {
    return `{{ __inputs__["${nodeId}"].${fieldPath} }}`
  }

  function makeDataReference(nodeId: string, fieldPath: string): string {
    return `{{ __data__["${nodeId}"].${fieldPath} }}`
  }

  function sanitizeFieldKey(value: string): string {
    const key = value.trim().replace(/[^\w]+/g, '_').replace(/^_+|_+$/g, '')
    return key || 'input'
  }

  function normalizeInputKey(baseKey: string, usedKeys: Set<string>): string {
    let key = sanitizeFieldKey(baseKey)
    let index = 2
    while (usedKeys.has(key)) {
      key = `${sanitizeFieldKey(baseKey)}_${index}`
      index += 1
    }
    usedKeys.add(key)
    return key
  }

  function getReferenceFieldKey(node: WorkflowNode | undefined, fieldPath: string): string {
    const prefix = node?.label || node?.type || 'input'
    const leaf = fieldPath.split('.').filter(Boolean).at(-1) || 'value'
    return `${prefix}_${leaf}`
  }

  function collectExternalReferences(value: unknown, selectedIds: Set<string>): Array<{ raw: string; source: '__data__' | '__inputs__'; nodeId: string; fieldPath: string }> {
    const refs: Array<{ raw: string; source: '__data__' | '__inputs__'; nodeId: string; fieldPath: string }> = []
    const pattern = /\{\{\s*(__data__|__inputs__)\[(["'])([^"']+)\2\]\.([^}]+?)\s*\}\}/g

    const visit = (item: unknown) => {
      if (typeof item === 'string') {
        for (const match of item.matchAll(pattern)) {
          const nodeId = match[3]
          if (!selectedIds.has(nodeId)) {
            refs.push({
              raw: match[0],
              source: match[1] as '__data__' | '__inputs__',
              nodeId,
              fieldPath: match[4].trim(),
            })
          }
        }
        return
      }
      if (Array.isArray(item)) {
        for (const child of item) visit(child)
        return
      }
      if (item && typeof item === 'object') {
        for (const child of Object.values(item)) visit(child)
      }
    }

    visit(value)
    return refs
  }

  function replaceReferences(value: unknown, replacements: Map<string, string>): unknown {
    if (typeof value === 'string') {
      let next = value
      for (const [raw, replacement] of replacements) {
        next = next.split(raw).join(replacement)
      }
      return next
    }
    if (Array.isArray(value)) return value.map((item) => replaceReferences(item, replacements))
    if (value && typeof value === 'object') {
      const next: Record<string, unknown> = {}
      for (const [key, child] of Object.entries(value)) {
        next[key] = replaceReferences(child, replacements)
      }
      return next
    }
    return value
  }

  function clearStartInputFieldValues(workflow: { nodes?: WorkflowNode[] }): void {
    if (!Array.isArray(workflow.nodes)) return
    for (const node of workflow.nodes) {
      if (node.type === 'start' && Array.isArray(node.data?.inputFields)) {
        node.data.inputFields = node.data.inputFields.map((field: OutputField) => {
          const next = { ...field }
          delete next.value
          return next
        })
      }
      const bodyWorkflow = node.data?.bodyWorkflow
      if (bodyWorkflow && typeof bodyWorkflow === 'object') {
        clearStartInputFieldValues(bodyWorkflow as { nodes?: WorkflowNode[] })
      }
    }
  }

  function remapSelectedWorkflowNodes(
    nodes: WorkflowNode[],
    edges: Workflow['edges'],
    selectedIds: Set<string>,
    selectedRootIds: Set<string>,
    startNodeId: string,
    endNodeId: string,
  ): { nodes: WorkflowNode[]; edges: Workflow['edges'] } {
    const selectedNodes = nodes.filter((node) => selectedIds.has(node.id)).map((node) => cloneData(node))
    const selectedEdges = edges.filter((edge) => selectedIds.has(edge.source) && selectedIds.has(edge.target)).map((edge) => cloneData(edge))
    const selectedRootNodes = nodes.filter((node) => selectedRootIds.has(node.id)).map((node) => cloneData(node))
    const rootEdges = edges.filter((edge) => selectedRootIds.has(edge.source) && selectedRootIds.has(edge.target))
    const firstNode = [...selectedRootNodes]
      .filter((node) => !rootEdges.some((edge) => edge.target === node.id))
      .sort((a, b) => a.position.x - b.position.x || a.position.y - b.position.y)[0]
      ?? [...selectedRootNodes].sort((a, b) => a.position.x - b.position.x || a.position.y - b.position.y)[0]
    const lastNode = [...selectedRootNodes]
      .filter((node) => !rootEdges.some((edge) => edge.source === node.id))
      .sort((a, b) => b.position.x - a.position.x || b.position.y - a.position.y)[0]
      ?? [...selectedRootNodes].sort((a, b) => b.position.x - a.position.x || b.position.y - a.position.y)[0]
    const firstTargetHandle = firstNode
      ? rootEdges.find((edge) => edge.target === firstNode.id)?.targetHandle ?? null
      : null

    const entryEdges = firstNode ? [{
      id: `e-${startNodeId}-default-${firstNode.id}-${firstTargetHandle ?? 'default'}`,
      source: startNodeId,
      target: firstNode.id,
      sourceHandle: null,
      targetHandle: firstTargetHandle,
    }] : []
    const exitSourceHandle = lastNode?.type === LOOP_NODE_TYPE ? LOOP_NEXT_SOURCE_HANDLE : null
    const exitEdges = lastNode ? [{
      id: `e-${lastNode.id}-${exitSourceHandle ?? 'default'}-${endNodeId}-default`,
      source: lastNode.id,
      target: endNodeId,
      sourceHandle: exitSourceHandle,
      targetHandle: null,
    }] : []

    return {
      nodes: selectedNodes,
      edges: [...selectedEdges, ...entryEdges, ...exitEdges],
    }
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

  function updateNodeBreakpoint(nodeId: string, breakpoint: NodeBreakpoint | null): void {
    undoRedo.pushUndo('修改节点断点')
    const node = currentWorkflow.value?.nodes.find((n) => n.id === nodeId)
    if (!node) return
    if (breakpoint) {
      node.breakpoint = breakpoint
    } else {
      delete node.breakpoint
    }
  }

  function updateNodeColor(nodeId: string, color: string | null): void {
    undoRedo.pushUndo('修改节点颜色')
    const node = currentWorkflow.value?.nodes.find((n) => n.id === nodeId)
    if (!node) return
    if (color) {
      node.nodeColor = color
    } else {
      delete node.nodeColor
    }
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

  async function mergeNodesToSubWorkflow(nodeIds: string[]): Promise<Workflow | null> {
    const workflow = currentWorkflow.value
    if (!workflow) return null

    const rootIds = new Set(nodeIds.filter((id) => canDeleteNode(id)))
    if (rootIds.size < 2) return null
    if ([...rootIds].some((id) => {
      const type = getNode(id)?.type
      return type === 'start' || type === 'end'
    })) {
      return null
    }

    const selectedIds = new Set<string>()
    for (const node of workflow.nodes) {
      const rootId = getCompositeRootId(node)
      if (rootIds.has(rootId)) {
        selectedIds.add(node.id)
      }
    }

    const nodes = workflow.nodes.filter((node) => selectedIds.has(node.id))
    if (nodes.length < 2) return null

    const startNodeId = crypto.randomUUID()
    const endNodeId = crypto.randomUUID()
    const subNodeId = crypto.randomUUID()
    const bounds = {
      minX: Math.min(...nodes.map((node) => node.position.x)),
      minY: Math.min(...nodes.map((node) => node.position.y)),
      maxX: Math.max(...nodes.map((node) => node.position.x)),
    }

    const usedInputKeys = new Set<string>()
    const replacements = new Map<string, string>()
    const startInputFields: OutputField[] = []
    const subNodeInputFields: OutputField[] = []

    for (const refItem of collectExternalReferences(nodes.map((node) => node.data), selectedIds)) {
      if (replacements.has(refItem.raw)) continue
      const sourceNode = workflow.nodes.find((node) => node.id === refItem.nodeId)
      const inputKey = normalizeInputKey(getReferenceFieldKey(sourceNode, refItem.fieldPath), usedInputKeys)
      const originalReference = refItem.source === '__inputs__'
        ? makeInputReference(refItem.nodeId, refItem.fieldPath)
        : makeDataReference(refItem.nodeId, refItem.fieldPath)
      startInputFields.push({ key: inputKey, type: 'any' })
      subNodeInputFields.push({ key: inputKey, type: 'any', value: originalReference })
      replacements.set(refItem.raw, makeInputReference(startNodeId, inputKey))
    }

    const selectedSnapshot = remapSelectedWorkflowNodes(workflow.nodes, workflow.edges, selectedIds, rootIds, startNodeId, endNodeId)
    const extractedNodes = selectedSnapshot.nodes.map((node) => ({
      ...node,
      data: replaceReferences(node.data, replacements) as Record<string, any>,
      position: {
        x: node.position.x - bounds.minX + 260,
        y: node.position.y - bounds.minY + 120,
      },
    }))
    clearStartInputFieldValues({ nodes: extractedNodes })
    const now = Date.now()
    const newWorkflow: Workflow = {
      id: crypto.randomUUID(),
      name: `${workflow.name}-子工作流`,
      folderId: workflow.folderId,
      nodes: [
        { id: startNodeId, type: 'start', label: '开始', position: { x: 80, y: 120 }, data: { inputFields: startInputFields } },
        ...extractedNodes,
        { id: endNodeId, type: 'end', label: '结束', position: { x: bounds.maxX - bounds.minX + 520, y: 120 }, data: {} },
      ],
      edges: selectedSnapshot.edges,
      createdAt: now,
      updatedAt: now,
      enabledPlugins: workflow.enabledPlugins ? cloneData(workflow.enabledPlugins) : undefined,
      pluginConfigSchemes: workflow.pluginConfigSchemes ? cloneData(workflow.pluginConfigSchemes) : undefined,
      agentConfig: workflow.agentConfig ? cloneData(workflow.agentConfig) : undefined,
    }

    const { id: _localId, ...workflowToCreate } = newWorkflow
    void _localId
    const createdWorkflow = await createWorkflowDomainApi().workflow.create(workflowToCreate) as Workflow
    if (!workflows.value.some((item) => item.id === createdWorkflow.id)) {
      workflows.value.push(createdWorkflow)
    }

    undoRedo.pushUndo('合并为子工作流')
    const incomingEdges = workflow.edges.filter((edge) => !selectedIds.has(edge.source) && selectedIds.has(edge.target))
    const outgoingEdges = workflow.edges.filter((edge) => selectedIds.has(edge.source) && !selectedIds.has(edge.target))
    const replacementNode: WorkflowNode = {
      id: subNodeId,
      type: 'sub_workflow',
      label: '子工作流',
      position: { x: bounds.minX, y: bounds.minY },
      data: {
        workflowId: createdWorkflow.id,
        workflowName: createdWorkflow.name,
        inputFields: subNodeInputFields,
      },
    }

    const replacementEdges: Workflow['edges'] = []
    for (const edge of incomingEdges) {
      const id = `e-${edge.source}-${edge.sourceHandle ?? 'default'}-${subNodeId}-default`
      if (!replacementEdges.some((item) => item.id === id)) {
        replacementEdges.push({ ...cloneData(edge), id, target: subNodeId, targetHandle: null })
      }
    }
    for (const edge of outgoingEdges) {
      const id = `e-${subNodeId}-default-${edge.target}-${edge.targetHandle ?? 'default'}`
      if (!replacementEdges.some((item) => item.id === id)) {
        replacementEdges.push({ ...cloneData(edge), id, source: subNodeId, sourceHandle: null })
      }
    }

    workflow.nodes = [
      ...workflow.nodes.filter((node) => !selectedIds.has(node.id)),
      replacementNode,
    ]
    workflow.edges = [
      ...workflow.edges.filter((edge) => !selectedIds.has(edge.source) && !selectedIds.has(edge.target)),
      ...replacementEdges,
    ]
    for (const id of selectedIds) {
      groupActions.cleanupGroupOnNodeDelete(id)
    }
    selectedNodeIds.value = [subNodeId]
    return createdWorkflow
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
    updateNodeBreakpoint,
    updateNodeColor,
    addEdge,
    removeEdge,
    mergeNodesToSubWorkflow,
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
