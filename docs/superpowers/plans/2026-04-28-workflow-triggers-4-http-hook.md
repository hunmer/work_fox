# Workflow Triggers Plan 4: HTTP Hook 端点 & SSE

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans.

**Goal:** 在 Express 上注册 `POST /hook/:hookName` 端点，实现 SSE 流式响应，透传 ExecutionEventMap 事件。

**Architecture:** Express 路由处理鉴权、查找绑定工作流、创建 SSE eventSink、并行执行工作流。SSE 断开仅清理引用不停止执行。TriggerService 暴露 `executeForHook` 公共方法，避免暴露私有 executionManager。

**Tech Stack:** Express SSE, TypeScript

**Spec:** Section 3 "HTTP Hook Endpoint & SSE"

**Depends on:** Plan 2 (execute eventSink), Plan 3 (TriggerService)

---

### Task 9: 在 TriggerService 添加 executeForHook 公共方法

**Files:**
- Modify: `backend/workflow/trigger-service.ts`

- [ ] **Step 1: 添加 executeForHook 方法**

在 TriggerService 类中添加公共方法，封装对 executionManager.execute 的调用：

```typescript
async executeForHook(
  workflowId: string,
  input: Record<string, unknown>,
  eventSink: (channel: string, payload: unknown) => void
): Promise<{ executionId: string; status: string }> {
  const result = await this.executionManager.execute(
    { workflowId, input },
    `__hook_${crypto.randomUUID()}__`,
    eventSink
  )
  return result
}
```

> **设计决策:** 通过公共方法封装，避免 hook-handler 直接访问私有 executionManager。

- [ ] **Step 2: 提交**

```bash
git add backend/workflow/trigger-service.ts
git commit -m "feat(triggers): add executeForHook public method to TriggerService"
```

---

### Task 10: 注册 HTTP Hook 路由

**Files:**
- Modify: `backend/app/create-server.ts`

- [ ] **Step 1: 修改 create-server.ts 接收 triggerService**

工厂函数签名添加可选参数：

```typescript
export function createBackendServer(
  config: BackendConfig,
  logger: Logger,
  triggerService?: WorkflowTriggerService
)
```

在 `GET /version` 路由之后添加：

```typescript
if (triggerService) {
  app.post('/hook/:hookName', (req, res) => {
    handleHookRequest(req, res, triggerService, config, logger)
  })
}
```

---

### Task 11: 创建 hook-handler.ts

**Files:**
- Create: `backend/workflow/hook-handler.ts`

- [ ] **Step 1: 创建文件**

```typescript
import type { Request, Response } from 'express'
import type { WorkflowTriggerService } from './trigger-service'
import type { BackendConfig } from '../app/config'
import type { Logger } from '../app/logger'

const SSE_HOOK_TIMEOUT_MS = 5 * 60_000

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

  let completedCount = 0
  let closed = false

  const sseSink = (channel: string, payload: unknown) => {
    if (closed) return
    res.write(`event: ${channel}\ndata: ${JSON.stringify(payload)}\n\n`)
  }

  // SSE 超时 — 5分钟后关闭连接（工作流继续执行）
  const timeoutId = setTimeout(() => {
    if (!closed) {
      sseSink('timeout', { message: 'Execution timeout, SSE closing' })
      res.write('event: done\ndata: {}\n\n')
      closed = true
      res.end()
    }
  }, SSE_HOOK_TIMEOUT_MS)

  // 客户端断开 — 仅清理 SSE，不停止执行
  res.on('close', () => {
    closed = true
    clearTimeout(timeoutId)
    logger.info(`[HookHandler] SSE client disconnected for hook "${hookName}"`)
  })

  // 4. 并行执行所有目标工作流
  const total = targetBindings.length
  for (const binding of targetBindings) {
    triggerService.executeForHook(binding.workflowId, body.input || {}, sseSink)
      .then(() => { onExecutionDone() })
      .catch((err: any) => {
        logger.error(`[HookHandler] Execution error: ${err.message}`)
        sseSink('workflow:error', { workflowId: binding.workflowId, error: err.message })
        onExecutionDone()
      })
  }

  function onExecutionDone() {
    completedCount++
    if (completedCount === total && !closed) {
      clearTimeout(timeoutId)
      res.write('event: done\ndata: {}\n\n')
      closed = true
      res.end()
    }
  }
}
```

- [ ] **Step 2: 修改 main.ts 传递 triggerService 到 createBackendServer**

在 `main.ts` 中，将 triggerService 传递给 `createBackendServer`：

```typescript
const backend = createBackendServer(config, logger, triggerService)
```

> **注意:** triggerService 需要在 `createBackendServer` 之前创建。调整 main.ts 中的初始化顺序：先创建 workflowStore 和 executionManager，再创建 triggerService，再传给 createBackendServer。

- [ ] **Step 3: 验证编译**

Run: `pnpm build:backend 2>&1 | tail -5`
Expected: PASS

- [ ] **Step 4: 提交**

```bash
git add backend/app/create-server.ts backend/workflow/hook-handler.ts backend/main.ts
git commit -m "feat(triggers): add HTTP hook endpoint with SSE streaming"
```
