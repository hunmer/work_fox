import Store from 'electron-store'

// ===== Workflow 类型（workflow-store.ts 消费）=====
export interface WorkflowFolder {
  id: string
  name: string
  parentId?: string | null
  order: number
  createdAt: number
}

export interface WorkflowNode {
  id: string
  type: string
  label: string
  position: { x: number; y: number }
  data: Record<string, any>
  nodeState?: 'normal' | 'disabled' | 'skipped'
  nodeColor?: string
}

export interface WorkflowEdge {
  id: string
  source: string
  target: string
}

export interface Workflow {
  id: string
  name: string
  folderId?: string | null
  description?: string
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  createdAt: number
  updatedAt: number
  enabledPlugins?: string[]
  agentConfig?: WorkflowAgentConfig
  pluginConfigSchemes?: Record<string, string>
}

export interface AgentResourceItem {
  id: string
  name: string
  enabled: boolean
  description?: string
  command?: string
  source?: string
}

export interface WorkflowAgentConfig {
  workspaceDir: string
  dataDir: string
  skills: AgentResourceItem[]
  mcps: AgentResourceItem[]
}

// ===== Shortcut 类型 =====
export interface ShortcutBinding {
  id: string
  accelerator: string
  global: boolean
  enabled: boolean
}

// ===== Store 实例 =====
interface StoreSchema {
  shortcutBindings: ShortcutBinding[]
  windowMaximized: boolean
}

const store = new Store<StoreSchema>({
  defaults: {
    shortcutBindings: [],
    windowMaximized: false,
  }
})

// ===== Shortcut Bindings =====
export function getShortcutBindings(): ShortcutBinding[] {
  return store.get('shortcutBindings', [])
}

export function setShortcutBindings(bindings: ShortcutBinding[]): void {
  store.set('shortcutBindings', bindings)
}

// ===== Window State =====
export function getWindowMaximized(): boolean {
  return store.get('windowMaximized', false)
}

export function setWindowMaximized(maximized: boolean): void {
  store.set('windowMaximized', maximized)
}
