import { ipcMain, BrowserWindow } from 'electron'
import { proxyChatCompletions, activeRequests } from '../services/ai-proxy'
import { resolvePendingRendererTool } from '../services/workflow-tool-dispatcher'
import { listAIProviders, createAIProvider, updateAIProvider, deleteAIProvider } from '../services/store'
import { testProviderConnection } from '../services/ai-proxy'
import { workflowNodeRegistry } from '../services/workflow-node-registry'

export function registerChatIpcHandlers(): void {
  ipcMain.handle('agent:execTool', async (_event, toolType: string, params: Record<string, any>) => {
    const handler = workflowNodeRegistry.getHandler(toolType)
    if (!handler) {
      return { error: `Tool not available: ${toolType}` }
    }
    const api = workflowNodeRegistry.getApiForNodeType(toolType) || {}
    try {
      const result = await handler(
        {
          api,
          nodeId: params.nodeId || '',
          nodeLabel: params.nodeLabel || '',
          upstream: params.upstream || {},
        },
        params,
      )
      return result
    } catch (err: any) {
      return { success: false, message: err.message }
    }
  })

  ipcMain.handle('chat:completions', async (event, params) => {
    const mainWindow = BrowserWindow.fromWebContents(event.sender)
    if (!mainWindow) throw new Error('No main window found')
    proxyChatCompletions(mainWindow, params).catch((err) => {
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send('on:chat:error', {
          requestId: params._requestId,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    })
    return { started: true }
  })

  ipcMain.handle('chat:abort', (_event, requestId: string) => {
    const controller = activeRequests.get(requestId)
    if (controller) {
      controller.abort()
      activeRequests.delete(requestId)
      return { aborted: true }
    }
    return { aborted: false, reason: 'not found' }
  })

  ipcMain.handle('workflow-tool:respond', (_event, requestId: string, result: unknown) => {
    return { resolved: resolvePendingRendererTool(requestId, result) }
  })

  // AI Provider IPC
  ipcMain.handle('aiProvider:list', () => listAIProviders())
  ipcMain.handle('aiProvider:create', (_event, data) => createAIProvider(data))
  ipcMain.handle('aiProvider:update', (_event, id, data) => { updateAIProvider(id, data) })
  ipcMain.handle('aiProvider:delete', (_event, id) => { deleteAIProvider(id) })
  ipcMain.handle('aiProvider:test', (_event, id) => testProviderConnection(id))
}
