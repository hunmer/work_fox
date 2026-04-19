import { computed, watch, nextTick } from 'vue'
import { MarkerType } from '@vue-flow/core'
import { useWorkflowStore } from '@/stores/workflow'

export function useFlowCanvas(
  flowId: string,
  deps: {
    onNodesChange: (cb: (changes: any[]) => void) => void
    onEdgesChange: (cb: (changes: any[]) => void) => void
    onViewportChange: (cb: (vp: any) => void) => void
    setViewport: (vp: any) => void
    fitView: () => void
    updateNodeInternals: (ids: string[]) => void
  },
) {
  const store = useWorkflowStore()

  onNodesChange((changes) => {
    for (const change of changes) {
      if (change.type === 'remove') {
        store.removeNode(change.id)
      } else if (change.type === 'position' && change.position) {
        store.updateNodePosition(change.id, change.position)
      }
    }
  })

  onEdgesChange((changes) => {
    for (const change of changes) {
      if (change.type === 'remove') {
        store.removeEdge(change.id)
      }
    }
  })

  // Viewport 持久化
  const VIEWPORT_KEY = (id: string) => `workflow-vp-${id}`
  let viewportSaveTimer: ReturnType<typeof setTimeout> | null = null

  onViewportChange(({ zoom, x, y }) => {
    if (!store.currentWorkflow) return
    if (viewportSaveTimer) clearTimeout(viewportSaveTimer)
    viewportSaveTimer = setTimeout(() => {
      localStorage.setItem(
        VIEWPORT_KEY(store.currentWorkflow!.id),
        JSON.stringify({ zoom, x, y }),
      )
    }, 300)
  })

  function getSavedViewport(workflowId: string): { zoom: number; x: number; y: number } | null {
    try {
      const raw = localStorage.getItem(VIEWPORT_KEY(workflowId))
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  }

  watch(() => store.currentWorkflow?.id, async (id) => {
    if (!id) return
    await nextTick()
    const saved = getSavedViewport(id)
    if (saved) {
      deps.setViewport(saved)
    } else {
      deps.fitView()
    }
  })

  const nodes = computed(() =>
    (store.currentWorkflow?.nodes || []).map((n) => ({
      id: n.id,
      type: 'custom',
      position: n.position,
      data: { ...n.data, label: n.label, nodeType: n.type },
    })),
  )

  const edges = computed(() =>
    (store.currentWorkflow?.edges || []).map((e) => ({
      id: e.id,
      type: 'custom',
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle,
      targetHandle: e.targetHandle,
      animated: true,
      markerEnd: MarkerType.ArrowClosed,
    })),
  )

  function handleConnect(params: any) {
    store.addEdge(
      params.source,
      params.target,
      params.sourceHandle ?? null,
      params.targetHandle ?? null,
    )
  }

  function handleNodesInitialized(nodes: any[]) {
    nextTick(() => {
      deps.updateNodeInternals(nodes.map((node) => node.id))
    })
  }

  return {
    nodes,
    edges,
    handleConnect,
    handleNodesInitialized,
  }
}
