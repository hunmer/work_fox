# Dashboard P3: Page Route & Components

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 创建 Dashboard 页面路由和所有 UI 组件，包括侧边栏、统计卡片、趋势图表、执行历史表格、工作流详情面板。

**Architecture:** `DashboardPage.vue` 作为页面入口，使用 shadcn-vue `SidebarProvider` 包裹 `DashboardSidebar`（左侧）和 `SidebarInset`（右侧）。右侧内容区根据 `isOverviewMode` 切换概览/详情模式。图表使用 Unovis（`@unovis/vue`）。

**Tech Stack:** Vue 3 `<script setup>`, TypeScript, Tailwind CSS 4, shadcn-vue, Unovis/Chart

**Depends on:** P1 (Backend), P2 (Store & API)

---

### Task 1: 路由注册

**Files:**
- Modify: `src/router/index.ts`

- [ ] **Step 1: 添加 `/dashboard` 路由**

在 `src/router/index.ts` 的 routes 数组中，`/home` 路由之后添加：

```typescript
{
  path: '/dashboard',
  name: 'dashboard',
  component: () => import('@/views/DashboardPage.vue'),
},
```

- [ ] **Step 2: 验证路由**

Run: `cd "G:/programming/nodejs/work_fox" && pnpm exec tsc -p tsconfig.web.json --noEmit 2>&1 | tail -5`

- [ ] **Step 3: Commit**

```bash
git add src/router/index.ts
git commit -m "feat(dashboard): add /dashboard route"
```

---

### Task 2: StatsCards 组件

**Files:**
- Create: `src/components/dashboard/StatsCards.vue`

- [ ] **Step 1: 创建统计卡片组件**

使用 shadcn-vue `Card` 组件，展示 6 张统计卡片（2 行 × 3 列）。Props 接收 `DashboardStatsResponse` + loading 状态：

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  IconWorkflow,
  IconPlayerPlay,
  IconPlug,
  IconCalendarEvent,
  IconCalendarWeek,
  IconChartBar,
} from '@tabler/icons-vue'
import type { DashboardStatsResponse } from '@shared/channel-contracts'

const props = defineProps<{
  stats: DashboardStatsResponse | null
  loading: boolean
}>()

const cards = computed(() => {
  if (!props.stats) return []
  return [
    { title: '工作流总数', value: props.stats.workflowCount, icon: IconWorkflow },
    { title: '正在运行', value: props.stats.runningCount, icon: IconPlayerPlay },
    { title: '插件数量', value: props.stats.pluginCount, icon: IconPlug },
    { title: '今日调用', value: props.stats.todayExecutions, icon: IconCalendarEvent },
    { title: '本周调用', value: props.stats.weekExecutions, icon: IconCalendarWeek },
    { title: '总调用次数', value: props.stats.totalExecutions, icon: IconChartBar },
  ]
})
</script>

<template>
  <div class="grid grid-cols-1 gap-4 px-4 sm:grid-cols-2 md:grid-cols-3 lg:px-6">
    <template v-if="loading">
      <Card v-for="i in 6" :key="i">
        <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
          <Skeleton class="h-4 w-24" />
          <Skeleton class="h-4 w-4" />
        </CardHeader>
        <CardContent>
          <Skeleton class="h-8 w-16" />
        </CardContent>
      </Card>
    </template>
    <template v-else>
      <Card v-for="card in cards" :key="card.title">
        <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle class="text-sm font-medium text-muted-foreground">
            {{ card.title }}
          </CardTitle>
          <component :is="card.icon" class="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div class="text-2xl font-bold">{{ card.value }}</div>
        </CardContent>
      </Card>
    </template>
  </div>
</template>
```

**注意**：`@tabler/icons-vue` 中的图标名称可能不完全匹配上述名称。查看 `src/components/AppSidebar.vue` 中使用了哪些图标来确认正确的 import 路径。或者用 `lucide-vue-next`（`components.json` 中配置的默认图标库）。

- [ ] **Step 2: 确认图标库**

Run: `grep -r "icon" "G:/programming/nodejs/work_fox/src/components/AppSidebar.vue" | head -10`

确认项目使用 `@tabler/icons-vue` 还是 `lucide-vue-next`。调整 import。

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/StatsCards.vue
git commit -m "feat(dashboard): add StatsCards component with 6 metric cards"
```

