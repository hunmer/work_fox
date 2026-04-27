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
export type NodeBreakpoint = 'start' | 'end'

export interface ConditionItem {
  id: string
  variable: string
  operator: string
  value: string
}

export interface WorkflowNodeCompositeMeta {
  rootId?: string
  parentId?: string | null
  role?: string
  generated?: boolean
  hidden?: boolean
  scopeBoundary?: boolean
}

export interface WorkflowNode {
  id: string
  type: string
  label: string
  position: { x: number; y: number }
  data: Record<string, unknown>
  nodeState?: NodeRunState
  breakpoint?: NodeBreakpoint
  nodeColor?: string
  composite?: WorkflowNodeCompositeMeta
}

export interface WorkflowEdgeCompositeMeta {
  rootId?: string
  parentId?: string | null
  generated?: boolean
  hidden?: boolean
  locked?: boolean
}

export interface WorkflowEdge {
  id: string
  source: string
  target: string
  sourceHandle?: string | null
  targetHandle?: string | null
  composite?: WorkflowEdgeCompositeMeta
}

export interface EmbeddedWorkflow {
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
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

export interface WorkflowGroup {
  id: string
  name: string
  childNodeIds: string[]                         // 直接子节点 ID（不含嵌套子分组的子节点）
  childGroupIds: string[]                        // 直接子分组 ID（嵌套）
  locked: boolean                                // 固定状态
  disabled: boolean                              // 分组级禁用开关
  savedNodeStates: Record<string, NodeRunState>  // 禁用前记忆每个节点的状态
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
  layoutSnapshot?: Record<string, unknown>  // golden-layout 布局快照
  groups?: WorkflowGroup[]                   // 所有分组，可选字段保持向后兼容
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

export interface NodePropertyVisibleWhen {
  key: string
  equals?: unknown
  in?: unknown[]
}

export interface NodeProperty {
  key: string
  label: string
  type: 'text' | 'textarea' | 'number' | 'select' | 'checkbox' | 'code' | 'conditions' | 'array' | 'output_fields'
  required?: boolean
  readonly?: boolean
  default?: unknown
  options?: { label: string; value: string }[]
  tooltip?: string
  fields?: ArrayFieldItem[]
  itemTemplate?: Record<string, unknown>
  visibleWhen?: NodePropertyVisibleWhen
}

export interface NodeNamedHandleConfig {
  id: string
  label?: string
}

export interface CompoundChildNodeDefinition {
  role: string
  type: string
  label?: string
  offset?: { x: number; y: number }
  hidden?: boolean
  scopeBoundary?: boolean
  parentRole?: string
  data?: Record<string, unknown>
}

export interface CompoundEdgeDefinition {
  sourceRole: string
  targetRole: string
  sourceHandle?: string | null
  targetHandle?: string | null
  hidden?: boolean
  locked?: boolean
}

export interface CompoundNodeDefinition {
  rootRole?: string
  children: CompoundChildNodeDefinition[]
  edges?: CompoundEdgeDefinition[]
}

export interface NodeHandleConfig {
  source?: boolean
  target?: boolean
  sourceHandles?: NodeNamedHandleConfig[]
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
  allowInputFields?: boolean
  outputs?: OutputField[]
  customView?: unknown
  customViewMinSize?: { width?: number; height?: number }
  manualCreate?: boolean
  debuggable?: boolean
  compound?: CompoundNodeDefinition
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
