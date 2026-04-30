import { wsBridge } from '../ws-bridge'
import type { StagedNode } from '@shared/workflow-types'

export const stagingBackendApi = {
  load(workflowId: string): Promise<StagedNode[]> {
    return wsBridge.invoke('staging:load', { workflowId })
  },
  save(workflowId: string, nodes: StagedNode[]): Promise<void> {
    return wsBridge.invoke('staging:save', { workflowId, nodes })
  },
  clear(workflowId: string): Promise<void> {
    return wsBridge.invoke('staging:clear', { workflowId })
  },
}
