import type {
  ExecutionControlRequest,
  WorkflowExecuteRequest,
  WorkflowExecuteResponse,
} from './execution-events'
import type {
  ExecutionLog,
  Workflow,
  WorkflowFolder,
  WorkflowVersion,
} from './workflow-types'
import type {
  AgentToolDefinition,
  PluginConfigSaveResult,
  PluginMeta,
  PluginWorkflowNodesResult,
} from './plugin-types'

export interface ChannelContract<Request, Response> {
  request: Request
  response: Response
}

export type EmptyRequest = undefined
export type EmptyResponse = undefined

export interface SystemPingRequest {
  timestamp?: number
}

export interface SystemPingResponse {
  timestamp: number
  serverTime: number
}

export interface SystemEchoRequest {
  value: unknown
}

export interface SystemEchoResponse {
  value: unknown
}

export interface WorkflowListRequest {
  folderId?: string | null
}

export interface WorkflowCreateRequest {
  data: Omit<Workflow, 'id'>
}

export interface WorkflowUpdateRequest {
  id: string
  data: Partial<Omit<Workflow, 'id'>>
}

export interface WorkflowDeleteRequest {
  id: string
}

export interface WorkflowGetRequest {
  id: string
}

export interface WorkflowFolderCreateRequest {
  data: Omit<WorkflowFolder, 'id'>
}

export interface WorkflowFolderUpdateRequest {
  id: string
  data: Partial<Omit<WorkflowFolder, 'id'>>
}

export interface WorkflowFolderDeleteRequest {
  id: string
}

export interface WorkflowVersionListRequest {
  workflowId: string
}

export interface WorkflowVersionAddRequest {
  workflowId: string
  name: string
  nodes: Workflow['nodes']
  edges: Workflow['edges']
}

export interface WorkflowVersionGetRequest {
  workflowId: string
  versionId: string
}

export interface WorkflowVersionDeleteRequest {
  workflowId: string
  versionId: string
}

export interface WorkflowVersionClearRequest {
  workflowId: string
}

export interface ExecutionLogListRequest {
  workflowId: string
}

export interface ExecutionLogSaveRequest {
  workflowId: string
  log: ExecutionLog
}

export interface ExecutionLogDeleteRequest {
  workflowId: string
  id: string
}

export interface ExecutionLogClearRequest {
  workflowId: string
}

export interface OperationHistoryLoadRequest {
  workflowId: string
}

export interface OperationHistorySaveRequest {
  workflowId: string
  entries: Array<Record<string, unknown>>
}

export interface OperationHistoryClearRequest {
  workflowId: string
}

export interface PluginSchemeRequest {
  workflowId: string
  pluginId: string
}

export interface PluginSchemeNamedRequest extends PluginSchemeRequest {
  schemeName: string
}

export interface PluginSchemeSaveRequest extends PluginSchemeNamedRequest {
  data: Record<string, string>
}

export interface PluginIdRequest {
  id: string
}

export interface PluginInstallRequest {
  url: string
}

export interface PluginWorkflowNodesRequest {
  pluginId: string
}

export interface PluginAgentToolsRequest {
  pluginIds: string[]
}

export interface PluginConfigRequest {
  pluginId: string
}

export interface PluginConfigSaveRequest {
  pluginId: string
  data: Record<string, string>
}

export interface BackendChannelMap {
  'system:ping': ChannelContract<SystemPingRequest, SystemPingResponse>
  'system:echo': ChannelContract<SystemEchoRequest, SystemEchoResponse>

