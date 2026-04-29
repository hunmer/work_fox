import type { WSRouter } from './router'
import type { WorkflowTriggerService } from '../workflow/trigger-service'

export function registerTriggerChannels(
  router: WSRouter,
  triggerService: WorkflowTriggerService
): void {
  router.register('trigger:validate-cron', ({ cron }) => {
    return triggerService.validateCron(cron)
  })

  router.register('trigger:check-hook-name', ({ hookName, excludeWorkflowId }) => {
    const { conflictWorkflowIds } = triggerService.getHookConflicts(hookName, excludeWorkflowId)
    const hookUrl = triggerService.getHookUrl(hookName)
    return { conflictWorkflowIds, hookUrl }
  })
}
