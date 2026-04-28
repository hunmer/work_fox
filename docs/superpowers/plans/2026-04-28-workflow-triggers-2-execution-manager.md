# Workflow Triggers Plan 2: ExecutionManager EventSink

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans.

**Goal:** 为 ExecutionSession 添加可选 eventSink，扩展 execute/createSession 方法签名，使触发器执行事件可路由到 SSE 或静默丢弃。

**Architecture:** Session-scoped eventSink 可选回调。emitEvent 方法中 session 参数携带 eventSink 时替换 WS emit，但保留 recentEvents 记录。

**Tech Stack:** TypeScript, backend/workflow/

**Spec:** Section 2 "ExecutionManager adaptation — session-scoped event sink"

---

### Task 4: 修改 ExecutionSession 和 emitEvent

**Files:**
- Modify: `backend/workflow/execution-manager.ts`

- [ ] **Step 1: 在 ExecutionSession 接口末尾添加 eventSink**

找到 `ExecutionSession` 接口（约 L57-83），在最后一个字段后添加：

```typescript
eventSink?: (channel: string, payload: unknown) => void
```

- [ ] **Step 2: 修改 execute() 方法签名**

找到 `execute()` 方法（约 L141），添加可选第三参数：

```typescript
async execute(
  request: WorkflowExecuteRequest,
  ownerClientId: string,
  eventSink?: (channel: string, payload: unknown) => void
): Promise<WorkflowExecuteResponse> {
```

将 eventSink 传递到 `createSession()` 调用中。

- [ ] **Step 3: 修改 createSession() 方法签名**

找到 `createSession()` 私有方法（约 L217-254），添加可选参数：

```typescript
private createSession(
  executionId: string,
  workflow: Workflow,
  ownerClientId: string,
  input?: Record<string, any>,
  snapshot?: ExecutionSnapshot,
  context?: Record<string, any>,
  eventSink?: (channel: string, payload: unknown) => void
): ExecutionSession {
```

在返回的对象中添加 `eventSink` 字段。

- [ ] **Step 4: 修改 emitEvent 方法**

找到 `emitEvent` 私有方法（约 L1503-1518）。实际签名是 `emitEvent<Channel>(session, channel, payload)` — session 是第一个参数。

在方法末尾的 `this.emit(channel, payload)` 调用处，替换为条件分支：

```typescript
// 原有 recentEvents/序列号逻辑保持不变（eventSink session 也需要）
session.lastUpdatedAt = Date.now()
session.eventSequence += 1
const event = { ...payload, _seq: session.eventSequence } as any
session.recentEvents.push(event)
if (session.recentEvents.length > 100) {
  session.recentEvents.shift()
}

// 新增: eventSink 替换 WS emit
if (session.eventSink) {
  session.eventSink(channel as string, payload)
} else {
  this.emit(channel, payload)
}
```

> **关键:** eventSink 分支保留 recentEvents 记录和序列号递增（执行恢复依赖），仅替换最终的 emit 目标。

- [ ] **Step 5: 验证编译**

Run: `pnpm build:backend 2>&1 | tail -5`
Expected: 编译成功

- [ ] **Step 6: 提交**

```bash
git add backend/workflow/execution-manager.ts
git commit -m "feat(triggers): add session-scoped eventSink to ExecutionManager"
```

---

### Task 5: 扩展 BackendConfig 添加 hookSecret

**Files:**
- Modify: `backend/app/config.ts`

- [ ] **Step 1: 在 BackendConfig 接口添加字段**

在 `heartbeatIntervalMs` 之后添加：

```typescript
hookSecret?: string
```

- [ ] **Step 2: 在 loadBackendConfig 函数中读取环境变量**

在 `heartbeatIntervalMs` 赋值之后添加：

```typescript
hookSecret: process.env.WORKFOX_HOOK_SECRET || undefined,
```

- [ ] **Step 3: 验证编译**

Run: `pnpm build:backend 2>&1 | tail -5`
Expected: PASS

- [ ] **Step 4: 提交**

```bash
git add backend/app/config.ts
git commit -m "feat(triggers): add hookSecret to BackendConfig"
```
