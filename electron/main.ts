import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { registerWorkflowIpcHandlers } from './ipc/workflow'
import { registerWorkflowVersionIpcHandlers } from './ipc/workflow-version'
import { registerExecutionLogIpcHandlers } from './ipc/execution-log'
import { registerChatIpcHandlers } from './ipc/chat'
import { registerShortcutIpcHandlers, registerGlobalShortcuts, unregisterGlobalShortcuts } from './ipc/shortcut'
import { registerPluginIpcHandlers } from './ipc/plugin'
import { registerTabsIpcHandlers } from './ipc/tabs'
import { registerAgentSettingsIpcHandlers } from './ipc/agent-settings'
import { pluginManager } from './services/plugin-manager'
import { workflowNodeRegistry } from './services/workflow-node-registry'
import { getWindowMaximized, setWindowMaximized } from './services/store'
import { builtinNodeDefinitions } from './services/builtin-nodes'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    frame: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    if (getWindowMaximized()) {
      mainWindow!.maximize()
    }
    mainWindow!.show()
  })

  mainWindow.on('maximize', () => setWindowMaximized(true))
  mainWindow.on('unmaximize', () => setWindowMaximized(false))

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
  registerPluginIpcHandlers()
  registerTabsIpcHandlers()
  registerAgentSettingsIpcHandlers()
  workflowNodeRegistry.registerBuiltinNodes(builtinNodeDefinitions)
  pluginManager.loadAll()

  ipcMain.on('window:minimize', () => mainWindow?.minimize())
  ipcMain.on('window:maximize', () => {
    if (mainWindow?.isMaximized()) mainWindow.unmaximize()
    else mainWindow?.maximize()
  })

  ipcMain.on('window:close', () => mainWindow?.close())
  ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized() ?? false)

  ipcMain.handle('app:getVersion', () => app.getVersion())
  ipcMain.handle('shell:openExternal', (_e, url: string) => {
    const { shell } = require('electron')
    shell.openExternal(url)
  })

  createWindow()
  pluginManager.setMainWindow(mainWindow!)
  registerGlobalShortcuts()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  unregisterGlobalShortcuts()
  pluginManager.shutdown()
  if (process.platform !== 'darwin') app.quit()
})
