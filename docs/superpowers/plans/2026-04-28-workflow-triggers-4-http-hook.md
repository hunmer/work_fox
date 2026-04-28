# Workflow Triggers Plan 4: HTTP Hook 端点 & SSE

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans.

**Goal:** 在 Express 上注册 `POST /hook/:hookName` 端点，实现 SSE 流式响应，透传 ExecutionEventMap 事件。

**Architecture:** Express 路由处理鉴权、查找绑定工作流、创建 SSE eventSink、并行执行工作流。SSE 断开仅清理引用不停止执行。

**Tech Stack:** Express SSE, TypeScript

**Spec:** Section 3 "HTTP Hook Endpoint & SSE"

**Depends on:** Plan 3 (TriggerService)

---

### Task 9: 注册 HTTP Hook 路由

**Files:**
- Modify: `backend/app/create-server.ts`

- [ ] **Step 1: 添加 hook 路由注册点**

`create-server.ts` 的返回对象中需要暴露一个注册 hook handler 的能力。修改工厂函数签名，接收 `triggerService`：

```typescript
export function createBackendServer(
  config: BackendConfig,
  logger: Logger,
  triggerService?: WorkflowTriggerService
)
```

在 `GET /version` 路由之后添加 hook 路由：

```typescript
// --- HTTP Hook Endpoint ---
if (triggerService) {
  app.post('/hook/:hookName', (req, res) => {
    handleHookRequest(req, res, triggerService, config, logger)
  })
}
```

> **注意:** `handleHookRequest` 函数可以放在同一文件中或提取到 `backend/workflow/hook-handler.ts`。建议提取到独立文件保持职责清晰。

- [ ] **Step 2: 创建 hook-handler.ts**

**Files:**
- Create: `backend/workflow/hook-handler.ts`

```typescript
import type { Request, Response } from 'express'
import type { WorkflowTriggerService } from './trigger-service'
import type { BackendConfig } from '../app/config'
import type { Logger } from '../app/logger'
import type { ExecutionEventChannel, ExecutionEventMap } from '@shared/execution-events'
import { v4 as uuid } from 'uuid'

const SSE_HOOK_TIMEOUT_MS = 5 * 60_000 // 5 minutes

interface HookRequestBody {
  workflowId?: string
  input?: Record<string, unknown>
}

export function handleHookRequest(
  req: Request,
  res: Response,
  triggerService: WorkflowTriggerService,
  config: BackendConfig,
  logger: Logger
): void {
  const hookName = req.params.hookName

  // 1. Auth
  if (config.hookSecret) {
    const auth = req.headers.authorization
    const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
    if (token !== config.hookSecret) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
  }

  // 2. 查找绑定的工作流
  const bindings = triggerService.getHookBindings(hookName)
  if (bindings.length === 0) {
    res.status(404).json({ error: `No workflows bound to hook "${hookName}"` })
    return
  }

  const body: HookRequestBody = req.body || {}
  let targetBindings = bindings
  if (body.workflowId) {
    targetBindings = bindings.filter(b => b.workflowId === body.workflowId)
    if (targetBindings.length === 0) {
      res.status(404).json({ error: `Workflow ${body.workflowId} not bound to hook "${hookName}"` })
      return
    }
  }

  // 3. 设置 SSE
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  })

  const sseClientId = `__hook_${uuid()}__`
  let completedCount = 0
  let closed = false

  const sseSink = (channel: string, payload: unknown) => {
    if (closed) return
    const data = JSON.stringify(payload)
    res.write(`event: ${channel}\ndata: ${data}\n\n`)
  }

  // SSE 超时
  const timeoutId = setTimeout(() => {
    if (!closed) {
      sseSink('timeout', { message: 'Execution timeout, SSE closing' })
      res.write('event: done\ndata: {}\n\n')
      closed = true
      res.end()
    }
  }, SSE_HOOK_TIMEOUT_MS)

  // 客户端断开
  res.on('close', () => {
    closed = true
    clearTimeout(timeoutId)
    logger.info(`[HookHandler] SSE client disconnected: ${sseClientId}`)
  })

  // 4. 并行执行所有目标工作流
  const executionManager = (triggerService as any).executionManager
  for (const binding of targetBindings) {
    executionManager.execute(
      { workflowId: binding.workflowId, input: body.input || {} },
      sseClientId,
      sseSink  // eventSink 通过 execute 传递
    ).then(() => {
      completedCount++
      if (completedCount === targetBindings.length && !closed) {
        clearTimeout(timeoutId)
        res.write('event: done\ndata: {}\n\n')
        closed = true
        res.end()
      }
    }).catch((err: any) => {
      logger.error(`[HookHandler] Execution error for workflow ${binding.workflowId}: ${err.message}`)
      sseSink('workflow:error', { workflowId: binding.workflowId, error: err.message })
      completedCount++
      if (completedCount === targetBindings.length && !closed) {
        clearTimeout(timeoutId)
        res.write('event: done\ndata: {}\n\n')
        closed = true
        res.end()
      }
    })
  }
}
```

> **关键注意:** `executionManager.execute()` 当前签名是 `execute(request, ownerClientId)`。需要扩展为 `execute(request, ownerClientId, eventSink?)` 以支持 eventSink 传入。在 Plan 2 的 eventSink 修改中，需要在 `createSession` 时将 eventSink 存入 session。

- [ ] **Step 3: 修改 ExecutionManager.execute 方法签名**

**Files:**
- Modify: `backend/workflow/execution-manager.ts`

在 `execute` 方法中添加可选第三参数：

```typescript
async execute(
  request: WorkflowExecuteRequest,
  ownerClientId: string,
  eventSink?: (channel: string, payload: unknown) => void
): Promise<WorkflowExecuteResponse> {
```

在 `createSession` 调用中传入 eventSink，确保 session 携带此回调。

- [ ] **Step 4: 验证编译**

Run: `pnpm build:backend 2>&1 | tail -5`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add backend/app/create-server.ts backend/workflow/hook-handler.ts backend/workflow/execution-manager.ts
git commit -m "feat(triggers): add HTTP hook endpoint with SSE streaming"
```
