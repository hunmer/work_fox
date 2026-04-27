# Dashboard P2: Frontend Store & API Layer

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 创建 Dashboard 的前端 API 客户端和 Pinia store，为页面组件提供数据层。

**Architecture:** `src/lib/backend-api/dashboard.ts` 通过 `wsBridge.invoke()` 调用 P1 中定义的 3 个 Dashboard WS 通道；`src/stores/dashboard.ts` 管理 Dashboard 页面的全部状态，包括统计数据、执行历史、选中工作流、文件夹/工作流树。

**Tech Stack:** TypeScript, Vue 3, Pinia, wsBridge

**Depends on:** P1 (Shared Types & Backend Channels)

---

### Task 1: Dashboard API Client

**Files:**
- Create: `src/lib/backend-api/dashboard.ts`

- [ ] **Step 1: 创建 API 客户端文件**

参考 `src/lib/backend-api/execution-log.ts` 的模式——导出一个对象，每个方法调用 `wsBridge.invoke()`：

```typescript
import { wsBridge } from '../ws-bridge'
import type {
  DashboardStatsResponse,
  DashboardExecutionsRequest,
  DashboardExecutionsResponse,
  DashboardWorkflowDetailResponse,
} from '@shared/channel-contracts'

export const dashboardBackendApi = {
  getStats(): Promise<DashboardStatsResponse> {
    return wsBridge.invoke('dashboard:stats', undefined)
  },

  getExecutions(req?: DashboardExecutionsRequest): Promise<DashboardExecutionsResponse> {
    return wsBridge.invoke('dashboard:executions', req ?? {})
  },

  getWorkflowDetail(workflowId: string): Promise<DashboardWorkflowDetailResponse> {
    return wsBridge.invoke('dashboard:workflow-detail', { workflowId })
  },
}
```

**注意**：`wsBridge.invoke` 的泛型签名需要匹配。查看 `src/lib/ws-bridge.ts` 中 `invoke` 的类型签名，如果需要显式泛型参数则加上：

```typescript
return wsBridge.invoke<'dashboard:stats'>('dashboard:stats', undefined)
```

- [ ] **Step 2: 验证类型正确**

Run: `cd "G:/programming/nodejs/work_fox" && pnpm exec tsc -p tsconfig.web.json --noEmit 2>&1 | grep dashboard`

不应有错误。

- [ ] **Step 3: Commit**

```bash
git add src/lib/backend-api/dashboard.ts
git commit -m "feat(dashboard): add frontend API client for dashboard channels"
```

---

### Task 2: Dashboard Pinia Store

**Files:**
- Create: `src/stores/dashboard.ts`

- [ ] **Step 1: 创建 Dashboard store**

参考 `src/stores/workflow.ts` 的 Pinia 模式。Store 管理全部 Dashboard 页面状态：

