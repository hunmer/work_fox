# Workflow Triggers Plan 1: Shared Types & Contracts

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan.

**Goal:** 定义 WorkflowTrigger 类型、扩展 Workflow 接口、添加 WS 通道契约和元数据。

**Architecture:** Discriminated union 类型设计，triggers 作为 Workflow 可选字段存储。新增 2 个 WS 通道契约。

**Tech Stack:** TypeScript, shared/ 模块

**Spec:** `docs/superpowers/specs/2026-04-28-workflow-triggers-design.md` Section 1, 4

---

### Task 1: 添加 WorkflowTrigger 类型

**Files:**
- Modify: `shared/workflow-types.ts`

- [ ] **Step 1: 在 `workflow-types.ts` 中添加类型**

在 `WorkflowGroup` 接口之后、`Workflow` 接口之前插入：

```typescript
/** 工作流触发器基础字段 */
export interface WorkflowTriggerBase {
  id: string
  enabled: boolean
}

/** 工作流触发器 — discriminated union */
export type WorkflowTrigger =
  | (WorkflowTriggerBase & {
      type: 'cron'
      cron: string
      timezone?: string
    })
  | (WorkflowTriggerBase & {
      type: 'hook'
      hookName: string
    })
```

- [ ] **Step 2: 扩展 Workflow 接口**

在 `Workflow` 接口的 `groups?` 字段后添加：

```typescript
triggers?: WorkflowTrigger[]
```

- [ ] **Step 3: 验证编译**

Run: `pnpm exec tsc -p tsconfig.web.json --noEmit 2>&1 | head -20`
Expected: 无新增错误（triggers 是可选字段，不影响现有代码）

- [ ] **Step 4: 提交**

```bash
git add shared/workflow-types.ts
git commit -m "feat(triggers): add WorkflowTrigger type and extend Workflow"
```

---

### Task 2: 添加 WS 通道契约

**Files:**
- Modify: `shared/channel-contracts.ts`

- [ ] **Step 1: 在 `BackendChannelMap` 末尾添加 Trigger 契约**

在 `dashboard:workflow-detail` 之后，`BackendChannelMap` 的闭合 `}` 之前添加：

```typescript
// --- Trigger ---
'trigger:validate-cron': ChannelContract<
  { cron: string },
  { valid: boolean; nextRuns: string[]; error?: string }
>
'trigger:check-hook-name': ChannelContract<
  { hookName: string; excludeWorkflowId?: string },
  { conflictWorkflowIds: string[]; hookUrl: string }
>
```

- [ ] **Step 2: 验证编译**

Run: `pnpm exec tsc -p tsconfig.web.json --noEmit 2>&1 | head -20`
Expected: 可能有 "handler not registered" 相关警告，但无类型错误

- [ ] **Step 3: 提交**

```bash
git add shared/channel-contracts.ts
git commit -m "feat(triggers): add trigger WS channel contracts"
```

---

### Task 3: 添加通道元数据

**Files:**
- Modify: `shared/channel-metadata.ts`

- [ ] **Step 1: 在 `CHANNEL_METADATA` 末尾（Dashboard 之后）添加**

```typescript
// --- Trigger ---
'trigger:validate-cron': crud('trigger:validate-cron', 'Validate cron expression'),
'trigger:check-hook-name': crud('trigger:check-hook-name', 'Check hook name bindings'),
```

- [ ] **Step 2: 验证编译**

Run: `pnpm exec tsc -p tsconfig.web.json --noEmit 2>&1 | head -20`
Expected: PASS

- [ ] **Step 3: 提交**

```bash
git add shared/channel-metadata.ts
git commit -m "feat(triggers): add trigger channel metadata"
```
