# Dashboard 统计页面设计

> 日期：2026-04-27
> 状态：草案

## 概述

在 WorkFox 前端新增 `/dashboard` 路由，提供全局统计概览和单工作流详情两种视图。页面采用 shadcn-vue Sidebar 组件实现独立侧边栏布局，不依赖全局导航改动。后端新增专用 HTTP API 端点提供聚合统计数据。

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

## 2. 后端 HTTP API

在后端新增 `backend/dashboard/` 目录，提供 3 个 HTTP 端点。在 `backend/main.ts` 中注册路由。

### `GET /api/dashboard/stats`

返回全局聚合统计。

```typescript
interface DashboardStats {
  workflowCount: number
  runningCount: number
  pluginCount: number
  todayExecutions: number
  weekExecutions: number
  totalExecutions: number
  // 趋势数据：最近 30 天每日执行次数
  dailyTrend: Array<{
    date: string       // YYYY-MM-DD
    count: number      // 总执行次数
    success: number    // 成功次数
    error: number      // 失败次数
  }>
}
```

**实现策略**：遍历所有工作流的 `execution_history/` 目录，读取执行日志元数据，聚合计算统计值。趋势数据从执行日志的 `startedAt` 字段按日聚合。

### `GET /api/dashboard/executions`

返回跨工作流执行历史，支持分页和日期范围筛选。

查询参数：

```typescript
interface ExecutionQuery {
  range?: 'today' | 'week' | 'all'  // 日期范围，默认 all
  status?: string                     // 可选状态过滤
  page?: number                       // 分页页码，默认 1
  pageSize?: number                   // 每页条数，默认 20
}
```

响应结构：

```typescript
interface ExecutionHistoryResponse {
  items: Array<{
    id: string
    workflowId: string
    workflowName: string
    status: 'running' | 'completed' | 'paused' | 'error'
    startedAt: string
    finishedAt: string | null
    duration: number | null           // 毫秒
    stepCount: number
    triggerType?: string
  }>
  total: number
  page: number
  pageSize: number
}
```

### `GET /api/dashboard/workflow/:id`

返回单个工作流的详情，包含基本信息、版本列表和执行记录。

响应结构：

```typescript
interface WorkflowDetailResponse {
  workflow: {
    id: string
    name: string
    folderId: string | null
    nodeCount: number
    edgeCount: number
    createdAt: string
    updatedAt: string
  }
  versions: Array<{
    id: string
    version: number
    createdAt: string
    nodeCount: number
    description?: string
  }>
  executions: {
    items: Array<{
      id: string
      status: 'running' | 'completed' | 'paused' | 'error'
      startedAt: string
      finishedAt: string | null
      duration: number | null
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
src/lib/backend-api/dashboard.ts         -- Dashboard HTTP API 客户端
src/stores/dashboard.ts                  -- Dashboard Pinia store
```

### 后端新增文件

```
backend/dashboard/
  ├── routes.ts                          -- HTTP 路由定义
  └── stats-store.ts                     -- 聚合查询逻辑
```

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
        ├── fetchStats()          → GET /api/dashboard/stats         → StatsCards + ExecutionChart
        ├── fetchExecutions(range)→ GET /api/dashboard/executions    → ExecutionHistoryTable
        ├── fetchWorkflowDetail() → GET /api/dashboard/workflow/:id  → WorkflowDetailPanel
        └── 左侧 Sidebar 选择      → selectedWorkflowId              → 切换右侧视图模式
```

### 交互逻辑

1. **页面加载**：并行请求 `stats` + `executions(all)` + `folders` + `workflows`
2. **左侧点击工作流**：设置 `selectedWorkflowId`，请求 `workflowDetail`，右侧切换到详情模式
3. **左侧点击"全部"**：清除 `selectedWorkflowId`，右侧回到概览模式
4. **范围筛选切换**（今日/本周/全部）：重新请求 `executions` 对应 range
5. **趋势图表**：使用 `stats.dailyTrend` 渲染面积折线图

## 4. 表格与图表细节

### 全局执行历史表格（ExecutionHistoryTable）

| 列名 | 字段 | 说明 |
|---|---|---|
| 工作流名称 | `workflowName` | 可点击跳转到编辑器 |
| 状态 | `status` | Badge 显示（completed=绿色, error=红色, running=蓝色, paused=黄色） |
| 开始时间 | `startedAt` | 格式化显示 |
| 耗时 | `duration` | 友好格式（如 "2m 30s"） |
| 步骤数 | `stepCount` | 执行步骤总数 |
| 触发方式 | `triggerType` | 可选列 |

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

列表形式展示（非表格），每项包含版本号、创建时间、节点数、备注。可点击恢复或查看 diff。

## 5. 错误处理

- API 请求失败时，卡片和表格区域显示 Empty 状态组件（使用已有 `ui/empty/`）
- 加载中显示 Skeleton（使用已有 `ui/skeleton/`）
- 后端未启动时，Dashboard 页面显示连接提示（参考现有 WS 断线处理逻辑）

## 6. 不包含的内容（YAGNI）

- 实时 WebSocket 推送统计数据（首次加载用 HTTP 拉取即可，后续可扩展）
- 导出报表功能
- 自定义日期范围选择器（仅支持今日/本周/全部三档）
- 工作流执行对比功能
- 多用户/权限相关
