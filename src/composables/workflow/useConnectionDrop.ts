import type { Ref } from 'vue'
import type { WorkflowStore } from '@/stores/workflow'

export function useConnectionDrop(
  store: WorkflowStore,
  project: (pos: { x: number; y: number }) => { x: number; y: number },
  vueFlowRef: Ref<HTMLElement | null | undefined>,
  nodeSelectOpen: Ref<boolean>,
) {
  let connectSource: { nodeId: string; handleId: string | null } | null = null
  let connectSucceeded = false
  let connectDropPosition: { x: number; y: number } | null = null

  function onConnectStart(params: { nodeId?: string; handleId?: string | null }) {
    const nodeId = params.nodeId ?? null
    const handleId = params.handleId ?? null
    connectSource = nodeId ? { nodeId, handleId } : null
    connectSucceeded = false
    connectDropPosition = null
  }

  function onConnectEnd(event?: MouseEvent) {
    if (connectSucceeded || !connectSource) {
      connectSource = null
      return
    }
    if (event) {
      const bounds = vueFlowRef.value?.getBoundingClientRect()
      if (bounds) {
        connectDropPosition = project({ x: event.clientX - bounds.left, y: event.clientY - bounds.top })
      }
    }
    nodeSelectOpen.value = true
  }

  function onNodeSelectFromDialog(type: string) {
    if (!connectSource || !store.currentWorkflow) return
    const sourceNode = store.currentWorkflow.nodes.find(n => n.id === connectSource!.nodeId)
    if (!sourceNode) return
    const position = connectDropPosition || {
      x: sourceNode.position.x + 250,
      y: sourceNode.position.y,
    }
    const newNode = store.addNode(type, position, {
      sourceNodeId: connectSource.nodeId,
      sourceHandle: connectSource.handleId,
    })
    store.addEdge(connectSource.nodeId, newNode.id, connectSource.handleId, null)
    connectSource = null
    connectDropPosition = null
  }

  function resetConnectionDrop() {
    connectSource = null
    connectDropPosition = null
  }

  function markConnectSucceeded() {
    connectSucceeded = true
  }

  return {
    onConnectStart,
    onConnectEnd,
    onNodeSelectFromDialog,
    resetConnectionDrop,
    markConnectSucceeded,
  }
}
