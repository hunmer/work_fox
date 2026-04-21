import { wsBridge } from '../ws-bridge'

export const workflowFolderBackendApi = {
  list() {
    return wsBridge.invoke('workflowFolder:list', undefined)
  },
  create(data: any) {
    return wsBridge.invoke('workflowFolder:create', { data })
  },
  update(id: string, data: any) {
    return wsBridge.invoke('workflowFolder:update', { id, data })
  },
  delete(id: string) {
    return wsBridge.invoke('workflowFolder:delete', { id })
  },
}
