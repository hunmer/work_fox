# Backend WS 通道扩展实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有 backend 中新增 aiProvider、chatHistory、agentSettings、shortcut、tabs、fs、app:getVersion 等 WS 通道，使浏览器前端能通过 `wsBridge.invoke()` 完成数据存取。

**Architecture:** 遵循 `backend/ws/storage-channels.ts` 已有模式：每个 domain 创建一个 `register*Channels(router, services)` 函数，在 `backend/main.ts` 中注册。数据持久化使用 `backend/storage/json-store.ts`。

**Tech Stack:** Node.js, TypeScript, WS (WebSocket)

**Spec:** `docs/superpowers/specs/2026-04-22-web-mode-design.md`

**Depends on:** Plan 1（Web 基础设施）中的 BrowserAPIAdapter 定义了这些 channel 名称

---

## 文件变更清单

| 操作 | 文件 | 职责 |
|------|------|------|
| Create | `backend/storage/ai-provider-store.ts` | AI Provider 配置持久化 |
| Create | `backend/storage/chat-history-store.ts` | Chat 会话/消息持久化 |
| Create | `backend/storage/agent-settings-store.ts` | Agent 全局设置持久化 |
| Create | `backend/storage/shortcut-store.ts` | 快捷键配置持久化 |
| Create | `backend/storage/tab-store.ts` | 标签页状态持久化 |
| Create | `backend/ws/app-channels.ts` | aiProvider/chatHistory/agentSettings/shortcut/tabs/app channel 注册 |
| Create | `backend/ws/fs-channels.ts` | fs:* channel 注册（服务端文件系统代理） |
| Modify | `shared/channel-contracts.ts` | 新增 channel 类型契约 |
| Modify | `backend/main.ts` | 注册新 channel |
| Modify | `backend/storage/paths.ts` | 新增数据目录路径 |

---

### Task 1: 扩展 shared/channel-contracts.ts

**Files:**
- Modify: `shared/channel-contracts.ts`

- [ ] **Step 1: 在 BackendChannelMap 末尾添加新 channel 契约**

在 `BackendChannelMap` 接口的 `}` 之前（即 `'plugin:save-config'` 行之后）添加：

```typescript
  // --- AI Provider ---
  'aiProvider:list': ChannelContract<EmptyRequest, AIProviderEntry[]>
  'aiProvider:create': ChannelContract<{ data: Omit<AIProviderEntry, 'id'> }, AIProviderEntry>
  'aiProvider:update': ChannelContract<{ id: string; data: Partial<Omit<AIProviderEntry, 'id'>> }, EmptyResponse>
  'aiProvider:delete': ChannelContract<{ id: string }, { success: boolean }>
  'aiProvider:test': ChannelContract<{ id: string }, { success: boolean; error?: string }>

  // --- Chat History ---
  'chatHistory:listSessions': ChannelContract<{ workflowId: string }, any[]>
  'chatHistory:createSession': ChannelContract<{ workflowId: string; session: any }, any>
  'chatHistory:updateSession': ChannelContract<{ workflowId: string; sessionId: string; updates: any }, EmptyResponse>
  'chatHistory:deleteSession': ChannelContract<{ workflowId: string; sessionId: string }, EmptyResponse>
  'chatHistory:listMessages': ChannelContract<{ workflowId: string; sessionId: string }, any[]>
  'chatHistory:addMessage': ChannelContract<{ workflowId: string; sessionId: string; message: any }, any>
  'chatHistory:updateMessage': ChannelContract<{ workflowId: string; sessionId: string; messageId: string; updates: any }, EmptyResponse>
  'chatHistory:deleteMessage': ChannelContract<{ workflowId: string; sessionId: string; messageId: string }, EmptyResponse>
  'chatHistory:deleteMessages': ChannelContract<{ workflowId: string; sessionId: string; messageIds: string[] }, EmptyResponse>
  'chatHistory:clearMessages': ChannelContract<{ workflowId: string; sessionId: string }, EmptyResponse>

  // --- Agent Settings ---
  'agentSettings:get': ChannelContract<EmptyRequest, any>
  'agentSettings:set': ChannelContract<{ settings: any }, any>

  // --- Shortcut ---
  'shortcut:list': ChannelContract<EmptyRequest, { groups: any[]; shortcuts: any[] }>
  'shortcut:update': ChannelContract<{ id: string; accelerator: string; isGlobal: boolean; enabled?: boolean }, EmptyResponse>
  'shortcut:toggle': ChannelContract<{ id: string; enabled: boolean }, EmptyResponse>
  'shortcut:clear': ChannelContract<{ id: string }, EmptyResponse>
  'shortcut:reset': ChannelContract<EmptyRequest, EmptyResponse>

  // --- Tabs ---
  'tabs:load': ChannelContract<EmptyRequest, { tabs: any[]; activeTabId: string | null }>
  'tabs:save': ChannelContract<{ tabs: any[]; activeTabId: string | null }, EmptyResponse>

  // --- App ---
  'app:getVersion': ChannelContract<EmptyRequest, { version: string }>

  // --- FS (server-side) ---
  'fs:listDir': ChannelContract<{ dirPath: string }, Array<{ name: string; path: string; type: 'file' | 'directory'; modifiedAt: string }>>
  'fs:delete': ChannelContract<{ targetPath: string }, { success: boolean; error?: string }>
  'fs:createFile': ChannelContract<{ filePath: string }, { success: boolean; error?: string }>
  'fs:createDir': ChannelContract<{ dirPath: string }, { success: boolean; error?: string }>
  'fs:rename': ChannelContract<{ oldPath: string; newName: string }, { success: boolean; newPath?: string; error?: string }>

  // --- Chat (流式，P0 但 handler 在 Plan 3 实现) ---
  'chat:completions': ChannelContract<any, { started: boolean; requestId?: string }>
  'chat:abort': ChannelContract<{ requestId: string }, { aborted: boolean }>

  // --- Agent / Workflow Tool ---
  'agent:execTool': ChannelContract<{ toolType: string; params: Record<string, unknown>; targetTabId?: string }, any>
  'workflowTool:respond': ChannelContract<{ requestId: string; result: unknown }, { resolved: boolean }>
```

