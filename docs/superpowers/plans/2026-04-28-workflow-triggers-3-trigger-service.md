# Workflow Triggers Plan 3: TriggerService 核心服务

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans.

**Goal:** 创建 WorkflowTriggerService，管理 cron 调度和 hook 反向索引，集成到 backend 启动流程和 storage channels。

**Architecture:** 单一服务类，启动时扫描所有工作流构建索引。CRUD 操作通过 DI 注入触发器更新。

**Tech Stack:** TypeScript, node-cron, backend/workflow/

**Spec:** Section 2 "Backend: TriggerService"

**Depends on:** Plan 1 (types), Plan 2 (eventSink, config)

---

### Task 6: 安装 node-cron 依赖

- [ ] **Step 1: 安装**

Run: `pnpm add node-cron cron-parser && pnpm add -D @types/node-cron`

- [ ] **Step 2: 提交**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore(triggers): add node-cron dependency"
```

---

### Task 7: 创建 TriggerService

**Files:**
- Create: `backend/workflow/trigger-service.ts`

- [ ] **Step 1: 创建文件骨架**

```typescript
import cron, { CronJob } from 'node-cron'
import { parseExpression } from 'cron-parser'
import type { BackendWorkflowStore } from '../storage/workflow-store'
import type { ExecutionManager } from './execution-manager'
import type { BackendConfig } from '../app/config'
import type { Logger } from '../app/logger'
import type { Workflow, WorkflowTrigger } from '@shared/workflow-types'

const SCHEDULER_CLIENT_ID = '__scheduler__'

interface HookBinding {
  workflowId: string
  triggerId: string
}

export class WorkflowTriggerService {
  private cronJobs = new Map<string, CronJob>()           // triggerId -> CronJob
  private hookIndex = new Map<string, Set<HookBinding>>() // hookName -> bindings

  constructor(
    private workflowStore: BackendWorkflowStore,
    private executionManager: ExecutionManager,
    private config: BackendConfig,
    private logger: Logger
  ) {}

  async start(): Promise<void> {
    const workflows = this.workflowStore.listWorkflows()
    for (const wf of workflows) {
      this.registerTriggers(wf)
    }
    this.logger.info(`[TriggerService] Started. ${this.cronJobs.size} cron jobs, ${this.hookIndex.size} hooks registered`)
  }

  reloadWorkflow(workflowId: string): void {
    this.clearTriggersForWorkflow(workflowId)
    const wf = this.workflowStore.getWorkflow(workflowId)
    if (wf) this.registerTriggers(wf)
  }

  removeWorkflow(workflowId: string): void {
    this.clearTriggersForWorkflow(workflowId)
  }

  getHookBindings(hookName: string): HookBinding[] {
    return Array.from(this.hookIndex.get(hookName) ?? [])
  }

  getHookConflicts(hookName: string, excludeWorkflowId?: string): { conflictWorkflowIds: string[] } {
    const bindings = this.hookIndex.get(hookName) ?? new Set()
    const ids = Array.from(bindings)
      .map(b => b.workflowId)
      .filter(id => id !== excludeWorkflowId)
    return { conflictWorkflowIds: [...new Set(ids)] }
  }

  getHookUrl(hookName: string): string {
    return `http://${this.config.host}:${this.config.port}/hook/${hookName}`
  }

  validateCron(cronExpr: string): { valid: boolean; nextRuns: string[]; error?: string } {
    if (!cron.validate(cronExpr)) {
      return { valid: false, nextRuns: [], error: 'Invalid cron expression' }
    }
    try {
      const interval = parseExpression(cronExpr)
      const nextRuns: string[] = []
      for (let i = 0; i < 5; i++) {
        nextRuns.push(interval.next().toISOString())
      }
      return { valid: true, nextRuns }
    } catch (err: any) {
      return { valid: false, nextRuns: [], error: err.message }
    }
  }

