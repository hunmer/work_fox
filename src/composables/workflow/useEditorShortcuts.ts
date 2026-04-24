import { onMounted, onUnmounted } from 'vue'
import type { WorkflowStore } from '@/stores/workflow'

interface WorkflowShortcutHandlerOptions {
  hasWorkflow: () => boolean
  isPreview?: () => boolean
  saveWorkflow?: () => void | Promise<void>
  undo?: () => void
  redo?: () => void
  copySelectedNodes: () => void
  pasteClipboardNodes: () => void
  deleteSelected: () => void
  selectAllNodes: () => void
}

export function createWorkflowShortcutHandler(options: WorkflowShortcutHandlerOptions) {
  return function handleKeyDown(e: KeyboardEvent) {
    if (!options.hasWorkflow()) return
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      if (isInputElement(e.target as HTMLElement)) return
      if (!options.saveWorkflow) return
      e.preventDefault()
      options.saveWorkflow()
      return
    }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'z') {
      if (isInputElement(e.target as HTMLElement)) return
      if (!options.redo) return
      e.preventDefault()
      options.redo()
      return
    }
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
      if (isInputElement(e.target as HTMLElement)) return
      if (!options.undo) return
      e.preventDefault()
      options.undo()
      return
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
      if (isInputElement(e.target as HTMLElement)) return
      e.preventDefault()
      options.copySelectedNodes()
      return
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
      if (isInputElement(e.target as HTMLElement)) return
      if (options.isPreview?.()) return
      e.preventDefault()
      options.pasteClipboardNodes()
      return
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
      if (isInputElement(e.target as HTMLElement)) return
      e.preventDefault()
      options.selectAllNodes()
      return
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (isInputElement(e.target as HTMLElement)) return
      if (options.isPreview?.()) return
      e.preventDefault()
      options.deleteSelected()
    }
  }
}

function isInputElement(el: HTMLElement | null): boolean {
  if (!el) return false
  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return true
  if (el.isContentEditable) return true
  return false
}

export function useEditorShortcuts(
  store: WorkflowStore,
  deps: {
    saveWorkflow: () => Promise<void>
    copySelectedNodes: () => void
    pasteClipboardNodes: () => void
    deleteSelected: () => void
    addSelectedNodes: (nodes: any[]) => void
    getNodes: { value: any[] }
    zoomIn: () => void
    zoomOut: () => void
    zoomTo: (level: number) => void
  },
) {
  const handleKeyDown = createWorkflowShortcutHandler({
    hasWorkflow: () => !!store.currentWorkflow,
    isPreview: () => store.isPreview,
    saveWorkflow: deps.saveWorkflow,
    undo: store.undo,
    redo: store.redo,
    copySelectedNodes: deps.copySelectedNodes,
    pasteClipboardNodes: deps.pasteClipboardNodes,
    deleteSelected: deps.deleteSelected,
    selectAllNodes: () => deps.addSelectedNodes(deps.getNodes.value),
  })

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
