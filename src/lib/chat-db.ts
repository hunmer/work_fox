import Dexie, { type Table } from 'dexie'
import type { ChatSession, ChatMessage } from '@/types'
import { wsBridge } from '@/lib/ws-bridge'

class ChatDB extends Dexie {
  sessions!: Table<ChatSession, string>
  messages!: Table<ChatMessage, string>

  constructor() {
    super('workfox-chat')
    this.version(1).stores({
      sessions: 'id, updatedAt, createdAt',
      messages: 'id, sessionId, createdAt, [sessionId+createdAt]',
    })
    this.version(2).stores({
      sessions: 'id, updatedAt, createdAt, workflowId',
      messages: 'id, sessionId, createdAt, [sessionId+createdAt]',
    })
    this.version(3).stores({
      sessions: 'id, updatedAt, createdAt, scope, workflowId',
      messages: 'id, sessionId, createdAt, [sessionId+createdAt]',
    }).upgrade(tx => {
      return tx.table('sessions').toCollection().modify(session => {
        if (!session.scope) {
          session.scope = session.workflowId ? 'workflow' : 'agent'
        }
      })
    })
  }
}

export const chatDb = new ChatDB()
export const MAX_MESSAGES_PER_SESSION = 5000

// ===== 辅助：判断 session 是否是 workflow scope 且有 workflowId =====

async function getWorkflowId(sessionId: string): Promise<string | null> {
  const session = await chatDb.sessions.get(sessionId)
  if (session?.scope === 'workflow' && session.workflowId) return session.workflowId
  return null
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

  // IndexedDB 始终写入（作为缓存/索引）
  await chatDb.sessions.add(session)

  if (scope === 'workflow' && workflowId) {
    await wsBridge.invoke('chatHistory:createSession', { workflowId, session })
  }

  return session
}

export async function listSessionsByScope(scope: string): Promise<ChatSession[]> {
  return chatDb.sessions
    .where('scope')
    .equals(scope)
    .reverse()
    .sortBy('updatedAt')
}

export async function deleteSession(id: string): Promise<void> {
  const session = await chatDb.sessions.get(id)
  if (session?.scope === 'workflow' && session.workflowId) {
    await wsBridge.invoke('chatHistory:deleteSession', { workflowId: session.workflowId, sessionId: id })
  }
  await chatDb.messages.where('sessionId').equals(id).delete()
  await chatDb.sessions.delete(id)
}

export async function updateSessionTitle(id: string, title: string): Promise<void> {
  const session = await chatDb.sessions.get(id)
  if (session?.scope === 'workflow' && session.workflowId) {
    await wsBridge.invoke('chatHistory:updateSession', { workflowId: session.workflowId, sessionId: id, updates: { title, updatedAt: Date.now() } })
  }
  await chatDb.sessions.update(id, { title, updatedAt: Date.now() })
}

export async function updateSessionBrowserView(id: string, browserViewId: string | null): Promise<void> {
  const session = await chatDb.sessions.get(id)
  if (session?.scope === 'workflow' && session.workflowId) {
    await wsBridge.invoke('chatHistory:updateSession', { workflowId: session.workflowId, sessionId: id, updates: { browserViewId, updatedAt: Date.now() } })
  }
  await chatDb.sessions.update(id, { browserViewId, updatedAt: Date.now() })
}

// ===== 消息操作 =====

export async function addMessage(message: Omit<ChatMessage, 'id'>): Promise<ChatMessage> {
  const id = crypto.randomUUID()
  const msg: ChatMessage = { ...message, id }

  const session = await chatDb.sessions.get(message.sessionId)

  // IndexedDB 始终写入
  await chatDb.messages.add(msg)

  if (session?.scope === 'workflow' && session.workflowId) {
    await wsBridge.invoke('chatHistory:addMessage', { workflowId: session.workflowId, sessionId: message.sessionId, message: msg })
  }

  // 更新会话的 updatedAt 和 messageCount
  if (session) {
    await chatDb.sessions.update(message.sessionId, {
      updatedAt: Date.now(),
      messageCount: session.messageCount + 1,
    })
  }

  // 超过上限时删除最早的消息（DB 侧）
  const count = await chatDb.messages.where('sessionId').equals(message.sessionId).count()
  if (count > MAX_MESSAGES_PER_SESSION) {
    const oldest = await chatDb.messages
      .where('sessionId')
      .equals(message.sessionId)
      .sortBy('createdAt')
    const toDelete = oldest.slice(0, count - MAX_MESSAGES_PER_SESSION).map((m) => m.id!)
    await chatDb.messages.bulkDelete(toDelete)
  }

  return msg
}

export async function listMessages(sessionId: string): Promise<ChatMessage[]> {
  // 优先从文件读取 workflow scope 的消息
  const wid = await getWorkflowId(sessionId)
  if (wid) {
    return wsBridge.invoke('chatHistory:listMessages', { workflowId: wid, sessionId })
  }
  return chatDb.messages
    .where('sessionId')
    .equals(sessionId)
    .sortBy('createdAt')
}

export async function updateMessage(id: string, updates: Partial<ChatMessage>): Promise<void> {
  await chatDb.messages.update(id, updates)

  // 从 DB 找 sessionId，再查 workflowId
  const msg = await chatDb.messages.get(id)
  if (msg?.sessionId) {
    const wid = await getWorkflowId(msg.sessionId)
    if (wid) {
      await wsBridge.invoke('chatHistory:updateMessage', { workflowId: wid, sessionId: msg.sessionId, messageId: id, updates })
    }
  }
}

export async function deleteMessage(id: string): Promise<void> {
  const msg = await chatDb.messages.get(id)
  if (!msg) return
  await chatDb.messages.delete(id)

  if (msg.sessionId) {
    const wid = await getWorkflowId(msg.sessionId)
    if (wid) {
      await wsBridge.invoke('chatHistory:deleteMessage', { workflowId: wid, sessionId: msg.sessionId, messageId: id })
    }
    const session = await chatDb.sessions.get(msg.sessionId)
    if (session) {
      await chatDb.sessions.update(msg.sessionId, {
        messageCount: Math.max(0, session.messageCount - 1),
        updatedAt: Date.now(),
      })
    }
  }
}

export async function deleteMessages(ids: string[]): Promise<void> {
  if (!ids.length) return
  const first = await chatDb.messages.get(ids[0])
  await chatDb.messages.bulkDelete(ids)

  if (first?.sessionId) {
    const wid = await getWorkflowId(first.sessionId)
    if (wid) {
      await wsBridge.invoke('chatHistory:deleteMessages', { workflowId: wid, sessionId: first.sessionId, messageIds: ids })
    }
  }
}

export async function clearMessages(sessionId: string): Promise<void> {
  const wid = await getWorkflowId(sessionId)
  if (wid) {
    await wsBridge.invoke('chatHistory:clearMessages', { workflowId: wid, sessionId })
  }
  await chatDb.messages.where('sessionId').equals(sessionId).delete()
  await chatDb.sessions.update(sessionId, {
    messageCount: 0,
    updatedAt: Date.now(),
  })
}