同时在文件顶部添加 `AIProviderEntry` 接口：

```typescript
export interface AIProviderEntry {
  id: string
  name: string
  apiBase: string
  apiKey: string
  models: Array<{ id: string; name: string }>
  enabled?: boolean
}
```

- [ ] **Step 2: 验证 backend 编译**

```bash
cd G:/programming/nodejs/work_fox && pnpm build:backend
```

Expected: 编译成功（channel 类型扩展不会破坏已有代码）。

- [ ] **Step 3: Commit**

```bash
git add shared/channel-contracts.ts
git commit -m "feat(shared): add channel contracts for web mode backend channels"
```

---

### Task 2: 创建 AI Provider Store

**Files:**
- Create: `backend/storage/ai-provider-store.ts`

- [ ] **Step 1: 创建 store**

读取 `backend/storage/json-store.ts` 了解基础 store 模式。然后创建：

```typescript
// backend/storage/ai-provider-store.ts
import { join } from 'node:path'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import type { AIProviderEntry } from '../../shared/channel-contracts'

export class BackendAIProviderStore {
  private filePath: string
  private cache: AIProviderEntry[] | null = null

  constructor(dataDir: string) {
    this.filePath = join(dataDir, 'ai-providers.json')
  }

  async list(): Promise<AIProviderEntry[]> {
    return this.load()
  }

  async create(data: Omit<AIProviderEntry, 'id'>): Promise<AIProviderEntry> {
    const providers = await this.load()
    const entry: AIProviderEntry = { ...data, id: crypto.randomUUID() }
    providers.push(entry)
    await this.save(providers)
    return entry
  }

  async update(id: string, data: Partial<Omit<AIProviderEntry, 'id'>>): Promise<void> {
    const providers = await this.load()
    const idx = providers.findIndex((p) => p.id === id)
    if (idx === -1) throw new Error(`Provider not found: ${id}`)
    providers[idx] = { ...providers[idx], ...data }
    await this.save(providers)
  }

  async delete(id: string): Promise<boolean> {
    const providers = await this.load()
    const idx = providers.findIndex((p) => p.id === id)
    if (idx === -1) return false
    providers.splice(idx, 1)
    await this.save(providers)
    return true
  }

  async get(id: string): Promise<AIProviderEntry | undefined> {
    const providers = await this.load()
    return providers.find((p) => p.id === id)
  }

  private async load(): Promise<AIProviderEntry[]> {
    if (this.cache) return this.cache
    try {
      const raw = await readFile(this.filePath, 'utf-8')
      this.cache = JSON.parse(raw)
      return this.cache!
    } catch {
      this.cache = []
      return []
    }
  }

  private async save(providers: AIProviderEntry[]): Promise<void> {
    await mkdir(join(this.filePath, '..'), { recursive: true })
    await writeFile(this.filePath, JSON.stringify(providers, null, 2), 'utf-8')
    this.cache = providers
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/storage/ai-provider-store.ts
git commit -m "feat(backend): add AI provider store for web mode"
```

