import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

/**
 * Electron Preload API — 仅保留平台能力。
 * 数据操作（chatHistory / aiProvider / agentSettings / tabs / fs CRUD）已迁移到 wsBridge。
 * Web 模式由 BrowserAPIAdapter 实现相同接口。
 */
const api = {
  // --- Agent 工具执行（interaction bridge 回调 Electron 主进程）---
  agent: {
    execTool: (toolType: string, params: Record<string, any>, targetTabId?: string): Promise<any> =>
      ipcRenderer.invoke('agent:execTool', toolType, params, targetTabId),
  },

  // --- 工作流文件对话框（原生文件选择器）---
  workflow: {
    importOpenFile: (): Promise<any> => ipcRenderer.invoke('workflow:importOpenFile'),
    exportSaveFile: (id: string): Promise<void> => ipcRenderer.invoke('workflow:exportSaveFile', id),
  },

  // --- 快捷键（Electron globalShortcut 注册）---
  shortcut: {
    list: (): Promise<{ groups: any[]; shortcuts: any[] }> => ipcRenderer.invoke('shortcut:list'),
    update: (id: string, accelerator: string, isGlobal: boolean, enabled?: boolean): Promise<any> =>
      ipcRenderer.invoke('shortcut:update', id, accelerator, isGlobal, enabled),
    toggle: (id: string, enabled: boolean): Promise<any> =>
      ipcRenderer.invoke('shortcut:toggle', id, enabled),
    clear: (id: string): Promise<any> => ipcRenderer.invoke('shortcut:clear', id),
    reset: (): Promise<any> => ipcRenderer.invoke('shortcut:reset'),
  },

  // --- 本地插件管理（Electron 文件系统 / 对话框 / shell）---
  plugin: {
    list: () => ipcRenderer.invoke('plugin:list'),
    listLocal: () => ipcRenderer.invoke('plugin:list-local'),
    enable: (id: string) => ipcRenderer.invoke('plugin:enable', id),
    enableLocal: (id: string) => ipcRenderer.invoke('plugin:enable-local', id),
    disable: (id: string) => ipcRenderer.invoke('plugin:disable', id),
    disableLocal: (id: string) => ipcRenderer.invoke('plugin:disable-local', id),
    getView: (id: string) => ipcRenderer.invoke('plugin:get-view', id),
    getWorkflowNodes: (pluginId: string) => ipcRenderer.invoke('plugin:get-workflow-nodes', pluginId),
    getAgentTools: (pluginIds: string[]) => ipcRenderer.invoke('plugin:get-agent-tools', pluginIds),
    getIcon: (id: string) => ipcRenderer.invoke('plugin:get-icon', id),
    importZip: () => ipcRenderer.invoke('plugin:import-zip'),
    openFolder: () => ipcRenderer.invoke('plugin:open-folder'),
    install: (url: string) => ipcRenderer.invoke('plugin:install', url),
    uninstall: (id: string) => ipcRenderer.invoke('plugin:uninstall', id),
  },

  // --- 窗口控制 ---
  window: {
    minimize: (): void => ipcRenderer.send('window:minimize'),
    maximize: (): void => ipcRenderer.send('window:maximize'),
    close: (): void => ipcRenderer.send('window:close'),
    isMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:isMaximized'),
  },

  // --- 文件系统：仅桌面端专属操作 ---
  fs: {
    openInExplorer: (targetPath: string): Promise<void> =>
      ipcRenderer.invoke('fs:openInExplorer', targetPath),
  },

  // --- 后端进程管理 ---
  backend: {
    getEndpoint: (): Promise<{ url: string; token: string }> =>
      ipcRenderer.invoke('backend:get-endpoint'),
    getStatus: (): Promise<{ running: boolean; url?: string; pid?: number; error?: string }> =>
      ipcRenderer.invoke('backend:get-status'),
  },

  // --- Shell / App ---
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('shell:openExternal', url),
  getAppVersion: (): Promise<string> => ipcRenderer.invoke('app:getVersion'),

  // --- 事件监听 ---
  on: (channel: string, callback: (...args: any[]) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, ...args: any[]) => callback(...args)
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
  },
}

export type IpcAPI = typeof api

contextBridge.exposeInMainWorld('api', api)
