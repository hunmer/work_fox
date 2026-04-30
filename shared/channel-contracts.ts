import type {
  ExecutionRecoveryRequest,
  ExecutionRecoveryResponse,
  ExecutionControlRequest,
  WorkflowExecuteRequest,
  WorkflowExecuteResponse,
  WorkflowDebugNodeRequest,
  WorkflowDebugNodeResponse,
} from './execution-events'
import type {
  ExecutionLog,
  OperationEntry,
  StagedNode,
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

export interface AIProviderEntry {
  id: string
  name: string
  apiBase: string
  apiKey: string
  models: Array<{ id: string; name: string }>
  enabled?: boolean
}

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

// ---- Dashboard ----
export interface DashboardStatsResponse {
  workflowCount: number
  runningCount: number
  pluginCount: number
  todayExecutions: number
  weekExecutions: number
  totalExecutions: number
  dailyTrend: Array<{
    date: string
    count: number
    success: number
    error: number
  }>
}

export interface DashboardExecutionsRequest {
  range?: 'today' | 'week' | 'all'
  status?: string
  page?: number
  pageSize?: number
}

export interface DashboardExecutionItem {
  id: string
  workflowId: string
  workflowName: string
  status: 'running' | 'completed' | 'paused' | 'error'
  startedAt: number
  finishedAt: number | null
  duration: number | null
  stepCount: number
}

export interface DashboardExecutionsResponse {
  items: DashboardExecutionItem[]
  total: number
  page: number
  pageSize: number
}

export interface DashboardWorkflowDetailRequest {
  workflowId: string
}

export interface DashboardWorkflowDetailResponse {
  workflow: {
    id: string
    name: string
    folderId: string | null
    nodeCount: number
    edgeCount: number
    createdAt: number
    updatedAt: number
  }
  versions: Array<{
    id: string
    version: number
    createdAt: number
    nodeCount: number
    description?: string
  }>
  executions: {
    items: Array<{
      id: string
      status: 'running' | 'completed' | 'paused' | 'error'
      startedAt: number
      finishedAt: number | null
      duration: number | null
      stepCount: number
    }>
    total: number
  }
}

export interface ExecutionLogClearRequest {
  workflowId: string
}

export interface ExecutionLogGetPathRequest {
  workflowId: string
  id: string
}

export interface OperationHistoryLoadRequest {
  workflowId: string
}

export interface OperationHistorySaveRequest {
  workflowId: string
  entries: OperationEntry[]
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

export interface ClientPluginNodeRegistrationRequest {
  nodes: Array<Record<string, unknown>>
}

export interface ClientPluginToolRegistrationRequest {
  tools: AgentToolDefinition[]
}

export interface PluginConfigRequest {
  pluginId: string
}

export interface PluginConfigSaveRequest {
  pluginId: string
  data: Record<string, string>
}

export interface ExecutionInputPreset {
  id: string
  name: string
  values: Record<string, unknown>
  createdAt: number
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
  'executionLog:getPath': ChannelContract<ExecutionLogGetPathRequest, string>

  'operationHistory:load': ChannelContract<OperationHistoryLoadRequest, OperationEntry[]>
  'operationHistory:save': ChannelContract<OperationHistorySaveRequest, EmptyResponse>
  'operationHistory:clear': ChannelContract<OperationHistoryClearRequest, EmptyResponse>

  'workflow:execute': ChannelContract<WorkflowExecuteRequest, WorkflowExecuteResponse>
  'workflow:debug-node': ChannelContract<WorkflowDebugNodeRequest, WorkflowDebugNodeResponse>
  'workflow:get-execution-recovery': ChannelContract<ExecutionRecoveryRequest, ExecutionRecoveryResponse>
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
  'chat:register-client-nodes': ChannelContract<ClientPluginNodeRegistrationRequest, EmptyResponse>
  'chat:register-client-agent-tools': ChannelContract<ClientPluginToolRegistrationRequest, EmptyResponse>

  // --- AI Provider ---
  'aiProvider:list': ChannelContract<EmptyRequest, AIProviderEntry[]>
  'aiProvider:create': ChannelContract<{ data: Omit<AIProviderEntry, 'id'> }, AIProviderEntry>
    'aiProvider:update': ChannelContract<{ id: string; data: Partial<Omit<AIProviderEntry, 'id'>> }, AIProviderEntry>
  'aiProvider:delete': ChannelContract<{ id: string }, { success: boolean }>
  'aiProvider:test': ChannelContract<{ id: string }, { success: boolean; error?: string }>

  // --- Chat History ---
  'chatHistory:listSessions': ChannelContract<{ scopeKey: string }, any[]>
  'chatHistory:createSession': ChannelContract<{ scopeKey: string; session: any }, any>
  'chatHistory:updateSession': ChannelContract<{ scopeKey: string; sessionId: string; updates: any }, EmptyResponse>
  'chatHistory:deleteSession': ChannelContract<{ scopeKey: string; sessionId: string }, EmptyResponse>
  'chatHistory:listMessages': ChannelContract<{ scopeKey: string; sessionId: string }, any[]>
  'chatHistory:addMessage': ChannelContract<{ scopeKey: string; sessionId: string; message: any }, any>
  'chatHistory:updateMessage': ChannelContract<{ scopeKey: string; sessionId: string; messageId: string; updates: any }, EmptyResponse>
  'chatHistory:deleteMessage': ChannelContract<{ scopeKey: string; sessionId: string; messageId: string }, EmptyResponse>
  'chatHistory:deleteMessages': ChannelContract<{ scopeKey: string; sessionId: string; messageIds: string[] }, EmptyResponse>
  'chatHistory:clearMessages': ChannelContract<{ scopeKey: string; sessionId: string }, EmptyResponse>
  'chatHistory:importData': ChannelContract<{ scopeKey: string; data: { sessions: any[]; messages: any[] } }, EmptyResponse>
  'chatHistory:listAllScopeKeys': ChannelContract<EmptyRequest, string[]>

  // --- Agent Settings ---
  'agentSettings:get': ChannelContract<EmptyRequest, any>
  'agentSettings:set': ChannelContract<{ settings: any }, any>

  // --- Shortcut ---
  'shortcut:list': ChannelContract<EmptyRequest, { groups: any[]; shortcuts: any[] }>
  'shortcut:update': ChannelContract<{ id: string; accelerator: string; isGlobal: boolean; enabled?: boolean }, { success: boolean; error?: string; conflictId?: string }>
  'shortcut:toggle': ChannelContract<{ id: string; enabled: boolean }, { success: boolean }>
  'shortcut:clear': ChannelContract<{ id: string }, EmptyResponse>
  'shortcut:reset': ChannelContract<EmptyRequest, EmptyResponse>

  // --- Tabs ---
  'tabs:load': ChannelContract<EmptyRequest, { tabs: any[]; activeTabId: string | null }>
  'tabs:save': ChannelContract<{ tabs: any[]; activeTabId: string | null }, EmptyResponse>

  // --- App ---
  'app:getVersion': ChannelContract<EmptyRequest, { version: string }>

  // --- FS ---
  'fs:listDir': ChannelContract<{ dirPath: string }, Array<{ name: string; path: string; type: 'file' | 'directory'; modifiedAt: string }>>
  'fs:delete': ChannelContract<{ targetPath: string }, { success: boolean; error?: string }>
  'fs:createFile': ChannelContract<{ filePath: string }, { success: boolean; error?: string }>
  'fs:createDir': ChannelContract<{ dirPath: string }, { success: boolean; error?: string }>
  'fs:rename': ChannelContract<{ oldPath: string; newName: string }, { success: boolean; newPath?: string; error?: string }>

  // --- Chat ---
  'chat:completions': ChannelContract<any, { started: boolean; requestId?: string }>
  'chat:abort': ChannelContract<{ requestId: string }, { aborted: boolean }>

  // --- Agent / Workflow Tool ---
  'agent:execTool': ChannelContract<{ toolType: string; params: Record<string, unknown>; targetTabId?: string }, any>

  // --- Dashboard ---
  'dashboard:stats': ChannelContract<EmptyRequest, DashboardStatsResponse>
  'dashboard:executions': ChannelContract<DashboardExecutionsRequest, DashboardExecutionsResponse>
  'dashboard:workflow-detail': ChannelContract<DashboardWorkflowDetailRequest, DashboardWorkflowDetailResponse>

  // --- Execution Input Presets ---
  'executionPreset:list': ChannelContract<{ workflowId: string }, ExecutionInputPreset[]>
  'executionPreset:save': ChannelContract<{ workflowId: string; preset: ExecutionInputPreset }, EmptyResponse>
  'executionPreset:delete': ChannelContract<{ workflowId: string; presetId: string }, EmptyResponse>

  // --- Trigger ---
  'trigger:validate-cron': ChannelContract<
    { cron: string },
    { valid: boolean; nextRuns: string[]; error?: string }
  >
  'trigger:check-hook-name': ChannelContract<
    { hookName: string; excludeWorkflowId?: string },
    { conflictWorkflowIds: string[]; hookUrl: string }
  >

  // --- Staging ---
  'staging:load': ChannelContract<{ workflowId: string }, StagedNode[]>
  'staging:save': ChannelContract<{ workflowId: string; nodes: StagedNode[] }, EmptyResponse>
  'staging:clear': ChannelContract<{ workflowId: string }, EmptyResponse>
}

export type BackendChannel = keyof BackendChannelMap
export type ChannelRequest<C extends BackendChannel> = BackendChannelMap[C]['request']
export type ChannelResponse<C extends BackendChannel> = BackendChannelMap[C]['response']
