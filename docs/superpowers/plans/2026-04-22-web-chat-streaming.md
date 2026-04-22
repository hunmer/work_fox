# Chat 流式推送实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Claude Agent SDK 的流式 Chat 能力从 Electron 主进程迁移到 backend，通过 WS 定向推送流式事件，使浏览器版能发送 Chat 消息并实时接收回复。

**Architecture:** 在 backend 中创建 `ChatRuntime`，封装 `@anthropic-ai/claude-agent-sdk` 的 `query()` API。流式事件通过 `ConnectionManager.sendToClient(clientId, event)` 定向推送到发起请求的客户端。事件名与 Electron 版完全一致（chat:chunk, chat:tool-call 等）。

**Tech Stack:** @anthropic-ai/claude-agent-sdk, Node.js, WS (WebSocket)

**Spec:** `docs/superpowers/specs/2026-04-22-web-mode-design.md`

**Depends on:** Plan 1（Web 基础设施）+ Plan 2（Backend channels 中的 aiProvider store）

---

## 文件变更清单

| 操作 | 文件 | 职责 |
|------|------|------|
| Create | `backend/chat/chat-runtime.ts` | Claude Agent SDK 封装（流式） |
| Create | `backend/chat/chat-event-sender.ts` | WS 事件推送封装 |
| Create | `backend/ws/chat-channels.ts` | chat:completions/abort channel 注册 |
| Modify | `backend/main.ts` | 注册 chat channels |
| Modify | `backend/app/config.ts` | 添加 chat 相关配置 |

---

### Task 1: 创建 chat-event-sender.ts

**Files:**
- Create: `backend/chat/chat-event-sender.ts`

这是最基础的模块——将 SDK 的流式事件转为 WS event 推送。

- [ ] **Step 1: 创建事件发送器**

```typescript
// backend/chat/chat-event-sender.ts
import type { ConnectionManager } from '../ws/connection-manager'

/** Chat 流式事件名（与 Electron ipcMain.send 一致） */
export type ChatEventChannel =
  | 'chat:chunk'
  | 'chat:tool-call'
  | 'chat:tool-call-args'
  | 'chat:tool-result'
  | 'chat:thinking'
  | 'chat:usage'
  | 'chat:done'
  | 'chat:error'
  | 'chat:retry'

/**
 * 将 Chat 流式事件定向推送给指定客户端。
 * 通过 ConnectionManager.sendToClient 实现，避免广播。
 */
export class ChatEventSender {
  constructor(
    private connections: ConnectionManager,
    private clientId: string,
  ) {}

  send(channel: ChatEventChannel, data: Record<string, unknown>): void {
    this.connections.sendToClient(this.clientId, {
      channel,
      type: 'event',
      data,
    })
  }

  chunk(requestId: string, token: string): void {
    this.send('chat:chunk', { requestId, token })
  }

  toolCall(requestId: string, toolCall: unknown): void {
    this.send('chat:tool-call', { requestId, toolCall })
  }

  toolCallArgs(requestId: string, toolUseId: string, args: Record<string, unknown>): void {
    this.send('chat:tool-call-args', { requestId, toolUseId, args })
  }

  toolResult(requestId: string, toolUseId: string, name: string, result: unknown): void {
    this.send('chat:tool-result', { requestId, toolUseId, name, result })
  }

  thinking(requestId: string, content: string, index: number): void {
    this.send('chat:thinking', { requestId, content, index })
  }

  usage(requestId: string, inputTokens: number, outputTokens: number): void {
    this.send('chat:usage', { requestId, inputTokens, outputTokens })
  }

  done(requestId: string, usage?: { inputTokens: number; outputTokens: number }): void {
    this.send('chat:done', { requestId, usage })
  }

  error(requestId: string, errorMessage: string): void {
    this.send('chat:error', { requestId, error: errorMessage })
  }

  retry(requestId: string, attempt: number, maxRetries: number, delayMs: number, status: number, error: string): void {
    this.send('chat:retry', { requestId, attempt, maxRetries, delayMs, status, error })
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/chat/chat-event-sender.ts
git commit -m "feat(backend): add ChatEventSender for WS streaming events"
```

---

### Task 2: 创建 chat-runtime.ts

**Files:**
- Create: `backend/chat/chat-runtime.ts`

这是核心——将 `claude-agent-runtime.ts` 的逻辑迁移为 backend 版本。

- [ ] **Step 1: 先读取 Electron 版了解事件发送模式**

读取 `electron/services/claude-agent-runtime.ts` 中 `query()` 的使用方式和事件映射逻辑。

