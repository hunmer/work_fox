export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }
export type JsonObject = Record<string, JsonValue>

export interface WorkflowFolder {
  id: string
  name: string
  parentId: string | null
  order: number
  createdAt: number
}

export type NodeRunState = 'normal' | 'disabled' | 'skipped'

export interface ConditionItem {
  id: string
  variable: string
  operator: string
  value: string
}

export interface WorkflowNode {
  id: string
  type: string
  label: string
  position: { x: number; y: number }
  data: Record<string, unknown>
  nodeState?: NodeRunState
}

export interface WorkflowEdge {
  id: string
  source: string
  target: string
  sourceHandle?: string | null
  targetHandle?: string | null
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

export interface Workflow {
  id: string
  name: string
  folderId: string | null
  description?: string
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  createdAt: number
  updatedAt: number
  enabledPlugins?: string[]
  agentConfig?: WorkflowAgentConfig
  pluginConfigSchemes?: Record<string, string>
}

export interface OutputField {
  key: string
  type: 'string' | 'number' | 'boolean' | 'object' | 'any'
  value?: string
  children?: OutputField[]
}

export interface ArrayFieldItem {
  key: string
  label: string
  type: 'text' | 'number' | 'select' | 'checkbox'
  required?: boolean
  default?: unknown
  options?: { label: string; value: string }[]
  placeholder?: string
}

export interface NodeProperty {
  key: string
  label: string
  type: 'text' | 'textarea' | 'number' | 'select' | 'checkbox' | 'code' | 'conditions' | 'array'
  required?: boolean
  readonly?: boolean
  default?: unknown
  options?: { label: string; value: string }[]
  tooltip?: string
  fields?: ArrayFieldItem[]
  itemTemplate?: Record<string, unknown>
}

export interface NodeHandleConfig {
  source?: boolean
  target?: boolean
  dynamicSource?: {
    dataKey: string
    extraCount?: number
  }
}

export interface NodeTypeDefinition {
  type: string
  label: string
  category: string
  icon: string
  description: string
  properties: NodeProperty[]
  handles?: NodeHandleConfig
  outputs?: OutputField[]
  customView?: unknown
  customViewMinSize?: { width?: number; height?: number }
}

export interface ExecutionLogEntry {
  level: 'info' | 'warning' | 'error'
  message: string
  timestamp: number
}

export interface ExecutionStep {
  nodeId: string
  nodeLabel: string
  startedAt: number
  finishedAt?: number
  status: 'running' | 'completed' | 'error' | 'skipped'
  input?: unknown
  output?: unknown
  error?: string
  logs?: ExecutionLogEntry[]
}

export interface ExecutionLog {
  id: string
  workflowId: string
  startedAt: number
  finishedAt?: number
  status: 'running' | 'completed' | 'paused' | 'error'
  steps: ExecutionStep[]
  snapshot?: {
    nodes: WorkflowNode[]
    edges: WorkflowEdge[]
  }
}

export interface WorkflowVersion {
  id: string
  workflowId: string
  name: string
  snapshot: {
    nodes: WorkflowNode[]
    edges: WorkflowEdge[]
  }
  createdAt: number
}

export type EngineStatus = 'idle' | 'running' | 'paused' | 'completed' | 'error'

export interface OperationEntry {
  description: string
  timestamp: number
  snapshot?: string
}
