import { app, BrowserWindow, ipcMain, protocol } from 'electron'
import { join, extname } from 'path'
import { readFileSync, statSync, openSync, readSync, closeSync, existsSync } from 'fs'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { registerWorkflowIpcHandlers } from './ipc/workflow'
import { registerChatIpcHandlers } from './ipc/chat'
import { registerGlobalShortcuts, unregisterGlobalShortcuts } from './ipc/shortcut'
import { registerPluginIpcHandlers } from './ipc/plugin'
import { registerFsIpcHandlers } from './ipc/fs'
import { registerBackendIpcHandlers } from './ipc/backend'
import { pluginManager } from './services/plugin-manager'
import { workflowNodeRegistry } from './services/workflow-node-registry'
import { getWindowMaximized, setWindowMaximized } from './services/store'
import { builtinNodeDefinitions } from './services/builtin-nodes'
import { backendProcessManager } from './services/backend-process'

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
  // 注册 local:// 自定义协议，允许渲染进程加载本地文件资源
  const MIME_MAP: Record<string, string> = {
    '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac',
    '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.flac': 'audio/flac',
    '.wma': 'audio/x-ms-wma', '.mp4': 'video/mp4', '.webm': 'video/webm',
    '.mkv': 'video/x-matroska', '.avi': 'video/x-msvideo',
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
    '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp',
    '.svg': 'image/svg+xml',
  }

  protocol.handle('local', (request) => {
    const url = new URL(request.url)
    let filePath = decodeURIComponent(url.pathname)
    if (process.platform === 'win32' && /^\/[A-Za-z]:\//.test(filePath)) {
      filePath = filePath.slice(1)
    }

    if (!existsSync(filePath)) {
      return new Response('Not Found', { status: 404 })
    }

    const stat = statSync(filePath)
    const ext = extname(filePath).toLowerCase()
    const contentType = MIME_MAP[ext] || 'application/octet-stream'

    // Range 请求支持（音频/视频 seek 必需）
    const rangeHeader = request.headers.get('Range')
    if (rangeHeader) {
      const match = rangeHeader.match(/bytes=(\d+)-(\d*)/)
      if (match) {
        const start = parseInt(match[1])
        const end = match[2] ? parseInt(match[2]) : stat.size - 1
        const length = end - start + 1
        const buf = Buffer.alloc(length)
        const fd = openSync(filePath, 'r')
        try { readSync(fd, buf, 0, length, start) } finally { closeSync(fd) }
        return new Response(buf, {
          status: 206,
          headers: {
            'Content-Type': contentType,
            'Content-Range': `bytes ${start}-${end}/${stat.size}`,
            'Content-Length': length.toString(),
            'Accept-Ranges': 'bytes',
          },
        })
      }
    }

    const buf = readFileSync(filePath)
    return new Response(buf, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': stat.size.toString(),
        'Accept-Ranges': 'bytes',
      },
    })
  })

  electronApp.setAppUserModelId('com.work-fox.app')
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerWorkflowIpcHandlers()
  registerChatIpcHandlers()
  registerPluginIpcHandlers()
  registerFsIpcHandlers()
  registerBackendIpcHandlers()
  workflowNodeRegistry.registerBuiltinNodes(builtinNodeDefinitions)
  pluginManager.loadAll()
  backendProcessManager.start().catch((error) => {
    console.error('[backend-process] startup failed', error)
  })

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
  backendProcessManager.stop().catch((error) => {
    console.error('[backend-process] shutdown failed', error)
  })
  if (process.platform !== 'darwin') app.quit()
})
