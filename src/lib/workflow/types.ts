// src/lib/workflow/types.ts

/** 工作流文件夹（树形结构） */
export interface WorkflowFolder {
  id: string
  name: string
  parentId: string | null // null = 根级
  order: number
  createdAt: number
}

/** 节点运行状态 */
export type NodeRunState = 'normal' | 'disabled' | 'skipped'
export type NodeBreakpoint = 'start' | 'end'

/** 选择器条件项 */
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

/** 工作流节点 */
export interface WorkflowNode {
  id: string
  type: string // 节点类型标识
  label: string // 用户可编辑的节点名称
  position: { x: number; y: number }
  data: Record<string, any> // 节点参数
  nodeState?: NodeRunState // 节点运行状态，默认 'normal'
  breakpoint?: NodeBreakpoint
  composite?: WorkflowNodeCompositeMeta
}

export interface WorkflowEdgeCompositeMeta {
  rootId?: string
  parentId?: string | null
  generated?: boolean
  hidden?: boolean
  locked?: boolean
}

/** 工作流连线 */
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

/** 节点分组 */
export interface WorkflowGroup {
  id: string
  name: string
  childNodeIds: string[]                         // 直接子节点 ID（不含嵌套子分组的子节点）
  childGroupIds: string[]                        // 直接子分组 ID（嵌套）
  x?: number                                     // 分组边界左上角 X
  y?: number                                     // 分组边界左上角 Y
  width?: number                                 // 手动调整后的宽度
  height?: number                                // 手动调整后的高度
  color?: string                                 // 分组背景色（hex/rgb 等 CSS 色值）
  locked: boolean                                // 固定状态
  disabled: boolean                              // 分组级禁用开关
  savedNodeStates: Record<string, NodeRunState>  // 禁用前记忆每个节点的状态
}

/** 工作流 */
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

/** 节点输出字段定义（支持嵌套） */
export interface OutputField {
  key: string
  type: 'string' | 'number' | 'boolean' | 'object' | 'any'
  value?: string
  children?: OutputField[]
}

/** 数组项子字段定义 */
export interface ArrayFieldItem {
  key: string
  label: string
  type: 'text' | 'number' | 'select' | 'checkbox' | 'output_fields'
  required?: boolean
  default?: any
  options?: { label: string; value: string }[]
  placeholder?: string
}

export interface NodePropertyVisibleWhen {
  key: string
  equals?: unknown
  in?: unknown[]
}

/** 节点属性表单字段定义 */
export interface NodeProperty {
  key: string
  label: string
  type: 'text' | 'textarea' | 'number' | 'select' | 'checkbox' | 'code' | 'conditions' | 'array' | 'output_fields'
  required?: boolean
  readonly?: boolean
  default?: any
  options?: { label: string; value: string }[]
  tooltip?: string
  /** array 类型的子字段定义 */
  fields?: ArrayFieldItem[]
  /** 新增项的默认值模板 */
  itemTemplate?: Record<string, any>
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

/** 节点连接点配置 */
export interface NodeHandleConfig {
  source?: boolean // 是否显示输出连接点，默认 true
  target?: boolean // 是否显示输入连接点，默认 true
  sourceHandles?: NodeNamedHandleConfig[]
  /** 动态源连接点配置，设置后忽略 source */
  dynamicSource?: {
    dataKey: string // node data 中条件数组的 key
    extraCount?: number // 额外输出数量（如 else = 1）
  }
}

/** 节点注册表项 */
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
  /** 自定义节点内容视图组件 */
  customView?: any
  /** 自定义视图所需的最小节点尺寸 */
  customViewMinSize?: { width?: number; height?: number }
  manualCreate?: boolean
  compound?: CompoundNodeDefinition
}

/** 执行日志条目 */
export interface ExecutionLogEntry {
  level: 'info' | 'warning' | 'error'
  message: string
  timestamp: number
}

/** 执行步骤记录 */
export interface ExecutionStep {
  nodeId: string
  nodeLabel: string
  startedAt: number
  finishedAt?: number
  status: 'running' | 'completed' | 'error' | 'skipped'
  input?: any
  output?: any
  error?: string
  logs?: ExecutionLogEntry[]
}

/** 执行日志 */
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

/** 工作流版本快照 */
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
