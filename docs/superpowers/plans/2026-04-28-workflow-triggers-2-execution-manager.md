# Workflow Triggers Plan 2: ExecutionManager EventSink

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans.

**Goal:** 为 ExecutionSession 添加可选 eventSink，使触发器执行事件可路由到 SSE 或静默丢弃，而非 WS 广播。

**Architecture:** Session-scoped eventSink 可选回调。emitEvent 方法优先使用 eventSink，不存在时走原有 WS emit。

**Tech Stack:** TypeScript, backend/workflow/

**Spec:** Section 2 "ExecutionManager adaptation — session-scoped event sink"

---

### Task 4: 修改 ExecutionSession 接口

**Files:**
- Modify: `backend/workflow/execution-manager.ts`

- [ ] **Step 1: 在 ExecutionSession 接口末尾添加 eventSink**

找到 `ExecutionSession` 接口（约 L57-83），在最后一个字段后添加：

```typescript
eventSink?: (channel: string, payload: unknown) => void
```

- [ ] **Step 2: 修改 emitEvent 方法**

找到 `emitEvent` 私有方法（约 L1503-1518），在 `this.deps.emit(channel, payload)` 调用前插入 eventSink 检查：

```typescript
private emitEvent(channel: ExecutionEventChannel, payload: ExecutionEventMap[ExecutionEventChannel]): void {
  // --- 新增: session-scoped eventSink 优先 ---
  if (this.currentSession?.eventSink) {
    this.currentSession.eventSink(channel, payload)
    return
  }
  // --- 原有逻辑 ---
  this.eventSequence++
  const event = { ...payload, _seq: this.eventSequence } as any
  this.currentSession?.recentEvents.push(event)
  if (this.currentSession && this.currentSession.recentEvents.length > 100) {
    this.currentSession.recentEvents.shift()
  }
  this.deps.emit(channel, payload)
}
```

> **注意:** `emitEvent` 方法签名和 `this.currentSession` 引用需要对照实际代码确认。关键是 eventSink 分支必须在 `this.deps.emit` 之前 return。

- [ ] **Step 3: 验证编译**

Run: `pnpm build:backend 2>&1 | tail -5`
Expected: 编译成功，无错误

- [ ] **Step 4: 提交**

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
