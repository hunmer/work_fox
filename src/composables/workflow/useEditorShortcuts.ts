import { onMounted, onUnmounted } from 'vue'
import { useWorkflowStore } from '@/stores/workflow'

export function useEditorShortcuts(deps: {
  saveWorkflow: () => Promise<void>
  copySelectedNodes: () => void
  pasteClipboardNodes: () => void
  deleteSelected: () => void
  addSelectedNodes: (nodes: any[]) => void
  getNodes: { value: any[] }
  zoomIn: () => void
  zoomOut: () => void
  zoomTo: (level: number) => void
}) {
  const store = useWorkflowStore()

  function handleKeyDown(e: KeyboardEvent) {
    if (!store.currentWorkflow) return
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault()
      deps.saveWorkflow()
      return
    }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'z') {
      e.preventDefault()
      store.redo()
      return
    }
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
      e.preventDefault()
      store.undo()
      return
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
      if (isInputElement(e.target as HTMLElement)) return
      e.preventDefault()
      deps.copySelectedNodes()
      return
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
      if (isInputElement(e.target as HTMLElement)) return
      e.preventDefault()
      deps.pasteClipboardNodes()
      return
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
      if (isInputElement(e.target as HTMLElement)) return
      e.preventDefault()
      deps.addSelectedNodes(deps.getNodes.value)
      return
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (isInputElement(e.target as HTMLElement)) return
      e.preventDefault()
      deps.deleteSelected()
    }
  }

  function isInputElement(el: HTMLElement | null): boolean {
    return el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA'
  }

  function onWorkflowZoomIn(e: Event) {
    deps.zoomIn()
    ;(e as CustomEvent).preventDefault()
  }

  function onWorkflowZoomOut(e: Event) {
    deps.zoomOut()
    ;(e as CustomEvent).preventDefault()
  }

  function onWorkflowZoomReset(e: Event) {
    deps.zoomTo(1)
    ;(e as CustomEvent).preventDefault()
  }

  onMounted(() => {
    window.addEventListener('workflow:zoom-in', onWorkflowZoomIn)
    window.addEventListener('workflow:zoom-out', onWorkflowZoomOut)
    window.addEventListener('workflow:zoom-reset', onWorkflowZoomReset)
  })

  onUnmounted(() => {
    window.removeEventListener('workflow:zoom-in', onWorkflowZoomIn)
    window.removeEventListener('workflow:zoom-out', onWorkflowZoomOut)
    window.removeEventListener('workflow:zoom-reset', onWorkflowZoomReset)
  })

  return { handleKeyDown }
}
