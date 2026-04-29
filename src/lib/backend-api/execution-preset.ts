import { wsBridge } from '../ws-bridge'
import type { ExecutionInputPreset } from '@shared/channel-contracts'

export const executionPresetApi = {
  list(workflowId: string): Promise<ExecutionInputPreset[]> {
    return wsBridge.invoke('executionPreset:list', { workflowId })
  },
  save(workflowId: string, preset: ExecutionInputPreset): Promise<void> {
    return wsBridge.invoke('executionPreset:save', { workflowId, preset })
  },
  delete(workflowId: string, presetId: string): Promise<void> {
    return wsBridge.invoke('executionPreset:delete', { workflowId, presetId })
  },
}
