import type { IpcAPI } from '../../preload/index'
import type { WSBridge } from '../lib/ws-bridge'
import { syncNoop, asyncNoop, notAvailable } from './stubs'

/** 打开文件选择对话框，读取文件文本内容 */
function pickFileAndRead(accept: string): Promise<{ json: string } | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.style.display = 'none'
    document.body.appendChild(input)

    input.onchange = async () => {
      const file = input.files?.[0]
      document.body.removeChild(input)
      if (!file) { resolve(null); return }
      const text = await file.text()
      resolve({ json: text })
    }
    input.oncancel = () => {
      document.body.removeChild(input)
      resolve(null)
    }
    input.click()
  })
}

/** 触发浏览器下载保存文件 */
function downloadFile(json: string, defaultName: string): Promise<{ success: boolean }> {
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = defaultName
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  return Promise.resolve({ success: true })
}

interface EndpointConfig {
  url: string
  token: string
}

/**
 * Browser-mode drop-in replacement for Electron's `window.api`.
 * Platform-only APIs that have no web equivalent are stubbed as no-ops or not-available.
 */
export class BrowserAPIAdapter implements IpcAPI {
  private ws: WSBridge
  private endpoint: EndpointConfig

  constructor(ws: WSBridge, endpoint: EndpointConfig) {
    this.ws = ws
    this.endpoint = endpoint
  }

  // ------------------------------------------------------------------
  // agent (interaction bridge → backend agent:execTool via WS)
  // ------------------------------------------------------------------
  agent = {
    execTool: (
      toolType: string,
      params: Record<string, any>,
      targetTabId?: string,
    ): Promise<any> => (this.ws as any).invoke('agent:execTool', { toolType, params, targetTabId }),
  }

  // ------------------------------------------------------------------
  // workflow (import/export — browser file picker / download)
  // ------------------------------------------------------------------
  workflow = {
    importOpenFile: (): Promise<any> =>
      pickFileAndRead('.workflow,.json'),
    exportSaveFile: async (json: string): Promise<void> => {
      await downloadFile(json, 'workflow.workflow')
    },
  }

  // ------------------------------------------------------------------
  // shortcut (web mode: config stored via backend WS, no global shortcuts)
  // ------------------------------------------------------------------
  shortcut = {
    list: (): Promise<{ groups: any[]; shortcuts: any[] }> =>
      (this.ws as any).invoke('shortcut:list'),
    update: (
      id: string,
      accelerator: string,
      isGlobal: boolean,
      enabled?: boolean,
    ): Promise<any> => (this.ws as any).invoke('shortcut:update', { id, accelerator, isGlobal, enabled }),
    toggle: (id: string, enabled: boolean): Promise<any> =>
      (this.ws as any).invoke('shortcut:toggle', { id, enabled }),
    clear: (id: string): Promise<any> => (this.ws as any).invoke('shortcut:clear', { id }),
    reset: (): Promise<any> => (this.ws as any).invoke('shortcut:reset'),
  }

  // ------------------------------------------------------------------
  // plugin (server plugins via WS, local plugins not available in web)
  // ------------------------------------------------------------------
  plugin = {
    list: () => (this.ws as any).invoke('plugin:list'),
    listLocal: async () => [],
    enable: (id: string) => (this.ws as any).invoke('plugin:enable', { id }),
    enableLocal: notAvailable('plugin:enable-local'),
    disable: (id: string) => (this.ws as any).invoke('plugin:disable', { id }),
    disableLocal: notAvailable('plugin:disable-local'),
    getWorkflowNodes: (pluginId: string) => (this.ws as any).invoke('plugin:get-workflow-nodes', { pluginId }),
    getAgentTools: (pluginIds: string[]) => (this.ws as any).invoke('plugin:get-agent-tools', { pluginIds }),
    getView: (id: string) => (this.ws as any).invoke('plugin:get-view', id),
    getIcon: (id: string) => (this.ws as any).invoke('plugin:get-icon', id),
    importZip: notAvailable('plugin:import-zip'),
    openFolder: notAvailable('plugin:open-folder'),
    install: async (url: string) => {
      const plugin = await (this.ws as any).invoke('plugin:install', { url })
      return {
        success: true,
        pluginName: plugin?.name,
      }
    },
    uninstall: async (id: string) => {
      await (this.ws as any).invoke('plugin:uninstall', { id })
      return { success: true }
    },
  }

  // ------------------------------------------------------------------
  // window (fire-and-forget in Electron → no-op in browser)
  // ------------------------------------------------------------------
  window = {
    minimize: syncNoop,
    maximize: syncNoop,
    close: syncNoop,
    isMaximized: asyncNoop(false),
  }

  // ------------------------------------------------------------------
  // fs (only openInExplorer is platform-only; data fs ops use fsApi via wsBridge)
  // ------------------------------------------------------------------
  fs = {
    openInExplorer: notAvailable('fs:openInExplorer'),
  }

  // ------------------------------------------------------------------
  // backend (returns local config, no WS call needed)
  // ------------------------------------------------------------------
  backend = {
    getEndpoint: (): Promise<{ url: string; token: string }> =>
      Promise.resolve(this.endpoint),
    getStatus: (): Promise<{
      running: boolean
      url?: string
      pid?: number
      error?: string
    }> =>
      Promise.resolve({
        running: this.ws.isConnected(),
        url: this.endpoint.url,
      }),
  }

  // ------------------------------------------------------------------
  // openExternal
  // ------------------------------------------------------------------
  openExternal = (url: string): Promise<void> => {
    window.open(url, '_blank')
    return Promise.resolve()
  }

  // ------------------------------------------------------------------
  // getAppVersion
  // ------------------------------------------------------------------
  getAppVersion = (): Promise<string> => (this.ws as any).invoke('app:getVersion')

  // ------------------------------------------------------------------
  // on — subscribe to events via WSBridge
  // ------------------------------------------------------------------
  on = (channel: string, callback: (...args: any[]) => void): (() => void) => {
    const handler = (data: unknown) => callback(data)
    this.ws.on(channel, handler)
    return () => this.ws.off(channel, handler)
  }
}
