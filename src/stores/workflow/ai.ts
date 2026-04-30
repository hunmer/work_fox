import { type Ref } from 'vue'
import type { Workflow } from '@/lib/workflow/types'
import { wsBridge } from '@/lib/ws-bridge'
import { summarizeChanges, type WorkflowChanges } from './utils'
import type { createUndoRedoManager } from './undo-redo'

export function createAIActions(
  currentWorkflow: Ref<Workflow | null>,
  undoRedo: ReturnType<typeof createUndoRedoManager>,
) {
  function normalizeHandleId(value: unknown): string | null {
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    return trimmed && trimmed !== 'default' ? trimmed : null
  }

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
      const normalizedEdge = {
        ...edge,
        sourceHandle: normalizeHandleId(edge.sourceHandle),
        targetHandle: normalizeHandleId(edge.targetHandle),
      }
      const idx = currentWorkflow.value.edges.findIndex(e => e.id === normalizedEdge.id)
      const targetOccupied = currentWorkflow.value.edges.some((e, edgeIndex) =>
        edgeIndex !== idx
        && e.target === normalizedEdge.target
        && normalizeHandleId(e.targetHandle) === normalizedEdge.targetHandle,
      )
      if (targetOccupied) continue
      if (idx >= 0) currentWorkflow.value.edges[idx] = normalizedEdge
      else currentWorkflow.value.edges.push(normalizedEdge)
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
