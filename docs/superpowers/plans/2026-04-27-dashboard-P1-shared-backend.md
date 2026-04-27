# Dashboard P1: Shared Types & Backend Channels

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立 Dashboard 的共享类型定义、WS 通道契约、后端聚合查询逻辑和通道 handler。

**Architecture:** 在 `shared/` 中定义 3 个新 WS 通道的类型契约和元数据；在 `backend/` 中新增 `DashboardStatsStore`（含 60 秒 TTL 内存缓存）负责聚合查询，`dashboard-channels.ts` 注册 handler。

**Tech Stack:** TypeScript, Node.js fs, WSRouter

**Spec:** `docs/superpowers/specs/2026-04-27-dashboard-page-design.md`

---

### Task 1: Shared Channel Contracts

**Files:**
- Modify: `shared/channel-contracts.ts`

- [ ] **Step 1: 在 `channel-contracts.ts` 中添加 Dashboard 请求/响应类型**

在文件中 `ExecutionLogDeleteRequest` 附近（约 line 130 之后），新增 Dashboard 相关接口：

```typescript
// ---- Dashboard ----
export interface DashboardStatsResponse {
  workflowCount: number
  runningCount: number
  pluginCount: number
  todayExecutions: number
  weekExecutions: number
  totalExecutions: number
  dailyTrend: Array<{
    date: string
    count: number
    success: number
    error: number
  }>
}

export interface DashboardExecutionsRequest {
  range?: 'today' | 'week' | 'all'
  status?: string
  page?: number
  pageSize?: number
}

export interface DashboardExecutionItem {
  id: string
  workflowId: string
  workflowName: string
  status: 'running' | 'completed' | 'paused' | 'error'
  startedAt: number
  finishedAt: number | null
  duration: number | null
  stepCount: number
}

export interface DashboardExecutionsResponse {
  items: DashboardExecutionItem[]
  total: number
  page: number
  pageSize: number
}

export interface DashboardWorkflowDetailRequest {
  workflowId: string
}

export interface DashboardWorkflowDetailResponse {
  workflow: {
    id: string
    name: string
    folderId: string | null
    nodeCount: number
    edgeCount: number
    createdAt: number
    updatedAt: number
  }
  versions: Array<{
    id: string
    version: number
    createdAt: number
    nodeCount: number
    description?: string
  }>
  executions: {
    items: Array<{
      id: string
      status: 'running' | 'completed' | 'paused' | 'error'
      startedAt: number
      finishedAt: number | null
      duration: number | null
      stepCount: number
    }>
    total: number
  }
}
```

- [ ] **Step 2: 在 `BackendChannelMap` 中注册 3 个新通道**

在 `BackendChannelMap` 接口中（约 line 199-308），在末尾 `}` 之前添加：

```typescript
  // Dashboard
  'dashboard:stats': ChannelContract<EmptyRequest, DashboardStatsResponse>
  'dashboard:executions': ChannelContract<DashboardExecutionsRequest, DashboardExecutionsResponse>
  'dashboard:workflow-detail': ChannelContract<DashboardWorkflowDetailRequest, DashboardWorkflowDetailResponse>
```

- [ ] **Step 3: 验证编译**

Run: `cd "G:/programming/nodejs/work_fox" && pnpm exec tsc -p tsconfig.web.json --noEmit 2>&1 | head -20`

预期可能有其他无关错误，但不应有 dashboard 相关的新错误。

- [ ] **Step 4: Commit**

```bash
git add shared/channel-contracts.ts
git commit -m "feat(dashboard): add shared channel contract types"
```

---

### Task 2: Shared Channel Metadata

**Files:**
- Modify: `shared/channel-metadata.ts`

- [ ] **Step 1: 在 `channel-metadata.ts` 中添加 Dashboard 通道元数据**

在 metadata 记录中（文件末尾 `}` 之前），添加 3 个条目。使用 `crud()` 工厂函数因为这些都是只读查询：

```typescript
  // Dashboard
  'dashboard:stats': crud('dashboard:stats', 'Get dashboard aggregate statistics'),
  'dashboard:executions': crud('dashboard:executions', 'List cross-workflow execution history'),
  'dashboard:workflow-detail': crud('dashboard:workflow-detail', 'Get workflow detail with versions and executions'),
```

