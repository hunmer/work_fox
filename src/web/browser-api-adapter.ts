import type { IpcAPI } from '../../preload/index'
import type { WSBridge } from '../lib/ws-bridge'
import { syncNoop, asyncNoop, notAvailable } from './stubs'

interface EndpointConfig {
  url: string
  token: string
}

/**
 * Browser-mode drop-in replacement for Electron's `window.api`.
 * Every call is routed through WSBridge to the backend.
 */
export class BrowserAPIAdapter implements IpcAPI {
  private ws: WSBridge
  private endpoint: EndpointConfig

  constructor(ws: WSBridge, endpoint: EndpointConfig) {
    this.ws = ws
    this.endpoint = endpoint
  }

  // ------------------------------------------------------------------
  // Raw invoke — bypasses BackendChannel type constraint so that web
  // mode can call IPC channels that are not (yet) in channel-contracts.
  // Multiple positional args are packed into a single data payload.
  // ------------------------------------------------------------------
  private rpc<R = any>(channel: string, ...args: any[]): Promise<R> {
    // If exactly one arg, send it directly; otherwise pack as array
    const data = args.length <= 1 ? args[0] : args
    return (this.ws as any).invoke(channel, data) as Promise<R>
  }

  // ------------------------------------------------------------------
  // chat
  // ------------------------------------------------------------------
  chat = {
    completions: (params: any): Promise<{ started: boolean }> =>
      this.rpc('chat:completions', params),
    abort: (requestId: string): Promise<{ aborted: boolean }> =>
      this.rpc('chat:abort', requestId),
  }

  // ------------------------------------------------------------------
  // chatHistory
  // ------------------------------------------------------------------
  chatHistory = {
    listSessions: (workflowId: string): Promise<any[]> =>
      this.rpc('chatHistory:listSessions', { workflowId }),
    createSession: (workflowId: string, session: any): Promise<any> =>
      this.rpc('chatHistory:createSession', { workflowId, session }),
    updateSession: (workflowId: string, sessionId: string, updates: any): Promise<void> =>
      this.rpc('chatHistory:updateSession', { workflowId, sessionId, updates }),
    deleteSession: (workflowId: string, sessionId: string): Promise<void> =>
      this.rpc('chatHistory:deleteSession', { workflowId, sessionId }),
    listMessages: (workflowId: string, sessionId: string): Promise<any[]> =>
      this.rpc('chatHistory:listMessages', { workflowId, sessionId }),
    addMessage: (workflowId: string, sessionId: string, message: any): Promise<any> =>
      this.rpc('chatHistory:addMessage', { workflowId, sessionId, message }),
    updateMessage: (
      workflowId: string,
      sessionId: string,
      messageId: string,
      updates: any,
    ): Promise<void> =>
      this.rpc('chatHistory:updateMessage', { workflowId, sessionId, messageId, updates }),
    deleteMessage: (
      workflowId: string,
      sessionId: string,
      messageId: string,
    ): Promise<void> =>
      this.rpc('chatHistory:deleteMessage', { workflowId, sessionId, messageId }),
    deleteMessages: (
      workflowId: string,
      sessionId: string,
      messageIds: string[],
    ): Promise<void> =>
      this.rpc('chatHistory:deleteMessages', { workflowId, sessionId, messageIds }),
    clearMessages: (workflowId: string, sessionId: string): Promise<void> =>
      this.rpc('chatHistory:clearMessages', { workflowId, sessionId }),
  }

  // ------------------------------------------------------------------
  // workflowTool
  // ------------------------------------------------------------------
  workflowTool = {
    respond: (requestId: string, result: unknown): Promise<{ resolved: boolean }> =>
      this.rpc('workflow-tool:respond', { requestId, result }),
  }

  // ------------------------------------------------------------------
  // agent
  // ------------------------------------------------------------------
  agent = {
    execTool: (
      toolType: string,
      params: Record<string, any>,
      targetTabId?: string,
    ): Promise<any> => this.rpc('agent:execTool', { toolType, params, targetTabId }),
  }

  // ------------------------------------------------------------------
  // aiProvider
  // ------------------------------------------------------------------
  aiProvider = {
    list: (): Promise<any[]> => this.rpc('aiProvider:list'),
    create: (data: any): Promise<any> => this.rpc('aiProvider:create', { data }),
    update: (data: { id: string; [key: string]: any }): Promise<any> => {
      const { id, ...rest } = data
      return this.rpc('aiProvider:update', { id, data: rest })
    },
    delete: (id: string): Promise<boolean> => this.rpc('aiProvider:delete', { id }),
    test: (id: string): Promise<{ success: boolean; error?: string }> =>
      this.rpc('aiProvider:test', { id }),
  }

