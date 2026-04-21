export function useWorkflowBackend(): boolean {
  try {
    if (window.localStorage.getItem('workfox.useWorkflowBackend') === '1') return true
  } catch {
    // ignore localStorage access issues
  }
  return import.meta.env.VITE_USE_WORKFLOW_BACKEND === '1'
}
