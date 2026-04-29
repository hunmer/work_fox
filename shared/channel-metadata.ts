import type { BackendChannel } from './channel-contracts'

export type ChannelPriority = 1 | 2 | 3

export interface ChannelMetadata {
  channel: BackendChannel
  priority: ChannelPriority
  ordered: boolean
  idempotent: boolean
  timeoutMs: number
  streaming: boolean
  description: string
}

export const DEFAULT_REQUEST_TIMEOUT_MS = 30_000
export const EXECUTION_REQUEST_TIMEOUT_MS = 5 * 60_000

export const backendChannelMetadata: Record<BackendChannel, ChannelMetadata> = {
  'system:ping': {
    channel: 'system:ping',
    priority: 1,
    ordered: false,
    idempotent: true,
    timeoutMs: 5_000,
    streaming: false,
    description: 'Backend health check over WebSocket',
  },
  'system:echo': {
    channel: 'system:echo',
    priority: 1,
    ordered: false,
    idempotent: true,
    timeoutMs: 5_000,
    streaming: false,
    description: 'Development echo channel for bridge verification',
  },

  'workflow:list': crud('workflow:list', 'List workflows'),
  'workflow:get': crud('workflow:get', 'Get one workflow'),
  'workflow:create': mutation('workflow:create', 'Create workflow'),
  'workflow:update': mutation('workflow:update', 'Update workflow'),
  'workflow:delete': mutation('workflow:delete', 'Delete workflow'),
  'workflow:list-plugin-schemes': crud('workflow:list-plugin-schemes', 'List workflow plugin config schemes'),
  'workflow:read-plugin-scheme': crud('workflow:read-plugin-scheme', 'Read workflow plugin config scheme'),
  'workflow:create-plugin-scheme': mutation('workflow:create-plugin-scheme', 'Create workflow plugin config scheme'),
  'workflow:save-plugin-scheme': mutation('workflow:save-plugin-scheme', 'Save workflow plugin config scheme'),
  'workflow:delete-plugin-scheme': mutation('workflow:delete-plugin-scheme', 'Delete workflow plugin config scheme'),

  'workflowFolder:list': crud('workflowFolder:list', 'List workflow folders'),
  'workflowFolder:create': mutation('workflowFolder:create', 'Create workflow folder'),
  'workflowFolder:update': mutation('workflowFolder:update', 'Update workflow folder'),
  'workflowFolder:delete': mutation('workflowFolder:delete', 'Delete workflow folder'),

  'workflowVersion:list': crud('workflowVersion:list', 'List workflow versions'),
  'workflowVersion:add': mutation('workflowVersion:add', 'Add workflow version snapshot'),
  'workflowVersion:get': crud('workflowVersion:get', 'Get workflow version snapshot'),
  'workflowVersion:delete': mutation('workflowVersion:delete', 'Delete workflow version snapshot'),
  'workflowVersion:clear': mutation('workflowVersion:clear', 'Clear workflow versions'),
  'workflowVersion:nextName': crud('workflowVersion:nextName', 'Get next workflow version name'),

  'executionLog:list': crud('executionLog:list', 'List execution logs'),
  'executionLog:save': mutation('executionLog:save', 'Save execution log'),
  'executionLog:delete': mutation('executionLog:delete', 'Delete execution log'),
  'executionLog:clear': mutation('executionLog:clear', 'Clear execution logs'),
  'executionLog:getPath': crud('executionLog:getPath', 'Get execution log file path'),

  'operationHistory:load': crud('operationHistory:load', 'Load operation history'),
  'operationHistory:save': mutation('operationHistory:save', 'Save operation history'),
  'operationHistory:clear': mutation('operationHistory:clear', 'Clear operation history'),

  'workflow:execute': execution('workflow:execute', 'Start workflow execution'),
  'workflow:debug-node': execution('workflow:debug-node', 'Debug a single workflow node'),
  'workflow:get-execution-recovery': execution('workflow:get-execution-recovery', 'Recover workflow execution snapshot and recent backlog'),
  'workflow:pause': execution('workflow:pause', 'Pause workflow execution'),
  'workflow:resume': execution('workflow:resume', 'Resume workflow execution'),
  'workflow:stop': execution('workflow:stop', 'Stop workflow execution'),

  'plugin:list': plugin('plugin:list', 'List plugins'),
  'plugin:enable': pluginMutation('plugin:enable', 'Enable plugin'),
  'plugin:disable': pluginMutation('plugin:disable', 'Disable plugin'),
  'plugin:install': pluginMutation('plugin:install', 'Install plugin'),
  'plugin:uninstall': pluginMutation('plugin:uninstall', 'Uninstall plugin'),
  'plugin:get-workflow-nodes': plugin('plugin:get-workflow-nodes', 'Get plugin workflow nodes'),
  'plugin:list-workflow-plugins': plugin('plugin:list-workflow-plugins', 'List workflow-capable plugins'),
  'plugin:get-agent-tools': plugin('plugin:get-agent-tools', 'Get plugin agent tool definitions'),
  'plugin:get-config': plugin('plugin:get-config', 'Get plugin config'),
  'plugin:save-config': pluginMutation('plugin:save-config', 'Save plugin config'),

  // --- AI Provider ---
  'aiProvider:list': crud('aiProvider:list', 'List AI providers'),
  'aiProvider:create': mutation('aiProvider:create', 'Create AI provider'),
  'aiProvider:update': mutation('aiProvider:update', 'Update AI provider'),
  'aiProvider:delete': mutation('aiProvider:delete', 'Delete AI provider'),
  'aiProvider:test': crud('aiProvider:test', 'Test AI provider connection'),

  // --- Chat History ---
  'chatHistory:listSessions': crud('chatHistory:listSessions', 'List chat sessions'),
  'chatHistory:createSession': mutation('chatHistory:createSession', 'Create chat session'),
  'chatHistory:updateSession': mutation('chatHistory:updateSession', 'Update chat session'),
  'chatHistory:deleteSession': mutation('chatHistory:deleteSession', 'Delete chat session'),
  'chatHistory:listMessages': crud('chatHistory:listMessages', 'List chat messages'),
  'chatHistory:addMessage': mutation('chatHistory:addMessage', 'Add chat message'),
  'chatHistory:updateMessage': mutation('chatHistory:updateMessage', 'Update chat message'),
  'chatHistory:deleteMessage': mutation('chatHistory:deleteMessage', 'Delete chat message'),
  'chatHistory:deleteMessages': mutation('chatHistory:deleteMessages', 'Delete multiple chat messages'),
  'chatHistory:clearMessages': mutation('chatHistory:clearMessages', 'Clear all messages in session'),
  'chatHistory:importData': mutation('chatHistory:importData', 'Import chat history data (migration)'),
  'chatHistory:listAllScopeKeys': crud('chatHistory:listAllScopeKeys', 'List all chat history scope keys'),

  // --- Agent Settings ---
  'agentSettings:get': crud('agentSettings:get', 'Get agent settings'),
  'agentSettings:set': mutation('agentSettings:set', 'Set agent settings'),

  // --- Shortcut ---
  'shortcut:list': crud('shortcut:list', 'List shortcuts'),
  'shortcut:update': mutation('shortcut:update', 'Update shortcut'),
  'shortcut:toggle': mutation('shortcut:toggle', 'Toggle shortcut'),
  'shortcut:clear': mutation('shortcut:clear', 'Clear shortcut'),
  'shortcut:reset': mutation('shortcut:reset', 'Reset all shortcuts'),

  // --- Tabs ---
  'tabs:load': crud('tabs:load', 'Load tabs'),
  'tabs:save': mutation('tabs:save', 'Save tabs'),

  // --- App ---
  'app:getVersion': crud('app:getVersion', 'Get app version'),

  // --- FS ---
  'fs:listDir': crud('fs:listDir', 'List directory contents'),
  'fs:delete': mutation('fs:delete', 'Delete file or directory'),
  'fs:createFile': mutation('fs:createFile', 'Create empty file'),
  'fs:createDir': mutation('fs:createDir', 'Create directory'),
  'fs:rename': mutation('fs:rename', 'Rename file or directory'),

  // --- Chat ---
  'chat:completions': { channel: 'chat:completions', priority: 3, ordered: true, idempotent: false, timeoutMs: 5 * 60_000, streaming: true, description: 'Start chat completion stream' },
  'chat:abort': { channel: 'chat:abort', priority: 2, ordered: false, idempotent: true, timeoutMs: 5_000, streaming: false, description: 'Abort chat completion' },
  'chat:register-client-nodes': mutation('chat:register-client-nodes', 'Register client workflow node definitions'),
  'chat:register-client-agent-tools': mutation('chat:register-client-agent-tools', 'Register client agent tool definitions'),

  // --- Agent / Workflow Tool ---
  'agent:execTool': {
    channel: 'agent:execTool',
    priority: 2,
    ordered: true,
    idempotent: false,
    timeoutMs: 10 * 60_000,
    streaming: false,
    description: 'Execute agent tool',
  },

  // --- Dashboard ---
  'dashboard:stats': crud('dashboard:stats', 'Get dashboard statistics overview'),
  'dashboard:executions': crud('dashboard:executions', 'List dashboard execution records'),
  'dashboard:workflow-detail': crud('dashboard:workflow-detail', 'Get dashboard workflow detail'),

  // --- Execution Input Presets ---
  'executionPreset:list': crud('executionPreset:list', 'List execution input presets'),
  'executionPreset:save': mutation('executionPreset:save', 'Save execution input preset'),
  'executionPreset:delete': mutation('executionPreset:delete', 'Delete execution input preset'),

  // --- Trigger ---
  'trigger:validate-cron': crud('trigger:validate-cron', 'Validate cron expression'),
  'trigger:check-hook-name': crud('trigger:check-hook-name', 'Check hook name bindings'),
}