  // ------------------------------------------------------------------
  // workflow (import/export only — CRUD lives on backend channels)
  // ------------------------------------------------------------------
  workflow = {
    importOpenFile: notAvailable('workflow:importOpenFile'),
    exportSaveFile: notAvailable('workflow:exportSaveFile'),
  }

  // ------------------------------------------------------------------
  // shortcut
  // ------------------------------------------------------------------
  shortcut = {
    list: (): Promise<{ groups: any[]; shortcuts: any[] }> =>
      this.rpc('shortcut:list'),
    update: (
      id: string,
      accelerator: string,
      isGlobal: boolean,
      enabled?: boolean,
    ): Promise<any> => this.rpc('shortcut:update', { id, accelerator, isGlobal, enabled }),
    toggle: (id: string, enabled: boolean): Promise<any> =>
      this.rpc('shortcut:toggle', { id, enabled }),
    clear: (id: string): Promise<any> => this.rpc('shortcut:clear', { id }),
    reset: (): Promise<any> => this.rpc('shortcut:reset'),
  }

  // ------------------------------------------------------------------
  // plugin
  // ------------------------------------------------------------------
  plugin = {
    list: () => this.rpc('plugin:list'),
    listLocal: async () => [],
    enable: (id: string) => this.rpc('plugin:enable', id),
    enableLocal: notAvailable('plugin:enable-local'),
    disable: (id: string) => this.rpc('plugin:disable', id),
    disableLocal: notAvailable('plugin:disable-local'),
    getView: (id: string) => this.rpc('plugin:get-view', id),
    getIcon: (id: string) => this.rpc('plugin:get-icon', id),
    importZip: notAvailable('plugin:import-zip'),
    openFolder: notAvailable('plugin:open-folder'),
    install: async (url: string) => {
      const plugin = await this.rpc<any>('plugin:install', { url })
      return {
        success: true,
        pluginName: plugin?.name,
      }
    },
    uninstall: async (id: string) => {
      await this.rpc('plugin:uninstall', { id })
      return { success: true }
    },
  }

  // ------------------------------------------------------------------
  // agentSettings
  // ------------------------------------------------------------------
  agentSettings = {
    get: (): Promise<any> => this.rpc('agentSettings:get'),
    set: (settings: any): Promise<any> => this.rpc('agentSettings:set', { settings }),
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
  // tabs
  // ------------------------------------------------------------------
  tabs = {
    load: (): Promise<{ tabs: any[]; activeTabId: string | null }> =>
      this.rpc('tabs:load'),
    save: (data: { tabs: any[]; activeTabId: string | null }): Promise<void> =>
      this.rpc('tabs:save', data),
  }

  // ------------------------------------------------------------------
  // fs
  // ------------------------------------------------------------------
  fs = {
    listDir: (
      dirPath: string,
    ): Promise<Array<{
      name: string
      path: string
      type: 'file' | 'directory'
      modifiedAt: string
    }>> => this.rpc('fs:listDir', dirPath),
    delete: (targetPath: string): Promise<{ success: boolean; error?: string }> =>
      this.rpc('fs:delete', targetPath),
    createFile: (filePath: string): Promise<{ success: boolean; error?: string }> =>
      this.rpc('fs:createFile', filePath),
    createDir: (dirPath: string): Promise<{ success: boolean; error?: string }> =>
      this.rpc('fs:createDir', dirPath),
    openInExplorer: notAvailable('fs:openInExplorer'),
    rename: (
      oldPath: string,
      newName: string,
    ): Promise<{ success: boolean; newPath?: string; error?: string }> =>
      this.rpc('fs:rename', { oldPath, newName }),
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
  getAppVersion = (): Promise<string> => this.rpc<string>('app:getVersion')

  // ------------------------------------------------------------------
  // on — subscribe to events via WSBridge
  // ------------------------------------------------------------------
  on = (channel: string, callback: (...args: any[]) => void): (() => void) => {
    const handler = (data: unknown) => callback(data)
    this.ws.on(channel, handler)
    return () => this.ws.off(channel, handler)
  }
}