---

### Task 3: 创建 Chat History Store

**Files:**
- Create: `backend/storage/chat-history-store.ts`

- [ ] **Step 1: 创建 store**

```typescript
// backend/storage/chat-history-store.ts
import { join } from 'node:path'
import { readFile, writeFile, mkdir } from 'node:fs/promises'

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
  [key: string]: unknown
}

interface ChatMessage {
  id: string
  sessionId: string
  role: string
  content: string
  createdAt: number
  [key: string]: unknown
}

interface WorkflowChatData {
  sessions: ChatSession[]
  messages: ChatMessage[]
}

export class BackendChatHistoryStore {
  private dataDir: string
  private cache = new Map<string, WorkflowChatData>()

  constructor(dataDir: string) {
    this.dataDir = join(dataDir, 'chat-history')
  }

  async listSessions(workflowId: string): Promise<ChatSession[]> {
    const data = await this.load(workflowId)
    return data.sessions
  }

  async createSession(workflowId: string, session: any): Promise<ChatSession> {
    const data = await this.load(workflowId)
    const entry: ChatSession = { ...session, id: session.id || crypto.randomUUID() }
    data.sessions.push(entry)
    await this.save(workflowId, data)
    return entry
  }

  async updateSession(workflowId: string, sessionId: string, updates: any): Promise<void> {
    const data = await this.load(workflowId)
    const idx = data.sessions.findIndex((s) => s.id === sessionId)
    if (idx === -1) return
    data.sessions[idx] = { ...data.sessions[idx], ...updates, updatedAt: Date.now() }
    await this.save(workflowId, data)
  }

  async deleteSession(workflowId: string, sessionId: string): Promise<void> {
    const data = await this.load(workflowId)
    data.sessions = data.sessions.filter((s) => s.id !== sessionId)
    data.messages = data.messages.filter((m) => m.sessionId !== sessionId)
    await this.save(workflowId, data)
  }

  async listMessages(workflowId: string, sessionId: string): Promise<ChatMessage[]> {
    const data = await this.load(workflowId)
    return data.messages.filter((m) => m.sessionId === sessionId)
  }

  async addMessage(workflowId: string, sessionId: string, message: any): Promise<ChatMessage> {
    const data = await this.load(workflowId)
    const entry: ChatMessage = { ...message, id: message.id || crypto.randomUUID(), sessionId }
    data.messages.push(entry)
    const session = data.sessions.find((s) => s.id === sessionId)
    if (session) session.messageCount = (session.messageCount || 0) + 1
    await this.save(workflowId, data)
    return entry
  }

  async updateMessage(workflowId: string, sessionId: string, messageId: string, updates: any): Promise<void> {
    const data = await this.load(workflowId)
    const idx = data.messages.findIndex((m) => m.id === messageId)
    if (idx === -1) return
    data.messages[idx] = { ...data.messages[idx], ...updates }
    await this.save(workflowId, data)
  }

  async deleteMessage(workflowId: string, sessionId: string, messageId: string): Promise<void> {
    const data = await this.load(workflowId)
    data.messages = data.messages.filter((m) => m.id !== messageId)
    await this.save(workflowId, data)
  }

  async deleteMessages(workflowId: string, sessionId: string, messageIds: string[]): Promise<void> {
    const data = await this.load(workflowId)
    const idSet = new Set(messageIds)
    data.messages = data.messages.filter((m) => !idSet.has(m.id))
    await this.save(workflowId, data)
  }

  async clearMessages(workflowId: string, sessionId: string): Promise<void> {
    const data = await this.load(workflowId)
    data.messages = data.messages.filter((m) => m.sessionId !== sessionId)
    const session = data.sessions.find((s) => s.id === sessionId)
    if (session) session.messageCount = 0
    await this.save(workflowId, data)
  }

  private async load(workflowId: string): Promise<WorkflowChatData> {
    const cached = this.cache.get(workflowId)
    if (cached) return cached
    const filePath = join(this.dataDir, `${workflowId}.json`)
    try {
      const raw = await readFile(filePath, 'utf-8')
      const data = JSON.parse(raw) as WorkflowChatData
      this.cache.set(workflowId, data)
      return data
    } catch {
      const data: WorkflowChatData = { sessions: [], messages: [] }
      this.cache.set(workflowId, data)
      return data
    }
  }

  private async save(workflowId: string, data: WorkflowChatData): Promise<void> {
    await mkdir(this.dataDir, { recursive: true })
    const filePath = join(this.dataDir, `${workflowId}.json`)
    await writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8')
    this.cache.set(workflowId, data)
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/storage/chat-history-store.ts
git commit -m "feat(backend): add chat history store for web mode"
```

