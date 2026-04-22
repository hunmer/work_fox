import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import AdmZip from 'adm-zip'
import type { Logger } from '../app/logger'
import type { BackendConfig } from '../app/config'
import type { PluginInfo, PluginMeta, AgentToolDefinition } from '../../shared/plugin-types'
import type { NodeTypeDefinition } from '../../shared/workflow-types'
import {
  isMainProcessBridgePlugin,
  loadPluginToolsModule,
  loadPluginWorkflowModule,
} from '../../shared/plugin-capability-loader'
import { createBuiltinFetchApi } from './builtin-fetch-api'
import { createBuiltinFsApi } from './builtin-fs-api'

type WorkflowNodeHandler = (ctx: any, args: Record<string, any>) => Promise<any>

interface LoadedPlugin {
  dir: string
  info: PluginInfo
  enabled: boolean
  workflowNodes: NodeTypeDefinition[]
  agentTools: AgentToolDefinition[]
  workflowHandlers: Map<string, WorkflowNodeHandler>
}

export class BackendPluginRegistry {
  private plugins = new Map<string, LoadedPlugin>()
  private disabledIds = new Set<string>()

  constructor(
    private config: BackendConfig,
    private logger: Logger,
  ) {}

  loadAll(): void {
    this.plugins.clear()
    this.disabledIds = this.readDisabledIds()

    for (const baseDir of this.getPluginDirs()) {
      if (!existsSync(baseDir)) {
        if (baseDir === this.config.pluginDir || baseDir === resolve(this.config.userDataDir, 'plugins')) {
          mkdirSync(baseDir, { recursive: true })
        }
        continue
      }

      const entries = readdirSync(baseDir, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        const pluginDir = join(baseDir, entry.name)
        try {
          this.loadPlugin(pluginDir)
        } catch (error) {
          this.logger.warn('Failed to load backend plugin metadata', {
            pluginDir,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }
    }
  }

  list(): PluginMeta[] {
    return Array.from(this.plugins.values()).map((plugin) => this.toPluginMeta(plugin))
  }

  async installFromUrl(url: string): Promise<PluginMeta> {
    const pluginsDir = resolve(this.config.userDataDir, 'plugins')
    this.ensureDir(pluginsDir)

    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`下载失败: HTTP ${response.status}`)
    }

    const zipPath = join(tmpdir(), `workfox-plugin-${Date.now()}.zip`)
    writeFileSync(zipPath, Buffer.from(await response.arrayBuffer()))

    try {
      const zip = new AdmZip(zipPath)
      const entries = zip.getEntries()
      const infoEntry = entries.find((entry) => !entry.isDirectory && entry.entryName.endsWith('info.json'))
      if (!infoEntry) {
        throw new Error('ZIP 中未找到 info.json，不是有效的插件包')
      }

      const relativePath = infoEntry.entryName
      const topDir = relativePath.split('/')[0]
      const extractedDir = join(pluginsDir, relativePath.includes('/') ? topDir : `plugin-${Date.now()}`)
      if (existsSync(extractedDir)) {
        rmSync(extractedDir, { recursive: true, force: true })
      }
      zip.extractAllTo(extractedDir, true)

      const info = this.readPluginInfo(extractedDir)
      if (!info) {
        rmSync(extractedDir, { recursive: true, force: true })
        throw new Error('插件缺少有效的 info.json')
      }
      if (info.type === 'client') {
        rmSync(extractedDir, { recursive: true, force: true })
        throw new Error('当前运行时仅支持安装 server 类型插件')
      }

      const finalDir = join(pluginsDir, info.id)
      if (extractedDir !== finalDir) {
        if (existsSync(finalDir)) {
          rmSync(finalDir, { recursive: true, force: true })
        }
        renameSync(extractedDir, finalDir)
      }

      this.loadPlugin(finalDir)
      const plugin = this.plugins.get(info.id)
      if (!plugin) {
        throw new Error('插件加载失败')
      }
      return this.toPluginMeta(plugin)
    } finally {
      rmSync(zipPath, { force: true })
    }
  }

  uninstall(id: string): void {
    const plugin = this.plugins.get(id)
    if (!plugin) return

    if (plugin.dir.startsWith(resolve(this.config.userDataDir, 'plugins'))) {
      rmSync(plugin.dir, { recursive: true, force: true })
    }
    this.plugins.delete(id)
    this.disabledIds.delete(id)
    this.saveDisabledIds()
  }

  enable(id: string): void {
    const plugin = this.plugins.get(id)
    if (!plugin) return
    plugin.enabled = true
    this.disabledIds.delete(id)
    this.saveDisabledIds()
  }

  disable(id: string): void {
    const plugin = this.plugins.get(id)
    if (!plugin) return
    plugin.enabled = false
    this.disabledIds.add(id)
    this.saveDisabledIds()
  }

  getWorkflowNodes(pluginId: string): { pluginId: string; nodes: NodeTypeDefinition[] } {
    const plugin = this.plugins.get(pluginId)
    return {
      pluginId,
      nodes: plugin?.workflowNodes ?? [],
    }
  }

  listWorkflowPlugins(): Array<PluginMeta & { nodeCount: number }> {
    return Array.from(this.plugins.values())
      .filter((plugin) => plugin.workflowNodes.length > 0)
      .map((plugin) => ({
        ...this.toPluginMeta(plugin),
        nodeCount: plugin.workflowNodes.length,
      }))
  }

  getAgentTools(pluginIds: string[]): AgentToolDefinition[] {
    const result: AgentToolDefinition[] = []
    for (const pluginId of pluginIds) {
      const plugin = this.plugins.get(pluginId)
      if (!plugin?.agentTools.length) continue
      result.push(
        ...plugin.agentTools.map((tool) => ({
          ...tool,
          pluginId,
        })),
      )
    }
    return result
  }

  getConfig(pluginId: string): Record<string, string> {
    const plugin = this.plugins.get(pluginId)
    if (!plugin) return {}

    const configFields = plugin.info.config || []
    const userValues = this.readPluginConfig(pluginId)
    const merged: Record<string, string> = {}
    for (const field of configFields) {
      merged[field.key] = userValues[field.key] ?? field.value
    }
    return merged
  }

  saveConfig(pluginId: string, data: Record<string, string>): { success: boolean; error?: string } {
    const plugin = this.plugins.get(pluginId)
    if (!plugin) {
      return { success: false, error: '插件未找到' }
    }
    if (!plugin.info.config?.length) {
      return { success: false, error: '插件无配置定义' }
    }

    const filePath = this.getPluginConfigPath(pluginId)
    this.ensureDir(join(this.config.userDataDir, 'plugin-data', pluginId))
    writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
    return { success: true }
  }

  canExecuteNode(nodeType: string): boolean {
    return this.getPluginByNodeType(nodeType)?.workflowHandlers.has(nodeType) ?? false
  }

  requiresMainProcessBridge(nodeType: string): boolean {
    const plugin = this.getPluginByNodeType(nodeType)
    if (!plugin) return false
    return isMainProcessBridgePlugin(plugin.info)
  }

  async executeWorkflowNode(
    nodeType: string,
    args: Record<string, any>,
    hooks: {
      logger: {
        info(message: string): void
        warning(message: string): void
        error(message: string): void
      }
    },
  ): Promise<any> {
    const plugin = this.getPluginByNodeType(nodeType)
    if (!plugin || !plugin.enabled) {
      throw new Error(`插件节点未启用或不存在: ${nodeType}`)
    }

    const handler = plugin.workflowHandlers.get(nodeType)
    if (!handler) {
      throw new Error(`插件节点无可执行 handler: ${nodeType}`)
    }

    const api = this.createPluginApi(plugin)
    return handler(
      {
        api,
        nodeId: '',
        nodeLabel: nodeType,
        upstream: {},
        logger: hooks.logger,
      },
      args,
    )
  }

  private loadPlugin(pluginDir: string): void {
    const info = this.readPluginInfo(pluginDir)
    if (!info) return
    if (info.type === 'client') return

    const { nodes: workflowNodes, handlers: workflowHandlers } = this.loadWorkflowNodes(pluginDir, info)
    const agentTools = this.loadAgentTools(pluginDir, info)

    this.plugins.set(info.id, {
      dir: pluginDir,
      info,
      enabled: !this.disabledIds.has(info.id),
      workflowNodes,
      agentTools,
      workflowHandlers,
    })
  }

  private getPluginDirs(): string[] {
    const dirs = [
      this.config.pluginDir,
      resolve(this.config.userDataDir, 'plugins'),
      resolve(process.cwd(), 'resources/plugins'),
    ].filter((dir): dir is string => Boolean(dir))

    return Array.from(new Set(dirs))
  }

  private readPluginInfo(pluginDir: string): PluginInfo | null {
    const infoPath = join(pluginDir, 'info.json')
    if (!existsSync(infoPath)) return null

    const raw = readFileSync(infoPath, 'utf-8')
    const info = JSON.parse(raw) as PluginInfo
    if (!info.id || !info.name || !info.version || !info.description || !info.author?.name) {
      throw new Error(`Invalid info.json in ${pluginDir}`)
    }
    return info
  }

  private loadWorkflowNodes(pluginDir: string, info: PluginInfo): { nodes: NodeTypeDefinition[]; handlers: Map<string, WorkflowNodeHandler> } {
    const workflowModule = loadPluginWorkflowModule(pluginDir, info)
    if (!workflowModule) return { nodes: [], handlers: new Map() }
    const handlers = new Map<string, WorkflowNodeHandler>()
    const nodes = (workflowModule.nodes || []).map((node) => {
      const { handler: _handler, ...serializable } = node
      if (typeof _handler === 'function' && typeof serializable.type === 'string') {
        handlers.set(serializable.type, _handler as WorkflowNodeHandler)
      }
      return {
        properties: [],
        ...serializable,
      } as unknown as NodeTypeDefinition
    })
    return { nodes, handlers }
  }

  private loadAgentTools(pluginDir: string, info: PluginInfo): AgentToolDefinition[] {
    const toolsModule = loadPluginToolsModule(pluginDir, info)
    if (!toolsModule) return []
    return (toolsModule.tools || []).map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.input_schema,
    }))
  }

  private toPluginMeta(plugin: LoadedPlugin): PluginMeta {
    const iconPath = join(plugin.dir, 'icon.png')
    return {
      id: plugin.info.id,
      name: plugin.info.name,
      version: plugin.info.version,
      description: plugin.info.description,
      author: plugin.info.author,
      tags: plugin.info.tags || [],
      hasView: plugin.info.hasView || false,
      hasWorkflow: plugin.workflowNodes.length > 0 || plugin.info.hasWorkflow || false,
      type: plugin.info.type,
      enabled: plugin.enabled,
      config: plugin.info.config,
      iconPath: existsSync(iconPath) ? iconPath : undefined,
    }
  }

  private readDisabledIds(): Set<string> {
    const filePath = join(this.config.userDataDir, 'plugin-data', 'disabled.json')
    try {
      if (!existsSync(filePath)) return new Set()
      const ids = JSON.parse(readFileSync(filePath, 'utf-8')) as string[]
      return new Set(ids)
    } catch {
      return new Set()
    }
  }

  private saveDisabledIds(): void {
    const dir = join(this.config.userDataDir, 'plugin-data')
    this.ensureDir(dir)
    writeFileSync(join(dir, 'disabled.json'), JSON.stringify([...this.disabledIds], null, 2), 'utf-8')
  }

  private readPluginConfig(pluginId: string): Record<string, string> {
    const filePath = this.getPluginConfigPath(pluginId)
    try {
      if (!existsSync(filePath)) return {}
      return JSON.parse(readFileSync(filePath, 'utf-8')) as Record<string, string>
    } catch {
      return {}
    }
  }

  private getPluginConfigPath(pluginId: string): string {
    return join(this.config.userDataDir, 'plugin-data', pluginId, 'data.json')
  }

  private ensureDir(dir: string): void {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  }

  private getPluginByNodeType(nodeType: string): LoadedPlugin | undefined {
    for (const plugin of this.plugins.values()) {
      if (plugin.workflowHandlers.has(nodeType)) return plugin
    }
    return undefined
  }

  private createPluginApi(plugin: LoadedPlugin): Record<string, any> {
    const fetchApi = createBuiltinFetchApi()
    const fsApi = createBuiltinFsApi()

    // Window-manager and other Electron-local APIs stay unsupported until interaction/main-process bridge lands.
    if (plugin.dir.includes('window-manager')) {
      return {
        ...fetchApi,
        ...fsApi,
        createWindow() {
          throw new Error('该插件节点依赖 Electron 本地窗口能力，当前 backend 版本尚未支持')
        },
        closeWindow() {
          throw new Error('该插件节点依赖 Electron 本地窗口能力，当前 backend 版本尚未支持')
        },
        navigateWindow() {
          throw new Error('该插件节点依赖 Electron 本地窗口能力，当前 backend 版本尚未支持')
        },
        focusWindow() {
          throw new Error('该插件节点依赖 Electron 本地窗口能力，当前 backend 版本尚未支持')
        },
        screenshotWindow() {
          throw new Error('该插件节点依赖 Electron 本地窗口能力，当前 backend 版本尚未支持')
        },
        getWindowDetail() {
          throw new Error('该插件节点依赖 Electron 本地窗口能力，当前 backend 版本尚未支持')
        },
        listWindows() {
          throw new Error('该插件节点依赖 Electron 本地窗口能力，当前 backend 版本尚未支持')
        },
        injectJS() {
          throw new Error('该插件节点依赖 Electron 本地窗口能力，当前 backend 版本尚未支持')
        },
      }
    }

    return {
      ...fetchApi,
      ...fsApi,
    }
  }
}
