import type { ChatSession, ChatMessage } from '@/types'
import { wsBridge } from '@/lib/ws-bridge'

// ===== Scope Key 解析 =====

export function resolveScopeKey(scope: string, workflowId?: string | null): string {
  if (scope === 'workflow' && workflowId) return `workflow-${workflowId}`
  return 'agent-global'
}

// ===== 会话操作 =====

export async function createSession(
  scope: string,
  modelId: string,
  providerId: string,
  browserViewId: string | null = null,
  workflowId: string | null = null,
): Promise<ChatSession> {
  const id = crypto.randomUUID()
  const now = Date.now()
  const session: ChatSession = {
    id,
    title: '新对话',
    scope,
    workflowId,
    browserViewId,
    modelId,
    providerId,
    createdAt: now,
    updatedAt: now,
    messageCount: 0,
  }

  const scopeKey = resolveScopeKey(scope, workflowId)
  await wsBridge.invoke('chatHistory:createSession', { scopeKey, session })
  return session
}

export async function listSessionsByScope(scope: string, workflowId?: string | null): Promise<ChatSession[]> {
  const scopeKey = resolveScopeKey(scope, workflowId)
  const sessions = await wsBridge.invoke('chatHistory:listSessions', { scopeKey }) as ChatSession[]
  return sessions.sort((a: ChatSession, b: ChatSession) => b.updatedAt - a.updatedAt)
}

export async function deleteSession(id: string, scopeKey: string): Promise<void> {
  await wsBridge.invoke('chatHistory:deleteSession', { scopeKey, sessionId: id })
}

export async function updateSessionTitle(id: string, title: string, scopeKey: string): Promise<void> {
  await wsBridge.invoke('chatHistory:updateSession', { scopeKey, sessionId: id, updates: { title, updatedAt: Date.now() } })
}

export async function updateSessionBrowserView(id: string, browserViewId: string | null, scopeKey: string): Promise<void> {
  await wsBridge.invoke('chatHistory:updateSession', { scopeKey, sessionId: id, updates: { browserViewId, updatedAt: Date.now() } })
}

// ===== 消息操作 =====

export async function addMessage(message: Omit<ChatMessage, 'id'>, scopeKey: string): Promise<ChatMessage> {
  const id = crypto.randomUUID()
  const msg: ChatMessage = { ...message, id }
  await wsBridge.invoke('chatHistory:addMessage', { scopeKey, sessionId: message.sessionId, message: msg })
  return msg
}

export async function listMessages(sessionId: string, scopeKey: string): Promise<ChatMessage[]> {
  return wsBridge.invoke('chatHistory:listMessages', { scopeKey, sessionId }) as Promise<ChatMessage[]>
}

export async function updateMessage(id: string, updates: Partial<ChatMessage>, scopeKey: string, sessionId: string): Promise<void> {
  await wsBridge.invoke('chatHistory:updateMessage', { scopeKey, sessionId, messageId: id, updates })
}

export async function deleteMessage(id: string, scopeKey: string, sessionId: string): Promise<void> {
  await wsBridge.invoke('chatHistory:deleteMessage', { scopeKey, sessionId, messageId: id })
}

export async function deleteMessages(ids: string[], scopeKey: string, sessionId: string): Promise<void> {
  if (!ids.length) return
  await wsBridge.invoke('chatHistory:deleteMessages', { scopeKey, sessionId, messageIds: ids })
}

export async function clearMessages(sessionId: string, scopeKey: string): Promise<void> {
  await wsBridge.invoke('chatHistory:clearMessages', { scopeKey, sessionId })
}

export async function getChatHistoryPath(scopeKey: string): Promise<string> {
  return wsBridge.invoke('chatHistory:getPath', { scopeKey })
}

