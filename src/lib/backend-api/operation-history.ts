import { wsBridge } from '../ws-bridge'

export const operationHistoryBackendApi = {
  load(workflowId: string) {
    return wsBridge.invoke('operationHistory:load', { workflowId })
  },
  save(workflowId: string, entries: any[]) {
    return wsBridge.invoke('operationHistory:save', { workflowId, entries })
  },
  clear(workflowId: string) {
    return wsBridge.invoke('operationHistory:clear', { workflowId })
  },
}
