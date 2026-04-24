import { ipcMain } from 'electron'
import { workflowNodeRegistry } from '../services/workflow-node-registry'
import { executeWorkflowBrowserNode } from '../services/workflow-browser-node-runtime'
import { isLocalBridgeWorkflowNode } from '../../shared/workflow-local-bridge'

export function registerChatIpcHandlers(): void {
  ipcMain.handle('agent:execTool', async (_event, toolType: string, params: Record<string, any>) => {
    const handler = workflowNodeRegistry.getHandler(toolType)
    const logs: Array<{ level: 'info' | 'warning' | 'error'; message: string; timestamp: number }> = []
    const logger = {
      info(message: string) { logs.push({ level: 'info', message, timestamp: Date.now() }) },
      warning(message: string) { logs.push({ level: 'warning', message, timestamp: Date.now() }) },
      error(message: string) { logs.push({ level: 'error', message, timestamp: Date.now() }) },
    }

    if (!handler) {
      if (!isLocalBridgeWorkflowNode(toolType)) {
        return { success: false, message: `Tool not available: ${toolType}`, _logs: logs }
      }
      try {
        const result = await executeWorkflowBrowserNode(toolType, params)
        return isPlainObject(result)
          ? { ...result, _logs: logs }
          : { result, _logs: logs }
      } catch (err: any) {
        return { success: false, message: err.message, _logs: logs }
      }
    }

    const api = (workflowNodeRegistry.getApiForNodeType(toolType) || {}) as any
    try {
      const result = await handler(
        {
          api,
          nodeId: params.nodeId || '',
          nodeLabel: params.nodeLabel || '',
          upstream: params.upstream || {},
          logger,
        },
        params,
      )
      return { ...result, _logs: logs }
    } catch (err: any) {
      return { success: false, message: err.message, _logs: logs }
    }
  })
}

function isPlainObject(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