---

### Task 4: 创建 Settings Store（agentSettings + shortcut + tabs）

**Files:**
- Create: `backend/storage/settings-store.ts`

- [ ] **Step 1: 创建通用 JSON settings store**

```typescript
// backend/storage/settings-store.ts
import { join } from 'node:path'
import { readFile, writeFile, mkdir } from 'node:fs/promises'

/**
 * 通用 JSON 文件存储，用于 agentSettings / shortcut / tabs 等简单配置。
 * 每个配置一个 JSON 文件。
 */
export class BackendSettingsStore<T = unknown> {
  private filePath: string
  private cache: T | null = null

  constructor(dataDir: string, filename: string) {
    this.filePath = join(dataDir, filename)
  }

  async get(): Promise<T> {
    if (this.cache !== null) return this.cache
    try {
      const raw = await readFile(this.filePath, 'utf-8')
      this.cache = JSON.parse(raw) as T
      return this.cache!
    } catch {
      return {} as T
    }
  }

  async set(data: T): Promise<T> {
    await mkdir(join(this.filePath, '..'), { recursive: true })
    await writeFile(this.filePath, JSON.stringify(data, null, 2), 'utf-8')
    this.cache = data
    return data
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/storage/settings-store.ts
git commit -m "feat(backend): add generic settings store for web mode"
```

---

### Task 5: 创建 app-channels.ts

**Files:**
- Create: `backend/ws/app-channels.ts`

- [ ] **Step 1: 创建 channel 注册函数**