  private registerTriggers(wf: Workflow): void {
    if (!wf.triggers) return
    for (const trigger of wf.triggers) {
      if (!trigger.enabled) continue
      if (trigger.type === 'cron') {
        this.registerCronJob(wf.id, trigger)
      } else if (trigger.type === 'hook') {
        this.registerHookBinding(wf.id, trigger)
      }
    }
  }

  private registerCronJob(workflowId: string, trigger: WorkflowTrigger & { type: 'cron' }): void {
    const key = `${workflowId}:${trigger.id}`
    try {
      const job = new CronJob(
        trigger.cron,
        () => {
          this.logger.info(`[TriggerService] Cron fired for workflow ${workflowId}`)
          this.executionManager.execute(
            { workflowId, input: {} },
            SCHEDULER_CLIENT_ID
          )
        },
        null,
        true, // start immediately
        trigger.timezone
      )
      this.cronJobs.set(key, job)
    } catch (err: any) {
      this.logger.error(`[TriggerService] Invalid cron "${trigger.cron}" for workflow ${workflowId}: ${err.message}`)
    }
  }

  private registerHookBinding(workflowId: string, trigger: WorkflowTrigger & { type: 'hook' }): void {
    let bindings = this.hookIndex.get(trigger.hookName)
    if (!bindings) {
      bindings = new Set()
      this.hookIndex.set(trigger.hookName, bindings)
    }
    bindings.add({ workflowId, triggerId: trigger.id })
  }

  private clearTriggersForWorkflow(workflowId: string): void {
    // 清理 cron jobs
    for (const [key, job] of this.cronJobs) {
      if (key.startsWith(`${workflowId}:`)) {
        job.stop()
        this.cronJobs.delete(key)
      }
    }
    // 清理 hook index
    for (const [hookName, bindings] of this.hookIndex) {
      for (const binding of bindings) {
        if (binding.workflowId === workflowId) {
          bindings.delete(binding)
        }
      }
      if (bindings.size === 0) {
        this.hookIndex.delete(hookName)
      }
    }
  }
}
```

- [ ] **Step 2: 验证编译**

Run: `pnpm build:backend 2>&1 | tail -5`
Expected: PASS

- [ ] **Step 3: 提交**

```bash
git add backend/workflow/trigger-service.ts
git commit -m "feat(triggers): create WorkflowTriggerService with cron scheduler and hook index"
```

---

### Task 8: 集成到 backend/main.ts 和 storage-channels

**Files:**
- Modify: `backend/main.ts`
- Modify: `backend/ws/storage-channels.ts`

- [ ] **Step 1: 修改 storage-channels.ts 签名**

将 `registerStorageChannels` 函数签名改为：

```typescript
export function registerStorageChannels(
  router: WSRouter,
  services: StorageServices,
  triggerService?: import('../workflow/trigger-service').WorkflowTriggerService
): void {
```

在 `workflow:create` handler 中（返回新建 wf 之后）添加：
```typescript
triggerService?.reloadWorkflow(wf.id)
```

在 `workflow:update` handler 中（updateWorkflow 之后）添加：
```typescript
triggerService?.reloadWorkflow(id)
```

在 `workflow:delete` handler 中（deleteWorkflow 之后）添加：
```typescript
triggerService?.removeWorkflow(id)
```

- [ ] **Step 2: 修改 main.ts 初始化流程**

在 ExecutionManager 创建之后、registerStorageChannels 之前，添加：

```typescript
import { WorkflowTriggerService } from './workflow/trigger-service'

const triggerService = new WorkflowTriggerService(workflowStore, executionManager, config, logger)
await triggerService.start()
```

修改 `registerStorageChannels` 调用，传入 triggerService：

```typescript
registerStorageChannels(router, { workflowStore, workflowVersionStore, executionLogStore, operationHistoryStore }, triggerService)
```

- [ ] **Step 3: 验证编译和启动**

Run: `pnpm build:backend 2>&1 | tail -5`
Expected: PASS

- [ ] **Step 4: 提交**

```bash
git add backend/main.ts backend/ws/storage-channels.ts
git commit -m "feat(triggers): integrate TriggerService into backend startup and workflow CRUD"
```
