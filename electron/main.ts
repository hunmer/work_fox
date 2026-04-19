import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { registerWorkflowIpcHandlers } from './ipc/workflow'
import { registerWorkflowVersionIpcHandlers } from './ipc/workflow-version'
import { registerExecutionLogIpcHandlers } from './ipc/execution-log'
import { registerChatIpcHandlers } from './ipc/chat'
import { registerShortcutIpcHandlers, registerGlobalShortcuts, unregisterGlobalShortcuts } from './ipc/shortcut'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    frame: false,
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow!.show()
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.work-fox.app')
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerWorkflowIpcHandlers()
  registerWorkflowVersionIpcHandlers()
  registerExecutionLogIpcHandlers()
  registerChatIpcHandlers()
  registerShortcutIpcHandlers()

  ipcMain.handle('app:getVersion', () => app.getVersion())
  ipcMain.handle('shell:openExternal', (_e, url: string) => {
    const { shell } = require('electron')
    shell.openExternal(url)
  })

  createWindow()
  registerGlobalShortcuts()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  unregisterGlobalShortcuts()
  if (process.platform !== 'darwin') app.quit()
})