function crud(channel: BackendChannel, description: string): ChannelMetadata {
  return {
    channel,
    priority: 1,
    ordered: false,
    idempotent: true,
    timeoutMs: DEFAULT_REQUEST_TIMEOUT_MS,
    streaming: false,
    description,
  }
}

function mutation(channel: BackendChannel, description: string): ChannelMetadata {
  return {
    channel,
    priority: 1,
    ordered: true,
    idempotent: false,
    timeoutMs: DEFAULT_REQUEST_TIMEOUT_MS,
    streaming: false,
    description,
  }
}

function execution(channel: BackendChannel, description: string): ChannelMetadata {
  return {
    channel,
    priority: 3,
    ordered: true,
    idempotent: false,
    timeoutMs: EXECUTION_REQUEST_TIMEOUT_MS,
    streaming: channel === 'workflow:execute',
    description,
  }
}

function plugin(channel: BackendChannel, description: string): ChannelMetadata {
  return {
    channel,
    priority: 2,
    ordered: false,
    idempotent: true,
    timeoutMs: DEFAULT_REQUEST_TIMEOUT_MS,
    streaming: false,
    description,
  }
}

function pluginMutation(channel: BackendChannel, description: string): ChannelMetadata {
  return {
    channel,
    priority: 2,
    ordered: true,
    idempotent: false,
    timeoutMs: DEFAULT_REQUEST_TIMEOUT_MS,
    streaming: false,
    description,
  }
}
