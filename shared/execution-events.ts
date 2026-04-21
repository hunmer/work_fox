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
}

export interface WorkflowExecuteResponse {
  executionId: string
  status: EngineStatus
}