- [ ] **Step 2: 验证编译**

Run: `cd "G:/programming/nodejs/work_fox" && pnpm exec tsc -p tsconfig.web.json --noEmit 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add shared/channel-metadata.ts
git commit -m "feat(dashboard): add channel metadata entries"
```

---

### Task 3: Backend DashboardStatsStore

**Files:**
- Create: `backend/dashboard/stats-store.ts`

- [ ] **Step 1: 创建 `backend/dashboard/stats-store.ts`**

参考 `backend/storage/execution-log-store.ts` 的模式。这个 store 负责：
1. 聚合所有工作流的执行日志
2. 计算 stats（工作流数、执行次数、趋势）
3. 60 秒 TTL 内存缓存

```typescript
import { existsSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import type { DashboardStatsResponse, DashboardExecutionsRequest, DashboardExecutionsResponse, DashboardExecutionItem, DashboardWorkflowDetailResponse } from '@shared/channel-contracts'
import type { Workflow, ExecutionLog } from '@shared/workflow-types'
import type { StoragePaths } from '../storage/paths'

interface CacheEntry<T> {
  data: T
  expiry: number
}

export class DashboardStatsStore {
  private statsCache: CacheEntry<DashboardStatsResponse> | null = null
  private readonly CACHE_TTL = 60_000 // 60 seconds

  constructor(
    private paths: StoragePaths,
    private listWorkflows: () => Workflow[],
    private getWorkflow: (id: string) => Workflow | undefined,
    private runningSessionCount: () => number,
    private pluginCount: () => number,
  ) {}

  getStats(): DashboardStatsResponse {
    const cached = this.getValidCache(this.statsCache)
    if (cached) return cached

    const workflows = this.listWorkflows()
    const allLogs = this.collectAllLogs(workflows)
    const now = Date.now()
    const todayStart = new Date(now).setHours(0, 0, 0, 0)
    const weekStart = todayStart - 6 * 24 * 60 * 60 * 1000

    let todayExecutions = 0
    let weekExecutions = 0
    const trendMap = new Map<string, { count: number; success: number; error: number }>()

    // Initialize last 30 days in trend map
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now - i * 24 * 60 * 60 * 1000)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      trendMap.set(key, { count: 0, success: 0, error: 0 })
    }

    for (const log of allLogs) {
      if (!log.startedAt) continue
      if (log.startedAt >= todayStart) todayExecutions++
      if (log.startedAt >= weekStart) weekExecutions++

      const d = new Date(log.startedAt)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const entry = trendMap.get(key)
      if (entry) {
        entry.count++
        if (log.status === 'completed') entry.success++
        if (log.status === 'error') entry.error++
      }
    }

    const result: DashboardStatsResponse = {
      workflowCount: workflows.length,
      runningCount: this.runningSessionCount(),
      pluginCount: this.pluginCount(),
      todayExecutions,
      weekExecutions,
      totalExecutions: allLogs.length,
      dailyTrend: Array.from(trendMap.entries()).map(([date, v]) => ({ date, ...v })),
    }

    this.statsCache = { data: result, expiry: Date.now() + this.CACHE_TTL }
    return result
  }

  getExecutions(req: DashboardExecutionsRequest): DashboardExecutionsResponse {
    const range = req.range ?? 'all'
    const page = req.page ?? 1
    const pageSize = req.pageSize ?? 20
    const now = Date.now()
    const todayStart = new Date(now).setHours(0, 0, 0, 0)
    const weekStart = todayStart - 6 * 24 * 60 * 60 * 1000

    const workflows = this.listWorkflows()
    const allLogs = this.collectAllLogs(workflows)
    const items: DashboardExecutionItem[] = []

    for (const log of allLogs) {
      if (!log.startedAt) continue
      if (range === 'today' && log.startedAt < todayStart) continue
      if (range === 'week' && log.startedAt < weekStart) continue
      if (req.status && log.status !== req.status) continue

      const wf = this.getWorkflow(log.workflowId)
      items.push({
        id: log.id,
        workflowId: log.workflowId,
        workflowName: wf?.name ?? 'Unknown',
        status: log.status ?? 'completed',
        startedAt: log.startedAt,
        finishedAt: log.finishedAt ?? null,
        duration: log.finishedAt && log.startedAt ? log.finishedAt - log.startedAt : null,
        stepCount: log.steps?.length ?? 0,
      })
    }

    // Sort by startedAt descending
    items.sort((a, b) => b.startedAt - a.startedAt)

    const total = items.length
    const start = (page - 1) * pageSize
    const paged = items.slice(start, start + pageSize)

    return { items: paged, total, page, pageSize }
  }

  getWorkflowDetail(workflowId: string): DashboardWorkflowDetailResponse | null {
    const wf = this.getWorkflow(workflowId)
    if (!wf) return null

    const logs = this.readLogsForWorkflow(workflowId)
    const versions = this.readVersionsForWorkflow(workflowId)

    return {
      workflow: {
        id: wf.id,
        name: wf.name,
        folderId: wf.folderId ?? null,
        nodeCount: wf.nodes?.length ?? 0,
        edgeCount: wf.edges?.length ?? 0,
        createdAt: wf.createdAt,
        updatedAt: wf.updatedAt,
      },
      versions,
      executions: {
        items: logs.map(log => ({
          id: log.id,
          status: log.status ?? 'completed',
          startedAt: log.startedAt,
          finishedAt: log.finishedAt ?? null,
          duration: log.finishedAt && log.startedAt ? log.finishedAt - log.startedAt : null,
          stepCount: log.steps?.length ?? 0,
        })),
        total: logs.length,
      },
    }
  }

  invalidateCache(): void {
    this.statsCache = null
  }

  // --- Private helpers ---

  private getValidCache<T>(cache: CacheEntry<T> | null): T | null {
    if (!cache) return null
    if (Date.now() > cache.expiry) {
      this.statsCache = null
      return null
    }
    return cache.data
  }

  private collectAllLogs(workflows: Workflow[]): ExecutionLog[] {
    const allLogs: ExecutionLog[] = []
    for (const wf of workflows) {
      allLogs.push(...this.readLogsForWorkflow(wf.id))
    }
    return allLogs
  }

  private readLogsForWorkflow(workflowId: string): ExecutionLog[] {
    const dir = this.paths.executionHistoryDir(workflowId)
    if (!existsSync(dir)) return []
    try {
      return readdirSync(dir)
        .filter(f => f.endsWith('.json'))
        .map(f => {
          try {
            return JSON.parse(readFileSync(join(dir, f), 'utf-8')) as ExecutionLog
          } catch { return null }
        })
        .filter((log): log is ExecutionLog => log !== null)
        .sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0))
    } catch {
      return []
    }
  }

  private readVersionsForWorkflow(workflowId: string): DashboardWorkflowDetailResponse['versions'] {
    const versionsDir = this.paths.versionsDir(workflowId)
    if (!versionsDir || !existsSync(versionsDir)) return []
    try {
      return readdirSync(versionsDir)
        .filter(f => f.endsWith('.json'))
        .map((f, i) => {
          try {
            const content = JSON.parse(readFileSync(join(versionsDir, f), 'utf-8'))
            return {
              id: f.replace('.json', ''),
              version: i + 1,
              createdAt: content.createdAt ?? 0,
              nodeCount: content.nodes?.length ?? 0,
              description: content.description,
            }
          } catch { return null }
        })
        .filter((v): v is NonNullable<typeof v> => v !== null)
    } catch {
      return []
    }
  }
}
```