- [ ] **Step 2: 创建 backend chat runtime**

```typescript
// backend/chat/chat-runtime.ts
import {
  query,
  AbortError,
  type Query,
} from '@anthropic-ai/claude-agent-sdk'
import { ChatEventSender } from './chat-event-sender'
import type { BackendAIProviderStore } from '../storage/ai-provider-store'
import type { Logger } from '../app/logger'

export interface ChatCompletionRequest {
  requestId: string
  providerId: string
  modelId: string
  system?: string
  messages: Array<{ role: string; content: string | Array<Record<string, unknown>> }>
  tools?: Array<Record<string, unknown>>
  stream: boolean
  maxTokens?: number
  thinking?: { type: 'enabled'; budgetTokens: number }
  enabledToolNames?: string[]
  runtime?: {
    cwd?: string
    additionalDirectories?: string[]
    permissionMode?: string
    allowedTools?: string[]
    extraInstructions?: string
    loadProjectClaudeMd?: boolean
    loadRuleMd?: boolean
    ruleFileNames?: string[]
    enabledPlugins?: string[]
  }
}

interface ActiveRequest {
  abortController: AbortController
}

export class ChatRuntime {
  private activeRequests = new Map<string, ActiveRequest>()
  private providerStore: BackendAIProviderStore
  private logger: Logger

  constructor(providerStore: BackendAIProviderStore, logger: Logger) {
    this.providerStore = providerStore
    this.logger = logger
  }

  async completions(
    request: ChatCompletionRequest,
    eventSender: ChatEventSender,
  ): Promise<{ started: boolean }> {
    const { requestId, providerId } = request

    // 获取 provider 配置（含 API key）
    const provider = await this.providerStore.get(providerId)
    if (!provider) {
      eventSender.error(requestId, `Provider not found: ${providerId}`)
      return { started: false }
    }
    if (!provider.apiKey) {
      eventSender.error(requestId, `Provider has no API key: ${providerId}`)
      return { started: false }
    }

    // 创建 AbortController
    const abortController = new AbortController()
    this.activeRequests.set(requestId, { abortController })

    // 异步执行流式查询
    this.runStream(request, provider, eventSender, abortController).catch((err) => {
      if (!(err instanceof AbortError)) {
        this.logger.error('Chat stream error', { requestId, error: err.message })
        eventSender.error(requestId, err.message)
      }
    }).finally(() => {
      this.activeRequests.delete(requestId)
    })

    return { started: true, requestId }
  }

  abort(requestId: string): { aborted: boolean } {
    const active = this.activeRequests.get(requestId)
    if (!active) return { aborted: false }
    active.abortController.abort()
    this.activeRequests.delete(requestId)
    return { aborted: true }
  }

  private async runStream(
    request: ChatCompletionRequest,
    provider: { apiBase: string; apiKey: string },
    eventSender: ChatEventSender,
    abortController: AbortController,
  ): Promise<void> {
    const { requestId, messages, system, modelId, maxTokens, thinking, runtime } = request

    // 构建 Claude Agent SDK query 选项
    const queryOptions: Query = {
      model: modelId,
      messages: messages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
      })),
      abortController,
      options: {
        apiKey: provider.apiKey,
        ...(provider.apiBase ? { apiBaseUrl: provider.apiBase } : {}),
      },
    }

    if (system) queryOptions.systemPrompt = system
    if (maxTokens) queryOptions.maxTokens = maxTokens
    if (thinking) queryOptions.thinking = thinking

    if (runtime?.cwd) {
      queryOptions.cwd = runtime.cwd
    }

    // 流式处理
    let finalText = ''
    let thinkingIndex = 0
    let inputTokens = 0
    let outputTokens = 0

    try {
      const stream = query(queryOptions)

      for await (const event of stream) {
        if (abortController.signal.aborted) break

        switch (event.type) {
          case 'assistant':
            if (event.subtype === 'text') {
              finalText += event.text
              eventSender.chunk(requestId, event.text)
            } else if (event.subtype === 'thinking') {
              eventSender.thinking(requestId, event.thinking, thinkingIndex++)
            }
            break

          case 'tool_use':
            eventSender.toolCall(requestId, {
              id: event.toolUseId,
              name: event.name,
              input: {},
            })
            break

          case 'tool_result':
            eventSender.toolResult(requestId, event.toolUseId, event.name, event.result)
            break

          case 'usage':
            inputTokens = event.inputTokens ?? 0
            outputTokens = event.outputTokens ?? 0
            eventSender.usage(requestId, inputTokens, outputTokens)
            break

          case 'result':
            // 查询完成
            break
        }
      }

      eventSender.done(requestId, { inputTokens, outputTokens })
    } catch (err: any) {
      if (err instanceof AbortError) return
      eventSender.error(requestId, err.message || 'Unknown error')
    }
  }
}
```

