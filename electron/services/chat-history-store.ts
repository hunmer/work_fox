import { join } from 'path'
import { app } from 'electron'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs'

const userDataPath = app.getPath('userData')

interface ChatSession {
  id: string
  title: string
  scope: string
  workflowId?: string | null
  browserViewId: string | null
  modelId: string
  providerId: string
  createdAt: number
  updatedAt: number
  messageCount: number
}

interface ChatMessage {
  id: string
  sessionId: string
  role: string
  content: string
  toolCalls?: any[]
  toolResult?: unknown
  thinkingBlocks?: any[]
  images?: string[]
  modelId?: string
  usage?: { inputTokens: number; outputTokens: number }
  createdAt: number
}

const MAX_MESSAGES_PER_SESSION = 5000

function historysDir(workflowId: string): string {
  return join(userDataPath, 'agent-workflows', workflowId, 'historys')
}

function sessionFilePath(workflowId: string, sessionId: string): string {
  return join(historysDir(workflowId), `${sessionId}.json`)
}

function ensureHistorysDir(workflowId: string): void {
  const dir = historysDir(workflowId)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

interface SessionFile {
  session: ChatSession
  messages: ChatMessage[]
}

// ===== 会话 CRUD =====

export function listSessions(workflowId: string): ChatSession[] {
  const dir = historysDir(workflowId)
  if (!existsSync(dir)) return []
  const sessions: ChatSession[] = []
  for (const file of readdirSync(dir).filter(f => f.endsWith('.json'))) {
    try {
      const data: SessionFile = JSON.parse(readFileSync(join(dir, file), 'utf-8'))
      sessions.push(data.session)
    } catch { /* skip corrupted */ }
  }
  return sessions.sort((a, b) => b.updatedAt - a.updatedAt)
}

export function getSession(workflowId: string, sessionId: string): ChatSession | undefined {
  const path = sessionFilePath(workflowId, sessionId)
  if (!existsSync(path)) return undefined
  try {
    const data: SessionFile = JSON.parse(readFileSync(path, 'utf-8'))
    return data.session
  } catch { return undefined }
}

export function createSession(workflowId: string, session: ChatSession): ChatSession {
  ensureHistorysDir(workflowId)
  const file: SessionFile = { session, messages: [] }
  writeFileSync(sessionFilePath(workflowId, session.id), JSON.stringify(file, null, 2), 'utf-8')
  return session
}

export function updateSession(workflowId: string, sessionId: string, updates: Partial<ChatSession>): void {
  const path = sessionFilePath(workflowId, sessionId)
  if (!existsSync(path)) return
  const data: SessionFile = JSON.parse(readFileSync(path, 'utf-8'))
  data.session = { ...data.session, ...updates }
  writeFileSync(path, JSON.stringify(data, null, 2), 'utf-8')
}

export function deleteSession(workflowId: string, sessionId: string): void {
  const path = sessionFilePath(workflowId, sessionId)
  if (existsSync(path)) unlinkSync(path)
}

// ===== 消息 CRUD =====

export function listMessages(workflowId: string, sessionId: string): ChatMessage[] {
  const path = sessionFilePath(workflowId, sessionId)
  if (!existsSync(path)) return []
  try {
    const data: SessionFile = JSON.parse(readFileSync(path, 'utf-8'))
    return (data.messages || []).sort((a, b) => a.createdAt - b.createdAt)
  } catch { return [] }
}

export function addMessage(workflowId: string, sessionId: string, message: ChatMessage): ChatMessage {
  const path = sessionFilePath(workflowId, sessionId)
  let data: SessionFile
  if (existsSync(path)) {
    data = JSON.parse(readFileSync(path, 'utf-8'))
  } else {
    data = {
      session: {
        id: sessionId, title: '新对话', scope: 'workflow', workflowId,
        browserViewId: null, modelId: '', providerId: '',
        createdAt: Date.now(), updatedAt: Date.now(), messageCount: 0,
      },
      messages: [],
    }
    ensureHistorysDir(workflowId)
  }
  data.messages.push(message)

  // 超过上限删除最早的消息
  if (data.messages.length > MAX_MESSAGES_PER_SESSION) {
    data.messages = data.messages
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(data.messages.length - MAX_MESSAGES_PER_SESSION)
  }

  data.session.updatedAt = Date.now()
  data.session.messageCount = data.messages.length
  writeFileSync(path, JSON.stringify(data, null, 2), 'utf-8')
  return message
}

export function updateMessage(workflowId: string, sessionId: string, messageId: string, updates: Partial<ChatMessage>): void {
  const path = sessionFilePath(workflowId, sessionId)
  if (!existsSync(path)) return
  const data: SessionFile = JSON.parse(readFileSync(path, 'utf-8'))
  const idx = data.messages.findIndex((m) => m.id === messageId)
  if (idx !== -1) {
    data.messages[idx] = { ...data.messages[idx], ...updates }
    writeFileSync(path, JSON.stringify(data, null, 2), 'utf-8')
  }
}

export function deleteMessage(workflowId: string, sessionId: string, messageId: string): void {
  const path = sessionFilePath(workflowId, sessionId)
  if (!existsSync(path)) return
  const data: SessionFile = JSON.parse(readFileSync(path, 'utf-8'))
  data.messages = data.messages.filter((m) => m.id !== messageId)
  data.session.messageCount = data.messages.length
  data.session.updatedAt = Date.now()
  writeFileSync(path, JSON.stringify(data, null, 2), 'utf-8')
}

export function deleteMessages(workflowId: string, sessionId: string, messageIds: string[]): void {
  if (!messageIds.length) return
  const path = sessionFilePath(workflowId, sessionId)
  if (!existsSync(path)) return
  const data: SessionFile = JSON.parse(readFileSync(path, 'utf-8'))
  const ids = new Set(messageIds)
  data.messages = data.messages.filter((m) => !ids.has(m.id))
  data.session.messageCount = data.messages.length
  data.session.updatedAt = Date.now()
  writeFileSync(path, JSON.stringify(data, null, 2), 'utf-8')
}

export function clearMessages(workflowId: string, sessionId: string): void {
  const path = sessionFilePath(workflowId, sessionId)
  if (!existsSync(path)) return
  const data: SessionFile = JSON.parse(readFileSync(path, 'utf-8'))
  data.messages = []
  data.session.messageCount = 0
  data.session.updatedAt = Date.now()
  writeFileSync(path, JSON.stringify(data, null, 2), 'utf-8')
}
