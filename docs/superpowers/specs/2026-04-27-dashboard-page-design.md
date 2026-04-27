# Dashboard 统计页面设计

> 日期：2026-04-27
> 状态：草案

## 概述

在 WorkFox 前端新增 `/dashboard` 路由，提供全局统计概览和单工作流详情两种视图。页面采用 shadcn-vue Sidebar 组件实现独立侧边栏布局，不依赖全局导航改动。后端新增 WS 通道提供聚合统计数据，遵循项目现有的全 WS 通信架构。

## 1. 路由与页面结构

### 路由

在 `src/router/index.ts` 新增：

```
/dashboard → DashboardPage.vue
```

### 页面组件层次

```
DashboardPage.vue
├── SidebarProvider（shadcn-vue sidebar）
│   ├── DashboardSidebar.vue（左侧自定义 Sidebar）
│   │   ├── SidebarHeader（"Dashboard" 标题）
│   │   ├── SidebarContent
│   │   │   ├── 文件夹树（可展开/折叠，使用现有 WorkflowFolder 体系）
│   │   │   └── 每个文件夹下的工作流列表
│   │   └── SidebarFooter（可选：全部分类统计）
│   │
│   └── SidebarInset（右侧主内容区）
│       ├── SiteHeader（页面标题 + 模式切换按钮）
│       │
│       ├── [概览模式]（默认，未选中工作流时）
│       │   ├── StatsCards（6 张统计卡片）
│       │   │   ├── 工作流总数
│       │   │   ├── 正在运行数
│       │   │   ├── 插件数量
│       │   │   ├── 今日调用次数
│       │   │   ├── 本周调用次数
│       │   │   └── 总调用次数
│       │   ├── ExecutionChart（执行趋势面积折线图）
│       │   └── ExecutionHistoryTable（全局执行历史表格）
│       │       └── 按日期筛选 Tabs（今日/本周/全部）
│       │
│       └── [详情模式]（左侧选中工作流时激活）
│           ├── WorkflowInfoCard（工作流名称/节点数/创建时间等）
│           ├── WorkflowVersionList（历史版本列表）
│           └── WorkflowExecutionTable（该工作流的执行记录）
```

### 导航集成

在 HomePage 中添加一个入口卡片/按钮链接到 `/dashboard`，后续可扩展到全局导航。

## 2. 后端 WS 通道

在后端新增 `backend/ws/dashboard-channels.ts`，注册 3 个 WS 通道。遵循项目现有的 WS 通道架构：
- 在 `shared/channel-contracts.ts` 中定义请求/响应类型映射
- 在 `shared/channel-metadata.ts` 中注册通道元数据
- 在 `backend/ws/` 中注册 handler

### `dashboard:stats`

返回全局聚合统计。前端通过 `wsBridge.invoke('dashboard:stats')` 调用。

```typescript
// 请求：无参数
// 响应：
interface DashboardStats {
  workflowCount: number
  runningCount: number           // 从 ExecutionManager.sessions.size 获取实时运行数
  pluginCount: number
  todayExecutions: number
  weekExecutions: number
  totalExecutions: number
  // 趋势数据：最近 30 天每日执行次数
  dailyTrend: Array<{
    date: string       // YYYY-MM-DD
    count: number      // 总执行次数
    success: number    // 'completed' 状态计数
    error: number      // 'error' 状态计数
  }>
}
```

**实现策略**：
- `runningCount` 从 `ExecutionManager` 的活跃 session Map 中获取（`sessions.size`），非文件扫描。
- 其余统计值由 `DashboardStatsStore` 聚合计算：遍历所有工作流的 `execution_history/` 目录，读取执行日志。
- **缓存策略**：`DashboardStatsStore` 维护内存缓存，TTL 60 秒。首次请求后缓存结果，后续请求在 TTL 内直接返回缓存。缓存失效时重新计算。
- `dailyTrend` 在缓存构建时从日志的 `startedAt`（`number` 时间戳）按日聚合。
- 所有时间字段在 API 层保持原始 `number` 类型（与 `ExecutionLog.startedAt` 一致），前端负责格式化显示。