注意：`query()` 的事件类型需要根据 `@anthropic-ai/claude-agent-sdk` 的实际 API 调整。上面的 `event.type / event.subtype` 是基于 SDK 典型模式的假设。实施时需读取 SDK 文档确认实际事件格式。

- [ ] **Step 3: 验证 SDK 类型可用**

```bash
cd G:/programming/nodejs/work_fox && pnpm build:backend 2>&1 | head -20
```

Expected: 编译成功（或仅 chat-runtime.ts 有 SDK 类型相关的 minor 错误，需按实际 SDK API 修正）。

- [ ] **Step 4: Commit**

```bash
git add backend/chat/chat-runtime.ts
git commit -m "feat(backend): add ChatRuntime wrapping claude-agent-sdk for streaming"
```

---

### Task 3: 创建 chat-channels.ts

**Files:**
- Create: `backend/ws/chat-channels.ts`

- [ ] **Step 1: 创建 channel 注册**

```typescript
// backend/ws/chat-channels.ts
import type { WSRouter } from './router'
import type { ConnectionManager } from './connection-manager'
import { ChatRuntime, type ChatCompletionRequest } from '../chat/chat-runtime'
import { ChatEventSender } from '../chat/chat-event-sender'
import type { BackendAIProviderStore } from '../storage/ai-provider-store'
import type { Logger } from '../app/logger'

export interface ChatServices {
  chatRuntime: ChatRuntime
  connectionManager: ConnectionManager
}

export function registerChatChannels(router: WSRouter, services: ChatServices): void {
  const { chatRuntime, connectionManager } = services

  router.register('chat:completions', async (data: ChatCompletionRequest, context) => {
    const eventSender = new ChatEventSender(connectionManager, context.clientId)
    return chatRuntime.completions(data, eventSender)
  })

  router.register('chat:abort', async ({ requestId }) => {
    return chatRuntime.abort(requestId)
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/ws/chat-channels.ts
git commit -m "feat(backend): add chat channel registration for streaming completions"
```

---

### Task 4: 在 backend/main.ts 中注册 chat channels

**Files:**
- Modify: `backend/main.ts`

- [ ] **Step 1: 添加导入**

在已有的 import 块末尾添加：

```typescript
import { ChatRuntime } from './chat/chat-runtime'
import { registerChatChannels } from './ws/chat-channels'
```

- [ ] **Step 2: 实例化 ChatRuntime 并注册**

在 `registerFsChannels(backend.router)` 行之后添加：

```typescript
  const chatRuntime = new ChatRuntime(aiProviderStore, logger)
  registerChatChannels(backend.router, {
    chatRuntime,
    connectionManager: backend.connections,
  })
```

- [ ] **Step 3: 验证编译**

```bash
cd G:/programming/nodejs/work_fox && pnpm build:backend
```

Expected: 编译成功。

- [ ] **Step 4: Commit**

```bash
git add backend/main.ts
git commit -m "feat(backend): register chat channels with ChatRuntime"
```

---

### Task 5: 端到端验证

- [ ] **Step 1: 启动 backend + web 前端**

终端 1:
```bash
cd G:/programming/nodejs/work_fox && pnpm build:backend && node out/backend/main.js
```

终端 2:
```bash
cd G:/programming/nodejs/work_fox && pnpm dev:web
```

- [ ] **Step 2: 浏览器测试**

1. 打开 `http://localhost:5173`
2. 确认 Vue app 加载
3. 在设置中添加 AI Provider（填入 API key）
4. 在 Chat 中发送消息
5. 验证流式回复逐字显示

Expected: Chat 消息发送后，逐 token 收到流式回复。

- [ ] **Step 3: 验证 abort**

发送长消息，然后立即点击取消。Expected: 请求被中止，不再收到 token。

- [ ] **Step 4: 修复任何问题并 commit**

根据实际测试结果修复 SDK 事件映射、类型错误等。

---

## 验收标准

- [ ] `pnpm build:backend` 编译成功
- [ ] `pnpm dev:web` 启动后浏览器能访问
- [ ] 能创建 AI Provider 并保存
- [ ] 能发送 Chat 消息并收到流式回复
- [ ] Chat abort 能中止进行中的请求
- [ ] Chat 历史能持久化和加载
- [ ] 事件名与 Electron 版完全一致（chat:chunk, chat:done 等）
