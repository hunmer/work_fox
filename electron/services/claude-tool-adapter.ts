import { createSdkMcpServer, tool, type CanUseTool, type McpServerConfig, type PermissionResult } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'
import { BrowserWindow } from 'electron'
import {
  buildCategoryListResponse,
  buildToolDetailResponse,
  buildToolListResponse,
  isBrowserBusinessToolName,
} from '../../src/lib/agent/tools'
import { dispatchWorkflowTool } from './workflow-tool-dispatcher'
import { workflowNodeRegistry, type AgentToolDefinition } from './workflow-node-registry'

const WORKFLOW_TOOL_SERVER = 'workfox_workflow'
const BROWSER_TOOL_SERVER = 'workfox_browser'
const PLUGIN_TOOL_SERVER = 'workfox_plugin'

const MCP_TOOL_PREFIX = /^mcp__([^_][^ ]*?)__(.+)$/

type RuntimeMode = 'browser' | 'workflow'

interface ToolAdapterContext {
  mainWindow: BrowserWindow
  requestId: string
  mode: RuntimeMode
  workflowId?: string
  enabledToolNames?: string[]
  enabledPlugins?: string[]
}

interface ToolExecutionContext {
  originalName: string
  displayName: string
  requestId: string
  args: Record<string, unknown>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function sanitizeToolName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/^[^a-zA-Z_]+/, '')
    .replace(/_+/g, '_')
    .replace(/^$/, 'tool')
}

function toZodSchema(schema: AgentToolDefinition['input_schema']) {
  const shape: Record<string, z.ZodTypeAny> = {}
  const properties = schema.properties || {}
  const required = new Set(schema.required || [])

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

    if (typeof prop.description === 'string') {
      field = field.describe(prop.description)
    }

    if (prop.default !== undefined) {
      field = field.default(prop.default)
    }

    if (!required.has(key)) {
      field = field.optional()
    }

    shape[key] = field
  }

  return shape
}

async function executeBrowserTool(
  name: string,
  args: Record<string, unknown>,
  enabledToolNames?: string[],
): Promise<unknown> {
  switch (name) {
    case 'list_categories':
      return buildCategoryListResponse()
    case 'list_tools_by_category': {
      const category = typeof args.category === 'string' ? args.category : ''
      if (!category) {
        return { error: 'category is required' }
      }
      return buildToolListResponse(category, enabledToolNames)
    }
    case 'get_tool_detail': {
      const toolName = typeof args.tool_name === 'string'
        ? args.tool_name
        : typeof args.toolName === 'string'
          ? args.toolName
          : typeof args.name === 'string'
            ? args.name
            : ''
      if (!toolName) {
        return { error: 'tool_name is required' }
      }
      return buildToolDetailResponse(toolName, enabledToolNames)
    }
    case 'execute_tool': {
      const toolName = typeof args.tool_name === 'string'
        ? args.tool_name
        : typeof args.toolName === 'string'
          ? args.toolName
          : typeof args.name === 'string'
            ? args.name
            : ''
      const toolArgs = isRecord(args.args) ? args.args : {}
      if (!toolName) {
        return { error: 'tool_name is required' }
      }
      return executeBrowserTool(toolName, toolArgs, enabledToolNames)
    }
    case 'delay': {
      const milliseconds = typeof args.milliseconds === 'number'
        ? args.milliseconds
        : typeof args.ms === 'number'
          ? args.ms
          : 1000
      const clamped = Math.max(100, Math.min(30_000, milliseconds))
      await new Promise((resolve) => setTimeout(resolve, clamped))
      return {
        success: true,
        message: `已等待 ${clamped}ms`,
        data: {
          milliseconds: clamped,
          reason: typeof args.reason === 'string' ? args.reason : undefined,
        },
      }
    }
    default:
      if (isBrowserBusinessToolName(name)) {
        return { error: `浏览器工具 ${name} 当前未在主进程中实现` }
      }
      return { error: `Tool not available in WorkFox: ${name}` }
  }
}

function toToolResult(result: unknown): { content: Array<{ type: 'text'; text: string }> } {
  if (typeof result === 'string') {
    return { content: [{ type: 'text', text: result }] }
  }

  return {
    content: [{
      type: 'text',
      text: JSON.stringify(result ?? null),
    }],
  }
}

function getMcpToolDisplayName(toolName: string): string {
  const match = toolName.match(MCP_TOOL_PREFIX)
  return match ? match[2] : toolName
}

