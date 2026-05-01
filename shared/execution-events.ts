import type {
  EngineStatus,
  ExecutionLog,
  ExecutionStep,
  WorkflowEdge,
  WorkflowNode,
} from './workflow-types'
import type { BackendErrorShape } from './errors'

export type ExecutionEventChannel =
  | 'workflow:started'
  | 'workflow:paused'
  | 'workflow:resumed'
  | 'workflow:completed'
  | 'workflow:error'
  | 'node:start'
  | 'node:progress'
  | 'node:complete'
  | 'node:error'
  | 'execution:log'
  | 'execution:context'

export interface ExecutionEventBase {
  executionId: string
  workflowId: string
  timestamp: number
}

export interface WorkflowStartedEvent extends ExecutionEventBase {
  status: 'running'
  workflowName?: string
}

export interface WorkflowPausedEvent extends ExecutionEventBase {
  status: 'paused'
  currentNodeId?: string
  reason?: 'manual' | 'breakpoint-start' | 'breakpoint-end'
}

export interface WorkflowResumedEvent extends ExecutionEventBase {
  status: 'running'
  currentNodeId?: string
}

export interface WorkflowCompletedEvent extends ExecutionEventBase {
  status: 'completed'
  log: ExecutionLog
  context: Record<string, unknown>
}

export interface WorkflowErrorEvent extends ExecutionEventBase {
  status: 'error'
  error: BackendErrorShape
  log?: ExecutionLog
}

export interface NodeStartEvent extends ExecutionEventBase {
  nodeId: string
  nodeLabel: string
  input?: unknown
}

export interface NodeProgressEvent extends ExecutionEventBase {
  nodeId: string
  message?: string
  progress?: number
  data?: unknown
}

export interface NodeCompleteEvent extends ExecutionEventBase {
  nodeId: string
  step: ExecutionStep
}

export interface NodeErrorEvent extends ExecutionEventBase {
  nodeId: string
  step: ExecutionStep
  error: BackendErrorShape
}

export interface ExecutionLogEvent extends ExecutionEventBase {
  log: ExecutionLog
}

export interface ExecutionContextEvent extends ExecutionEventBase {
  context: Record<string, unknown>
}

export interface ExecutionSnapshot {
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  groups?: Workflow['groups']
}

export interface ExecutionBacklogEvent {
  sequence: number
  channel: ExecutionEventChannel
  payload: ExecutionEventMap[ExecutionEventChannel]
}

export interface ExecutionRecoveryRequest {
  workflowId: string
  executionId?: string | null
}

export interface ExecutionRecoveryState {
  executionId: string
  workflowId: string
  status: EngineStatus
  currentNodeId?: string
  pauseReason?: WorkflowPausedEvent['reason']
  updatedAt: number
  active: boolean
  log: ExecutionLog
  context: Record<string, unknown>
  recentEvents: ExecutionBacklogEvent[]
}

export interface ExecutionRecoveryResponse {
  found: boolean
  execution?: ExecutionRecoveryState
}

export interface ExecutionEventMap {
  'workflow:started': WorkflowStartedEvent
  'workflow:paused': WorkflowPausedEvent
  'workflow:resumed': WorkflowResumedEvent
  'workflow:completed': WorkflowCompletedEvent
  'workflow:error': WorkflowErrorEvent
  'node:start': NodeStartEvent
  'node:progress': NodeProgressEvent
  'node:complete': NodeCompleteEvent
  'node:error': NodeErrorEvent
  'execution:log': ExecutionLogEvent
  'execution:context': ExecutionContextEvent
}

export interface ExecutionControlRequest {
  executionId: string
}

export interface WorkflowExecuteRequest {
  workflowId: string
  input?: Record<string, unknown>
  snapshot?: ExecutionSnapshot
  startNodeId?: string
}

export interface WorkflowExecuteResponse {
  executionId: string
  status: EngineStatus
}

export interface WorkflowDebugNodeRequest {
  workflowId: string
  nodeId: string
  input?: Record<string, unknown>
  context?: Record<string, unknown>
  snapshot?: ExecutionSnapshot
  embeddedNode?: WorkflowNode
}

export interface WorkflowDebugNodeResponse {
  status: 'completed' | 'error'
  output?: unknown
  error?: string
  duration: number
}
