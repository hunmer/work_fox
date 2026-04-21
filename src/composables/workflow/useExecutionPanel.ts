import { ref, watch, nextTick } from 'vue'

export function useExecutionPanel() {
  const EXEC_PANEL_SIZE_KEY = 'workflow-exec-panel-sizes'
  const EXEC_PANEL_EXPANDED_KEY = 'workflow-exec-panel-expanded'
  const DEFAULT_SIZES = [75, 25]

  function loadPanelSizes(): number[] {
    try {
      const raw = localStorage.getItem(EXEC_PANEL_SIZE_KEY)
      return raw ? JSON.parse(raw) : DEFAULT_SIZES
    } catch {
      return DEFAULT_SIZES
    }
  }

  const executionBarExpanded = ref(localStorage.getItem(EXEC_PANEL_EXPANDED_KEY) === 'true')
  const execPanelSizes = ref<number[]>(loadPanelSizes())
  const execPanelRef = ref<InstanceType<typeof import('@/components/ui/resizable').ResizablePanel> | null>(null)

  function onExecBarResize(sizes: number[]) {
    if (executionBarExpanded.value && sizes.length === 2) {
      execPanelSizes.value = sizes
      localStorage.setItem(EXEC_PANEL_SIZE_KEY, JSON.stringify(sizes))
    }
  }

  watch(executionBarExpanded, (expanded) => {
    localStorage.setItem(EXEC_PANEL_EXPANDED_KEY, String(expanded))
    if (expanded) {
      nextTick(() => {
        nextTick(() => {
          ;(execPanelRef.value as { resize?: (size: number) => void } | null)?.resize?.(execPanelSizes.value[1])
        })
      })
    }
  })

  return {
    executionBarExpanded,
    execPanelSizes,
    execPanelRef,
    onExecBarResize,
  }
}
