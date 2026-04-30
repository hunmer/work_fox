import { z } from 'zod'
import {
  buildCategoryListResponse,
  buildToolDetailResponse,
  buildToolListResponse,
  isBrowserBusinessToolName,
} from '../../src/lib/agent/tools'
import { WORKFLOW_TOOL_DEFINITIONS } from '../../src/lib/agent/workflow-tools'
import { WORKFLOW_AGENT_TOOL_DEFINITIONS } from '../../src/lib/agent/workflow-agent-tools'
import type { BackendInteractionManager } from '../workflow/interaction-manager'
import type { BackendPluginRegistry } from '../plugins/plugin-registry'
import type { ChatWorkflowToolExecutor } from './chat-workflow-tool-executor'
import type { ClientNodeCache } from './client-node-cache'

const WORKFLOW_TOOL_SERVER = 'workfox_workflow'
const BROWSER_TOOL_SERVER = 'workfox_browser'
const PLUGIN_TOOL_SERVER = 'workfox_plugin'
const MCP_TOOL_PREFIX = /^mcp__([^_][^ ]*?)__(.+)$/

type RuntimeMode = 'browser' | 'workflow' | 'workflow-agent'

type CanUseTool = (toolName: string, input: unknown, options: { toolUseID: string }) => Promise<{ behavior: 'allow'; toolUseID: string }>
type McpServerConfig = unknown

interface ToolExecutionContext {
  originalName: string
  displayName: string
  requestId: string
  args: Record<string, unknown>
}

interface ToolAdapterContext {
  clientId: string
  requestId: string
  mode: RuntimeMode
  workflowId?: string
  enabledToolNames?: string[]
  enabledPlugins?: string[]
}

interface ToolAdapterResult {
  mcpServers: Record<string, McpServerConfig>
  canUseTool: CanUseTool
  allowedToolNames: string[]
  resolveDisplayToolName: (toolName: string) => string
  getExecutionContext: (toolUseId: string) => ToolExecutionContext | undefined
}

interface SdkToolDefinition {
  name: string
  description: string
}

interface ClaudeSdkModule {
  createSdkMcpServer: (config: { name: string; tools: SdkToolDefinition[] }) => McpServerConfig
  tool: (name: string, description: string, schema: Record<string, z.ZodTypeAny>, handler: (args: any) => Promise<any>) => SdkToolDefinition
}

async function loadSdkModule(): Promise<ClaudeSdkModule> {
  return import('@anthropic-ai/claude-agent-sdk') as Promise<any>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function sanitizeToolName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^[^a-zA-Z_]+/, '').replace(/_+/g, '_').replace(/^$/, 'tool')
}

function toZodSchema(schema: any) {
  const shape: Record<string, z.ZodTypeAny> = {}
  const properties = schema?.properties || {}
  const required = new Set(schema?.required || [])
  for (const [key, propValue] of Object.entries(properties)) {
    const prop = isRecord(propValue) ? propValue : {}
    let field: z.ZodTypeAny
    if (Array.isArray(prop.enum) && prop.enum.every((item) => typeof item === 'string') && prop.enum.length > 0) {
      field = z.enum(prop.enum as [string, ...string[]])
    } else {
      switch (prop.type) {
        case 'number':
        case 'integer':
          field = z.number()
          break
        case 'boolean':
          field = z.boolean()
          break
        case 'array':
          field = z.array(z.unknown())
          break
        case 'object':
          field = z.record(z.string(), z.unknown())
          break
        default:
          field = z.string()
      }
    }
    if (typeof prop.description === 'string') field = field.describe(prop.description)
    if (prop.default !== undefined) field = field.default(prop.default)
    if (!required.has(key)) field = field.optional()
    shape[key] = field
  }
  return shape
}

function toToolResult(result: unknown): { content: Array<{ type: 'text'; text: string }> } {
  return {
    content: [{
      type: 'text',
      text: typeof result === 'string' ? result : JSON.stringify(result ?? null),
    }],
  }
}

function getMcpToolDisplayName(toolName: string): string {
  const match = toolName.match(MCP_TOOL_PREFIX)
  return match ? match[2] : toolName
}

