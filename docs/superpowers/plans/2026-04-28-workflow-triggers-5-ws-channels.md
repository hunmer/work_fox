# Workflow Triggers Plan 5: WS 通道 & 前端 API

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans.

**Goal:** 创建 trigger WS 通道 handler 和前端 API 适配层。

**Architecture:** `trigger-channels.ts` 注册 validate-cron 和 check-hook-name 两个通道。`trigger-domain.ts` 封装 wsBridge 调用。

**Tech Stack:** TypeScript, WS 通道模式

**Spec:** Section 4 "WS Channels"

**Depends on:** Plan 1 (contracts), Plan 3 (TriggerService)

---

### Task 10: 创建 trigger WS 通道

**Files:**
- Create: `backend/ws/trigger-channels.ts`
- Modify: `backend/main.ts`

- [ ] **Step 1: 创建 trigger-channels.ts**

```typescript
import type { WSRouter } from './router'
import type { WorkflowTriggerService } from '../workflow/trigger-service'

export function registerTriggerChannels(
  router: WSRouter,
  triggerService: WorkflowTriggerService
): void {
  router.register('trigger:validate-cron', ({ cron }) => {
    return triggerService.validateCron(cron)
  })

  router.register('trigger:check-hook-name', ({ hookName, excludeWorkflowId }) => {
    const { conflictWorkflowIds } = triggerService.getHookConflicts(hookName, excludeWorkflowId)
    const hookUrl = triggerService.getHookUrl(hookName)
    return { conflictWorkflowIds, hookUrl }
  })
}
```

- [ ] **Step 2: 在 main.ts 中注册通道**

在 `registerExecutionChannels` 之后添加：

```typescript
import { registerTriggerChannels } from './ws/trigger-channels'
// ...
registerTriggerChannels(router, triggerService)
```

- [ ] **Step 3: 验证编译**

Run: `pnpm build:backend 2>&1 | tail -5`
Expected: PASS

- [ ] **Step 4: 提交**

```bash
git add backend/ws/trigger-channels.ts backend/main.ts
git commit -m "feat(triggers): add trigger WS channels (validate-cron, check-hook-name)"
```

---

### Task 11: 创建前端 trigger API 适配层

**Files:**
- Create: `src/lib/backend-api/trigger-domain.ts`

- [ ] **Step 1: 创建 trigger-domain.ts**

参照 `src/lib/backend-api/dashboard.ts` 的模式：

```typescript
import { wsBridge } from '../ws-bridge'

export const triggerApi = {
  validateCron(cron: string) {
    return wsBridge.invoke('trigger:validate-cron', { cron }) as Promise<{
      valid: boolean
      nextRuns: string[]
      error?: string
    }>
  },

  checkHookName(hookName: string, excludeWorkflowId?: string) {
    return wsBridge.invoke('trigger:check-hook-name', {
      hookName,
      excludeWorkflowId
    }) as Promise<{
      conflictWorkflowIds: string[]
      hookUrl: string
    }>
  }
}
```

- [ ] **Step 2: 验证编译**

Run: `pnpm exec tsc -p tsconfig.web.json --noEmit 2>&1 | head -10`
Expected: PASS

- [ ] **Step 3: 提交**

```bash
git add src/lib/backend-api/trigger-domain.ts
git commit -m "feat(triggers): add frontend trigger API adapter"
```

---

### Task 12: 端到端验证

- [ ] **Step 1: 完整编译**

Run: `pnpm build:backend && pnpm build`
Expected: 两个都成功

- [ ] **Step 2: 手动冒烟测试（开发模式）**

```bash
pnpm dev
```

验证：
1. 后端启动日志中出现 `[TriggerService] Started`
2. 通过 Dashboard 创建一个工作流，添加 triggers 字段并保存
3. `curl http://localhost:9123/hook/test-hook` 返回 404（无绑定）
4. WS 通道 `trigger:validate-cron` 和 `trigger:check-hook-name` 响应正常

- [ ] **Step 3: 提交（如有修复）**

```bash
git add -A && git commit -m "fix(triggers): address smoke test issues"
```
