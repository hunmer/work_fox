import { BrowserWindow } from 'electron'
import https from 'https'
import http from 'http'
import { URL } from 'url'
import fs from 'fs/promises'
import path from 'path'
import { pluginEventBus } from './plugin-event-bus'
import { PluginStorage } from './plugin-storage'
import { workflowNodeRegistry } from './workflow-node-registry'
import type { PluginContext, PluginInfo, PluginApi, FetchApi, FetchOptions, FetchBufferResult, FetchBuffersItem, FsApi, ListFilesItem, FileStatResult } from './plugin-types'

function httpGet(url: string, options: FetchOptions & { timeout: number }): Promise<http.IncomingMessage> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    const mod = parsed.protocol === 'https:' ? https : http
    const req = mod.get(url, {
      headers: {
        'User-Agent': options.userAgent || 'WorkFox/1.0',
        ...options.headers,
      },
      timeout: options.timeout,
    }, (res) => {
      if (res.statusCode! >= 300 && res.statusCode! < 400 && res.headers.location) {
        return httpGet(res.headers.location, options).then(resolve, reject)
      }
      if (res.statusCode! >= 400) {
        res.resume()
        return reject(new Error(`HTTP ${res.statusCode}`))
      }
      resolve(res)
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('请求超时')) })
  })
}

function collectBody(res: http.IncomingMessage, encoding?: BufferEncoding): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    res.on('data', (c: Buffer) => chunks.push(c))
    res.on('end', () => resolve(Buffer.concat(chunks).toString(encoding || 'utf-8')))
    res.on('error', reject)
  })
}

function collectBuffer(res: http.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    res.on('data', (c: Buffer) => chunks.push(c))
    res.on('end', () => resolve(Buffer.concat(chunks)))
    res.on('error', reject)
  })
}

export function createBuiltinFetchApi(): FetchApi {
  return {
    async fetchText(url, options = {}): Promise<string> {
      const res = await httpGet(url, { ...options, timeout: options.timeout || 30000 })
      return collectBody(res, options.encoding as BufferEncoding | undefined)
    },

    async fetchJson<T = any>(url: string, options?: FetchOptions): Promise<T> {
      const text = await createBuiltinFetchApi().fetchText(url, options)
      return JSON.parse(text)
    },

    async fetchBuffer(url, options = {}): Promise<FetchBufferResult> {
      const res = await httpGet(url, { ...options, timeout: options.timeout || 60000 })
      const buffer = await collectBuffer(res)
      return {
        buffer,
        size: buffer.length,
        mimeType: res.headers['content-type'] || 'application/octet-stream',
      }
    },

    async fetchBuffers(urls, options = {}): Promise<FetchBuffersItem[]> {
      const results: FetchBuffersItem[] = []
      for (const url of urls) {
        try {
          const result = await createBuiltinFetchApi().fetchBuffer(url, options)
          results.push({ url, ...result, success: true })
        } catch (err: any) {
          results.push({ url, success: false, error: err.message })
        }
      }
      return results
    },
  }
}

function matchPattern(name: string, pattern: string): boolean {
  const re = new RegExp(pattern.replace(/\*/g, '.*').replace(/\?/g, '.'))
  return re.test(name)
}

