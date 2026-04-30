import type { WSRouter } from './router'
import type { BackendStagingStore } from '../storage/staging-store'

export interface StagingServices {
  stagingStore: BackendStagingStore
}

export function registerStagingChannels(router: WSRouter, services: StagingServices): void {
  const { stagingStore } = services

  router.register('staging:load', ({ workflowId }) => stagingStore.load(workflowId))
  router.register('staging:save', ({ workflowId, nodes }) => {
    stagingStore.save(workflowId, nodes)
    return undefined
  })
  router.register('staging:clear', ({ workflowId }) => {
    stagingStore.clear(workflowId)
    return undefined
  })
}
