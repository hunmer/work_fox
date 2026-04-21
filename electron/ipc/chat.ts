import { ipcMain, BrowserWindow } from 'electron'
import { abortClaudeAgentRun, startClaudeAgentRun } from '../services/claude-agent-runtime'
import { resolvePendingRendererTool } from '../services/workflow-tool-dispatcher'
import { testProviderConnection } from '../services/ai-provider-test'
import { listAIProviders, getAIProvider, createAIProvider, updateAIProvider, deleteAIProvider } from '../services/store'
import { workflowNodeRegistry } from '../services/workflow-node-registry'
import { executeWorkflowBrowserNode } from '../services/workflow-browser-node-runtime'
import * as chatHistory from '../services/chat-history-store'

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

  // Chat History (workflow scope)
  ipcMain.handle('chatHistory:listSessions', (_e, workflowId: string) => chatHistory.listSessions(workflowId))
  ipcMain.handle('chatHistory:createSession', (_e, workflowId: string, session: any) => chatHistory.createSession(workflowId, session))
  ipcMain.handle('chatHistory:updateSession', (_e, workflowId: string, sessionId: string, updates: any) => chatHistory.updateSession(workflowId, sessionId, updates))
  ipcMain.handle('chatHistory:deleteSession', (_e, workflowId: string, sessionId: string) => chatHistory.deleteSession(workflowId, sessionId))
  ipcMain.handle('chatHistory:listMessages', (_e, workflowId: string, sessionId: string) => chatHistory.listMessages(workflowId, sessionId))
  ipcMain.handle('chatHistory:addMessage', (_e, workflowId: string, sessionId: string, message: any) => chatHistory.addMessage(workflowId, sessionId, message))
  ipcMain.handle('chatHistory:updateMessage', (_e, workflowId: string, sessionId: string, messageId: string, updates: any) => chatHistory.updateMessage(workflowId, sessionId, messageId, updates))
  ipcMain.handle('chatHistory:deleteMessage', (_e, workflowId: string, sessionId: string, messageId: string) => chatHistory.deleteMessage(workflowId, sessionId, messageId))
  ipcMain.handle('chatHistory:deleteMessages', (_e, workflowId: string, sessionId: string, messageIds: string[]) => chatHistory.deleteMessages(workflowId, sessionId, messageIds))
  ipcMain.handle('chatHistory:clearMessages', (_e, workflowId: string, sessionId: string) => chatHistory.clearMessages(workflowId, sessionId))
}

function isPlainObject(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
