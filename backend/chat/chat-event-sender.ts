import type { ConnectionManager } from '../ws/connection-manager'

/**
 * Wraps ConnectionManager.sendToClient into typed methods matching the 9 chat
 * event channels the renderer listens to via listenToChatStream().
 *
 * Each method sends a WSEvent (channel + type:'event' + data) directly to the
 * originating client so that the WS bridge on the renderer side can dispatch
 * them the same way IPC events would arrive in Electron mode.
 */
export class ChatEventSender {
  constructor(
    private connections: ConnectionManager,
    private clientId: string,
  ) {}

  // -- 9 chat event channels ------------------------------------------------

  /** Text token streaming – maps to chat:chunk */
  chunk(requestId: string, token: string): void {
    this.emit('chat:chunk', { requestId, token })
  }

  /** Tool call started – maps to chat:tool-call */
  toolCall(requestId: string, toolCall: ChatToolCallEvent): void {
    this.emit('chat:tool-call', { requestId, toolCall })
  }

  /** Tool call arguments (partial or final) – maps to chat:tool-call-args */
  toolCallArgs(requestId: string, toolUseId: string, args: Record<string, unknown>): void {
    this.emit('chat:tool-call-args', { requestId, toolUseId, args })
  }

  /** Tool execution result – maps to chat:tool-result */
  toolResult(requestId: string, toolUseId: string, name: string, result: unknown): void {
    this.emit('chat:tool-result', { requestId, toolUseId, name, result })
  }

  /** Extended thinking delta – maps to chat:thinking */
  thinking(requestId: string, content: string, index: number): void {
    this.emit('chat:thinking', { requestId, content, index })
  }

  /** Token usage update – maps to chat:usage */
  usage(requestId: string, inputTokens: number, outputTokens: number): void {
    this.emit('chat:usage', { requestId, inputTokens, outputTokens })
  }

  /** Stream completed successfully – maps to chat:done */
  done(requestId: string, usage?: { inputTokens: number; outputTokens: number }): void {
    this.emit('chat:done', { requestId, usage })
  }

  /** Stream terminated with error – maps to chat:error */
  error(requestId: string, errorMessage: string): void {
    this.emit('chat:error', { requestId, error: errorMessage })
  }

  /** Retry status – maps to chat:retry */
  retry(requestId: string, attempt: number, maxRetries: number, delayMs: number, status: number, error: string): void {
    this.emit('chat:retry', { requestId, attempt, maxRetries, delayMs, status, error })
  }

  // -- helpers --------------------------------------------------------------

  private emit(channel: string, data: unknown): void {
    this.connections.sendToClient(this.clientId, {
      channel,
      type: 'event',
      data,
    })
  }
}

// -- Types ------------------------------------------------------------------

export interface ChatToolCallEvent {
  id: string
  name: string
  args: Record<string, unknown>
  status: 'running' | 'completed' | 'error'
  startedAt: number
}
