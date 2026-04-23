import { wsBridge } from '../ws-bridge'

export const executionLogBackendApi = {
  list(workflowId: string) {
    return wsBridge.invoke('executionLog:list', { workflowId })
  },
  save(workflowId: string, log: any) {
    return wsBridge.invoke('executionLog:save', { workflowId, log })
  },
  delete(workflowId: string, id: string) {
    return wsBridge.invoke('executionLog:delete', { workflowId, id })
  },
  clear(workflowId: string) {
    return wsBridge.invoke('executionLog:clear', { workflowId })
  },
  getPath(workflowId: string, id: string): Promise<string> {
    return wsBridge.invoke('executionLog:getPath', { workflowId, id })
  },
}
