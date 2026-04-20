import { constants as fsConstants } from 'node:fs'
import { access, readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { AbortError, query, type PermissionMode, type Query } from '@anthropic-ai/claude-agent-sdk'
import { BrowserWindow } from 'electron'
import { createClaudeToolAdapter } from './claude-tool-adapter'
import { getAIProvider } from './store'
import { rejectPendingRendererToolsForRequest } from './workflow-tool-dispatcher'

interface RuntimeOptions {
  cwd?: string
  additionalDirectories?: string[]
  permissionMode?: PermissionMode
  allowedTools?: string[]
  extraInstructions?: string
  loadProjectClaudeMd?: boolean
  loadRuleMd?: boolean
  ruleFileNames?: string[]
  enabledPlugins?: string[]
}

interface ClaudeRuntimeRequest {
  _requestId: string
  providerId: string
  modelId: string
  system?: string
  messages: Array<{ role: string; content: string | Array<Record<string, unknown>> }>
  tools?: Array<Record<string, unknown>>
  stream: boolean
  maxTokens?: number
  thinking?: { type: 'enabled'; budgetTokens: number }
  targetTabId?: string
  enabledToolNames?: string[]
  _mode?: string
  _workflowId?: string
  runtime?: RuntimeOptions
}

interface ActiveClaudeRun {
  abortController: AbortController
  queryHandle: Query
}

interface UsageState {
  inputTokens: number
  outputTokens: number
}

interface ToolCallState {
  id: string
  name: string
  args: Record<string, unknown>
  completed: boolean
}

interface StreamBridgeState {
  blockIndexOffset: number
  currentMessageMaxIndex: number
  usage: UsageState
  toolJsonBuffers: Map<number, { toolUseId: string; json: string }>
  tools: Map<string, ToolCallState>
  emittedText: boolean
}

const READ_ONLY_TOOLS = ['Read', 'Glob', 'Grep', 'LS']
const EDIT_TOOLS = ['Read', 'Glob', 'Grep', 'LS', 'Edit', 'MultiEdit', 'Write']
const DEFAULT_RULE_FILE_NAMES = ['rule.md']
const PLATFORM_BINARY_PACKAGE = `@anthropic-ai/claude-agent-sdk-${process.platform}-${process.arch}`
const RUNTIME_SYSTEM_PROMPT = [
  '你是 WorkFox 中的 Claude 执行型 agent。',
  '回复使用中文。',
  '优先直接完成任务；如果当前工具、目录或权限受限，要明确说明限制，而不是虚构结果。',
].join('\n')

export const activeClaudeRuns = new Map<string, ActiveClaudeRun>()

function send(mainWindow: BrowserWindow, channel: string, data: unknown): void {
  if (mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) {
    return
  }
  mainWindow.webContents.send(channel, data)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function resolveClaudeCodeExecutablePath(): string | undefined {
  try {
    const projectRequire = createRequire(import.meta.url)
    const sdkEntry = projectRequire.resolve('@anthropic-ai/claude-agent-sdk')
    const sdkRequire = createRequire(sdkEntry)
    return sdkRequire.resolve(`${PLATFORM_BINARY_PACKAGE}/claude`)
  } catch {
    return undefined
  }
}

function resolvePermissionMode(runtime?: RuntimeOptions): PermissionMode {
  return runtime?.permissionMode ?? 'dontAsk'
}

function resolveBuiltInTools(runtime?: RuntimeOptions): string[] | { type: 'preset'; preset: 'claude_code' } {
  if (runtime?.allowedTools?.length) {
    return runtime.allowedTools
  }

  switch (resolvePermissionMode(runtime)) {
    case 'acceptEdits':
      return EDIT_TOOLS
    case 'bypassPermissions':
      return { type: 'preset', preset: 'claude_code' }
    default:
      return READ_ONLY_TOOLS
  }
}

async function ensureReadableDirectory(dirPath: string): Promise<string> {
  const absolutePath = resolve(dirPath)
  await access(absolutePath, fsConstants.R_OK)
  return absolutePath
}

async function resolveRuntimeDirectories(runtime?: RuntimeOptions): Promise<{
  cwd?: string
  additionalDirectories?: string[]
}> {
  if (!runtime) {
    return {}
  }

  const cwd = runtime.cwd ? await ensureReadableDirectory(runtime.cwd) : undefined
  const additionalDirectories = runtime.additionalDirectories?.length
    ? await Promise.all(runtime.additionalDirectories.map(ensureReadableDirectory))
    : undefined

  return { cwd, additionalDirectories }
}

async function tryReadFile(filePath: string): Promise<string | null> {
  try {
    await access(filePath, fsConstants.R_OK)
    return await readFile(filePath, 'utf8')
  } catch {
    return null
  }
}

async function loadRuleInstructions(runtime: RuntimeOptions | undefined, cwd: string | undefined): Promise<string | undefined> {
  if (!runtime?.loadRuleMd || !cwd) {
    return undefined
  }

  const fileNames = runtime.ruleFileNames?.length ? runtime.ruleFileNames : DEFAULT_RULE_FILE_NAMES
  const contents: string[] = []

  for (const fileName of fileNames) {
    const absolutePath = resolve(cwd, fileName)
    const content = await tryReadFile(absolutePath)
    if (content?.trim()) {
      contents.push(`# ${fileName}\n${content.trim()}`)
    }
  }

  return contents.length > 0 ? contents.join('\n\n') : undefined
}

function roleLabel(role: string): string {
  switch (role) {
    case 'user':
      return '用户'
    case 'assistant':
      return '助手'
    case 'system':
      return '系统'
    case 'tool':
      return '工具'
    default:
      return role
  }
}

function formatContentBlock(block: Record<string, unknown>): string {
  if (block.type === 'text' && typeof block.text === 'string') {
    return block.text
  }
  if (block.type === 'image') {
    const source = isRecord(block.source) ? block.source : undefined
    const mediaType = typeof source?.media_type === 'string' ? source.media_type : 'unknown'
    return `[附加图片: ${mediaType}]`
  }
  return `[非文本内容: ${String(block.type ?? 'unknown')}]`
}

function formatMessageContent(content: string | Array<Record<string, unknown>>): string {
  if (typeof content === 'string') {
    return content
  }

  const parts = content.map(formatContentBlock).filter(Boolean)
  return parts.join('\n')
}

function buildPrompt(messages: ClaudeRuntimeRequest['messages']): string {
  const transcript = messages
    .map((message, index) => {
      const content = formatMessageContent(message.content).trim()
      return `[${index + 1}] ${roleLabel(message.role)}:\n${content || '(空)'}`
    })
    .join('\n\n')

  return [
    '以下是当前会话上下文。请延续这段对话，重点完成最后一个用户请求。',
    transcript,
  ].join('\n\n')
}

function buildSystemPrompt(params: ClaudeRuntimeRequest, ruleInstructions?: string): {
  type: 'preset'
  preset: 'claude_code'
  append: string
} {
  const appendSections = [RUNTIME_SYSTEM_PROMPT]

  if (params._mode === 'workflow') {
    appendSections.push('当前运行在 WorkFox 的工作流上下文中。优先输出可复用、可落盘的结果。')
  }

  if (params.system?.trim()) {
    appendSections.push(
      params._mode === 'workflow'
        ? `工作流上下文说明:\n${params.system.trim()}`
        : `应用附加说明:\n${params.system.trim()}`,
    )
  }

  if (params.runtime?.extraInstructions?.trim()) {
    appendSections.push(params.runtime.extraInstructions.trim())
  }

  if (ruleInstructions?.trim()) {
    appendSections.push(`兼容规则文件内容:\n${ruleInstructions.trim()}`)
  }

  return {
    type: 'preset',
    preset: 'claude_code',
    append: appendSections.join('\n\n'),
  }
}

function extractAssistantText(message: unknown): string {
  if (!isRecord(message) || !Array.isArray(message.content)) {
    return ''
  }

  const parts = message.content
    .filter(isRecord)
    .map((block) => (block.type === 'text' && typeof block.text === 'string' ? block.text : ''))
    .filter(Boolean)

  return parts.join('')
}

function toUsage(value: unknown, previous: UsageState): UsageState {
  if (!isRecord(value)) {
    return previous
  }

  const inputTokens = typeof value.input_tokens === 'number' ? value.input_tokens : previous.inputTokens
  const outputTokens = typeof value.output_tokens === 'number' ? value.output_tokens : previous.outputTokens

  return {
    inputTokens,
    outputTokens,
  }
}

function emitUsage(mainWindow: BrowserWindow, requestId: string, usage: UsageState): void {
  send(mainWindow, 'chat:usage', {
    requestId,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
  })
}

function resolveBlockIndex(state: StreamBridgeState, rawIndex: unknown): number | null {
  if (typeof rawIndex !== 'number') {
    return null
  }
  state.currentMessageMaxIndex = Math.max(state.currentMessageMaxIndex, rawIndex)
  return rawIndex + state.blockIndexOffset
}

function emitToolCall(
  mainWindow: BrowserWindow,
  requestId: string,
  toolUseId: string,
  toolName: string,
  args: Record<string, unknown>,
): void {
  send(mainWindow, 'chat:tool-call', {
    requestId,
    toolCall: {
      id: toolUseId,
      name: toolName,
      args: cloneJson(args),
      status: 'running',
      startedAt: Date.now(),
    },
  })

  if (Object.keys(args).length > 0) {
    send(mainWindow, 'chat:tool-call-args', {
      requestId,
      toolUseId,
      args: cloneJson(args),
    })
  }
}

function completeToolCall(
  mainWindow: BrowserWindow,
  requestId: string,
  toolUseId: string,
  toolName: string,
  result: unknown,
): void {
  send(mainWindow, 'chat:tool-result', {
    requestId,
    toolUseId,
    name: toolName,
    result: cloneJson(result),
  })
}

function bridgePartialMessage(
  mainWindow: BrowserWindow,
  requestId: string,
  state: StreamBridgeState,
  streamEvent: unknown,
  resolveDisplayToolName: (toolName: string) => string,
): void {
  if (!isRecord(streamEvent)) {
    return
  }

  const eventType = typeof streamEvent.type === 'string' ? streamEvent.type : ''
  const resolvedIndex = resolveBlockIndex(state, streamEvent.index)

  switch (eventType) {
    case 'message_start': {
      const message = isRecord(streamEvent.message) ? streamEvent.message : undefined
      state.usage = toUsage(message?.usage, state.usage)
      emitUsage(mainWindow, requestId, state.usage)
      break
    }
    case 'content_block_start': {
      const contentBlock = isRecord(streamEvent.content_block) ? streamEvent.content_block : undefined
      if (contentBlock?.type === 'tool_use') {
        const toolUseId = typeof contentBlock.id === 'string' ? contentBlock.id : `tool-${Date.now()}`
        const rawToolName = typeof contentBlock.name === 'string' ? contentBlock.name : 'unknown'
        const toolName = resolveDisplayToolName(rawToolName)
        const args = isRecord(contentBlock.input) ? cloneJson(contentBlock.input) : {}

        state.tools.set(toolUseId, {
          id: toolUseId,
          name: toolName,
          args,
          completed: false,
        })

        if (resolvedIndex !== null) {
          state.toolJsonBuffers.set(resolvedIndex, { toolUseId, json: '' })
        }

        emitToolCall(mainWindow, requestId, toolUseId, toolName, args)
      }
      break
    }
    case 'content_block_delta': {
      const delta = isRecord(streamEvent.delta) ? streamEvent.delta : undefined
      if (!delta) {
        break
      }

      if (delta.type === 'text_delta' && typeof delta.text === 'string') {
        state.emittedText = true
        send(mainWindow, 'chat:chunk', { requestId, token: delta.text })
      }

      if (delta.type === 'thinking_delta' && typeof delta.thinking === 'string') {
        send(mainWindow, 'chat:thinking', {
          requestId,
          content: delta.thinking,
          index: resolvedIndex ?? 0,
        })
      }

      if (delta.type === 'input_json_delta' && typeof delta.partial_json === 'string' && resolvedIndex !== null) {
        const buffer = state.toolJsonBuffers.get(resolvedIndex)
        if (buffer) {
          buffer.json += delta.partial_json
        }
      }
      break
    }
    case 'content_block_stop': {
      if (resolvedIndex === null) {
        break
      }

      const buffer = state.toolJsonBuffers.get(resolvedIndex)
      if (!buffer) {
        break
      }

      state.toolJsonBuffers.delete(resolvedIndex)

      try {
        const parsedArgs = JSON.parse(buffer.json || '{}') as Record<string, unknown>
        const tool = state.tools.get(buffer.toolUseId)
        if (tool) {
          tool.args = parsedArgs
          send(mainWindow, 'chat:tool-call-args', {
            requestId,
            toolUseId: tool.id,
            args: cloneJson(parsedArgs),
          })
        }
      } catch {
        // 输入流未形成合法 JSON 时，沿用已知参数并继续。
      }
      break
    }
    case 'message_delta': {
      state.usage = toUsage(streamEvent.usage, state.usage)
      emitUsage(mainWindow, requestId, state.usage)
      break
    }
    case 'message_stop': {
      state.blockIndexOffset += state.currentMessageMaxIndex + 1
      state.currentMessageMaxIndex = -1
      break
    }
    default:
      break
  }
}

export async function startClaudeAgentRun(
  mainWindow: BrowserWindow,
  params: ClaudeRuntimeRequest,
): Promise<void> {
  const { _requestId, providerId, modelId, runtime } = params
  const provider = getAIProvider(providerId)

  if (!provider) {
    send(mainWindow, 'chat:error', { requestId: _requestId, error: `Provider not found: ${providerId}` })
    return
  }

  if (!provider.apiKey) {
    send(mainWindow, 'chat:error', { requestId: _requestId, error: `Provider has no API key: ${providerId}` })
    return
  }

  const abortController = new AbortController()

  try {
    const { cwd, additionalDirectories } = await resolveRuntimeDirectories(runtime)
    const ruleInstructions = await loadRuleInstructions(runtime, cwd)
    const permissionMode = resolvePermissionMode(runtime)
    const tools = resolveBuiltInTools(runtime)
    const toolAdapter = createClaudeToolAdapter({
      mainWindow,
      requestId: _requestId,
      mode: params._mode === 'workflow' ? 'workflow' : 'browser',
      workflowId: params._workflowId,
      enabledToolNames: params.enabledToolNames,
      enabledPlugins: runtime?.enabledPlugins,
    })

    const agentQuery = query({
      prompt: buildPrompt(params.messages),
      options: {
        abortController,
        model: modelId,
        pathToClaudeCodeExecutable: resolveClaudeCodeExecutablePath(),
        cwd,
        additionalDirectories,
        persistSession: false,
        includePartialMessages: true,
        maxTurns: 20,
        tools,
        allowedTools: Array.isArray(tools) ? tools : undefined,
        permissionMode,
        allowDangerouslySkipPermissions: permissionMode === 'bypassPermissions',
        settingSources: runtime?.loadProjectClaudeMd === false ? [] : ['project'],
        systemPrompt: buildSystemPrompt(params, ruleInstructions),
        mcpServers: Object.keys(toolAdapter.mcpServers).length > 0 ? toolAdapter.mcpServers : undefined,
        canUseTool: toolAdapter.canUseTool,
        env: {
          ...process.env,
          ANTHROPIC_API_KEY: provider.apiKey,
          ANTHROPIC_BASE_URL: provider.apiBase,
          CLAUDE_AGENT_SDK_CLIENT_APP: 'work-fox/0.0.1',
        },
      },
    })

    activeClaudeRuns.set(_requestId, {
      abortController,
      queryHandle: agentQuery,
    })

    const streamState: StreamBridgeState = {
      blockIndexOffset: 0,
      currentMessageMaxIndex: -1,
      usage: { inputTokens: 0, outputTokens: 0 },
      toolJsonBuffers: new Map(),
      tools: new Map(),
      emittedText: false,
    }

    for await (const message of agentQuery) {
      if (message.type === 'stream_event') {
        bridgePartialMessage(mainWindow, _requestId, streamState, message.event, toolAdapter.resolveDisplayToolName)
        continue
      }

      if (message.type === 'assistant') {
        const finalText = extractAssistantText(message.message)
        if (!streamState.emittedText && finalText) {
          streamState.emittedText = true
          send(mainWindow, 'chat:chunk', { requestId: _requestId, token: finalText })
        }
        continue
      }

      if (message.type === 'tool_progress') {
        if (!streamState.tools.has(message.tool_use_id)) {
          const executionContext = toolAdapter.getExecutionContext(message.tool_use_id)
          const displayName = executionContext?.displayName ?? toolAdapter.resolveDisplayToolName(message.tool_name)
          const args = executionContext?.args ?? {}

          streamState.tools.set(message.tool_use_id, {
            id: message.tool_use_id,
            name: displayName,
            args,
            completed: false,
          })
          emitToolCall(mainWindow, _requestId, message.tool_use_id, displayName, args)
        }
        continue
      }

      if (message.type === 'tool_use_summary') {
        for (const toolUseId of message.preceding_tool_use_ids) {
          const tool = streamState.tools.get(toolUseId)
          if (!tool || tool.completed) {
            continue
          }
          tool.completed = true
          const knownResult = toolAdapter.getToolResult(toolUseId)
          completeToolCall(
            mainWindow,
            _requestId,
            toolUseId,
            tool.name,
            knownResult ?? { summary: message.summary },
          )
        }
        continue
      }

      if (message.type === 'result') {
        streamState.usage = toUsage(message.usage, streamState.usage)
        emitUsage(mainWindow, _requestId, streamState.usage)

        if (message.subtype === 'success') {
          send(mainWindow, 'chat:done', {
            requestId: _requestId,
            usage: {
              inputTokens: streamState.usage.inputTokens,
              outputTokens: streamState.usage.outputTokens,
            },
          })
        } else {
          const errorText = message.errors.join('\n') || 'Claude agent runtime failed'
          send(mainWindow, 'chat:error', {
            requestId: _requestId,
            error: errorText,
          })
        }
      }
    }
  } catch (error) {
    if (abortController.signal.aborted || error instanceof AbortError || (error instanceof Error && error.name === 'AbortError')) {
      return
    }

    send(mainWindow, 'chat:error', {
      requestId: _requestId,
      error: error instanceof Error ? error.message : String(error),
    })
  } finally {
    rejectPendingRendererToolsForRequest(_requestId, new Error('Claude agent request finished'))
    const activeRun = activeClaudeRuns.get(_requestId)
    activeRun?.queryHandle.close()
    activeClaudeRuns.delete(_requestId)
  }
}

export function abortClaudeAgentRun(requestId: string): { aborted: boolean; reason?: string } {
  const activeRun = activeClaudeRuns.get(requestId)
  if (!activeRun) {
    return { aborted: false, reason: 'not found' }
  }

  rejectPendingRendererToolsForRequest(requestId, new Error('Claude agent request aborted'))
  activeRun.abortController.abort()
  activeRun.queryHandle.close()
  activeClaudeRuns.delete(requestId)
  return { aborted: true }
}
