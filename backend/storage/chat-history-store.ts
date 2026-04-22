import { join } from 'node:path'
import { readFile, writeFile, mkdir } from 'node:fs/promises'

export interface ChatSession {
  id: string
  title: string
  createdAt: number
  updatedAt: number
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

export class BackendChatHistoryStore {
  private cache = new Map<string, ChatHistoryFile>()

  constructor(private userDataDir: string) {}

  private filePath(workflowId: string): string {
    return join(this.userDataDir, 'chat-history', `${workflowId}.json`)
  }

  private async load(workflowId: string): Promise<ChatHistoryFile> {
    const cached = this.cache.get(workflowId)
    if (cached) return cached
    try {
      const raw = await readFile(this.filePath(workflowId), 'utf-8')
      const data = JSON.parse(raw) as ChatHistoryFile
      this.cache.set(workflowId, data)
      return data
    } catch {
      const data: ChatHistoryFile = { sessions: [], messages: [] }
      this.cache.set(workflowId, data)
      return data
    }
  }

  private async save(workflowId: string, data: ChatHistoryFile): Promise<void> {
    const fp = this.filePath(workflowId)
    await mkdir(join(fp, '..'), { recursive: true })
    await writeFile(fp, JSON.stringify(data, null, 2), 'utf-8')
    this.cache.set(workflowId, data)
  }

  // --- Sessions ---

  async listSessions(workflowId: string): Promise<ChatSession[]> {
    const data = await this.load(workflowId)
    return data.sessions
  }

  async createSession(workflowId: string, session: ChatSession): Promise<ChatSession> {
    const data = await this.load(workflowId)
    data.sessions.push(session)
    await this.save(workflowId, data)
    return session
  }

  async updateSession(workflowId: string, sessionId: string, updates: Partial<ChatSession>): Promise<void> {
    const data = await this.load(workflowId)
    const idx = data.sessions.findIndex((s) => s.id === sessionId)
    if (idx === -1) throw new Error(`Session not found: ${sessionId}`)
    data.sessions[idx] = { ...data.sessions[idx], ...updates }
    await this.save(workflowId, data)
  }

  async deleteSession(workflowId: string, sessionId: string): Promise<void> {
    const data = await this.load(workflowId)
    data.sessions = data.sessions.filter((s) => s.id !== sessionId)
    data.messages = data.messages.filter((m) => m.sessionId !== sessionId)
    await this.save(workflowId, data)
  }

  // --- Messages ---

  async listMessages(workflowId: string, sessionId: string): Promise<ChatMessage[]> {
    const data = await this.load(workflowId)
    return data.messages.filter((m) => m.sessionId === sessionId)
  }

  async addMessage(workflowId: string, sessionId: string, message: ChatMessage): Promise<ChatMessage> {
    const data = await this.load(workflowId)
    data.messages.push(message)
    await this.save(workflowId, data)
    return message
  }

  async updateMessage(
    workflowId: string,
    sessionId: string,
    messageId: string,
    updates: Partial<ChatMessage>,
  ): Promise<void> {
    const data = await this.load(workflowId)
    const idx = data.messages.findIndex((m) => m.id === messageId && m.sessionId === sessionId)
    if (idx === -1) throw new Error(`Message not found: ${messageId}`)
    data.messages[idx] = { ...data.messages[idx], ...updates }
    await this.save(workflowId, data)
  }

  async deleteMessage(workflowId: string, sessionId: string, messageId: string): Promise<void> {
    const data = await this.load(workflowId)
    data.messages = data.messages.filter((m) => !(m.id === messageId && m.sessionId === sessionId))
    await this.save(workflowId, data)
  }

  async deleteMessages(workflowId: string, sessionId: string, messageIds: string[]): Promise<void> {
    const idSet = new Set(messageIds)
    const data = await this.load(workflowId)
    data.messages = data.messages.filter((m) => !(m.sessionId === sessionId && idSet.has(m.id)))
    await this.save(workflowId, data)
  }

  async clearMessages(workflowId: string, sessionId: string): Promise<void> {
    const data = await this.load(workflowId)
    data.messages = data.messages.filter((m) => m.sessionId !== sessionId)
    await this.save(workflowId, data)
  }
}
