import { BrowserWindow } from 'electron'
import { pluginEventBus } from './plugin-event-bus'
import { PluginStorage } from './plugin-storage'
import { windowManager } from './window-manager'
import type { PluginContext, PluginInfo, PluginApi } from './plugin-types'

export function createPluginContext(
  pluginInfo: PluginInfo,
  storage: PluginStorage,
  eventBus: typeof pluginEventBus,
  getMainWindow: () => BrowserWindow | null,
  hasWorkflow = false,
): { context: PluginContext; cleanupEvents: () => void } {
  const prefix = `plugin:${pluginInfo.id}:`

  // 追踪所有通过 context.events 注册的监听器，卸载时逐一移除
  const registeredHandlers: Array<{ event: string; handler: (...args: any[]) => void }> = []

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

    ...(hasWorkflow
      ? {
          api: {
            createWindow: (opts: any) => windowManager.createWindow(opts),
            closeWindow: (windowId: number) => windowManager.closeWindow(windowId),
            navigateWindow: (windowId: number, url: string) => windowManager.navigateWindow(windowId, url),
            focusWindow: (windowId: number) => windowManager.focusWindow(windowId),
            screenshotWindow: (windowId: number) => windowManager.screenshotWindow(windowId),
            getWindowDetail: (windowId: number) => windowManager.getWindowDetail(windowId),
            listWindows: () => windowManager.listWindows(),
          } satisfies PluginApi,
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
