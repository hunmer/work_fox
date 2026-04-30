import { join } from 'node:path'
import { readFile, writeFile, mkdir, readdir, rename } from 'node:fs/promises'

export interface ChatSession {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  messageCount?: number
  [key: string]: unknown
}

export interface ChatMessage {
  id: string
  sessionId: string
  role: string
  content: string
  createdAt: number
  [key: string]: unknown
}

interface ChatHistoryFile {
  sessions: ChatSession[]
  messages: ChatMessage[]
}

const MAX_MESSAGES_PER_SESSION = 5000

export class BackendChatHistoryStore {
  private cache = new Map<string, ChatHistoryFile>()

  constructor(private userDataDir: string) {
    this.migrateLegacyFiles()
  }

  private filePath(scopeKey: string): string {
    return join(this.userDataDir, 'chat-history', `${scopeKey}.json`)
  }

  private chatHistoryDir(): string {
    return join(this.userDataDir, 'chat-history')
  }

  getPath(scopeKey: string): string {
    return this.filePath(scopeKey)
  }

  /** 将旧格式文件（纯 UUID 名，无 workflow- 前缀）重命名为新格式 */
  private async migrateLegacyFiles(): Promise<void> {
    try {
      const dir = this.chatHistoryDir()
      const files = await readdir(dir)
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.json$/i
      for (const file of files) {
        if (uuidPattern.test(file)) {
          const oldPath = join(dir, file)
          const newName = `workflow-${file}`
          const newPath = join(dir, newName)
          await rename(oldPath, newPath).catch(() => {})
        }
      }
    } catch {
      // directory doesn't exist yet, nothing to migrate
    }
  }

  private async load(scopeKey: string): Promise<ChatHistoryFile> {
    const cached = this.cache.get(scopeKey)
    if (cached) return cached
    try {
      const raw = await readFile(this.filePath(scopeKey), 'utf-8')
      const data = JSON.parse(raw) as ChatHistoryFile
      data.sessions = (data.sessions ?? []).filter(Boolean)
      data.messages = (data.messages ?? []).filter(Boolean)
      this.cache.set(scopeKey, data)
      return data
    } catch {
      const data: ChatHistoryFile = { sessions: [], messages: [] }
      this.cache.set(scopeKey, data)
      return data
    }
  }

  private async save(scopeKey: string, data: ChatHistoryFile): Promise<void> {
    const fp = this.filePath(scopeKey)
    await mkdir(join(fp, '..'), { recursive: true })
    await writeFile(fp, JSON.stringify(data, null, 2), 'utf-8')
    this.cache.set(scopeKey, data)
  }

  // --- Scope Key Discovery ---

  async listAllScopeKeys(): Promise<string[]> {
    try {
      const dir = this.chatHistoryDir()
      const files = await readdir(dir)
      return files
        .filter(f => f.endsWith('.json'))
        .map(f => f.slice(0, -5)) // remove .json
    } catch {
      return []
    }
  }

  // --- Import (for migration) ---

  async importData(scopeKey: string, incoming: ChatHistoryFile): Promise<void> {
    const data = await this.load(scopeKey)
    const existingSessionIds = new Set(data.sessions.map(s => s.id))
    const existingMessageIds = new Set(data.messages.map(m => m.id))

    for (const session of (incoming.sessions ?? [])) {
      if (!existingSessionIds.has(session.id)) {
        data.sessions.push(session)
      }
    }
    for (const message of (incoming.messages ?? [])) {
      if (!existingMessageIds.has(message.id)) {
        data.messages.push(message)
      }
    }

    await this.save(scopeKey, data)
  }

  // --- Sessions ---

  async listSessions(scopeKey: string): Promise<ChatSession[]> {
    const data = await this.load(scopeKey)
    return data.sessions
  }

  async createSession(scopeKey: string, session: ChatSession): Promise<ChatSession> {
    const data = await this.load(scopeKey)
    data.sessions.push(session)
    await this.save(scopeKey, data)
    return session
  }

