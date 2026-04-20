import { ipcMain, BrowserWindow } from 'electron'
import { abortClaudeAgentRun, startClaudeAgentRun } from '../services/claude-agent-runtime'
import { resolvePendingRendererTool } from '../services/workflow-tool-dispatcher'
import { testProviderConnection } from '../services/ai-provider-test'
import { listAIProviders, getAIProvider, createAIProvider, updateAIProvider, deleteAIProvider } from '../services/store'
import { workflowNodeRegistry } from '../services/workflow-node-registry'

export function registerChatIpcHandlers(): void {
  ipcMain.handle('agent:execTool', async (_event, toolType: string, params: Record<string, any>) => {
    const handler = workflowNodeRegistry.getHandler(toolType)
    if (!handler) {
      return { error: `Tool not available: ${toolType}` }
    }
    const api = workflowNodeRegistry.getApiForNodeType(toolType) || {}
    const logs: Array<{ level: 'info' | 'warning' | 'error'; message: string; timestamp: number }> = []
    const logger = {
      info(message: string) { logs.push({ level: 'info', message, timestamp: Date.now() }) },
      warning(message: string) { logs.push({ level: 'warning', message, timestamp: Date.now() }) },
      error(message: string) { logs.push({ level: 'error', message, timestamp: Date.now() }) },
    }
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

  ipcMain.handle('chat:completions', async (event, params) => {
    const mainWindow = BrowserWindow.fromWebContents(event.sender)
    if (!mainWindow) throw new Error('No main window found')
    startClaudeAgentRun(mainWindow, params).catch((err) => {
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send('chat:error', {
          requestId: params._requestId,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    })
    return { started: true }
  })

  ipcMain.handle('chat:abort', (_event, requestId: string) => {
    return abortClaudeAgentRun(requestId)
  })

  ipcMain.handle('workflow-tool:respond', (_event, requestId: string, result: unknown) => {
    return { resolved: resolvePendingRendererTool(requestId, result) }
  })

  // AI Provider IPC
  ipcMain.handle('aiProvider:list', () => listAIProviders())
  ipcMain.handle('aiProvider:create', (_event, data) => createAIProvider(data))
  ipcMain.handle('aiProvider:update', (_event, id, data) => { updateAIProvider(id, data); return getAIProvider(id) })
  ipcMain.handle('aiProvider:delete', (_event, id) => { deleteAIProvider(id); return true })
  ipcMain.handle('aiProvider:test', (_event, id) => testProviderConnection(id))
}
