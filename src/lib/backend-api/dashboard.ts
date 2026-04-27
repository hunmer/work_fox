import { wsBridge } from '../ws-bridge'

export const dashboardBackendApi = {
  getStats() {
    return wsBridge.invoke('dashboard:stats', undefined)
  },

  getExecutions(req?: { range?: 'today' | 'week' | 'all'; status?: string; page?: number; pageSize?: number }) {
    return wsBridge.invoke('dashboard:executions', req ?? {})
  },

  getWorkflowDetail(workflowId: string) {
    return wsBridge.invoke('dashboard:workflow-detail', { workflowId })
  },
}
