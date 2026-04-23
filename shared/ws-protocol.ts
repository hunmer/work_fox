import type { BackendErrorShape } from './errors'

export type WSMessageKind =
  | 'request'
  | 'response'
  | 'event'
  | 'error'
  | 'interaction_required'
  | 'interaction_response'

export interface WSRequest<Channel extends string = string, Data = unknown> {
  id: string
  channel: Channel
  type: 'request'
  data: Data
  timeoutMs?: number
}

export interface WSResponse<Channel extends string = string, Data = unknown> {
  id: string
  channel: Channel
  type: 'response'
  data: Data
}

export interface WSEvent<Channel extends string = string, Data = unknown> {
  channel: Channel
  type: 'event'
  data: Data
}

export interface WSError<Channel extends string = string> {
  id?: string
  channel?: Channel
  type: 'error'
  error: BackendErrorShape
}

export type InteractionType =
  | 'file_select'
  | 'form'
  | 'confirm'
  | 'agent_chat'
  | 'chat_tool'
  | 'node_execution'
  | 'table_confirm'
  | 'custom'

export interface AgentChatInteractionSchema {
  prompt: string
  systemPrompt?: string
  cwd?: string
  additionalDirectories?: string[]
  permissionMode?: string
  extraInstructions?: string
  loadProjectClaudeMd?: boolean
  loadRuleMd?: boolean
  workflowId?: string
  workflowName?: string
  workflowDescription?: string
  enabledPlugins?: string[]
}

export interface NodeExecutionInteractionSchema {
  toolType: string
  params: Record<string, unknown>
}

export interface ChatToolInteractionSchema {
  kind: 'renderer_workflow_tool' | 'client_agent_tool'
  requestId: string
  toolName: string
  args: Record<string, unknown>
  targetTabId?: string
}

export interface TableConfirmInteractionSchema {
  headers: Array<{ id: string; title: string; type: 'string' | 'number' | 'boolean' }>
  cells: Array<{ id: string; data: Record<string, any> }>
  selectionMode: 'none' | 'single' | 'multi'
}

export interface InteractionRequest<Data = unknown> {
  id: string
  channel: 'workflow:interaction'
  type: 'interaction_required'
  executionId: string
  workflowId: string
  nodeId: string
  interactionType: InteractionType
  schema: Data
  timeoutMs?: number
}

export interface InteractionResponse<Data = unknown> {
  id: string
  channel: 'workflow:interaction'
  type: 'interaction_response'
  executionId: string
  workflowId: string
  nodeId: string
  data: Data
  cancelled?: boolean
  error?: BackendErrorShape
}

export type WSIncomingMessage =
  | WSRequest
  | WSResponse
  | WSEvent
  | WSError
  | InteractionRequest
  | InteractionResponse

export type WSOutgoingMessage = WSIncomingMessage

export interface WSClientHello {
  protocolVersion: 1
  clientId?: string
  token?: string
}

export interface WSServerHello {
  protocolVersion: 1
  serverId: string
  clientId: string
  heartbeatIntervalMs: number
}
