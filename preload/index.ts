import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

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
    list: (folderId?: string | null): Promise<any[]> => ipcRenderer.invoke('workflow:list', folderId),
    get: (id: string): Promise<any> => ipcRenderer.invoke('workflow:get', id),
    create: (data: any): Promise<any> => ipcRenderer.invoke('workflow:create', data),
    update: (id: string, data: any): Promise<void> => ipcRenderer.invoke('workflow:update', id, data),
    delete: (id: string): Promise<void> => ipcRenderer.invoke('workflow:delete', id),
    importOpenFile: (): Promise<any> => ipcRenderer.invoke('workflow:importOpenFile'),
    exportSaveFile: (id: string): Promise<void> => ipcRenderer.invoke('workflow:exportSaveFile', id),
  },

  workflowFolder: {
    list: (): Promise<any[]> => ipcRenderer.invoke('workflowFolder:list'),
    create: (data: any): Promise<any> => ipcRenderer.invoke('workflowFolder:create', data),
    update: (id: string, data: any): Promise<void> => ipcRenderer.invoke('workflowFolder:update', id, data),
    delete: (id: string): Promise<void> => ipcRenderer.invoke('workflowFolder:delete', id),
  },

  workflowVersion: {
    list: (workflowId: string): Promise<any[]> => ipcRenderer.invoke('workflowVersion:list', workflowId),
    add: (workflowId: string, name: string, nodes: any[], edges: any[]): Promise<any> => ipcRenderer.invoke('workflowVersion:add', workflowId, name, nodes, edges),
    get: (id: string): Promise<any> => ipcRenderer.invoke('workflowVersion:get', id),
    delete: (id: string): Promise<void> => ipcRenderer.invoke('workflowVersion:delete', id),
    clear: (workflowId: string): Promise<void> => ipcRenderer.invoke('workflowVersion:clear', workflowId),
    nextName: (workflowId: string): Promise<string> => ipcRenderer.invoke('workflowVersion:nextName', workflowId),
  },

  executionLog: {
    list: (workflowId: string): Promise<any[]> => ipcRenderer.invoke('executionLog:list', workflowId),
    save: (log: any): Promise<any> => ipcRenderer.invoke('executionLog:save', log),
    delete: (id: string): Promise<void> => ipcRenderer.invoke('executionLog:delete', id),
    clear: (workflowId: string): Promise<void> => ipcRenderer.invoke('executionLog:clear', workflowId),
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
    enable: (id: string) => ipcRenderer.invoke('plugin:enable', id),
    disable: (id: string) => ipcRenderer.invoke('plugin:disable', id),
    getView: (id: string) => ipcRenderer.invoke('plugin:get-view', id),
    getIcon: (id: string) => ipcRenderer.invoke('plugin:get-icon', id),
    importZip: () => ipcRenderer.invoke('plugin:import-zip'),
    openFolder: () => ipcRenderer.invoke('plugin:open-folder'),
    install: (url: string) => ipcRenderer.invoke('plugin:install', url),
    uninstall: (id: string) => ipcRenderer.invoke('plugin:uninstall', id),
    getWorkflowNodes: (pluginId: string) => ipcRenderer.invoke('plugin:get-workflow-nodes', pluginId),
    listWorkflowPlugins: () => ipcRenderer.invoke('plugin:list-workflow-plugins'),
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