```typescript
// backend/ws/app-channels.ts
import type { WSRouter } from './router'
import { BackendAIProviderStore } from '../storage/ai-provider-store'
import { BackendChatHistoryStore } from '../storage/chat-history-store'
import { BackendSettingsStore } from '../storage/settings-store'
import { readdir, stat, mkdir, rename, unlink, writeFile as writeFileAsync } from 'node:fs/promises'
import { join, dirname, basename } from 'node:path'

export interface AppServices {
  aiProviderStore: BackendAIProviderStore
  chatHistoryStore: BackendChatHistoryStore
  agentSettingsStore: BackendSettingsStore
  shortcutStore: BackendSettingsStore<{ groups: any[]; shortcuts: any[] }>
  tabStore: BackendSettingsStore<{ tabs: any[]; activeTabId: string | null }>
  appVersion: string
}

export function registerAppChannels(router: WSRouter, services: AppServices): void {
  const { aiProviderStore, chatHistoryStore, agentSettingsStore, shortcutStore, tabStore, appVersion } = services

  // --- AI Provider ---
  router.register('aiProvider:list', async () => aiProviderStore.list())
  router.register('aiProvider:create', async ({ data }) => aiProviderStore.create(data))
  router.register('aiProvider:update', async ({ id, data }) => {
    await aiProviderStore.update(id, data)
    return undefined
  })
  router.register('aiProvider:delete', async ({ id }) => ({ success: await aiProviderStore.delete(id) }))
  router.register('aiProvider:test', async ({ id }) => {
    const provider = await aiProviderStore.get(id)
    if (!provider) return { success: false, error: `Provider not found: ${id}` }
    try {
      const resp = await fetch(`${provider.apiBase}/models`, {
        headers: { 'Authorization': `Bearer ${provider.apiKey}` },
        signal: AbortSignal.timeout(10_000),
      })
      return { success: resp.ok }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // --- Chat History ---
  router.register('chatHistory:listSessions', ({ workflowId }) => chatHistoryStore.listSessions(workflowId))
  router.register('chatHistory:createSession', ({ workflowId, session }) => chatHistoryStore.createSession(workflowId, session))
  router.register('chatHistory:updateSession', ({ workflowId, sessionId, updates }) => {
    chatHistoryStore.updateSession(workflowId, sessionId, updates)
    return undefined
  })
  router.register('chatHistory:deleteSession', ({ workflowId, sessionId }) => {
    chatHistoryStore.deleteSession(workflowId, sessionId)
    return undefined
  })
  router.register('chatHistory:listMessages', ({ workflowId, sessionId }) => chatHistoryStore.listMessages(workflowId, sessionId))
  router.register('chatHistory:addMessage', ({ workflowId, sessionId, message }) => chatHistoryStore.addMessage(workflowId, sessionId, message))
  router.register('chatHistory:updateMessage', ({ workflowId, sessionId, messageId, updates }) => {
    chatHistoryStore.updateMessage(workflowId, sessionId, messageId, updates)
    return undefined
  })
  router.register('chatHistory:deleteMessage', ({ workflowId, sessionId, messageId }) => {
    chatHistoryStore.deleteMessage(workflowId, sessionId, messageId)
    return undefined
  })
  router.register('chatHistory:deleteMessages', ({ workflowId, sessionId, messageIds }) => {
    chatHistoryStore.deleteMessages(workflowId, sessionId, messageIds)
    return undefined
  })
  router.register('chatHistory:clearMessages', ({ workflowId, sessionId }) => {
    chatHistoryStore.clearMessages(workflowId, sessionId)
    return undefined
  })

  // --- Agent Settings ---
  router.register('agentSettings:get', () => agentSettingsStore.get())
  router.register('agentSettings:set', ({ settings }) => agentSettingsStore.set(settings))

  // --- Shortcut ---
  router.register('shortcut:list', () => shortcutStore.get())
  router.register('shortcut:update', async ({ id, accelerator, isGlobal, enabled }) => {
    const data = await shortcutStore.get()
    const idx = (data.shortcuts || []).findIndex((s: any) => s.id === id)
    if (idx !== -1) {
      data.shortcuts[idx] = { ...data.shortcuts[idx], accelerator, isGlobal, enabled }
      await shortcutStore.set(data)
    }
    return undefined
  })
  router.register('shortcut:toggle', async ({ id, enabled }) => {
    const data = await shortcutStore.get()
    const idx = (data.shortcuts || []).findIndex((s: any) => s.id === id)
    if (idx !== -1) {
      data.shortcuts[idx] = { ...data.shortcuts[idx], enabled }
      await shortcutStore.set(data)
    }
    return undefined
  })
  router.register('shortcut:clear', async ({ id }) => {
    const data = await shortcutStore.get()
    const idx = (data.shortcuts || []).findIndex((s: any) => s.id === id)
    if (idx !== -1) {
      data.shortcuts[idx] = { ...data.shortcuts[idx], accelerator: '', isGlobal: false }
      await shortcutStore.set(data)
    }
    return undefined
  })
  router.register('shortcut:reset', async () => {
    await shortcutStore.set({ groups: [], shortcuts: [] })
    return undefined
  })

  // --- Tabs ---
  router.register('tabs:load', () => tabStore.get())
  router.register('tabs:save', ({ tabs, activeTabId }) => tabStore.set({ tabs, activeTabId }))

  // --- App Version ---
  router.register('app:getVersion', () => ({ version: appVersion }))
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/ws/app-channels.ts
git commit -m "feat(backend): add app channel handlers for provider/chatHistory/settings"
```

---

### Task 6: 创建 fs-channels.ts

**Files:**
- Create: `backend/ws/fs-channels.ts`

- [ ] **Step 1: 创建文件系统 channel**

```typescript
// backend/ws/fs-channels.ts
import type { WSRouter } from './router'
import { readdir, stat, mkdir, rename, unlink, writeFile } from 'node:fs/promises'
import { join, dirname, basename } from 'node:path'

export function registerFsChannels(router: WSRouter): void {
  router.register('fs:listDir', async ({ dirPath }) => {
    const entries = await readdir(dirPath)
    const results = await Promise.all(
      entries.map(async (name) => {
        const fullPath = join(dirPath, name)
        try {
          const s = await stat(fullPath)
          return {
            name,
            path: fullPath,
            type: s.isDirectory() ? 'directory' as const : 'file' as const,
            modifiedAt: s.mtime.toISOString(),
          }
        } catch {
          return null
        }
      }),
    )
    return results.filter(Boolean)
  })

  router.register('fs:delete', async ({ targetPath }) => {
    try {
      await unlink(targetPath)
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  router.register('fs:createFile', async ({ filePath }) => {
    try {
      await mkdir(dirname(filePath), { recursive: true })
      await writeFile(filePath, '', 'utf-8')
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  router.register('fs:createDir', async ({ dirPath }) => {
    try {
      await mkdir(dirPath, { recursive: true })
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  router.register('fs:rename', async ({ oldPath, newName }) => {
    try {
      const newPath = join(dirname(oldPath), newName)
      await rename(oldPath, newPath)
      return { success: true, newPath }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/ws/fs-channels.ts
git commit -m "feat(backend): add fs channel handlers for web mode file operations"
```