export function createClaudeToolAdapter(context: ToolAdapterContext): {
  mcpServers: Record<string, McpServerConfig>
  canUseTool: CanUseTool
  allowedToolNames: string[]
  resolveDisplayToolName: (toolName: string) => string
  getExecutionContext: (toolUseId: string) => ToolExecutionContext | undefined
  setToolResult: (toolUseId: string, result: unknown) => void
  getToolResult: (toolUseId: string) => unknown
} {
  const toolExecutions = new Map<string, ToolExecutionContext>()
  const toolResults = new Map<string, unknown>()
  const emittedToolResults = new Set<string>()
  const pendingToolUseIds = new Map<string, string[]>()
  const mcpNameToDisplayName = new Map<string, string>()
  const mcpServers: Record<string, McpServerConfig> = {}

  function registerMcpToolName(serverName: string, toolName: string, displayName: string): void {
    const sdkToolName = `mcp__${serverName}__${toolName}`
    mcpNameToDisplayName.set(sdkToolName, displayName)
    console.debug('[ClaudeToolAdapter] registered MCP tool:', {
      requestId: context.requestId,
      serverName,
      toolName,
      sdkToolName,
      displayName,
    })
  }

  function enqueuePendingToolUse(displayName: string, toolUseId: string): void {
    const queue = pendingToolUseIds.get(displayName) ?? []
    queue.push(toolUseId)
    pendingToolUseIds.set(displayName, queue)
  }

  function shiftPendingToolUse(displayName: string): string | undefined {
    const queue = pendingToolUseIds.get(displayName)
    if (!queue?.length) {
      return undefined
    }
    const toolUseId = queue.shift()
    if (queue.length === 0) {
      pendingToolUseIds.delete(displayName)
    }
    return toolUseId
  }

  function completeToolUse(toolUseId: string, displayName: string, result: unknown): void {
    toolResults.set(toolUseId, result)
    if (emittedToolResults.has(toolUseId)) {
      return
    }
    emittedToolResults.add(toolUseId)
    if (context.mainWindow.isDestroyed() || context.mainWindow.webContents.isDestroyed()) {
      return
    }
    context.mainWindow.webContents.send('chat:tool-result', {
      requestId: context.requestId,
      toolUseId,
      name: displayName,
      result: cloneJson(result),
    })
  }

  async function executeTrackedTool(
    displayName: string,
    args: Record<string, unknown>,
    executor: () => Promise<unknown>,
  ): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
    const toolUseId = shiftPendingToolUse(displayName) ?? `${context.requestId}:${displayName}:${Date.now()}`
    try {
      const result = await executor()
      completeToolUse(toolUseId, displayName, result)
      return toToolResult(result)
    } catch (error) {
      const result = {
        success: false,
        message: error instanceof Error ? error.message : String(error),
      }
      completeToolUse(toolUseId, displayName, result)
      return toToolResult(result)
    }
  }

  if (context.mode === 'browser') {
    const browserTools = [
      tool(
        'list_categories',
        '列出可用能力分类及场景说明。',
        {},
        async (args) => executeTrackedTool(
          'list_categories',
          args,
          () => executeBrowserTool('list_categories', {}, context.enabledToolNames),
        ),
      ),
      tool(
        'list_tools_by_category',
        '按分类列出轻量工具清单。',
        {
          category: z.string().describe('能力分类名称'),
        },
        async (args) => executeTrackedTool(
          'list_tools_by_category',
          args,
          () => executeBrowserTool('list_tools_by_category', args, context.enabledToolNames),
        ),
      ),
      tool(
        'get_tool_detail',
        '按工具名获取完整工具用法。',
        {
          tool_name: z.string().describe('工具名，必须来自 list_tools_by_category 返回结果。'),
        },
        async (args) => executeTrackedTool(
          'get_tool_detail',
          args,
          () => executeBrowserTool('get_tool_detail', args, context.enabledToolNames),
        ),
      ),
      tool(
        'execute_tool',
        '执行已查看过详情的浏览器工具。',
        {
          tool_name: z.string().describe('要执行的业务工具名。'),
          args: z.record(z.string(), z.unknown()).optional().describe('业务工具参数。'),
        },
        async (args) => executeTrackedTool(
          'execute_tool',
          args,
          () => executeBrowserTool('execute_tool', args, context.enabledToolNames),
        ),
      ),
      tool(
        'delay',
        '延迟等待指定毫秒数后继续执行。',
        {
          milliseconds: z.number().min(100).max(30_000).describe('等待时长（毫秒）。'),
          reason: z.string().optional().describe('等待原因说明（可选）。'),
        },
        async (args) => executeTrackedTool(
          'delay',
          args,
          () => executeBrowserTool('delay', args, context.enabledToolNames),
        ),
      ),
    ]

    for (const toolDefinition of browserTools) {
      registerMcpToolName(BROWSER_TOOL_SERVER, toolDefinition.name, toolDefinition.name)
    }

    mcpServers[BROWSER_TOOL_SERVER] = createSdkMcpServer({
      name: BROWSER_TOOL_SERVER,
      tools: browserTools,
    })
  }

  if (context.mode === 'workflow' && context.workflowId) {
    const workflowTools = [
      { name: 'get_workflow', description: '读取指定工作流文件中的数据。', input_schema: { type: 'object' as const, properties: { workflow_id: { type: 'string', description: '工作流 ID。' }, summarize: { type: 'boolean', description: '是否返回摘要。' } }, required: ['workflow_id'] } },
      { name: 'get_current_workflow', description: '读取当前渲染进程画布工作流。', input_schema: { type: 'object' as const, properties: { summarize: { type: 'boolean', description: '是否返回摘要。' } } } },
      { name: 'list_node_types', description: '列出可用工作流节点类型。', input_schema: { type: 'object' as const, properties: { category: { type: 'string', description: '可选分类。' } } } },
      { name: 'create_node', description: '创建工作流节点。', input_schema: { type: 'object' as const, properties: { type: { type: 'string', description: '节点类型。' }, label: { type: 'string', description: '节点标签。' }, data: { type: 'object', description: '节点参数。' } }, required: ['type'] } },
      { name: 'update_node', description: '更新工作流节点。', input_schema: { type: 'object' as const, properties: { nodeId: { type: 'string', description: '节点 ID。' }, data: { type: 'object', description: '更新数据。' }, label: { type: 'string', description: '可选标签。' } }, required: ['nodeId', 'data'] } },
      { name: 'delete_node', description: '删除工作流节点。', input_schema: { type: 'object' as const, properties: { nodeId: { type: 'string', description: '节点 ID。' } }, required: ['nodeId'] } },
      { name: 'create_edge', description: '创建工作流连线。', input_schema: { type: 'object' as const, properties: { source: { type: 'string', description: '源节点 ID。' }, target: { type: 'string', description: '目标节点 ID。' }, sourceHandle: { type: 'string', description: '源 handle。' }, targetHandle: { type: 'string', description: '目标 handle。' } }, required: ['source', 'target'] } },
      { name: 'delete_edge', description: '删除工作流连线。', input_schema: { type: 'object' as const, properties: { edgeId: { type: 'string', description: '连线 ID。' } }, required: ['edgeId'] } },
      { name: 'batch_update', description: '批量更新工作流。', input_schema: { type: 'object' as const, properties: { operations: { type: 'array', description: '操作列表。' } }, required: ['operations'] } },
      { name: 'auto_layout', description: '自动布局工作流。', input_schema: { type: 'object' as const, properties: {} } },
      { name: 'execute_workflow_sync', description: '同步执行工作流。', input_schema: { type: 'object' as const, properties: {} } },
      { name: 'execute_workflow_async', description: '异步执行工作流。', input_schema: { type: 'object' as const, properties: {} } },
      { name: 'get_workflow_result', description: '查询工作流执行结果。', input_schema: { type: 'object' as const, properties: { execution_id: { type: 'string', description: '执行 ID。' }, node_id: { type: 'string', description: '可选节点 ID。' } }, required: ['execution_id'] } },
    ] as AgentToolDefinition[]

    mcpServers[WORKFLOW_TOOL_SERVER] = createSdkMcpServer({
      name: WORKFLOW_TOOL_SERVER,
      tools: workflowTools.map((definition) => {
        const mcpToolName = sanitizeToolName(definition.name)
        registerMcpToolName(WORKFLOW_TOOL_SERVER, mcpToolName, definition.name)

        return tool(
          mcpToolName,
          definition.description,
          toZodSchema(definition.input_schema),
          async (args) => {
            const toolUseId = shiftPendingToolUse(definition.name) ?? `${context.requestId}:${definition.name}:${Date.now()}`
            console.debug('[ClaudeToolAdapter] workflow tool execute:', {
              requestId: context.requestId,
              workflowId: context.workflowId,
              toolUseId,
              name: definition.name,
              args,
            })
            const result = await dispatchWorkflowTool(
              context.mainWindow,
              context.requestId,
              toolUseId,
              definition.name,
              args,
              context.workflowId!,
            )
            completeToolUse(toolUseId, definition.name, result)
            console.debug('[ClaudeToolAdapter] workflow tool result:', {
              requestId: context.requestId,
              workflowId: context.workflowId,
              toolUseId,
              name: definition.name,
              result,
            })
            return toToolResult(result)
          },
        )
      }),
    })
  }

  if (context.enabledPlugins?.length) {
    const pluginTools = workflowNodeRegistry.getAgentToolsWithPluginIds(context.enabledPlugins)

    if (pluginTools.length > 0) {
      mcpServers[PLUGIN_TOOL_SERVER] = createSdkMcpServer({
        name: PLUGIN_TOOL_SERVER,
        tools: pluginTools.map((definition) => {
          const mcpToolName = sanitizeToolName(`${definition.pluginId}_${definition.name}`)
          registerMcpToolName(PLUGIN_TOOL_SERVER, mcpToolName, definition.name)

          return tool(
            mcpToolName,
            definition.description,
            toZodSchema(definition.input_schema),
            async (args) => {
              const resolved = workflowNodeRegistry.getAgentToolHandler(definition.name)
              const toolUseId = shiftPendingToolUse(definition.name) ?? `${context.requestId}:${definition.pluginId}:${definition.name}:${Date.now()}`
              console.debug('[ClaudeToolAdapter] plugin tool execute:', {
                requestId: context.requestId,
                pluginId: definition.pluginId,
                toolUseId,
                name: definition.name,
                args,
              })

              if (!resolved) {
                const result = { success: false, message: `插件工具不存在: ${definition.name}` }
                completeToolUse(toolUseId, definition.name, result)
                console.debug('[ClaudeToolAdapter] plugin tool missing:', {
                  requestId: context.requestId,
                  pluginId: definition.pluginId,
                  toolUseId,
                  name: definition.name,
                })
                return toToolResult(result)
              }

              try {
                const result = await resolved.handler(definition.name, args, resolved.api)
                completeToolUse(toolUseId, definition.name, result)
                console.debug('[ClaudeToolAdapter] plugin tool result:', {
                  requestId: context.requestId,
                  pluginId: definition.pluginId,
                  toolUseId,
                  name: definition.name,
                  result,
                })
                return toToolResult(result)
              } catch (error) {
                const result = {
                  success: false,
                  message: error instanceof Error ? error.message : String(error),
                }
                completeToolUse(toolUseId, definition.name, result)
                console.debug('[ClaudeToolAdapter] plugin tool error:', {
                  requestId: context.requestId,
                  pluginId: definition.pluginId,
                  toolUseId,
                  name: definition.name,
                  error: result.message,
                })
                return toToolResult(result)
              }
            },
          )
        }),
      })
    }
  }

  return {
    mcpServers,
    allowedToolNames: [...mcpNameToDisplayName.keys()],
    async canUseTool(toolName, input, options) {
      const displayName = mcpNameToDisplayName.get(toolName) ?? getMcpToolDisplayName(toolName)
      console.debug('[ClaudeToolAdapter] canUseTool allow:', {
        requestId: context.requestId,
        toolUseId: options.toolUseID,
        toolName,
        displayName,
        input,
        suggestions: options.suggestions,
        blockedPath: options.blockedPath,
        decisionReason: options.decisionReason,
      })
      toolExecutions.set(options.toolUseID, {
        originalName: toolName,
        displayName,
        requestId: options.toolUseID,
        args: JSON.parse(JSON.stringify(input ?? {})),
      })
      if (mcpNameToDisplayName.has(toolName)) {
        enqueuePendingToolUse(displayName, options.toolUseID)
      }

      return { behavior: 'allow', toolUseID: options.toolUseID }
    },
    resolveDisplayToolName(toolName) {
      return mcpNameToDisplayName.get(toolName) ?? getMcpToolDisplayName(toolName)
    },
    getExecutionContext(toolUseId) {
      return toolExecutions.get(toolUseId)
    },
    setToolResult(toolUseId, result) {
      const executionContext = toolExecutions.get(toolUseId)
      completeToolUse(toolUseId, executionContext?.displayName ?? toolUseId, result)
    },
    getToolResult(toolUseId) {
      return toolResults.get(toolUseId)
    },
  }
}
