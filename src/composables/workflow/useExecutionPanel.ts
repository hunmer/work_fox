import { ref, watch, nextTick } from 'vue'
import type { Ref } from 'vue'

export function useExecutionPanel() {
  const EXEC_PANEL_SIZE_KEY = 'workflow-exec-panel-size'
  const EXEC_PANEL_EXPANDED_KEY = 'workflow-exec-panel-expanded'
  const executionBarExpanded = ref(localStorage.getItem(EXEC_PANEL_EXPANDED_KEY) === 'true')
  const savedExecPanelSize = ref(Number(localStorage.getItem(EXEC_PANEL_SIZE_KEY)) || 25)
  const execPanelRef = ref<InstanceType<typeof import('@/components/ui/resizable').ResizablePanel> | null>(null)

  function onExecBarResize(sizes: number[]) {
    if (executionBarExpanded.value && sizes.length === 2) {
      savedExecPanelSize.value = sizes[1]
      localStorage.setItem(EXEC_PANEL_SIZE_KEY, String(sizes[1]))
    }
  }

  watch(executionBarExpanded, (expanded) => {
    localStorage.setItem(EXEC_PANEL_EXPANDED_KEY, String(expanded))
    if (expanded) {
      nextTick(() => {
        nextTick(() => {
          execPanelRef.value?.resize(savedExecPanelSize.value)
        })
      })
    }
  })

  return {
    executionBarExpanded,
    savedExecPanelSize,
    execPanelRef,
    onExecBarResize,
  }
}
