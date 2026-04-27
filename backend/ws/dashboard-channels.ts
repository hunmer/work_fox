import type { WSRouter } from './router'
import type { DashboardStatsStore } from '../dashboard/stats-store'

export interface DashboardServices {
  dashboardStatsStore: DashboardStatsStore
}

export function registerDashboardChannels(router: WSRouter, services: DashboardServices): void {
  const { dashboardStatsStore } = services

  router.register('dashboard:stats', () => {
    return dashboardStatsStore.getStats()
  })

  router.register('dashboard:executions', (data) => {
    return dashboardStatsStore.getExecutions(data ?? {})
  })

  router.register('dashboard:workflow-detail', (data) => {
    const result = dashboardStatsStore.getWorkflowDetail(data.workflowId)
    if (!result) throw new Error(`Workflow not found: ${data.workflowId}`)
    return result
  })
}
