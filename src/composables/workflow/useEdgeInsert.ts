import { useWorkflowStore } from '@/stores/workflow'

export function useEdgeInsert() {
  const store = useWorkflowStore()

  let insertEdgeId: string | null = null
  let insertSourceId: string | null = null
  let insertTargetId: string | null = null

  function onEdgeInsertNode(edgeId: string, sourceId: string, targetId: string) {
    insertEdgeId = edgeId
    insertSourceId = sourceId
    insertTargetId = targetId
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
    const newNode = store.addNode(type, position)
    if (insertEdgeId) store.removeEdge(insertEdgeId)
    store.addEdge(insertSourceId, newNode.id, null, null)
    store.addEdge(newNode.id, insertTargetId, null, null)
    resetEdgeInsert()
  }

  function resetEdgeInsert() {
    insertEdgeId = null
    insertSourceId = null
    insertTargetId = null
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