export async function createChatToolAdapter(
  context: ToolAdapterContext,
  deps: {
    workflowToolExecutor: ChatWorkflowToolExecutor
    interactionManager: BackendInteractionManager
    pluginRegistry: BackendPluginRegistry
    clientNodeCache: ClientNodeCache
  },
): Promise<ToolAdapterResult> {
  const sdk = await loadSdkModule()
  const toolExecutions = new Map<string, ToolExecutionContext>()
  const pendingToolUseIds = new Map<string, string[]>()
  const mcpNameToDisplayName = new Map<string, string>()
  const mcpServers: Record<string, McpServerConfig> = {}

  function registerMcpToolName(serverName: string, toolName: string, displayName: string): void {
    mcpNameToDisplayName.set(`mcp__${serverName}__${toolName}`, displayName)
  }

  function enqueuePendingToolUse(displayName: string, toolUseId: string): void {
    const queue = pendingToolUseIds.get(displayName) ?? []
    queue.push(toolUseId)
    pendingToolUseIds.set(displayName, queue)
  }

  async function executeBrowserTool(name: string, args: Record<string, unknown>, enabledToolNames?: string[]): Promise<unknown> {
    switch (name) {
      case 'list_categories':
        return buildCategoryListResponse()
      case 'list_tools_by_category': {
        const category = typeof args.category === 'string' ? args.category : ''
        return category ? buildToolListResponse(category, enabledToolNames) : { error: 'category is required' }
      }
      case 'get_tool_detail': {
        const toolName = typeof args.tool_name === 'string' ? args.tool_name : ''
        return toolName ? buildToolDetailResponse(toolName, enabledToolNames) : { error: 'tool_name is required' }
      }
      case 'execute_tool': {
        const toolName = typeof args.tool_name === 'string' ? args.tool_name : ''
        const toolArgs = isRecord(args.args) ? args.args : {}
        return toolName ? executeBrowserTool(toolName, toolArgs, enabledToolNames) : { error: 'tool_name is required' }
      }
      default:
        return isBrowserBusinessToolName(name)
          ? { error: `浏览器工具 ${name} 当前未在 backend 中实现` }
          : { error: `Tool not available in WorkFox: ${name}` }
    }
  }

  if (context.mode === 'browser') {
    const browserTools = [
      sdk.tool('list_categories', '列出可用能力分类及场景说明。', {}, async () => toToolResult(await executeBrowserTool('list_categories', {}, context.enabledToolNames))),
      sdk.tool('list_tools_by_category', '按分类列出轻量工具清单。', { category: z.string() }, async (args) => toToolResult(await executeBrowserTool('list_tools_by_category', args, context.enabledToolNames))),
      sdk.tool('get_tool_detail', '按工具名获取完整工具用法。', { tool_name: z.string() }, async (args) => toToolResult(await executeBrowserTool('get_tool_detail', args, context.enabledToolNames))),
      sdk.tool('execute_tool', '执行已查看过详情的浏览器工具。', { tool_name: z.string(), args: z.record(z.string(), z.unknown()).optional() }, async (args) => toToolResult(await executeBrowserTool('execute_tool', args, context.enabledToolNames))),
    ]
    for (const toolDefinition of browserTools) registerMcpToolName(BROWSER_TOOL_SERVER, toolDefinition.name, toolDefinition.name)
    mcpServers[BROWSER_TOOL_SERVER] = sdk.createSdkMcpServer({ name: BROWSER_TOOL_SERVER, tools: browserTools })
  }

  if (context.mode === 'workflow' && context.workflowId) {
    const rendererTools = new Set(['get_current_workflow', 'execute_workflow_sync', 'execute_workflow_async', 'get_workflow_result'])
    const workflowTools = WORKFLOW_TOOL_DEFINITIONS.map((definition: any) => {
      const mcpToolName = sanitizeToolName(definition.name)
      registerMcpToolName(WORKFLOW_TOOL_SERVER, mcpToolName, definition.name)
      return sdk.tool(mcpToolName, definition.description, toZodSchema(definition.input_schema), async (args) => {
        const result = rendererTools.has(definition.name)
          ? await deps.interactionManager.request({
              clientId: context.clientId,
              executionId: context.requestId,
              workflowId: context.workflowId!,
              nodeId: definition.name,
              interactionType: 'chat_tool',
              schema: {
                kind: 'renderer_workflow_tool',
                requestId: context.requestId,
                toolName: definition.name,
                args,
              },
              timeoutMs: 300_000,
            })
          : await deps.workflowToolExecutor.executeTool(definition.name, args, context.workflowId!, context.clientId)
        return toToolResult(result)
      })
    })
    mcpServers[WORKFLOW_TOOL_SERVER] = sdk.createSdkMcpServer({ name: WORKFLOW_TOOL_SERVER, tools: workflowTools })
  }

  if (context.mode === 'workflow-agent') {
    const workflowAgentTools = WORKFLOW_AGENT_TOOL_DEFINITIONS.map((definition: any) => {
      const mcpToolName = sanitizeToolName(definition.name)
      registerMcpToolName(WORKFLOW_TOOL_SERVER, mcpToolName, definition.name)
      return sdk.tool(mcpToolName, definition.description, toZodSchema(definition.input_schema), async (args) => {
        const result = await deps.workflowToolExecutor.executeWorkflowAgentTool(definition.name, args, context.clientId)
        return toToolResult(result)
      })
    })
    mcpServers[WORKFLOW_TOOL_SERVER] = sdk.createSdkMcpServer({ name: WORKFLOW_TOOL_SERVER, tools: workflowAgentTools })
  }

  const serverPluginTools = context.enabledPlugins?.length ? deps.pluginRegistry.getAgentTools(context.enabledPlugins) : []
  const clientPluginTools = deps.clientNodeCache.getAllTools()
  const pluginTools = [...serverPluginTools, ...clientPluginTools]
  if (pluginTools.length > 0) {
    const tools = pluginTools.map((definition) => {
      const mcpToolName = sanitizeToolName(`${definition.pluginId || 'plugin'}_${definition.name}`)
      registerMcpToolName(PLUGIN_TOOL_SERVER, mcpToolName, definition.name)
      return sdk.tool(mcpToolName, definition.description, toZodSchema((definition as any).inputSchema || (definition as any).input_schema), async (args) => {
        const isClientTool = deps.clientNodeCache.hasClientTool(definition.name)
        const result = isClientTool
          ? await deps.interactionManager.request({
              clientId: context.clientId,
              executionId: context.requestId,
              workflowId: context.workflowId || 'chat',
              nodeId: definition.name,
              interactionType: 'chat_tool',
              schema: {
                kind: 'client_agent_tool',
                requestId: context.requestId,
                toolName: definition.name,
                args,
              },
              timeoutMs: 120_000,
            })
          : await deps.pluginRegistry.executeAgentTool(definition.name, args)
        return toToolResult(result)
      })
    })
    mcpServers[PLUGIN_TOOL_SERVER] = sdk.createSdkMcpServer({ name: PLUGIN_TOOL_SERVER, tools })
  }

  return {
    mcpServers,
    allowedToolNames: [...mcpNameToDisplayName.keys()],
    async canUseTool(toolName, input, options) {
      const displayName = mcpNameToDisplayName.get(toolName) ?? getMcpToolDisplayName(toolName)
      toolExecutions.set(options.toolUseID, {
        originalName: toolName,
        displayName,
        requestId: options.toolUseID,
        args: JSON.parse(JSON.stringify(input ?? {})),
      })
      if (mcpNameToDisplayName.has(toolName)) {
        const queue = pendingToolUseIds.get(displayName) ?? []
        queue.push(options.toolUseID)
        pendingToolUseIds.set(displayName, queue)
      }
      return { behavior: 'allow', toolUseID: options.toolUseID }
    },
    resolveDisplayToolName(toolName) {
      return mcpNameToDisplayName.get(toolName) ?? getMcpToolDisplayName(toolName)
    },
    getExecutionContext(toolUseId) {
      return toolExecutions.get(toolUseId)
    },
  }
}