---

### Task 3: ExecutionChart 组件

**Files:**
- Create: `src/components/dashboard/ExecutionChart.vue`

- [ ] **Step 1: 创建趋势图表组件**

使用项目已有的 `@unovis/vue` + shadcn-vue `ChartContainer`。面积折线图展示 30 天执行趋势：

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { VisArea, VisAxis, VisXYContainer } from '@unovis/vue'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import type { DashboardStatsResponse } from '@shared/channel-contracts'

const props = defineProps<{
  stats: DashboardStatsResponse | null
  loading: boolean
}>()

type TrendItem = DashboardStatsResponse['dailyTrend'][number]

const chartData = computed(() => props.stats?.dailyTrend ?? [])
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle class="text-base">执行趋势（近 30 天）</CardTitle>
    </CardHeader>
    <CardContent>
      <Skeleton v-if="loading" class="h-[300px] w-full" />
      <div v-else-if="chartData.length" class="h-[300px]">
        <VisXYContainer :data="chartData" :padding="{ top: 10 }">
          <VisArea
            :x="(d: TrendItem, i: number) => i"
            :y="[(d: TrendItem) => d.success, (d: TrendItem) => d.error]"
            :color="['hsl(var(--chart-1))', 'hsl(var(--chart-5))']"
            :opacity="0.3"
            :curve-type="'monotoneX'"
          />
          <VisAxis
            type="x"
            :tick-format="(i: number) => chartData[i]?.date?.slice(5) ?? ''"
            :num-ticks="6"
            :grid-line="false"
          />
          <VisAxis
            type="y"
            :num-ticks="4"
            :grid-line="true"
            :domain-line="false"
          />
        </VisXYContainer>
      </div>
      <div v-else class="flex h-[300px] items-center justify-center text-muted-foreground">
        暂无趋势数据
      </div>
    </CardContent>
  </Card>
</template>
```

**注意**：
- 需要确认 `@unovis/vue` 中 `VisArea`、`VisAxis`、`VisXYContainer` 的确切 API。参考 `src/components/` 中是否有使用 Unovis 的现有组件。
- CSS 变量 `--chart-1` 到 `--chart-5` 需要在 `globals.css` 中定义。查看是否已存在。
- 如果项目中已有 `ChartAreaInteractive` 类似组件，优先复用其模式。

- [ ] **Step 2: 确认 Unovis 用法**

Run: `grep -r "VisArea\|VisXY\|@unovis" "G:/programming/nodejs/work_fox/src/components/" | head -10`

如果有现有 Unovis 用法，参考其模式。如果没有，上面的代码需要调整为实际的 Unovis API。

- [ ] **Step 3: 确认 chart CSS 变量**

Run: `grep "chart-" "G:/programming/nodejs/work_fox/src/styles/globals.css" | head -10`

如果不存在 chart 颜色变量，需要在 `@theme inline` 块中添加：

```css
--color-chart-1: hsl(220 70% 50%);
--color-chart-2: hsl(160 60% 45%);
--color-chart-3: hsl(30 80% 55%);
--color-chart-4: hsl(280 65% 60%);
--color-chart-5: hsl(0 70% 50%);
```

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/ExecutionChart.vue
git commit -m "feat(dashboard): add ExecutionChart area chart component"
```

---

### Task 4: ExecutionHistoryTable 组件

**Files:**
- Create: `src/components/dashboard/ExecutionHistoryTable.vue`

- [ ] **Step 1: 创建全局执行历史表格**

使用 shadcn-vue `Table` + `Tabs` 组件：

