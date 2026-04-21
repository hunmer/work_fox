import { ipcMain, BrowserWindow, dialog } from 'electron'
import {
  listWorkflows,
  getWorkflow,
  createWorkflow,
  updateWorkflow,
  deleteWorkflow,
  listWorkflowFolders,
  createWorkflowFolder,
  updateWorkflowFolder,
  deleteWorkflowFolder,
  listPluginSchemes,
  readPluginScheme,
  createPluginScheme,
  savePluginScheme,
  deletePluginScheme,
} from '../services/workflow-store'

export function registerWorkflowIpcHandlers(): void {
  // 工作流
  ipcMain.handle('workflow:list', (_e, folderId?: string | null) => listWorkflows(folderId))
  ipcMain.handle('workflow:get', (_e, id: string) => getWorkflow(id))
  ipcMain.handle('workflow:create', (_e, data) => createWorkflow(data))
  ipcMain.handle('workflow:update', (_e, id: string, data) => updateWorkflow(id, data))
  ipcMain.handle('workflow:delete', (_e, id: string) => deleteWorkflow(id))

  // 工作流导入
  ipcMain.handle('workflow:importOpenFile', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) return null
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: '导入工作流',
      filters: [{ name: '工作流文件', extensions: ['workflow'] }],
      properties: ['openFile'],
    })
    if (canceled || filePaths.length === 0) return null
    const { readFileSync } = await import('node:fs')
    return { json: readFileSync(filePaths[0], 'utf-8') }
  })

  // 工作流导出
  ipcMain.handle('workflow:exportSaveFile', async (e, json: string) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) return { success: false }
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: '导出工作流',
      defaultPath: 'workflow.workflow',
      filters: [{ name: '工作流文件', extensions: ['workflow'] }],
    })
    if (canceled || !filePath) return { success: false }
    const { writeFileSync } = await import('node:fs')
    writeFileSync(filePath, json, 'utf-8')
    return { success: true }
  })

  // 工作流文件夹
  ipcMain.handle('workflowFolder:list', () => listWorkflowFolders())
  ipcMain.handle('workflowFolder:create', (_e, data) => createWorkflowFolder(data))
  ipcMain.handle('workflowFolder:update', (_e, id: string, data) => updateWorkflowFolder(id, data))
  ipcMain.handle('workflowFolder:delete', (_e, id: string) => deleteWorkflowFolder(id))

  // 插件配置方案
  ipcMain.handle('workflow:list-plugin-schemes', (_e, { workflowId, pluginId }: { workflowId: string; pluginId: string }) => {
    try { return listPluginSchemes(workflowId, pluginId) } catch { return [] }
  })
  ipcMain.handle('workflow:read-plugin-scheme', (_e, { workflowId, pluginId, schemeName }: { workflowId: string; pluginId: string; schemeName: string }) => {
    return readPluginScheme(workflowId, pluginId, schemeName)
  })
  ipcMain.handle('workflow:create-plugin-scheme', (_e, { workflowId, pluginId, schemeName }: { workflowId: string; pluginId: string; schemeName: string }) => {
    return createPluginScheme(workflowId, pluginId, schemeName)
  })
  ipcMain.handle('workflow:save-plugin-scheme', (_e, { workflowId, pluginId, schemeName, data }: { workflowId: string; pluginId: string; schemeName: string; data: Record<string, string> }) => {
    return savePluginScheme(workflowId, pluginId, schemeName, data)
  })
  ipcMain.handle('workflow:delete-plugin-scheme', (_e, { workflowId, pluginId, schemeName }: { workflowId: string; pluginId: string; schemeName: string }) => {
    return deletePluginScheme(workflowId, pluginId, schemeName)
  })
}
