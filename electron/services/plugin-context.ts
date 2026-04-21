import { BrowserWindow } from 'electron'
import { pluginEventBus } from './plugin-event-bus'
import { PluginStorage, PluginConfigStorage } from './plugin-storage'
import { workflowNodeRegistry } from './workflow-node-registry'
import { createBuiltinFetchApi } from './plugin-fetch-api'
import { createBuiltinFsApi } from './plugin-fs-api'
import type { PluginContext, PluginInfo, PluginApi } from './plugin-types'

export { createBuiltinFetchApi } from './plugin-fetch-api'
export { createBuiltinFsApi } from './plugin-fs-api'

export function createPluginContext(
  pluginInfo: PluginInfo,
  storage: PluginStorage,
  eventBus: typeof pluginEventBus,
  getMainWindow: () => BrowserWindow | null,
  hasWorkflow = false,
  configStorage?: PluginConfigStorage,
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

    config: new Proxy({} as Record<string, string>, {
      get(_, key: string) {
        if (typeof key === 'symbol') return undefined
        const userVal = configStorage?.getSync(key)
        if (userVal !== undefined) return userVal
        const field = pluginInfo.config?.find(f => f.key === key)
        return field?.value
      },
      ownKeys() {
        const keys = new Set<string>()
        if (pluginInfo.config) {
          for (const f of pluginInfo.config) keys.add(f.key)
        }
        if (configStorage) {
          for (const k of configStorage.keysSync()) keys.add(k)
        }
        return [...keys]
      },
      has(_, key: string) {
        return !!(pluginInfo.config?.find(f => f.key === key)) ||
          !!(configStorage && configStorage.getSync(key) !== undefined)
      }
    }),

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
