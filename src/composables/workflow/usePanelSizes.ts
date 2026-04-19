import { ref } from 'vue'

export function usePanelSizes() {
  const PANEL_SIZES_KEY = 'workflow-panel-sizes'
  const DEFAULT_SIZES = [18, 52, 30]

  function loadPanelSizes(): number[] {
    try {
      const raw = localStorage.getItem(PANEL_SIZES_KEY)
      return raw ? JSON.parse(raw) : DEFAULT_SIZES
    } catch {
      return DEFAULT_SIZES
    }
  }

  const panelSizes = ref<number[]>(loadPanelSizes())

  function handlePanelResize(sizes: number[]) {
    panelSizes.value = sizes
    localStorage.setItem(PANEL_SIZES_KEY, JSON.stringify(sizes))
  }

  return { panelSizes, handlePanelResize }
}
