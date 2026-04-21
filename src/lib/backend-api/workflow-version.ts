import { wsBridge } from '../ws-bridge'

export const workflowVersionBackendApi = {
  list(workflowId: string) {
    return wsBridge.invoke('workflowVersion:list', { workflowId })
  },
  add(workflowId: string, name: string, nodes: any[], edges: any[]) {
    return wsBridge.invoke('workflowVersion:add', { workflowId, name, nodes, edges })
  },
  get(workflowId: string, versionId: string) {
    return wsBridge.invoke('workflowVersion:get', { workflowId, versionId })
  },
  delete(workflowId: string, versionId: string) {
    return wsBridge.invoke('workflowVersion:delete', { workflowId, versionId })
  },
  clear(workflowId: string) {
    return wsBridge.invoke('workflowVersion:clear', { workflowId })
  },
  nextName(workflowId: string) {
    return wsBridge.invoke('workflowVersion:nextName', { workflowId })
  },
}
