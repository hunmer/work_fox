import type { ToolCall } from '@/types'
import { wsBridge } from '@/lib/ws-bridge'

export interface ToolResultEvent {
  requestId: string
  toolUseId: string
  name: string
  result: unknown
}

export interface ToolCallArgsEvent {
  requestId: string
  toolUseId: string
  args: Record<string, unknown>
}

export interface RetryEvent {
  requestId: string
  attempt: number
  maxRetries: number
  delayMs: number
  status: number
  error: string
}

export interface StreamCallbacks {
  onToken: (token: string) => void
  onToolCall: (call: ToolCall) => void
  onToolResult: (event: ToolResultEvent) => void
  onToolCallArgs: (event: ToolCallArgsEvent) => void
  onThinking: (content: string, blockIndex: number) => void
  onUsage: (usage: { inputTokens: number; outputTokens: number }) => void
  onRetry?: (event: RetryEvent) => void
  onDone: () => void
  onError: (error: Error) => void
}

/**
 * 监听聊天流事件。WS 优先，Electron IPC 作为 fallback。
 * 返回清理函数用于移除监听。
 */
export function listenToChatStream(requestId: string, callbacks: StreamCallbacks): () => void {
  const unsubscribers: Array<() => void> = []
  const subscribe = (channel: string, handler: (data: any) => void) => {
    const wrapped = (data: any) => {
      if (data.requestId === requestId) handler(data)
    }
    if (wsBridge.isConnected() || !navigator.userAgent.includes('Electron')) {
      wsBridge.on(channel, wrapped)
      unsubscribers.push(() => wsBridge.off(channel, wrapped))
      return
    }
    unsubscribers.push(window.api.on(channel, wrapped))
  }

  subscribe('chat:chunk', (data) => callbacks.onToken(data.token))

  subscribe('chat:tool-call', (data) => callbacks.onToolCall(data.toolCall))

  subscribe('chat:tool-result', (data) => callbacks.onToolResult(data))

  subscribe('chat:tool-call-args', (data) => callbacks.onToolCallArgs(data))

  subscribe('chat:thinking', (data) => callbacks.onThinking(data.content, data.index))

  subscribe('chat:done', (data) => {
    if (data.usage) callbacks.onUsage(data.usage)
    callbacks.onDone()
    unsubscribers.forEach((fn) => fn())
  })

  subscribe('chat:error', (data) => {
    callbacks.onError(new Error(data.error))
    unsubscribers.forEach((fn) => fn())
  })

  subscribe('chat:retry', (data) => callbacks.onRetry?.(data))

  subscribe('chat:usage', (data) => callbacks.onUsage({ inputTokens: data.inputTokens, outputTokens: data.outputTokens }))

  return () => unsubscribers.forEach((fn) => fn())
}
