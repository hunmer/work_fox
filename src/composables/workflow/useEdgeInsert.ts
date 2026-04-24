import type { Ref } from 'vue'
import type { WorkflowStore } from '@/stores/workflow'

export function useEdgeInsert(store: WorkflowStore, nodeSelectOpen: Ref<boolean>) {
  let insertEdgeId: string | null = null
  let insertSourceId: string | null = null
  let insertTargetId: string | null = null
  let insertSourceHandle: string | null = null

  function onEdgeInsertNode(edgeId: string, sourceId: string, targetId: string, sourceHandle: string | null) {
    insertEdgeId = edgeId
    insertSourceId = sourceId
    insertTargetId = targetId
    insertSourceHandle = sourceHandle
    nodeSelectOpen.value = true
  }

  function onNodeSelectFromEdge(type: string) {
    if (!insertSourceId || !insertTargetId || !store.currentWorkflow) return
    const sourceNode = store.currentWorkflow.nodes.find(n => n.id === insertSourceId)
    const targetNode = store.currentWorkflow.nodes.find(n => n.id === insertTargetId)
    if (!sourceNode || !targetNode) return

    const position = {
      x: (sourceNode.position.x + targetNode.position.x) / 2,
      y: (sourceNode.position.y + targetNode.position.y) / 2,
    }
    const newNode = store.addNode(type, position, {
      sourceNodeId: insertSourceId,
      sourceHandle: insertSourceHandle,
    })
    if (insertEdgeId) store.removeEdge(insertEdgeId)
    store.addEdge(insertSourceId, newNode.id, insertSourceHandle, null)
    store.addEdge(newNode.id, insertTargetId, null, null)
    resetEdgeInsert()
  }

  function resetEdgeInsert() {
    insertEdgeId = null
    insertSourceId = null
    insertTargetId = null
    insertSourceHandle = null
  }

  function hasInsertContext() {
    return insertEdgeId !== null
  }

  return {
    onEdgeInsertNode,
    onNodeSelectFromEdge,
    resetEdgeInsert,
    hasInsertContext,
  }
}
