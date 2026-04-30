import { defineStore } from 'pinia'
import { ref, computed, watch, inject, provide } from 'vue'
import type { Workflow, WorkflowFolder, WorkflowNode, ExecutionLog } from '@/lib/workflow/types'
import type { EngineStatus } from '@shared/workflow-types'
import { createWorkflowDomainApi } from '@/lib/backend-api/workflow-domain'
import { wsBridge } from '@/lib/ws-bridge'
import { validateWorkflowExecution, type WorkflowChanges } from './utils'
import { createUndoRedoManager } from './undo-redo'
import { createExecutionLogManager } from './execution-log'
import { createVersionManager } from './version'
import { createDirtyTracker } from './dirty-tracker'
import { createCrudActions } from './crud'
import { createEditActions } from './edit'
import { createExecutionActions } from './execution'
import { createDebugActions } from './debug'
import { createGroupActions } from './group'
import { createAIActions } from './ai'
import { createStagingManager } from './staging'

export type WorkflowStore = ReturnType<typeof createWorkflowStore>
export type { WorkflowChanges }

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
    const editActions = createEditActions(
      currentWorkflow,
      workflows,
      selectedNodeIds,
      executionStatus,
      executionLog,
      executionContext,
      undoRedo,
      groupActions,
    )
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
    const stagingMgr = createStagingManager(currentWorkflow, api)

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
      stagingMgr.loadStagedNodes()
    })

    return {
      tabId,
      rightPanelTab,
      workflows, workflowFolders, currentWorkflow, loadState, loadError, selectedNodeId, selectedNodeIds,
      selectedEmbeddedNode,
      effectiveSelectedNodeId,
      rootFolders, selectedNode, selectedNodes, executionValidationError,
      executionStatus, executionLog, executionContext,
      partialExecutionStartNodeId: execActions.partialExecutionStartNodeId,
      pausedNodeId: execActions.pausedNodeId,
      pausedReason: execActions.pausedReason,
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
      stagedNodes: stagingMgr.stagedNodes,
      loadStagedNodes: stagingMgr.loadStagedNodes,
      copyNodeToStaging: stagingMgr.copyNodeToStaging,
      moveNodeToStaging: stagingMgr.moveNodeToStaging,
      removeStagedNode: stagingMgr.removeStagedNode,
      clearStagedNodes: stagingMgr.clearStagedNodes,
      pasteStagedNode(stagedNode: import('@shared/workflow-types').StagedNode) {
        const wf = currentWorkflow.value
        if (!wf) return
        const nodes = wf.nodes
        let position = { x: 200, y: 200 }
        if (nodes.length > 0) {
          const avgX = nodes.reduce((s: number, n: any) => s + n.position.x, 0) / nodes.length
          const avgY = nodes.reduce((s: number, n: any) => s + n.position.y, 0) / nodes.length
          position = { x: Math.round(avgX) + 30, y: Math.round(avgY) + 30 }
        }
        const newNode = editActions.addNode(stagedNode.type, position)
        if (newNode) {
          newNode.data = JSON.parse(JSON.stringify(stagedNode.data))
          newNode.label = stagedNode.label
        }
      },
    }
  })
  return useStore()
}

// ====== Provide / Inject ======

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
