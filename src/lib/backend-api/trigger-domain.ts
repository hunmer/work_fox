import { wsBridge } from '../ws-bridge'

export const triggerApi = {
  validateCron(cron: string) {
    return wsBridge.invoke('trigger:validate-cron', { cron }) as Promise<{
      valid: boolean
      nextRuns: string[]
      error?: string
    }>
  },

  checkHookName(hookName: string, excludeWorkflowId?: string) {
    return wsBridge.invoke('trigger:check-hook-name', {
      hookName,
      excludeWorkflowId
    }) as Promise<{
      conflictWorkflowIds: string[]
      hookUrl: string
    }>
  }
}
