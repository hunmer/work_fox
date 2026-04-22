/**
 * ChatRuntime – Backend-side wrapper around @anthropic-ai/claude-agent-sdk.
 *
 * This is a web-mode counterpart of `electron/services/claude-agent-runtime.ts`.
 * It drives the Claude Agent SDK `query()` inside the backend Node.js process
 * and forwards all streaming events to the browser client via ChatEventSender
 * over WebSocket.
 *
 * Initial version supports:
 *   - Pure text streaming (content_block_delta → chat:chunk)
 *   - Extended thinking (thinking_delta → chat:thinking)
 *   - Usage stats (message_start / message_delta → chat:usage)
 *   - Completion (result → chat:done / chat:error)
 *   - Abort via AbortController
 *
 * Tool calls are NOT yet forwarded (they require an interaction bridge back to
 * Electron or a backend plugin registry hook). This will be added in a
 * subsequent iteration.
 */

import type { BackendAIProviderStore } from '../storage/ai-provider-store'
import type { Logger } from '../app/logger'
import type { ChatEventSender } from './chat-event-sender'

/**
 * Dynamic import for @anthropic-ai/claude-agent-sdk.
 *
 * The SDK is an ESM-only package (`"type": "module"`) while the backend
 * compiles as CommonJS (tsconfig `module: "NodeNext"` + no `"type": "module"`
 * in package.json). Static `import from '...'` would emit a `require()` call
 * which Node rejects for ESM modules, so we use dynamic `import()`.
 *
 * We also avoid importing any SDK types at the top level (TS 5.x enforces
 * resolution-mode for type imports from ESM in CJS files). Instead we define
 * lightweight local types for the portions we use.
 */

/** Minimal subset of the SDK module shape we consume. */
interface ClaudeAgentSDK {
  query: (params: any) => AsyncIterable<any> & { close(): void }
}

async function loadSdk(): Promise<ClaudeAgentSDK> {
  return import('@anthropic-ai/claude-agent-sdk') as Promise<any>
}

/** Local mirror of SDK PermissionMode — kept in sync manually. */
type PermissionMode = 'bypassPermissions' | 'default' | 'plan'

/** Handle returned by query(); supports async iteration and close(). */
interface QueryHandle {
  [Symbol.asyncIterator](): AsyncIterator<any>
  close(): void
}

// -- Request shape (mirrors ClaudeRuntimeRequest from Electron) -------------

interface ChatRuntimeRequest {
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
  runtime?: ChatRuntimeOptions
}