**注意**：`paths.versionsDir` 和 `paths.executionHistoryDir` 的实际方法签名需要查看 `backend/storage/paths.ts` 确认。如果 `versionsDir` 方法名不同，需调整。

- [ ] **Step 2: 验证 `backend/storage/paths.ts` 中的路径方法名**

Run: `grep -n "Dir\b" "G:/programming/nodejs/work_fox/backend/storage/paths.ts"`

确认 `executionHistoryDir` 和版本目录路径方法的准确名称。如果不匹配，调整 `stats-store.ts` 中的调用。

- [ ] **Step 3: 验证后端编译**

Run: `cd "G:/programming/nodejs/work_fox" && pnpm build:backend 2>&1 | tail -5`

如有类型错误，根据 paths.ts 的实际方法签名修复。

- [ ] **Step 4: Commit**

```bash
git add backend/dashboard/stats-store.ts
git commit -m "feat(dashboard): add DashboardStatsStore with cached aggregation"
```

---

### Task 4: Backend Dashboard Channel Handlers

**Files:**
- Create: `backend/ws/dashboard-channels.ts`
- Modify: `backend/main.ts`

- [ ] **Step 1: 创建 `backend/ws/dashboard-channels.ts`**

参考 `backend/ws/app-channels.ts` 的注册模式。接收 `WSRouter` + services，注册 3 个 handler：

