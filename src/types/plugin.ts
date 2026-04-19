/** 插件元信息（info.json 内容） */
export interface PluginInfo {
  id: string
  name: string
  version: string
  description: string
  author: {
    name: string
    email?: string
    url?: string
  }
  tags?: string[]
  minAppVersion?: string
  hasView?: boolean
  hasWorkflow?: boolean
}

/** 插件展示信息（传递给渲染进程） */
export interface PluginMeta {
  id: string
  name: string
  version: string
  description: string
  author: { name: string; email?: string; url?: string }
  tags: string[]
  hasView: boolean
  enabled: boolean
  iconPath: string
}

/** 在线插件商店条目 */
export interface RemotePlugin {
  id: string
  name: string
  version: string
  description: string
  author: { name: string; email?: string; url?: string }
  tags: string[]
  hasView: boolean
  downloadUrl: string
  iconUrl?: string
}

/** 插件运行时实例 */
export interface PluginInstance {
  id: string
  dir: string
  info: PluginInfo
  enabled: boolean
  module: any
  context: PluginContext
  storage: any
}

/** 插件上下文 API */
export interface PluginContext {
  events: {
    on(event: string, handler: (...args: any[]) => void): void
    once(event: string, handler: (...args: any[]) => void): void
    off(event: string, handler: (...args: any[]) => void): void
    emit(event: string, ...args: any[]): void
  }
  storage: {
    get(key: string): Promise<any>
    set(key: string, value: any): Promise<void>
    delete(key: string): Promise<void>
    clear(): Promise<void>
    keys(): Promise<string[]>
  }
  plugin: PluginInfo
  logger: {
    info(msg: string, ...args: any[]): void
    warn(msg: string, ...args: any[]): void
    error(msg: string, ...args: any[]): void
  }
}

/** 插件工作流节点定义（渲染进程使用，不含 handler） */
export interface PluginWorkflowNode {
  type: string
  label: string
  category: string
  icon?: string
  description: string
  properties?: Array<{
    key: string
    label: string
    type: 'text' | 'textarea' | 'number' | 'select' | 'checkbox' | 'code'
    required?: boolean
    default?: any
    options?: Array<{ label: string; value: string }>
    tooltip?: string
  }>
  handles?: {
    source?: boolean
    target?: boolean
    dynamicSource?: { dataKey: string; extraCount?: number }
  }
}

/** 插件 API 能力（渲染进程类型声明） */
export interface PluginApi {
  createWindow(opts: {
    url: string
    title?: string
    width?: number
    height?: number
  }): Promise<{ id: number; webContentsId: number }>
  closeWindow(windowId: number): Promise<void>
  navigateWindow(windowId: number, url: string): Promise<void>
  focusWindow(windowId: number): Promise<void>
  screenshotWindow(windowId: number): Promise<string>
  getWindowDetail(windowId: number): Promise<Record<string, any>>
  listWindows(): Promise<Array<Record<string, any>>>
}
