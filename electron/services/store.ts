import Store from 'electron-store'
import { randomUUID } from 'crypto'

// ===== AI Provider 类型 =====
export interface AIModel {
  id: string
  name: string
  maxTokens?: number
  supportsVision?: boolean
  supportsThinking?: boolean
}

export interface AIProvider {
  id: string
  name: string
  apiBase: string
  apiKey: string
  models: AIModel[]
  enabled?: boolean
}

// ===== Workflow 类型 =====
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
}

// ===== Shortcut 类型 =====
export interface ShortcutBinding {
  id: string
  accelerator: string
  global: boolean
  enabled: boolean
}

// ===== App Tab 类型 =====
export interface AppTab {
  id: string
  workflowId: string | null
  name: string
}

// ===== Store 实例 =====
interface StoreSchema {
  aiProviders: AIProvider[]
  shortcutBindings: ShortcutBinding[]
  appTabs: { tabs: AppTab[]; activeTabId: string | null }
  windowMaximized: boolean
}

const store = new Store<StoreSchema>({
  defaults: {
    aiProviders: [],
    shortcutBindings: [],
    appTabs: { tabs: [], activeTabId: null },
    windowMaximized: false,
  }
})

// ===== AI Provider CRUD =====
export function listAIProviders(): AIProvider[] {
  return store.get('aiProviders', [])
}

export function getAIProvider(id: string): AIProvider | undefined {
  return listAIProviders().find(p => p.id === id)
}

export function createAIProvider(data: Omit<AIProvider, 'id'>): AIProvider {
  const providers = listAIProviders()
  const provider: AIProvider = { ...data, id: randomUUID() }
  providers.push(provider)
  store.set('aiProviders', providers)
  return provider
}

export function updateAIProvider(id: string, data: Partial<Omit<AIProvider, 'id'>>): void {
  const providers = listAIProviders()
  const idx = providers.findIndex(p => p.id === id)
  if (idx >= 0) {
    providers[idx] = { ...providers[idx], ...data }
    store.set('aiProviders', providers)
  }
}

export function deleteAIProvider(id: string): void {
  const providers = listAIProviders().filter(p => p.id !== id)
  store.set('aiProviders', providers)
}

// ===== Shortcut Bindings =====
export function getShortcutBindings(): ShortcutBinding[] {
  return store.get('shortcutBindings', [])
}

export function setShortcutBindings(bindings: ShortcutBinding[]): void {
  store.set('shortcutBindings', bindings)
}

// ===== App Tabs =====
export function getAppTabs(): { tabs: AppTab[]; activeTabId: string | null } {
  return store.get('appTabs', { tabs: [], activeTabId: null })
}

export function setAppTabs(data: { tabs: AppTab[]; activeTabId: string | null }): void {
  store.set('appTabs', data)
}

// ===== Window State =====
export function getWindowMaximized(): boolean {
  return store.get('windowMaximized', false)
}

export function setWindowMaximized(maximized: boolean): void {
  store.set('windowMaximized', maximized)
}
