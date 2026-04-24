/**
 * 插件类型定义（主进程使用）
 * 与 src/types/plugin.ts 保持同步
 */

/** 插件配置字段定义 */
export interface PluginConfigField {
  /** 配置键名，唯一标识 */
  key: string
  /** 表单标签 */
  label: string
  /** 描述/提示文本 */
  desc?: string
  /** 字段类型 */
  type: 'string' | 'number' | 'boolean' | 'select' | 'object'
  /** 默认值（统一为字符串存储） */
  value: string
  /** select 类型的选项列表 */
  options?: Array<{ label: string; value: string }>
  /** 输入占位文本 */
  placeholder?: string
  /** 是否必填 */
  required?: boolean
}

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
  type?: 'server' | 'client' | 'both'
  config?: PluginConfigField[]
  entries?: {
    main?: string
    server?: string
    client?: string
    workflow?: string
    tools?: string
    api?: string
    view?: string
  }
}

/** 插件运行时实例 */
export interface PluginInstance {
  id: string
  dir: string
  info: PluginInfo
  enabled: boolean
  module: any
  context: PluginContext
  storage: import('./plugin-storage').PluginStorage
  configStorage?: import('./plugin-storage').PluginConfigStorage
  /** 清理该插件注册的所有事件监听器 */
  cleanupEvents: () => void
}

/** 插件列表展示用的元信息 */
export interface PluginMeta {
  id: string
  name: string
  version: string
  description: string
  author: PluginInfo['author']
  tags: string[]
  hasView: boolean
  hasWorkflow?: boolean
  type?: PluginInfo['type']
  enabled: boolean
  config?: PluginConfigField[]
  iconPath: string
}

/** 网络请求选项 */
export interface FetchOptions {
  headers?: Record<string, string>
  encoding?: string
  timeout?: number
  userAgent?: string
  /** HTTP 代理地址，如 http://127.0.0.1:7890 */
  proxy?: string
}

/** 单个下载结果 */
export interface FetchBufferResult {
  buffer: Buffer
  size: number
  mimeType: string
}

/** 批量下载单项结果 */
export interface FetchBuffersItem {
  url: string
  buffer?: Buffer
  size?: number
  mimeType?: string
  success: boolean
  error?: string
}

/** POST 请求选项 */
export interface PostOptions extends FetchOptions {
  body?: any
}

/** 内置网络请求 API */
export interface FetchApi {
  fetchText(url: string, options?: FetchOptions): Promise<string>
  fetchJson<T = any>(url: string, options?: FetchOptions): Promise<T>
  fetchBuffer(url: string, options?: FetchOptions): Promise<FetchBufferResult>
  fetchBuffers(urls: string[], options?: FetchOptions): Promise<FetchBuffersItem[]>
  postJson<T = any>(url: string, options?: PostOptions): Promise<T>
}

/** 列举文件结果项 */
export interface ListFilesItem {
  name: string
  path: string
  type: 'file' | 'directory'
}

/** 文件信息结果 */
export interface FileStatResult {
  isFile: boolean
  isDirectory: boolean
  size: number
  createdAt: string
  modifiedAt: string
}

/** 内置文件系统 API */
export interface FsApi {
  writeFile(filePath: string, content: string, encoding?: string): Promise<void>
  readFile(filePath: string, encoding?: string): Promise<string>
  editFile(filePath: string, oldContent: string, newContent: string): Promise<{ replaced: boolean }>
  deleteFile(filePath: string): Promise<void>
  listFiles(dirPath: string, options?: { recursive?: boolean; pattern?: string }): Promise<ListFilesItem[]>
  createDir(dirPath: string, options?: { recursive?: boolean }): Promise<void>
  removeDir(dirPath: string, options?: { recursive?: boolean; force?: boolean }): Promise<void>
  stat(filePath: string): Promise<FileStatResult>
  exists(filePath: string): Promise<boolean>
  rename(oldPath: string, newPath: string): Promise<void>
  copyFile(src: string, dest: string): Promise<void>
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
  /** 向渲染进程发送消息（通过 mainWindow.webContents.send） */
  sendToRenderer(channel: string, ...args: any[]): void
  /** 内置网络请求能力 */
  fetch: FetchApi
  /** 内置文件系统能力 */
  fs: FsApi
  config: Record<string, string>
  api?: PluginApi
}

/** 插件工作流节点定义（workflow.js 导出） */
export interface PluginWorkflowNode {
  type: string
  label: string
  category: string
  icon?: string
  description: string
  properties?: Array<{
    key: string
    label: string
    type: 'text' | 'textarea' | 'number' | 'select' | 'checkbox' | 'code' | 'array' | 'conditions' | 'output_fields'
    required?: boolean
    default?: any
    options?: Array<{ label: string; value: string }>
    tooltip?: string
    placeholder?: string
    visibleWhen?: {
      key: string
      equals?: any
      in?: any[]
    }
    itemTemplate?: Record<string, any>
    fields?: Array<{
      key: string
      label: string
      type: string
      required?: boolean
      default?: any
      placeholder?: string
      options?: Array<{ label: string; value: string }>
      tooltip?: string
    }>
  }>
  handles?: {
    source?: boolean
    target?: boolean
    sourceHandles?: Array<{ id: string; label?: string }>
    dynamicSource?: { dataKey: string; extraCount?: number }
  }
  outputs?: Array<{
    key: string
    type: 'string' | 'number' | 'boolean' | 'object' | 'any'
    value?: string
    children?: any[]
  }>
  manualCreate?: boolean
  compound?: {
    rootRole?: string
    children: Array<{
      role: string
      type: string
      label?: string
      offset?: { x: number; y: number }
      hidden?: boolean
      scopeBoundary?: boolean
      parentRole?: string
      data?: Record<string, any>
    }>
    edges?: Array<{
      sourceRole: string
      targetRole: string
      sourceHandle?: string | null
      targetHandle?: string | null
      hidden?: boolean
      locked?: boolean
    }>
  }
  handler?: (ctx: PluginNodeContext, args: Record<string, any>) => Promise<PluginToolResult>
}

/** 节点 handler 日志接口 */
export interface NodeLogger {
  info(message: string): void
  warning(message: string): void
  error(message: string): void
}

/** 插件节点执行上下文 */
export interface PluginNodeContext {
  api: PluginApi
  nodeId: string
  nodeLabel: string
  upstream: Record<string, any>
  logger: NodeLogger
}

/** 插件 handler 返回结果 */
export interface PluginToolResult {
  success: boolean
  message?: string
  data?: any
}

/** 插件 API 能力（暴露给插件 handler 的主进程能力） */
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
  injectJS(windowId: number, code: string): Promise<any>
}

/** 插件工作流模块（workflow.js 导出） */
export interface PluginWorkflowModule {
  nodes: PluginWorkflowNode[]
}