**字段来源说明**：
- `workflowCount` = `WorkflowStore.listWorkflows().length`
- `runningCount` = `ExecutionManager.sessions.size`
- `pluginCount` = `PluginRegistry` 已注册插件数
- `todayExecutions/weekExecutions/totalExecutions` = 从执行日志按 `startedAt` 时间戳过滤计数
- `workflowName` = 需关联 `WorkflowStore.getWorkflow(workflowId).name`
- `stepCount` = 派生自 `ExecutionLog.steps.length`
- `duration` = 派生自 `finishedAt - startedAt`（均为 `number` 毫秒时间戳）
- `triggerType` = 当前不存在于 `ExecutionLog` 中，**移除**（见 YAGNI 章节）

### `dashboard:executions`

返回跨工作流执行历史，支持分页和日期范围筛选。

```typescript
// 请求：
interface DashboardExecutionsRequest {
  range?: 'today' | 'week' | 'all'  // 日期范围，默认 all
  status?: string                     // 可选状态过滤
  page?: number                       // 分页页码，默认 1
  pageSize?: number                   // 每页条数，默认 20
}

// 响应：
interface DashboardExecutionsResponse {
  items: Array<{
    id: string
    workflowId: string
    workflowName: string        // 关联 WorkflowStore 获取
    status: 'running' | 'completed' | 'paused' | 'error'
    startedAt: number           // Unix 时间戳（ms），与 ExecutionLog 一致
    finishedAt: number | null   // Unix 时间戳（ms）
    duration: number | null     // 毫秒，派生自 finishedAt - startedAt
    stepCount: number           // 派生自 steps.length
  }>
  total: number
  page: number
  pageSize: number
}
```

### `dashboard:workflow-detail`

返回单个工作流的详情，包含基本信息、版本列表和执行记录。

```typescript
// 请求：
interface DashboardWorkflowDetailRequest {
  workflowId: string
}

// 响应：
interface DashboardWorkflowDetailResponse {
  workflow: {
    id: string
    name: string
    folderId: string | null
    nodeCount: number
    edgeCount: number
    createdAt: number          // Unix 时间戳（ms），与 Workflow 类型一致
    updatedAt: number          // Unix 时间戳（ms）
  }
  versions: Array<{
    id: string
    version: number
    createdAt: number          // Unix 时间戳（ms）
    nodeCount: number
    description?: string
  }>
  executions: {
    items: Array<{
      id: string
      status: 'running' | 'completed' | 'paused' | 'error'
      startedAt: number        // Unix 时间戳（ms）
      finishedAt: number | null
      duration: number | null  // 毫秒
      stepCount: number
    }>
    total: number
  }
}
```

## 3. 前端组件与数据流

### 新增文件

```
src/views/DashboardPage.vue              -- 页面入口
src/components/dashboard/
  ├── DashboardSidebar.vue               -- 左侧 Sidebar（文件夹树 + 工作流列表）
  ├── StatsCards.vue                     -- 统计卡片行（6 张卡片）
  ├── ExecutionChart.vue                 -- 执行趋势面积折线图
  ├── ExecutionHistoryTable.vue          -- 全局执行历史表格
  ├── WorkflowDetailPanel.vue            -- 工作流详情面板（容器）
  ├── WorkflowInfoCard.vue               -- 工作流基本信息卡片
  ├── WorkflowVersionList.vue            -- 历史版本列表
  └── WorkflowExecutionTable.vue         -- 单个工作流执行记录表格
src/lib/backend-api/dashboard.ts         -- Dashboard WS 通道客户端
src/stores/dashboard.ts                  -- Dashboard Pinia store
```

### 后端新增文件

```
backend/ws/dashboard-channels.ts         -- WS 通道 handler 注册
backend/dashboard/
  └── stats-store.ts                     -- 聚合查询逻辑（含内存缓存）
```

### Shared 新增内容

在 `shared/channel-contracts.ts` 中新增 `dashboard:stats`、`dashboard:executions`、`dashboard:workflow-detail` 的类型映射。
在 `shared/channel-metadata.ts` 中新增对应元数据。

### Dashboard Store 核心状态