```typescript
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { dashboardBackendApi } from '@/lib/backend-api/dashboard'
import { workflowBackendApi } from '@/lib/backend-api/workflow'
import { workflowFolderBackendApi } from '@/lib/backend-api/workflow-folder'
import type {
  DashboardStatsResponse,
  DashboardExecutionsResponse,
  DashboardWorkflowDetailResponse,
} from '@shared/channel-contracts'
import type { Workflow, WorkflowFolder } from '@shared/workflow-types'

export type DashboardExecutionsRange = 'today' | 'week' | 'all'

export const useDashboardStore = defineStore('dashboard', () => {
  // ---- Stats ----
  const stats = ref<DashboardStatsResponse | null>(null)
  const statsLoading = ref(false)

  async function fetchStats() {
    statsLoading.value = true
    try {
      stats.value = await dashboardBackendApi.getStats()
    } catch (e) {
      console.error('[Dashboard] fetchStats failed:', e)
    } finally {
      statsLoading.value = false
    }
  }

  // ---- Executions ----
  const executions = ref<DashboardExecutionsResponse | null>(null)
  const executionsLoading = ref(false)
  const executionsRange = ref<DashboardExecutionsRange>('all')

  async function fetchExecutions(range?: DashboardExecutionsRange) {
    if (range) executionsRange.value = range
    executionsLoading.value = true
    try {
      executions.value = await dashboardBackendApi.getExecutions({
        range: executionsRange.value,
      })
    } catch (e) {
      console.error('[Dashboard] fetchExecutions failed:', e)
    } finally {
      executionsLoading.value = false
    }
  }

  // ---- Selected workflow ----
  const selectedWorkflowId = ref<string | null>(null)
  const workflowDetail = ref<DashboardWorkflowDetailResponse | null>(null)
  const workflowDetailLoading = ref(false)

  const isOverviewMode = computed(() => selectedWorkflowId.value === null)

  async function selectWorkflow(workflowId: string | null) {
    selectedWorkflowId.value = workflowId
    if (workflowId) {
      workflowDetailLoading.value = true
      try {
        workflowDetail.value = await dashboardBackendApi.getWorkflowDetail(workflowId)
      } catch (e) {
        console.error('[Dashboard] fetchWorkflowDetail failed:', e)
        workflowDetail.value = null
      } finally {
        workflowDetailLoading.value = false
      }
    } else {
      workflowDetail.value = null
    }
  }

  // ---- Sidebar data (folders + workflows) ----
  const folders = ref<WorkflowFolder[]>([])
  const workflows = ref<Workflow[]>([])
  const sidebarLoading = ref(false)

  async function fetchSidebarData() {
    sidebarLoading.value = true
    try {
      const [folderList, workflowList] = await Promise.all([
        workflowFolderBackendApi.list(),
        workflowBackendApi.list(),
      ])
      folders.value = folderList
      workflows.value = workflowList
    } catch (e) {
      console.error('[Dashboard] fetchSidebarData failed:', e)
    } finally {
      sidebarLoading.value = false
    }
  }

  // ---- Init (page load) ----
  async function init() {
    await Promise.all([
      fetchStats(),
      fetchExecutions('all'),
      fetchSidebarData(),
    ])
  }

  // ---- Refresh stats (e.g., after returning to overview) ----
  async function refresh() {
    await Promise.all([
      fetchStats(),
      fetchExecutions(),
    ])
  }

  return {
    // Stats
    stats,
    statsLoading,
    fetchStats,
    // Executions
    executions,
    executionsLoading,
    executionsRange,
    fetchExecutions,
    // Selected workflow
    selectedWorkflowId,
    workflowDetail,
    workflowDetailLoading,
    isOverviewMode,
    selectWorkflow,
    // Sidebar
    folders,
    workflows,
    sidebarLoading,
    fetchSidebarData,
    // Lifecycle
    init,
    refresh,
  }
})
```

**注意**：需要确认 `workflowFolderBackendApi` 的实际导出名和 `list()` 方法签名。查看 `src/lib/backend-api/workflow-folder.ts` 确认。

- [ ] **Step 2: 确认 workflowFolder API 导出名**

Run: `grep "export" "G:/programming/nodejs/work_fox/src/lib/backend-api/workflow-folder.ts" | head -5`

如果不叫 `workflowFolderBackendApi`，调整 store 中的 import。

- [ ] **Step 3: 确认 workflowBackendApi.list() 返回类型**

确保 `workflowBackendApi.list()` 返回的是 `Workflow[]`，包含 `folderId` 字段。

- [ ] **Step 4: 验证前端编译**

Run: `cd "G:/programming/nodejs/work_fox" && pnpm exec tsc -p tsconfig.web.json --noEmit 2>&1 | grep -E "(dashboard|error)" | head -10`

- [ ] **Step 5: Commit**

```bash
git add src/stores/dashboard.ts
git commit -m "feat(dashboard): add Pinia store with stats, executions, and sidebar state"
```

---

### Task 3: 注册到 backend-api index

**Files:**
- Modify: `src/lib/backend-api/workflow-domain.ts`（或 index.ts，取决于项目聚合方式）

- [ ] **Step 1: 检查 backend-api 的导出方式**

Run: `grep -n "export" "G:/programming/nodejs/work_fox/src/lib/backend-api/workflow-domain.ts" | head -10`

确认其他 API 是如何被聚合导出的。

- [ ] **Step 2: 如果有 domain 工厂模式，添加 dashboard**

如果项目使用 domain 工厂模式（类似 `createWorkflowDomainApi`），创建对应的 `createDashboardDomainApi`。否则跳过此步骤——各组件直接 import `dashboardBackendApi` 即可。

- [ ] **Step 3: Commit（如有改动）**

```bash
git add src/lib/backend-api/
git commit -m "feat(dashboard): register dashboard API in domain layer"
```