```vue
<script setup lang="ts">
import { useRouter } from 'vue-router'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { Empty } from '@/components/ui/empty'
import type { DashboardExecutionsResponse } from '@shared/channel-contracts'
import type { DashboardExecutionsRange } from '@/stores/dashboard'

const props = defineProps<{
  data: DashboardExecutionsResponse | null
  loading: boolean
  range: DashboardExecutionsRange
}>()

const emit = defineEmits<{
  'update:range': [range: DashboardExecutionsRange]
}>()

const router = useRouter()

const statusVariant: Record<string, string> = {
  completed: 'default',
  running: 'secondary',
  paused: 'outline',
  error: 'destructive',
}

const statusLabel: Record<string, string> = {
  completed: '已完成',
  running: '运行中',
  paused: '已暂停',
  error: '失败',
}

function formatDuration(ms: number | null): string {
  if (ms == null) return '-'
  if (ms < 1000) return `${ms}ms`
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainSeconds = seconds % 60
  return `${minutes}m ${remainSeconds}s`
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString()
}

function openWorkflow(workflowId: string) {
  router.push({ path: '/editor', query: { workflow_id: workflowId } })
}
</script>

<template>
  <Card>
    <CardHeader class="flex flex-row items-center justify-between">
      <CardTitle class="text-base">执行历史</CardTitle>
      <Tabs :model-value="range" @update:model-value="emit('update:range', $event as DashboardExecutionsRange)">
        <TabsList>
          <TabsTrigger value="today">今日</TabsTrigger>
          <TabsTrigger value="week">本周</TabsTrigger>
          <TabsTrigger value="all">全部</TabsTrigger>
        </TabsList>
      </Tabs>
    </CardHeader>
    <CardContent>
      <template v-if="loading">
        <div class="space-y-2">
          <Skeleton v-for="i in 5" :key="i" class="h-10 w-full" />
        </div>
      </template>
      <Empty v-else-if="!data?.items?.length" description="暂无执行记录" />
      <Table v-else>
        <TableHeader>
          <TableRow>
            <TableHead>工作流</TableHead>
            <TableHead>状态</TableHead>
            <TableHead>开始时间</TableHead>
            <TableHead>耗时</TableHead>
            <TableHead>步骤数</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-for="item in data.items" :key="item.id">
            <TableCell>
              <button
                class="text-primary hover:underline cursor-pointer"
                @click="openWorkflow(item.workflowId)"
              >
                {{ item.workflowName }}
              </button>
            </TableCell>
            <TableCell>
              <Badge :variant="statusVariant[item.status] as any">
                {{ statusLabel[item.status] ?? item.status }}
              </Badge>
            </TableCell>
            <TableCell class="text-muted-foreground">
              {{ formatTime(item.startedAt) }}
            </TableCell>
            <TableCell>{{ formatDuration(item.duration) }}</TableCell>
            <TableCell>{{ item.stepCount }}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </CardContent>
  </Card>
</template>
```

**注意**：需要在文件顶部添加 `Card`、`CardHeader`、`CardTitle`、`CardContent` 的 import。

- [ ] **Step 2: Commit**

```bash
git add src/components/dashboard/ExecutionHistoryTable.vue
git commit -m "feat(dashboard): add ExecutionHistoryTable with range filter tabs"
```

---

### Task 5: WorkflowDetailPanel 组件组

**Files:**
- Create: `src/components/dashboard/WorkflowDetailPanel.vue`
- Create: `src/components/dashboard/WorkflowInfoCard.vue`
- Create: `src/components/dashboard/WorkflowVersionList.vue`
- Create: `src/components/dashboard/WorkflowExecutionTable.vue`

- [ ] **Step 1: 创建 WorkflowInfoCard**

展示选中工作流的基本信息：

```vue
<script setup lang="ts">
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import type { DashboardWorkflowDetailResponse } from '@shared/channel-contracts'

defineProps<{
  detail: DashboardWorkflowDetailResponse | null
  loading: boolean
}>()

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString()
}
</script>

<template>
  <Card v-if="loading">
    <CardHeader><Skeleton class="h-6 w-48" /></CardHeader>
    <CardContent class="space-y-2">
      <Skeleton class="h-4 w-32" />
      <Skeleton class="h-4 w-24" />
      <Skeleton class="h-4 w-40" />
    </CardContent>
  </Card>
  <Card v-else-if="detail">
    <CardHeader>
      <CardTitle>{{ detail.workflow.name }}</CardTitle>
    </CardHeader>
    <CardContent class="space-y-1 text-sm">
      <div class="flex justify-between">
        <span class="text-muted-foreground">节点数</span>
        <span>{{ detail.workflow.nodeCount }}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-muted-foreground">连线数</span>
        <span>{{ detail.workflow.edgeCount }}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-muted-foreground">创建时间</span>
        <span>{{ formatTime(detail.workflow.createdAt) }}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-muted-foreground">更新时间</span>
        <span>{{ formatTime(detail.workflow.updatedAt) }}</span>
      </div>
    </CardContent>
  </Card>
</template>
```