  'workflow:list': ChannelContract<WorkflowListRequest, Workflow[]>
  'workflow:get': ChannelContract<WorkflowGetRequest, Workflow | undefined>
  'workflow:create': ChannelContract<WorkflowCreateRequest, Workflow>
  'workflow:update': ChannelContract<WorkflowUpdateRequest, EmptyResponse>
  'workflow:delete': ChannelContract<WorkflowDeleteRequest, EmptyResponse>
  'workflow:list-plugin-schemes': ChannelContract<PluginSchemeRequest, string[]>
  'workflow:read-plugin-scheme': ChannelContract<PluginSchemeNamedRequest, Record<string, string>>
  'workflow:create-plugin-scheme': ChannelContract<PluginSchemeNamedRequest, EmptyResponse>
  'workflow:save-plugin-scheme': ChannelContract<PluginSchemeSaveRequest, EmptyResponse>
  'workflow:delete-plugin-scheme': ChannelContract<PluginSchemeNamedRequest, EmptyResponse>

  'workflowFolder:list': ChannelContract<EmptyRequest, WorkflowFolder[]>
  'workflowFolder:create': ChannelContract<WorkflowFolderCreateRequest, WorkflowFolder>
  'workflowFolder:update': ChannelContract<WorkflowFolderUpdateRequest, EmptyResponse>
  'workflowFolder:delete': ChannelContract<WorkflowFolderDeleteRequest, EmptyResponse>

  'workflowVersion:list': ChannelContract<WorkflowVersionListRequest, WorkflowVersion[]>
  'workflowVersion:add': ChannelContract<WorkflowVersionAddRequest, WorkflowVersion>
  'workflowVersion:get': ChannelContract<WorkflowVersionGetRequest, WorkflowVersion | undefined>
  'workflowVersion:delete': ChannelContract<WorkflowVersionDeleteRequest, EmptyResponse>
  'workflowVersion:clear': ChannelContract<WorkflowVersionClearRequest, EmptyResponse>
  'workflowVersion:nextName': ChannelContract<WorkflowVersionListRequest, string>

  'executionLog:list': ChannelContract<ExecutionLogListRequest, ExecutionLog[]>
  'executionLog:save': ChannelContract<ExecutionLogSaveRequest, ExecutionLog>
  'executionLog:delete': ChannelContract<ExecutionLogDeleteRequest, EmptyResponse>
  'executionLog:clear': ChannelContract<ExecutionLogClearRequest, EmptyResponse>

  'operationHistory:load': ChannelContract<OperationHistoryLoadRequest, Array<Record<string, unknown>>>
  'operationHistory:save': ChannelContract<OperationHistorySaveRequest, EmptyResponse>
  'operationHistory:clear': ChannelContract<OperationHistoryClearRequest, EmptyResponse>

  'workflow:execute': ChannelContract<WorkflowExecuteRequest, WorkflowExecuteResponse>
  'workflow:pause': ChannelContract<ExecutionControlRequest, WorkflowExecuteResponse>
  'workflow:resume': ChannelContract<ExecutionControlRequest, WorkflowExecuteResponse>
  'workflow:stop': ChannelContract<ExecutionControlRequest, WorkflowExecuteResponse>

  'plugin:list': ChannelContract<EmptyRequest, PluginMeta[]>
  'plugin:enable': ChannelContract<PluginIdRequest, EmptyResponse>
  'plugin:disable': ChannelContract<PluginIdRequest, EmptyResponse>
  'plugin:install': ChannelContract<PluginInstallRequest, PluginMeta>
  'plugin:uninstall': ChannelContract<PluginIdRequest, EmptyResponse>
  'plugin:get-workflow-nodes': ChannelContract<PluginWorkflowNodesRequest, PluginWorkflowNodesResult>
  'plugin:list-workflow-plugins': ChannelContract<EmptyRequest, PluginMeta[]>
  'plugin:get-agent-tools': ChannelContract<PluginAgentToolsRequest, AgentToolDefinition[]>
  'plugin:get-config': ChannelContract<PluginConfigRequest, Record<string, string>>
  'plugin:save-config': ChannelContract<PluginConfigSaveRequest, PluginConfigSaveResult>
}

export type BackendChannel = keyof BackendChannelMap
export type ChannelRequest<C extends BackendChannel> = BackendChannelMap[C]['request']
export type ChannelResponse<C extends BackendChannel> = BackendChannelMap[C]['response']
