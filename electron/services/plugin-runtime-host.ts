import { join } from 'path'
import { existsSync } from 'node:fs'
import { BrowserWindow, app } from 'electron'
import { pluginEventBus } from './plugin-event-bus'
import { PluginStorage, PluginConfigStorage } from './plugin-storage'
import { createPluginContext } from './plugin-context'
import type { PluginInfo, PluginInstance } from './plugin-types'
import { workflowNodeRegistry, type AgentToolDefinition } from './workflow-node-registry'
import { windowManager } from './window-manager'
import {
  loadPluginApiModule,
  loadPluginToolsModule,
  loadPluginWorkflowModule,
} from '../../shared/plugin-capability-loader'
import { resolvePluginEntryFile } from '../../shared/plugin-entry'
import type { PluginManifestRecord } from './plugin-catalog'

export class PluginRuntimeHost {
  private plugins: Map<string, PluginInstance> = new Map()
  private mainWindow: BrowserWindow | null = null
  private readonly userDataPath: string

  constructor() {
    this.userDataPath = app.getPath('userData')
  }

  setMainWindow(win: BrowserWindow): void {
    this.mainWindow = win
  }

  load(manifest: PluginManifestRecord): PluginInstance | null {
    const { dir, info, enabled } = manifest
    const mainPath = join(dir, resolvePluginEntryFile(info, 'main'))
    if (!existsSync(mainPath)) return null

    const storage = new PluginStorage(info.id, this.userDataPath)
    const configStorage = info.config?.length ? new PluginConfigStorage(info.id, this.userDataPath) : undefined
    const { context, cleanupEvents } = createPluginContext(info, storage, pluginEventBus, () => this.mainWindow, !!info.hasWorkflow, configStorage)
    const pluginModule = require(mainPath)

    const instance: PluginInstance = {
      id: info.id,
      dir,
      info,
      enabled,
      module: pluginModule,
      context,
      storage,
      configStorage,
      cleanupEvents,
    }

    this.registerWorkflowCapabilities(instance)
    this.plugins.set(info.id, instance)

    if (enabled && typeof pluginModule.activate === 'function') {
      try {
        pluginModule.activate(context)
        console.log(`[PluginRuntimeHost] 插件已激活: ${info.name} v${info.version}`)
      } catch (err) {
        console.error(`[PluginRuntimeHost] 插件激活失败: ${info.name}`, err)
      }
    }

    return instance
  }

  unload(pluginId: string): void {
    const instance = this.plugins.get(pluginId)
    if (!instance) return
    if (instance.enabled && typeof instance.module.deactivate === 'function') {
      try {
        instance.module.deactivate(instance.context)
      } catch (err) {
        console.error(`[PluginRuntimeHost] 插件停用失败: ${instance.info.name}`, err)
      }
    }
    if (instance.info.hasWorkflow) {
      workflowNodeRegistry.unregister(pluginId)
    }
    instance.cleanupEvents()
    this.plugins.delete(pluginId)
  }

  enable(pluginId: string): void {
    const instance = this.plugins.get(pluginId)
    if (!instance || instance.enabled) return
    if (typeof instance.module.activate === 'function') {
      try {
        instance.module.activate(instance.context)
      } catch (err) {
        console.error(`[PluginRuntimeHost] 插件激活失败: ${instance.info.name}`, err)
        return
      }
    }
    instance.enabled = true
  }

  disable(pluginId: string): void {
    const instance = this.plugins.get(pluginId)
    if (!instance || !instance.enabled) return
    if (typeof instance.module.deactivate === 'function') {
      try {
        instance.module.deactivate(instance.context)
      } catch (err) {
        console.error(`[PluginRuntimeHost] 插件停用失败: ${instance.info.name}`, err)
      }
    }
    instance.cleanupEvents()
    instance.enabled = false
  }

  getPlugin(pluginId: string): PluginInstance | undefined {
    return this.plugins.get(pluginId)
  }

  shutdown(): void {
    for (const [id] of this.plugins) {
      this.unload(id)
    }
  }

  private registerWorkflowCapabilities(instance: PluginInstance): void {
    const { dir, info, context } = instance
    if (!info.hasWorkflow) return

    const workflowModule = loadPluginWorkflowModule(dir, info)
    if (workflowModule?.nodes) {
      try {
        workflowNodeRegistry.register(info.id, { nodes: workflowModule.nodes })
      } catch (err) {
        console.error(`[PluginRuntimeHost] 插件 ${info.name} 的 workflow.js 加载失败:`, err)
      }
    }

    const apiModule = loadPluginApiModule(dir, info)
    if (apiModule) {
      try {
        if (typeof apiModule?.createApi === 'function') {
          const api = apiModule.createApi({ windowManager })
          workflowNodeRegistry.registerApi(info.id, api)
        }
      } catch (err) {
        console.error(`[PluginRuntimeHost] 插件 ${info.name} 的 api.js 加载失败:`, err)
      }
    } else {
      workflowNodeRegistry.registerApi(info.id, { ...context.fetch, ...context.fs } as any)
    }

    const toolsModule = loadPluginToolsModule(dir, info)
    if (toolsModule) {
      try {
        if (toolsModule?.tools && typeof toolsModule.handler === 'function') {
          workflowNodeRegistry.registerAgentTools(info.id, {
            tools: toolsModule.tools as AgentToolDefinition[],
            handler: toolsModule.handler as (name: string, args: Record<string, any>, api: Record<string, any>) => Promise<any>,
          })
        }
      } catch (err) {
        console.error(`[PluginRuntimeHost] 插件 ${info.name} 的 tools.js 加载失败:`, err)
      }
    }
  }
}
