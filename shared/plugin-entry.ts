import type { PluginInfo } from './plugin-types'

export type PluginEntryKind = 'main' | 'server' | 'client' | 'workflow' | 'tools' | 'api' | 'view'

const DEFAULT_PLUGIN_ENTRY_FILES: Record<PluginEntryKind, string> = {
  main: 'main.js',
  server: 'main.js',
  client: 'main.js',
  workflow: 'workflow.js',
  tools: 'tools.js',
  api: 'api.js',
  view: 'view.js',
}

export function resolvePluginEntryFile(info: PluginInfo, kind: PluginEntryKind): string {
  const entry = info.entries?.[kind]
  if (typeof entry === 'string' && entry.trim()) return entry.trim()
  return DEFAULT_PLUGIN_ENTRY_FILES[kind]
}
