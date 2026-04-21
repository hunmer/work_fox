import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { PluginInfo } from './plugin-types'
import { resolvePluginEntryFile } from './plugin-entry'

export interface PluginWorkflowModule {
  nodes?: Array<Record<string, unknown>>
}

export interface PluginToolsModule {
  tools?: Array<{
    name: string
    description: string
    input_schema?: Record<string, unknown>
  }>
  handler?: unknown
}

export interface PluginApiModule {
  createApi?: (deps: unknown) => Record<string, unknown>
}

export function isMainProcessBridgePlugin(info: PluginInfo): boolean {
  return info.type === 'client' || info.type === 'both'
}

export function loadPluginWorkflowModule(pluginDir: string, info: PluginInfo): PluginWorkflowModule | null {
  return loadPluginEntryModule<PluginWorkflowModule>(pluginDir, info, 'workflow')
}

export function loadPluginToolsModule(pluginDir: string, info: PluginInfo): PluginToolsModule | null {
  return loadPluginEntryModule<PluginToolsModule>(pluginDir, info, 'tools')
}

export function loadPluginApiModule(pluginDir: string, info: PluginInfo): PluginApiModule | null {
  return loadPluginEntryModule<PluginApiModule>(pluginDir, info, 'api')
}

function loadPluginEntryModule<T>(pluginDir: string, info: PluginInfo, kind: 'workflow' | 'tools' | 'api'): T | null {
  const entryPath = join(pluginDir, resolvePluginEntryFile(info, kind))
  if (!existsSync(entryPath)) return null
  return require(entryPath) as T
}