```typescript
interface DashboardState {
  // 统计数据
  stats: DashboardStats | null
  statsLoading: boolean

  // 全局执行历史
  executions: ExecutionRecord[]
  executionsTotal: number
  executionsLoading: boolean
  executionsRange: 'today' | 'week' | 'all'

  // 当前选中工作流
  selectedWorkflowId: string | null
  workflowDetail: WorkflowDetail | null
  workflowDetailLoading: boolean

  // 文件夹 + 工作流树
  folders: WorkflowFolder[]
  workflows: Workflow[]
  sidebarLoading: boolean
}
```

### 数据流

```
DashboardPage.vue
  └── useDashboardStore()
        ├── fetchStats()          → wsBridge.invoke('dashboard:stats')         → StatsCards + ExecutionChart
        ├── fetchExecutions(range)→ wsBridge.invoke('dashboard:executions')   → ExecutionHistoryTable
        ├── fetchWorkflowDetail() → wsBridge.invoke('dashboard:workflow-detail') → WorkflowDetailPanel
        ├── fetchFolders()        → wsBridge.invoke('workflowFolder:list')     → DashboardSidebar
        ├── fetchWorkflows()      → wsBridge.invoke('workflow:list')           → DashboardSidebar
        └── 左侧 Sidebar 选择      → selectedWorkflowId                       → 切换右侧视图模式
```

**侧边栏数据来源**：文件夹和工作流列表复用现有 WS 通道（`workflowFolder:list`、`workflow:list`），不新增接口。

### 交互逻辑

1. **页面加载**：并行请求 `stats` + `executions(all)` + `folders`（复用 `workflowFolder:list`）+ `workflows`（复用 `workflow:list`）
2. **左侧点击工作流**：设置 `selectedWorkflowId`，请求 `workflowDetail`，右侧切换到详情模式
3. **左侧点击"全部"**：清除 `selectedWorkflowId`，右侧回到概览模式
4. **范围筛选切换**（今日/本周/全部）：重新请求 `executions` 对应 range
5. **趋势图表**：使用 `stats.dailyTrend` 渲染面积折线图

## 4. 表格与图表细节

### 全局执行历史表格（ExecutionHistoryTable）

| 列名 | 字段 | 说明 |
|---|---|---|
| 工作流名称 | `workflowName` | 可点击跳转到编辑器（`router.push({ path: '/editor', query: { workflow_id } })`） |
| 状态 | `status` | Badge 显示（completed=绿色, error=红色, running=蓝色, paused=黄色） |
| 开始时间 | `startedAt` | 格式化显示（前端将 `number` 时间戳转为本地时间字符串） |
| 耗时 | `duration` | 友好格式（如 "2m 30s"） |
| 步骤数 | `stepCount` | 执行步骤总数（派生自 `steps.length`） |

支持排序（按时间/状态）和日期范围筛选 Tabs。

### 工作流执行记录表格（WorkflowExecutionTable）

与全局表类似，去掉工作流名称列，增加"查看详情"操作。

### 趋势图表（ExecutionChart）

- **类型**：面积折线图（Area Chart）
- **X 轴**：日期（最近 30 天）
- **Y 轴**：执行次数
- **双线**：成功次数（绿色）+ 失败次数（红色）
- 使用已有 `ui/chart/` 组件
- 支持悬停 Tooltip

### 版本列表（WorkflowVersionList）

列表形式展示（非表格），每项包含版本号、创建时间、节点数、备注。暂仅展示信息，不提供恢复或 diff 操作（见 YAGNI 章节）。

## 5. 错误处理

- WS 通道请求失败时，卡片和表格区域显示 Empty 状态组件（使用已有 `ui/empty/`）
- 加载中显示 Skeleton（使用已有 `ui/skeleton/`）
- 后端未启动或 WS 断线时，Dashboard 页面显示连接提示（复用 `ws-bridge.ts` 的断线检测逻辑）

## 6. 不包含的内容（YAGNI）

- 实时 WebSocket 推送统计数据（首次加载用 WS 请求-响应拉取，后续可扩展为推送）
- 导出报表功能
- 自定义日期范围选择器（仅支持今日/本周/全部三档）
- 工作流执行对比功能
- 多用户/权限相关
- 版本恢复或 diff 查看功能（版本列表仅展示信息）
- `triggerType` 字段（当前 `ExecutionLog` 不包含此字段，不虚构）