- [ ] **Step 2: 创建 WorkflowVersionList**

展示版本历史列表（仅展示信息）：

```vue
<script setup lang="ts">
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Empty } from '@/components/ui/empty'
import type { DashboardWorkflowDetailResponse } from '@shared/channel-contracts'

defineProps<{
  detail: DashboardWorkflowDetailResponse | null
}>()

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString()
}
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle class="text-base">历史版本</CardTitle>
    </CardHeader>
    <CardContent>
      <Empty v-if="!detail?.versions?.length" description="暂无版本记录" />
      <div v-else class="space-y-3">
        <div
          v-for="version in detail.versions"
          :key="version.id"
          class="flex items-center justify-between rounded-lg border p-3"
        >
          <div class="flex items-center gap-3">
            <Badge variant="outline">v{{ version.version }}</Badge>
            <span class="text-sm text-muted-foreground">
              {{ version.nodeCount }} 个节点
            </span>
          </div>
          <span class="text-xs text-muted-foreground">
            {{ formatTime(version.createdAt) }}
          </span>
        </div>
      </div>
    </CardContent>
  </Card>
</template>
```

- [ ] **Step 3: 创建 WorkflowExecutionTable**

单工作流的执行记录表格（类似全局表，无工作流名称列）：

```vue
<script setup lang="ts">
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty } from '@/components/ui/empty'
import type { DashboardWorkflowDetailResponse } from '@shared/channel-contracts'

defineProps<{
  detail: DashboardWorkflowDetailResponse | null
}>()

const statusVariant: Record<string, string> = {
  completed: 'default',
  running: 'secondary',
  paused: 'outline',
  error: 'destructive',
}
const statusLabel: Record<string, string> = {
  completed: '已完成',
  running: '运行中',
  paused: '已暂停',
  error: '失败',
}

function formatDuration(ms: number | null): string {
  if (ms == null) return '-'
  if (ms < 1000) return `${ms}ms`
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  return `${minutes}m ${seconds % 60}s`
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString()
}
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle class="text-base">执行记录</CardTitle>
    </CardHeader>
    <CardContent>
      <Empty v-if="!detail?.executions?.items?.length" description="暂无执行记录" />
      <Table v-else>
        <TableHeader>
          <TableRow>
            <TableHead>状态</TableHead>
            <TableHead>开始时间</TableHead>
            <TableHead>耗时</TableHead>
            <TableHead>步骤数</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-for="item in detail.executions.items" :key="item.id">
            <TableCell>
              <Badge :variant="statusVariant[item.status] as any">
                {{ statusLabel[item.status] ?? item.status }}
              </Badge>
            </TableCell>
            <TableCell class="text-muted-foreground">{{ formatTime(item.startedAt) }}</TableCell>
            <TableCell>{{ formatDuration(item.duration) }}</TableCell>
            <TableCell>{{ item.stepCount }}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </CardContent>
  </Card>
</template>
```

- [ ] **Step 4: 创建 WorkflowDetailPanel 容器组件**

聚合 InfoCard + VersionList + ExecutionTable：