---

### Task 7: 在 backend/main.ts 中注册新 channels

**Files:**
- Modify: `backend/main.ts`

- [ ] **Step 1: 导入新模块**

在 `import { registerExecutionChannels }` 行之后添加：

```typescript
import { BackendAIProviderStore } from './storage/ai-provider-store'
import { BackendChatHistoryStore } from './storage/chat-history-store'
import { BackendSettingsStore } from './storage/settings-store'
import { registerAppChannels, type AppServices } from './ws/app-channels'
import { registerFsChannels } from './ws/fs-channels'
```

- [ ] **Step 2: 实例化新 stores**

在 `const plugins = new BackendPluginRegistry(...)` 行之后添加：

```typescript
  const aiProviderStore = new BackendAIProviderStore(paths.dataDir)
  const chatHistoryStore = new BackendChatHistoryStore(paths.dataDir)
  const agentSettingsStore = new BackendSettingsStore(paths.dataDir, 'agent-settings.json')
  const shortcutStore = new BackendSettingsStore(paths.dataDir, 'shortcuts.json')
  const tabStore = new BackendSettingsStore(paths.dataDir, 'tabs.json')
```

- [ ] **Step 3: 注册新 channels**

在 `registerExecutionChannels(...)` 行之后添加：

```typescript
  registerAppChannels(backend.router, {
    aiProviderStore,
    chatHistoryStore,
    agentSettingsStore,
    shortcutStore,
    tabStore,
    appVersion: config.version ?? '0.0.12',
  })
  registerFsChannels(backend.router)
```

- [ ] **Step 4: 验证 backend 编译和启动**

```bash
cd G:/programming/nodejs/work_fox && pnpm build:backend && pnpm smoke:backend
```

Expected: 编译成功，smoke 测试通过。

- [ ] **Step 5: Commit**

```bash
git add backend/main.ts
git commit -m "feat(backend): register app and fs channels in main"
```

---

### Task 8: 集成验证

- [ ] **Step 1: 启动 backend，手动测试 WS channel**

```bash
cd G:/programming/nodejs/work_fox && pnpm build:backend && node out/backend/main.js
```

使用 `ws` 客户端或浏览器控制台测试：

```javascript
// 浏览器控制台
const ws = new WebSocket('ws://localhost:3001/ws')
ws.onopen = () => {
  ws.send(JSON.stringify({ id: '1', channel: 'app:getVersion', type: 'request', data: undefined }))
}
ws.onmessage = (e) => console.log(JSON.parse(e.data))
```

Expected: 收到 `{ id: '1', channel: 'app:getVersion', type: 'response', data: { version: '0.0.12' } }`

- [ ] **Step 2: 测试 aiProvider CRUD**

```javascript
ws.send(JSON.stringify({ id: '2', channel: 'aiProvider:list', type: 'request', data: undefined }))
// 然后
ws.send(JSON.stringify({ id: '3', channel: 'aiProvider:create', type: 'request', data: { data: { name: 'test', apiBase: 'https://api.example.com', apiKey: 'key', models: [] } } }))
```

Expected: 创建后 list 返回包含新 provider 的数组。

---

## 验收标准

- [ ] `pnpm build:backend` 编译成功
- [ ] `pnpm smoke:backend` 通过
- [ ] `app:getVersion` WS channel 返回正确版本号
- [ ] `aiProvider:*` CRUD 完整工作
- [ ] `chatHistory:*` CRUD 完整工作
- [ ] `agentSettings:get/set` 完整工作
- [ ] `shortcut:*` 完整工作
- [ ] `tabs:*` 完整工作
- [ ] `fs:listDir/createDir/createFile` 完整工作
