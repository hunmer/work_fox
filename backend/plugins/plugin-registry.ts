import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Logger } from '../app/logger'
import type { BackendConfig } from '../app/config'
import type { PluginInfo, PluginMeta, AgentToolDefinition } from '../../shared/plugin-types'
import type { NodeTypeDefinition } from '../../shared/workflow-types'

interface LoadedPlugin {
  dir: string
  info: PluginInfo
  enabled: boolean
  workflowNodes: NodeTypeDefinition[]
  agentTools: AgentToolDefinition[]
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

    if (!this.config.pluginDir || !existsSync(this.config.pluginDir)) {
      this.logger.warn('Plugin directory not found', { pluginDir: this.config.pluginDir })
      return
    }

    const entries = readdirSync(this.config.pluginDir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const pluginDir = join(this.config.pluginDir, entry.name)
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

  list(): PluginMeta[] {
    return Array.from(this.plugins.values()).map((plugin) => this.toPluginMeta(plugin))
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

  private loadPlugin(pluginDir: string): void {
    const infoPath = join(pluginDir, 'info.json')
    if (!existsSync(infoPath)) return

    const raw = readFileSync(infoPath, 'utf-8')
    const info = JSON.parse(raw) as PluginInfo
    if (!info.id || !info.name || !info.version || !info.description || !info.author?.name) {
      throw new Error(`Invalid info.json in ${pluginDir}`)
    }

    const workflowNodes = this.loadWorkflowNodes(pluginDir)
    const agentTools = this.loadAgentTools(pluginDir)

    this.plugins.set(info.id, {
      dir: pluginDir,
      info,
      enabled: !this.disabledIds.has(info.id),
      workflowNodes,
      agentTools,
    })
  }

  private loadWorkflowNodes(pluginDir: string): NodeTypeDefinition[] {
    const workflowPath = join(pluginDir, 'workflow.js')
    if (!existsSync(workflowPath)) return []

    const workflowModule = require(workflowPath) as { nodes?: Array<Record<string, unknown>> }
    return (workflowModule.nodes || []).map((node) => {
      const { handler: _handler, ...serializable } = node
      return {
        properties: [],
        ...serializable,
      } as unknown as NodeTypeDefinition
    })
  }

  private loadAgentTools(pluginDir: string): AgentToolDefinition[] {
    const toolsPath = join(pluginDir, 'tools.js')
    if (!existsSync(toolsPath)) return []

    const toolsModule = require(toolsPath) as {
      tools?: Array<{
        name: string
        description: string
        input_schema?: Record<string, unknown>
      }>
    }

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
}