```vue
<script setup lang="ts">
import WorkflowInfoCard from './WorkflowInfoCard.vue'
import WorkflowVersionList from './WorkflowVersionList.vue'
import WorkflowExecutionTable from './WorkflowExecutionTable.vue'
import type { DashboardWorkflowDetailResponse } from '@shared/channel-contracts'

defineProps<{
  detail: DashboardWorkflowDetailResponse | null
  loading: boolean
}>()
</script>

<template>
  <div class="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
    <WorkflowInfoCard :detail="detail" :loading="loading" />
    <WorkflowVersionList :detail="detail" />
    <WorkflowExecutionTable :detail="detail" />
  </div>
</template>
```

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/WorkflowInfoCard.vue src/components/dashboard/WorkflowVersionList.vue src/components/dashboard/WorkflowExecutionTable.vue src/components/dashboard/WorkflowDetailPanel.vue
git commit -m "feat(dashboard): add workflow detail panel with info card, version list, execution table"
```

---

### Task 6: DashboardSidebar 组件

**Files:**
- Create: `src/components/dashboard/DashboardSidebar.vue`

- [ ] **Step 1: 创建侧边栏组件**

使用 shadcn-vue Sidebar 组件，展示文件夹树和工作流列表：

```vue
<script setup lang="ts">
import { computed } from 'vue'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import type { Workflow, WorkflowFolder } from '@shared/workflow-types'

const props = defineProps<{
  folders: WorkflowFolder[]
  workflows: Workflow[]
  selectedWorkflowId: string | null
}>()

const emit = defineEmits<{
  select: [workflowId: string | null]
}>()

// Workflows grouped by folderId (null = uncategorized)
const groupedWorkflows = computed(() => {
  const groups = new Map<string | null, Workflow[]>()

  // Init groups for all folders
  groups.set(null, []) // uncategorized
  for (const folder of props.folders) {
    groups.set(folder.id, [])
  }

  for (const wf of props.workflows) {
    const key = wf.folderId ?? null
    const group = groups.get(key)
    if (group) group.push(wf)
    else groups.set(key, [wf])
  }

  return groups
})

const foldersWithWorkflows = computed(() =>
  props.folders.filter(f => (groupedWorkflows.value.get(f.id)?.length ?? 0) > 0)
)

const uncategorizedWorkflows = computed(() =>
  groupedWorkflows.value.get(null) ?? []
)
</script>

<template>
  <Sidebar collapsible="offcanvas" class="border-r">
    <SidebarHeader class="border-b px-4 py-3">
      <h2 class="text-lg font-semibold">Dashboard</h2>
    </SidebarHeader>
    <SidebarContent>
      <!-- "All" button -->
      <SidebarGroup>
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                :is-active="selectedWorkflowId === null"
                @click="emit('select', null)"
              >
                全部概览
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      <!-- Folder groups -->
      <SidebarGroup v-for="folder in foldersWithWorkflows" :key="folder.id">
        <Collapsible default-open>
          <SidebarGroupLabel as-child>
            <CollapsibleTrigger class="flex w-full items-center justify-between">
              {{ folder.name }}
              <ChevronRight class="h-4 w-4 transition-transform group-data-[state=open]:rotate-90" />
            </CollapsibleTrigger>
          </SidebarGroupLabel>
          <CollapsibleContent>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem v-for="wf in groupedWorkflows.get(folder.id)" :key="wf.id">
                  <SidebarMenuButton
                    :is-active="selectedWorkflowId === wf.id"
                    @click="emit('select', wf.id)"
                  >
                    {{ wf.name }}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </CollapsibleContent>
        </Collapsible>
      </SidebarGroup>

      <!-- Uncategorized workflows -->
      <SidebarGroup v-if="uncategorizedWorkflows.length">
        <SidebarGroupLabel>未分类</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem v-for="wf in uncategorizedWorkflows" :key="wf.id">
              <SidebarMenuButton
                :is-active="selectedWorkflowId === wf.id"
                @click="emit('select', wf.id)"
              >
                {{ wf.name }}
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </SidebarContent>
  </Sidebar>