export function createBuiltinFsApi(): FsApi {
  return {
    writeFile: (filePath, content, encoding = 'utf-8') =>
      fs.writeFile(filePath, content, encoding),

    readFile: (filePath, encoding = 'utf-8') =>
      fs.readFile(filePath, encoding),

    async editFile(filePath, oldContent, newContent) {
      const content = await fs.readFile(filePath, 'utf-8')
      if (!content.includes(oldContent)) {
        throw new Error('文件中未找到要替换的内容')
      }
      await fs.writeFile(filePath, content.replace(oldContent, newContent), 'utf-8')
      return { replaced: true }
    },

    deleteFile: (filePath) => fs.unlink(filePath),

    async listFiles(dirPath, options = {}): Promise<ListFilesItem[]> {
      const recursive = options.recursive ?? false
      const pattern = options.pattern || null
      if (recursive) {
        const results: ListFilesItem[] = []
        const walk = async (dir: string) => {
          const entries = await fs.readdir(dir, { withFileTypes: true })
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name)
            if (entry.isDirectory()) {
              results.push({ name: entry.name, path: fullPath, type: 'directory' })
              await walk(fullPath)
            } else if (!pattern || matchPattern(entry.name, pattern)) {
              results.push({ name: entry.name, path: fullPath, type: 'file' })
            }
          }
        }
        await walk(dirPath)
        return results
      }
      const entries = await fs.readdir(dirPath, { withFileTypes: true })
      return entries
        .filter(e => !pattern || matchPattern(e.name, pattern))
        .map(e => ({ name: e.name, path: path.join(dirPath, e.name), type: (e.isDirectory() ? 'directory' : 'file') as 'file' | 'directory' }))
    },

    createDir: (dirPath, options = {}) =>
      fs.mkdir(dirPath, { recursive: options.recursive ?? true }),

    removeDir: (dirPath, options = {}) =>
      fs.rm(dirPath, { recursive: options.recursive ?? false, force: options.force ?? false }),

    async stat(filePath): Promise<FileStatResult> {
      const s = await fs.stat(filePath)
      return {
        isFile: s.isFile(),
        isDirectory: s.isDirectory(),
        size: s.size,
        createdAt: s.birthtime.toISOString(),
        modifiedAt: s.mtime.toISOString(),
      }
    },

    exists: (filePath) => fs.access(filePath).then(() => true).catch(() => false),

    rename: (oldPath, newPath) => fs.rename(oldPath, newPath),

    copyFile: (src, dest) => fs.copyFile(src, dest),
  }
}

export function createPluginContext(
  pluginInfo: PluginInfo,
  storage: PluginStorage,
  eventBus: typeof pluginEventBus,
  getMainWindow: () => BrowserWindow | null,
  hasWorkflow = false,
): { context: PluginContext; cleanupEvents: () => void } {
  const prefix = `plugin:${pluginInfo.id}:`

  const registeredHandlers: Array<{ event: string; handler: (...args: any[]) => void }> = []
  const fetchApi = createBuiltinFetchApi()
  const fsApi = createBuiltinFsApi()

  const context: PluginContext = {
    events: {
      on(event: string, handler: (...args: any[]) => void): void {
        registeredHandlers.push({ event, handler })
        eventBus.on(event, handler)
      },
      once(event: string, handler: (...args: any[]) => void): void {
        registeredHandlers.push({ event, handler })
        eventBus.once(event, handler)
      },
      off(event: string, handler: (...args: any[]) => void): void {
        const idx = registeredHandlers.findIndex((h) => h.event === event && h.handler === handler)
        if (idx !== -1) registeredHandlers.splice(idx, 1)
        eventBus.off(event, handler)
      },
      emit(event: string, ...args: any[]): void {
        eventBus.emit(prefix + event, ...args)
      }
    },

    storage: {
      get: (key: string) => storage.get(key),
      set: (key: string, value: any) => storage.set(key, value),
      delete: (key: string) => storage.delete(key),
      clear: () => storage.clear(),
      keys: () => storage.keys()
    },

    plugin: pluginInfo,

    logger: {
      info(msg: string, ...args: any[]): void {
        console.log(`[Plugin:${pluginInfo.name}] ${msg}`, ...args)
      },
      warn(msg: string, ...args: any[]): void {
        console.warn(`[Plugin:${pluginInfo.name}] ${msg}`, ...args)
      },
      error(msg: string, ...args: any[]): void {
        console.error(`[Plugin:${pluginInfo.name}] ${msg}`, ...args)
      }
    },

    sendToRenderer(channel: string, ...args: any[]): void {
      const win = getMainWindow()
      if (!win || win.isDestroyed()) return
      win.webContents.send(channel, ...args)
    },

    fetch: fetchApi,
    fs: fsApi,

    ...(hasWorkflow
      ? {
          get api(): PluginApi {
            const nodes = workflowNodeRegistry.getPluginNodes(pluginInfo.id)
            for (const node of nodes) {
              const api = workflowNodeRegistry.getApiForNodeType(node.type)
              if (api) return api as PluginApi
            }
            return {} as PluginApi
          },
        }
      : {}),
  }

  const cleanupEvents = () => {
    for (const { event, handler } of registeredHandlers) {
      eventBus.off(event, handler)
    }
    registeredHandlers.length = 0
  }

  return { context, cleanupEvents }
}
