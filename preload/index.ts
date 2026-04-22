import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { AgentGlobalSettings } from '../src/types'

export interface ChatCompletionParams {
  providerId: string
  modelId: string
  system?: string
  messages: Array<{ role: string; content: string | Array<Record<string, unknown>> }>
  tools?: Array<Record<string, unknown>>
  stream: boolean
  maxTokens?: number
  thinking?: { type: 'enabled'; budgetTokens: number }
  targetTabId?: string
  enabledToolNames?: string[]
  _mode?: 'workflow'
  _workflowId?: string
  runtime?: {
    cwd?: string
    additionalDirectories?: string[]
    permissionMode?: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | 'dontAsk' | 'auto'
    allowedTools?: string[]
    extraInstructions?: string
    loadProjectClaudeMd?: boolean
    loadRuleMd?: boolean
    ruleFileNames?: string[]
    enabledPlugins?: string[]
  }
}

export interface WorkflowToolExecuteRequest {
  requestId: string
  toolUseId: string
  name: string
  args: Record<string, unknown>
  workflowId: string
}

const api = {
  chat: {
    completions: (params: ChatCompletionParams & { _requestId: string }): Promise<{ started: boolean }> =>
      ipcRenderer.invoke('chat:completions', params),
    abort: (requestId: string): Promise<{ aborted: boolean }> =>
      ipcRenderer.invoke('chat:abort', requestId),
  },

  chatHistory: {
    listSessions: (workflowId: string): Promise<any[]> =>
      ipcRenderer.invoke('chatHistory:listSessions', workflowId),
    createSession: (workflowId: string, session: any): Promise<any> =>
      ipcRenderer.invoke('chatHistory:createSession', workflowId, session),
    updateSession: (workflowId: string, sessionId: string, updates: any): Promise<void> =>
      ipcRenderer.invoke('chatHistory:updateSession', workflowId, sessionId, updates),
    deleteSession: (workflowId: string, sessionId: string): Promise<void> =>
      ipcRenderer.invoke('chatHistory:deleteSession', workflowId, sessionId),
    listMessages: (workflowId: string, sessionId: string): Promise<any[]> =>
      ipcRenderer.invoke('chatHistory:listMessages', workflowId, sessionId),
    addMessage: (workflowId: string, sessionId: string, message: any): Promise<any> =>
      ipcRenderer.invoke('chatHistory:addMessage', workflowId, sessionId, message),
    updateMessage: (workflowId: string, sessionId: string, messageId: string, updates: any): Promise<void> =>
      ipcRenderer.invoke('chatHistory:updateMessage', workflowId, sessionId, messageId, updates),
    deleteMessage: (workflowId: string, sessionId: string, messageId: string): Promise<void> =>
      ipcRenderer.invoke('chatHistory:deleteMessage', workflowId, sessionId, messageId),
    deleteMessages: (workflowId: string, sessionId: string, messageIds: string[]): Promise<void> =>
      ipcRenderer.invoke('chatHistory:deleteMessages', workflowId, sessionId, messageIds),
    clearMessages: (workflowId: string, sessionId: string): Promise<void> =>
      ipcRenderer.invoke('chatHistory:clearMessages', workflowId, sessionId),
  },

  workflowTool: {
    respond: (requestId: string, result: unknown): Promise<{ resolved: boolean }> =>
      ipcRenderer.invoke('workflow-tool:respond', requestId, result),
  },

  agent: {
    execTool: (toolType: string, params: Record<string, any>, targetTabId?: string): Promise<any> =>
      ipcRenderer.invoke('agent:execTool', toolType, params, targetTabId),
  },

  aiProvider: {
    list: (): Promise<any[]> => ipcRenderer.invoke('aiProvider:list'),
    create: (data: any): Promise<any> => ipcRenderer.invoke('aiProvider:create', data),
    update: (data: { id: string; [key: string]: any }): Promise<any> =>
      ipcRenderer.invoke('aiProvider:update', data.id, data),
    delete: (id: string): Promise<boolean> => ipcRenderer.invoke('aiProvider:delete', id),
    test: (id: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('aiProvider:test', id),
  },

  workflow: {
    importOpenFile: (): Promise<any> => ipcRenderer.invoke('workflow:importOpenFile'),
    exportSaveFile: (id: string): Promise<void> => ipcRenderer.invoke('workflow:exportSaveFile', id),
  },

  shortcut: {
    list: (): Promise<{ groups: any[]; shortcuts: any[] }> => ipcRenderer.invoke('shortcut:list'),
    update: (id: string, accelerator: string, isGlobal: boolean, enabled?: boolean): Promise<any> =>
      ipcRenderer.invoke('shortcut:update', id, accelerator, isGlobal, enabled),
    toggle: (id: string, enabled: boolean): Promise<any> =>
      ipcRenderer.invoke('shortcut:toggle', id, enabled),
    clear: (id: string): Promise<any> => ipcRenderer.invoke('shortcut:clear', id),
    reset: (): Promise<any> => ipcRenderer.invoke('shortcut:reset'),
  },

  plugin: {
    list: () => ipcRenderer.invoke('plugin:list'),
    listLocal: () => ipcRenderer.invoke('plugin:list-local'),
    enable: (id: string) => ipcRenderer.invoke('plugin:enable', id),
    enableLocal: (id: string) => ipcRenderer.invoke('plugin:enable-local', id),
    disable: (id: string) => ipcRenderer.invoke('plugin:disable', id),
    disableLocal: (id: string) => ipcRenderer.invoke('plugin:disable-local', id),
    getView: (id: string) => ipcRenderer.invoke('plugin:get-view', id),
    getIcon: (id: string) => ipcRenderer.invoke('plugin:get-icon', id),
    importZip: () => ipcRenderer.invoke('plugin:import-zip'),
    openFolder: () => ipcRenderer.invoke('plugin:open-folder'),
    install: (url: string) => ipcRenderer.invoke('plugin:install', url),
    uninstall: (id: string) => ipcRenderer.invoke('plugin:uninstall', id),
  },

  agentSettings: {
    get: (): Promise<AgentGlobalSettings> => ipcRenderer.invoke('agentSettings:get'),
    set: (settings: AgentGlobalSettings): Promise<AgentGlobalSettings> => ipcRenderer.invoke('agentSettings:set', settings),
  },

  window: {
    minimize: (): void => ipcRenderer.send('window:minimize'),
    maximize: (): void => ipcRenderer.send('window:maximize'),
    close: (): void => ipcRenderer.send('window:close'),
    isMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:isMaximized'),
  },

  tabs: {
    load: (): Promise<{ tabs: any[]; activeTabId: string | null }> => ipcRenderer.invoke('tabs:load'),
    save: (data: { tabs: any[]; activeTabId: string | null }): Promise<void> => ipcRenderer.invoke('tabs:save', data),
  },

  fs: {
    listDir: (dirPath: string): Promise<Array<{ name: string; path: string; type: 'file' | 'directory'; modifiedAt: string }>> =>
      ipcRenderer.invoke('fs:listDir', dirPath),
    delete: (targetPath: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('fs:delete', targetPath),
    createFile: (filePath: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('fs:createFile', filePath),
    createDir: (dirPath: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('fs:createDir', dirPath),
    openInExplorer: (targetPath: string): Promise<void> =>
      ipcRenderer.invoke('fs:openInExplorer', targetPath),
    rename: (oldPath: string, newName: string): Promise<{ success: boolean; newPath?: string; error?: string }> =>
      ipcRenderer.invoke('fs:rename', oldPath, newName),
  },

  backend: {
    getEndpoint: (): Promise<{ url: string; token: string }> =>
      ipcRenderer.invoke('backend:get-endpoint'),
    getStatus: (): Promise<{ running: boolean; url?: string; pid?: number; error?: string }> =>
      ipcRenderer.invoke('backend:get-status'),
  },

  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('shell:openExternal', url),

  getAppVersion: (): Promise<string> => ipcRenderer.invoke('app:getVersion'),

  on: (channel: string, callback: (...args: any[]) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, ...args: any[]) => callback(...args)
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
  },
}

export type IpcAPI = typeof api

contextBridge.exposeInMainWorld('api', api)