  async updateSession(scopeKey: string, sessionId: string, updates: Partial<ChatSession>): Promise<void> {
    const data = await this.load(scopeKey)
    const idx = data.sessions.findIndex((s) => s.id === sessionId)
    if (idx === -1) throw new Error(`Session not found: ${sessionId}`)
    data.sessions[idx] = { ...data.sessions[idx], ...updates }
    await this.save(scopeKey, data)
  }

  async deleteSession(scopeKey: string, sessionId: string): Promise<void> {
    const data = await this.load(scopeKey)
    data.sessions = data.sessions.filter((s) => s.id !== sessionId)
    data.messages = data.messages.filter((m) => m.sessionId !== sessionId)
    await this.save(scopeKey, data)
  }

  // --- Messages ---

  async listMessages(scopeKey: string, sessionId: string): Promise<ChatMessage[]> {
    const data = await this.load(scopeKey)
    return data.messages
      .filter((m) => m.sessionId === sessionId)
      .sort((a, b) => a.createdAt - b.createdAt)
  }

  async addMessage(scopeKey: string, sessionId: string, message: ChatMessage): Promise<ChatMessage> {
    const data = await this.load(scopeKey)
    data.messages.push(message)

    // auto-update session messageCount and updatedAt
    const session = data.sessions.find(s => s.id === sessionId)
    if (session) {
      session.messageCount = (session.messageCount ?? 0) + 1
      session.updatedAt = Date.now()
    }

    // trim oldest messages if exceeding limit
    const sessionMsgs = data.messages.filter(m => m.sessionId === sessionId)
    if (sessionMsgs.length > MAX_MESSAGES_PER_SESSION) {
      const toRemove = sessionMsgs.length - MAX_MESSAGES_PER_SESSION
      const oldest = sessionMsgs
        .sort((a, b) => a.createdAt - b.createdAt)
        .slice(0, toRemove)
      const removeIds = new Set(oldest.map(m => m.id))
      data.messages = data.messages.filter(m => !removeIds.has(m.id))
    }

    await this.save(scopeKey, data)
    return message
  }

  async updateMessage(
    scopeKey: string,
    sessionId: string,
    messageId: string,
    updates: Partial<ChatMessage>,
  ): Promise<void> {
    const data = await this.load(scopeKey)
    const idx = data.messages.findIndex((m) => m.id === messageId && m.sessionId === sessionId)
    if (idx === -1) throw new Error(`Message not found: ${messageId}`)
    data.messages[idx] = { ...data.messages[idx], ...updates }
    await this.save(scopeKey, data)
  }

  async deleteMessage(scopeKey: string, sessionId: string, messageId: string): Promise<void> {
    const data = await this.load(scopeKey)
    data.messages = data.messages.filter((m) => !(m.id === messageId && m.sessionId === sessionId))

    // auto-update session messageCount
    const session = data.sessions.find(s => s.id === sessionId)
    if (session) {
      session.messageCount = Math.max(0, (session.messageCount ?? 1) - 1)
      session.updatedAt = Date.now()
    }

    await this.save(scopeKey, data)
  }

  async deleteMessages(scopeKey: string, sessionId: string, messageIds: string[]): Promise<void> {
    const idSet = new Set(messageIds)
    const data = await this.load(scopeKey)
    data.messages = data.messages.filter((m) => !(m.sessionId === sessionId && idSet.has(m.id)))

    // auto-update session messageCount
    const session = data.sessions.find(s => s.id === sessionId)
    if (session) {
      session.messageCount = Math.max(0, (session.messageCount ?? messageIds.length) - messageIds.length)
      session.updatedAt = Date.now()
    }

    await this.save(scopeKey, data)
  }

  async clearMessages(scopeKey: string, sessionId: string): Promise<void> {
    const data = await this.load(scopeKey)
    data.messages = data.messages.filter((m) => m.sessionId !== sessionId)

    // auto-update session messageCount
    const session = data.sessions.find(s => s.id === sessionId)
    if (session) {
      session.messageCount = 0
      session.updatedAt = Date.now()
    }

    await this.save(scopeKey, data)
  }
}
