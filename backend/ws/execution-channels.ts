import type { WSRouter } from './router'
import type { BackendWorkflowExecutionManager } from '../workflow/execution-manager'

export function registerExecutionChannels(router: WSRouter, executionManager: BackendWorkflowExecutionManager): void {
  router.register('workflow:execute', (data, context) => executionManager.execute(data, context.clientId))
  router.register('workflow:debug-node', (data, context) => executionManager.debugNode(data, context.clientId))
  router.register('workflow:get-execution-recovery', (data, context) => executionManager.getExecutionRecovery(data, context.clientId))
  router.register('workflow:pause', ({ executionId }) => executionManager.pause(executionId))
  router.register('workflow:resume', ({ executionId }) => executionManager.resume(executionId))
  router.register('workflow:stop', ({ executionId }) => executionManager.stop(executionId))
}
