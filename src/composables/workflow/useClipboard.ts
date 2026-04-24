import type { WorkflowStore } from '@/stores/workflow'
import { useNotification } from '@/composables/useNotification'
import { isHiddenWorkflowNode, isLockedWorkflowEdge } from '@shared/workflow-composite'

interface ClipboardNode {
  id: string
  type: string
  position: { x: number; y: number }
  data: Record<string, any>
  label: string
  nodeType: string
}

interface ClipboardEdge {
  source: string
  target: string
  sourceHandle: string | null
  targetHandle: string | null
}

export function useClipboard(
  store: WorkflowStore,
  deps: {
    getSelectedNodes: { value: any[] }
    getSelectedEdges: { value: any[] }
    getNodes: { value: any[] }
    addSelectedNodes: (nodes: any[]) => void
    nodesSelectionActive: { value: boolean }
  },
) {
  const notify = useNotification()

  let clipboardNodes: ClipboardNode[] = []
  let clipboardEdges: ClipboardEdge[] = []

  const NODE_COLLISION_W = 180
  const NODE_COLLISION_H = 80
  const OFFSET_STEP = 60
  const SINGLETON_TYPES = new Set(['start', 'end'])

  function copySelectedNodes() {
    const selected = deps.getSelectedNodes.value
    if (!selected.length) return

    const selectedIds = new Set(selected.map((n) => n.id))
    clipboardNodes = selected.map((n) => ({
      id: n.id,
      type: n.type ?? 'custom',
      position: { ...n.position },
      data: { ...(n.data as Record<string, any>) },
      label: (n.data as any)?.label ?? '',
      nodeType: (n.data as any)?.nodeType ?? '',
    }))
    clipboardEdges = (store.currentWorkflow?.edges ?? [])
      .filter((e) => selectedIds.has(e.source) && selectedIds.has(e.target) && !isLockedWorkflowEdge(e))
      .map((e) => ({
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle ?? null,
        targetHandle: e.targetHandle ?? null,
      }))
    notify.success(`已复制 ${selected.length} 个节点`)
  }

  function findSafeOffset(): { x: number; y: number } {
    const existing = store.currentWorkflow?.nodes ?? []
    for (let step = 1; step <= 30; step++) {
      const dx = OFFSET_STEP * step
      const dy = OFFSET_STEP * step
      const hasOverlap = clipboardNodes.some((cn) =>
        existing.some(
          (en) =>
            Math.abs(en.position.x - (cn.position.x + dx)) < NODE_COLLISION_W &&
            Math.abs(en.position.y - (cn.position.y + dy)) < NODE_COLLISION_H,
        ),
      )
      if (!hasOverlap) return { x: dx, y: dy }
    }
    return { x: OFFSET_STEP * 10, y: OFFSET_STEP * 10 }
  }

  function pasteClipboardNodes() {
    if (!clipboardNodes.length || !store.currentWorkflow) return

    const offset = findSafeOffset()
    const idMap = new Map<string, string>()

    for (const clip of clipboardNodes) {
      if (SINGLETON_TYPES.has(clip.nodeType)) {
        const existing = store.currentWorkflow.nodes.find((n) => n.type === clip.nodeType)
        if (existing) {
          existing.data = { ...clip.data }
          existing.label = clip.label
          idMap.set(clip.id, existing.id)
        } else {
          const newNode = store.addNode(clip.nodeType, {
            x: clip.position.x + offset.x,
            y: clip.position.y + offset.y,
          })
          newNode.data = { ...clip.data }
          newNode.label = clip.label
          idMap.set(clip.id, newNode.id)
        }
      } else {
        const newNode = store.addNode(clip.nodeType, {
          x: clip.position.x + offset.x,
          y: clip.position.y + offset.y,
        })
        newNode.data = { ...clip.data }
        newNode.label = clip.label
        idMap.set(clip.id, newNode.id)
      }
    }

    for (const edge of clipboardEdges) {
      const newSource = idMap.get(edge.source)
      const newTarget = idMap.get(edge.target)
      if (newSource && newTarget) {
        store.addEdge(newSource, newTarget, edge.sourceHandle, edge.targetHandle)
      }
    }

    for (const node of deps.getNodes.value) {
      node.selected = false
    }
    const newIds = new Set(idMap.values())
    const newVueFlowNodes = deps.getNodes.value.filter((n) => newIds.has(n.id))
    deps.addSelectedNodes(newVueFlowNodes)
    if (clipboardNodes.length > 1) {
      deps.nodesSelectionActive.value = true
    }
    notify.success(`已粘贴 ${clipboardNodes.length} 个节点`)
  }

  function deleteSelected() {
    const selectedNodes = deps.getSelectedNodes.value
    const selectedEdges = deps.getSelectedEdges.value
    let count = 0
    for (const edge of selectedEdges) {
      if (store.canDeleteEdge(edge.id)) {
        store.removeEdge(edge.id)
        count++
      }
    }
    for (const node of selectedNodes) {
      if (store.canDeleteNode(node.id) && !isHiddenWorkflowNode(store.currentWorkflow?.nodes.find((n) => n.id === node.id) as any)) {
        store.removeNode(node.id)
        count++
      }
    }
    if (count > 0) {
      notify.success(`已删除 ${count} 个元素`)
    }
  }

  return {
    copySelectedNodes,
    pasteClipboardNodes,
    deleteSelected,
  }
}
