import { ipcMain, BrowserWindow, dialog } from 'electron'

export function registerWorkflowIpcHandlers(): void {
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
}
