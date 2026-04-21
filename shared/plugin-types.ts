import type { NodeTypeDefinition } from './workflow-types'

export type PluginRuntimeType = 'server' | 'client' | 'both'

export interface PluginConfigField {
  key: string
  label: string
  desc?: string
  type: 'string' | 'number' | 'boolean' | 'select' | 'object'
  value: string
  options?: Array<{ label: string; value: string }>
  placeholder?: string
  required?: boolean
}

export interface PluginAuthor {
  name: string
  email?: string
  url?: string
}

export interface PluginInfo {
  id: string
  name: string
  version: string
  description: string
  author: PluginAuthor
  tags?: string[]
  minAppVersion?: string
  hasView?: boolean
  hasWorkflow?: boolean
  type?: PluginRuntimeType
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

export interface PluginMeta {
  id: string
  name: string
  version: string
  description: string
  author: PluginAuthor
  tags: string[]
  hasView: boolean
  hasWorkflow?: boolean
  type?: PluginRuntimeType
  enabled: boolean
  config?: PluginConfigField[]
  iconPath?: string
}

export interface AgentToolDefinition {
  name: string
  description: string
  inputSchema?: Record<string, unknown>
  pluginId?: string
}

export interface PluginWorkflowNodesResult {
  pluginId: string
  nodes: NodeTypeDefinition[]
}

export interface PluginConfigSaveResult {
  success: boolean
  error?: string
}