interface ChatRuntimeOptions {
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

// -- Internal types ---------------------------------------------------------

interface ActiveChatRun {
  abortController: AbortController
  queryHandle: QueryHandle
}

interface UsageState {
  inputTokens: number
  outputTokens: number
}

interface StreamState {
  blockIndexOffset: number
  currentMessageMaxIndex: number
  usage: UsageState
  emittedText: boolean
}

// -- Helpers ----------------------------------------------------------------

const SYSTEM_PROMPT_BASE = [
  '你是 WorkFox 中的 Claude 执行型 agent。',
  '回复使用中文。',
  '优先直接完成任务；如果当前工具、目录或权限受限，要明确说明限制，而不是虚构结果。',
].join('\n')

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function roleLabel(role: string): string {
  switch (role) {
    case 'user': return '用户'
    case 'assistant': return '助手'
    case 'system': return '系统'
    case 'tool': return '工具'
    default: return role
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
  return content.map(formatContentBlock).filter(Boolean).join('\n')
}

function buildPrompt(messages: ChatRuntimeRequest['messages']): string {
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

function buildSystemPrompt(params: ChatRuntimeRequest): {
  type: 'preset'
  preset: 'claude_code'
  append: string
} {
  const appendSections = [SYSTEM_PROMPT_BASE]

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

  return {
    type: 'preset',
    preset: 'claude_code',
    append: appendSections.join('\n\n'),
  }
}

function toUsage(value: unknown, previous: UsageState): UsageState {
  if (!isRecord(value)) return previous
  return {
    inputTokens: typeof value.input_tokens === 'number' ? value.input_tokens : previous.inputTokens,
    outputTokens: typeof value.output_tokens === 'number' ? value.output_tokens : previous.outputTokens,
  }
}

function extractAssistantText(message: unknown): string {
  if (!isRecord(message) || !Array.isArray(message.content)) return ''
  return (message.content as Array<Record<string, unknown>>)
    .filter(isRecord)
    .map((block) => (block.type === 'text' && typeof block.text === 'string' ? block.text : ''))
    .filter(Boolean)
    .join('')
}

// -- ChatRuntime class ------------------------------------------------------

export class ChatRuntime {
  private activeRuns = new Map<string, ActiveChatRun>()

  constructor(
    private aiProviderStore: BackendAIProviderStore,
    private logger: Logger,
  ) {}

  /**
   * Start a streaming chat completion.
   *
   * The method resolves quickly with `{ started: true, requestId }` so the
   * WS channel handler can return the response. Streaming events continue to
   * be pushed to the client via `eventSender`.
   */
  async completions(
    request: ChatRuntimeRequest,
    eventSender: ChatEventSender,
  ): Promise<{ started: boolean; requestId?: string }> {
    const { _requestId, providerId, modelId, runtime } = request

    const provider = await this.aiProviderStore.get(providerId)
    if (!provider) {
      eventSender.error(_requestId, `Provider not found: ${providerId}`)
      return { started: false }
    }

    if (!provider.apiKey) {
      eventSender.error(_requestId, `Provider has no API key: ${providerId}`)
      return { started: false }
    }

    // Fire-and-forget the stream processing
    this.runStream(request, provider, eventSender).catch((err) => {
      this.logger.error('[ChatRuntime] unhandled stream error', {
        requestId: _requestId,
        error: err instanceof Error ? err.message : String(err),
      })
    })

    return { started: true, requestId: _requestId }
  }

  /**
   * Abort a running chat completion by requestId.
   */
  abort(requestId: string): { aborted: boolean; reason?: string } {
    const run = this.activeRuns.get(requestId)
    if (!run) {
      return { aborted: false, reason: 'not found' }
    }

    run.abortController.abort()
    try {
      run.queryHandle.close()
    } catch {
      // ignore close race
    }
    this.activeRuns.delete(requestId)
    return { aborted: true }
  }

  // -- Private stream processing --------------------------------------------

  private async runStream(
    params: ChatRuntimeRequest,
    provider: { apiKey: string; apiBase: string },
    eventSender: ChatEventSender,
  ): Promise<void> {
    const { _requestId, modelId, runtime } = params
    const abortController = new AbortController()

    const state: StreamState = {
      blockIndexOffset: 0,
      currentMessageMaxIndex: -1,
      usage: { inputTokens: 0, outputTokens: 0 },
      emittedText: false,
    }

    try {
      const cwd = runtime?.cwd
      const additionalDirectories = runtime?.additionalDirectories
      const permissionMode = runtime?.permissionMode ?? 'bypassPermissions'

      this.logger.debug('[ChatRuntime] start run:', {
        requestId: _requestId,
        providerId: params.providerId,
        modelId,
        mode: params._mode,
        workflowId: params._workflowId,
        cwd,
        permissionMode,
      })

      // Dynamic import required – SDK is ESM-only, backend is CJS
      const sdk = await loadSdk()

      const agentQuery = sdk.query({
        prompt: buildPrompt(params.messages),
        options: {
          abortController,
          model: modelId,
          cwd,
          additionalDirectories,
          persistSession: false,
          includePartialMessages: true,
          maxTurns: 1, // Initial version: single-turn, no tool loops
          tools: { type: 'preset', preset: 'claude_code' },
          permissionMode,
          allowDangerouslySkipPermissions: true,
          systemPrompt: buildSystemPrompt(params),
          env: {
            ...process.env,
            ANTHROPIC_API_KEY: provider.apiKey,
            ANTHROPIC_BASE_URL: provider.apiBase,
            CLAUDE_AGENT_SDK_CLIENT_APP: 'work-fox-web/0.0.1',
          },
        },
      })

      this.activeRuns.set(_requestId, {
        abortController,
        queryHandle: agentQuery,
      })

      for await (const message of agentQuery) {
        // Handle abort
        if (abortController.signal.aborted) break

        // -- stream_event: fine-grained partial deltas from the SDK --------
        if (message.type === 'stream_event') {
          this.handleStreamEvent(message.event, _requestId, state, eventSender)
          continue
        }

        // -- assistant: final assembled assistant message -------------------
        if (message.type === 'assistant') {
          const finalText = extractAssistantText(message.message)
          if (!state.emittedText && finalText) {
            state.emittedText = true
            eventSender.chunk(_requestId, finalText)
          }
          continue
        }

        // -- result: terminal message from the SDK -------------------------
        if (message.type === 'result') {
          state.usage = toUsage(message.usage, state.usage)
          eventSender.usage(_requestId, state.usage.inputTokens, state.usage.outputTokens)

          if (message.subtype === 'success') {
            eventSender.done(_requestId, {
              inputTokens: state.usage.inputTokens,
              outputTokens: state.usage.outputTokens,
            })
          } else {
            const errorText = message.errors?.join('\n') || 'Claude agent runtime failed'
            eventSender.error(_requestId, errorText)
          }
        }
      }
    } catch (error) {
      if (
        abortController.signal.aborted
        || (error instanceof Error && error.name === 'AbortError')
      ) {
        // Aborted – no error event needed
        return
      }

      this.logger.debug('[ChatRuntime] run exception:', {
        requestId: _requestId,
        error: error instanceof Error ? error.stack || error.message : String(error),
      })
      eventSender.error(_requestId, error instanceof Error ? error.message : String(error))
    } finally {
      this.logger.debug('[ChatRuntime] finish run:', { requestId: _requestId })
      const activeRun = this.activeRuns.get(_requestId)
      activeRun?.queryHandle.close()
      this.activeRuns.delete(_requestId)
    }
  }

  /**
   * Process a single SDK stream_event and forward to the client.
   *
   * Mirrors `bridgePartialMessage` from the Electron runtime, but only
   * handles text, thinking and usage for the initial version.
   */
  private handleStreamEvent(
    streamEvent: unknown,
    requestId: string,
    state: StreamState,
    eventSender: ChatEventSender,
  ): void {
    if (!isRecord(streamEvent)) return

    const eventType = typeof streamEvent.type === 'string' ? streamEvent.type : ''

    switch (eventType) {
      case 'message_start': {
        const message = isRecord(streamEvent.message) ? streamEvent.message : undefined
        state.usage = toUsage(message?.usage, state.usage)
        eventSender.usage(requestId, state.usage.inputTokens, state.usage.outputTokens)
        break
      }

      case 'content_block_delta': {
        const delta = isRecord(streamEvent.delta) ? streamEvent.delta : undefined
        if (!delta) break

        // Text token
        if (delta.type === 'text_delta' && typeof delta.text === 'string') {
          state.emittedText = true
          eventSender.chunk(requestId, delta.text)
        }

        // Extended thinking
        if (delta.type === 'thinking_delta' && typeof delta.thinking === 'string') {
          const index = typeof streamEvent.index === 'number' ? streamEvent.index : 0
          eventSender.thinking(requestId, delta.thinking, index)
        }
        break
      }

      case 'message_delta': {
        state.usage = toUsage(streamEvent.usage, state.usage)
        eventSender.usage(requestId, state.usage.inputTokens, state.usage.outputTokens)
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
}