```typescript
import type { WSRouter } from './router'
import type { DashboardStatsStore } from '../dashboard/stats-store'

export interface DashboardServices {
  dashboardStatsStore: DashboardStatsStore
}

export function registerDashboardChannels(router: WSRouter, services: DashboardServices): void {
  const { dashboardStatsStore } = services

  router.register('dashboard:stats', (_data) => {
    return dashboardStatsStore.getStats()
  })

  router.register('dashboard:executions', (data) => {
    return dashboardStatsStore.getExecutions(data ?? {})
  })

  router.register('dashboard:workflow-detail', (data) => {
    const result = dashboardStatsStore.getWorkflowDetail(data.workflowId)
    if (!result) throw new Error(`Workflow not found: ${data.workflowId}`)
    return result
  })
}
```

- [ ] **Step 2: 在 `backend/main.ts` 中集成 Dashboard**

在 store 创建区域（约 line 29-37）之后，创建 `DashboardStatsStore` 实例：

```typescript
import { DashboardStatsStore } from './dashboard/stats-store'
import { registerDashboardChannels } from './ws/dashboard-channels'
```

在 `registerChatChannels(...)` 之后（约 line 72），添加：

```typescript
// Dashboard
const dashboardStatsStore = new DashboardStatsStore(
  paths,
  () => workflowStore.listWorkflows(),
  (id: string) => workflowStore.getWorkflow(id),
  () => executionManager.sessions.size,  // 确认 sessions 是 public 的
  () => plugins.list().length,           // 确认 PluginRegistry 有 list 方法
)
registerDashboardChannels(backend.router, { dashboardStatsStore })
```

**注意**：需要确认 `ExecutionManager` 的 `sessions` 属性是否为 public。如果是 private，需要添加一个 `getRunningCount(): number` 方法。同样需要确认 `PluginRegistry` 的列表方法名。

- [ ] **Step 3: 验证 ExecutionManager.sessions 访问性**

Run: `grep -n "sessions" "G:/programming/nodejs/work_fox/backend/workflow/execution-manager.ts" | head -10`

如果 `sessions` 是 private，在 `ExecutionManager` 中添加：

```typescript
getRunningSessionCount(): number {
  return this.sessions.size
}
```

- [ ] **Step 4: 验证 PluginRegistry 列表方法**

Run: `grep -n "list\|getAll\|plugins" "G:/programming/nodejs/work_fox/backend/plugins/plugin-registry.ts" | head -10`

确认获取插件列表的正确方法名。

- [ ] **Step 5: 验证后端编译**

Run: `cd "G:/programming/nodejs/work_fox" && pnpm build:backend 2>&1 | tail -10`

修复所有类型错误。

- [ ] **Step 6: Commit**

```bash
git add backend/ws/dashboard-channels.ts backend/main.ts
git commit -m "feat(dashboard): register dashboard WS channel handlers"
```

---

### Task 5: 集成验证

- [ ] **Step 1: 全量编译检查**

Run: `cd "G:/programming/nodejs/work_fox" && pnpm build:backend 2>&1 | tail -5`

- [ ] **Step 2: 前端编译检查**（shared 类型变更会影响前端）

Run: `cd "G:/programming/nodejs/work_fox" && pnpm exec tsc -p tsconfig.web.json --noEmit 2>&1 | tail -10`

- [ ] **Step 3: 全量构建**

Run: `cd "G:/programming/nodejs/work_fox" && pnpm build 2>&1 | tail -10`

- [ ] **Step 4: Commit（如有自动修复）**

如果验证过程中有修复：

```bash
git add -A
git commit -m "fix(dashboard): address compilation issues from P1"
```