</template>
```

**注意**：需要添加 `ChevronRight` 图标的 import。确认使用 `lucide-vue-next` 还是 `@tabler/icons-vue`。

- [ ] **Step 2: Commit**

```bash
git add src/components/dashboard/DashboardSidebar.vue
git commit -m "feat(dashboard): add DashboardSidebar with folder tree and workflow list"
```

---

### Task 7: DashboardPage 页面入口

**Files:**
- Create: `src/views/DashboardPage.vue`

- [ ] **Step 1: 创建 Dashboard 页面**

组合所有组件，参考你提供的布局代码：

```vue
<script setup lang="ts">
import { onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import DashboardSidebar from '@/components/dashboard/DashboardSidebar.vue'
import StatsCards from '@/components/dashboard/StatsCards.vue'
import ExecutionChart from '@/components/dashboard/ExecutionChart.vue'
import ExecutionHistoryTable from '@/components/dashboard/ExecutionHistoryTable.vue'
import WorkflowDetailPanel from '@/components/dashboard/WorkflowDetailPanel.vue'
import { useDashboardStore } from '@/stores/dashboard'

const store = useDashboardStore()
const router = useRouter()

onMounted(() => {
  store.init()
})

function handleSelectWorkflow(workflowId: string | null) {
  store.selectWorkflow(workflowId)
  if (workflowId === null) {
    store.refresh()
  }
}

function handleRangeChange(range: 'today' | 'week' | 'all') {
  store.fetchExecutions(range)
}
</script>

<template>
  <SidebarProvider
    :style="{
      '--sidebar-width': '280px',
      '--header-height': '48px',
    }"
  >
    <DashboardSidebar
      :folders="store.folders"
      :workflows="store.workflows"
      :selected-workflow-id="store.selectedWorkflowId"
      @select="handleSelectWorkflow"
    />
    <SidebarInset>
      <!-- Header -->
      <header class="flex h-12 items-center border-b px-4">
        <h1 class="text-lg font-semibold">
          {{ store.isOverviewMode ? '统计概览' : store.workflowDetail?.workflow.name ?? '工作流详情' }}
        </h1>
        <button
          v-if="!store.isOverviewMode"
          class="ml-4 text-sm text-muted-foreground hover:text-foreground"
          @click="handleSelectWorkflow(null)"
        >
          ← 返回概览
        </button>
      </header>

      <!-- Content -->
      <div class="flex flex-1 flex-col">
        <div class="flex flex-1 flex-col gap-2">
          <!-- Overview mode -->
          <template v-if="store.isOverviewMode">
            <div class="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
              <StatsCards :stats="store.stats" :loading="store.statsLoading" />
              <div class="px-4 lg:px-6">
                <ExecutionChart :stats="store.stats" :loading="store.statsLoading" />
              </div>
              <div class="px-4 lg:px-6">
                <ExecutionHistoryTable
                  :data="store.executions"
                  :loading="store.executionsLoading"
                  :range="store.executionsRange"
                  @update:range="handleRangeChange"
                />
              </div>
            </div>
          </template>

          <!-- Detail mode -->
          <template v-else>
            <div class="px-4 lg:px-6">
              <WorkflowDetailPanel
                :detail="store.workflowDetail"
                :loading="store.workflowDetailLoading"
              />
            </div>
          </template>
        </div>
      </div>
    </SidebarInset>
  </SidebarProvider>
</template>
```

- [ ] **Step 2: 验证前端编译**

Run: `cd "G:/programming/nodejs/work_fox" && pnpm exec tsc -p tsconfig.web.json --noEmit 2>&1 | tail -10`

修复所有类型错误。

- [ ] **Step 3: 全量构建**

Run: `cd "G:/programming/nodejs/work_fox" && pnpm build 2>&1 | tail -10`

- [ ] **Step 4: Commit**

```bash
git add src/views/DashboardPage.vue
git commit -m "feat(dashboard): add DashboardPage with sidebar layout and dual-mode content"
```

---

### Task 8: 集成验证

- [ ] **Step 1: 启动开发服务器**

Run: `cd "G:/programming/nodejs/work_fox" && pnpm dev`

在浏览器中打开 `http://localhost:5173/#/dashboard`，验证：
- 页面加载无白屏
- Sidebar 正常渲染
- 统计卡片显示（可能是 0 或 Skeleton）
- 表格区域正常

- [ ] **Step 2: 修复运行时问题**

根据控制台错误修复组件渲染问题。

- [ ] **Step 3: Commit（如有修复）**

```bash
git add -A
git commit -m "fix(dashboard): address runtime issues from P3"
```
