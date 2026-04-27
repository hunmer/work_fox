# Dashboard P4: Navigation Integration & Polish

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 HomePage 中添加 Dashboard 入口，完善 App.vue 中的导航体验，处理边界情况和样式调优。

**Architecture:** 在 HomePage/WelcomePage 中添加一个"Dashboard"入口卡片；处理空状态、断线状态、响应式布局。

**Tech Stack:** Vue 3, Tailwind CSS 4, shadcn-vue

**Depends on:** P3 (Page & Components)

---

### Task 1: HomePage 添加 Dashboard 入口

**Files:**
- Modify: `src/views/HomePage.vue`
- Possibly modify: `src/components/workflow/WelcomePage.vue`

- [ ] **Step 1: 查看 WelcomePage 组件接口**

Run: `grep -n "defineProps\|defineEmits\|<template" "G:/programming/nodejs/work_fox/src/components/workflow/WelcomePage.vue" | head -20`

确认 WelcomePage 的 props 和 events 接口，了解如何添加新入口。

- [ ] **Step 2: 在 HomePage.vue 中添加 Dashboard 导航**

如果 WelcomePage 有 slot 或 action 区域，添加 Dashboard 按钮。否则在 HomePage 中添加独立按钮：

```vue
<!-- In HomePage.vue template, after WelcomePage or as part of it -->
<router-link
  to="/dashboard"
  class="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
>
  <IconChartBar class="h-4 w-4" />
  统计面板
</router-link>
```

或者在 WelcomePage 的操作区域添加一个入口卡片。具体方式取决于 WelcomePage 的结构。

- [ ] **Step 3: 验证入口可见**

Run: `cd "G:/programming/nodejs/work_fox" && pnpm dev`

在 `http://localhost:5173/#/home` 确认 Dashboard 入口可见且可点击跳转。

- [ ] **Step 4: Commit**

```bash
git add src/views/HomePage.vue
git commit -m "feat(dashboard): add dashboard entry point on home page"
```

---

### Task 2: 空状态与错误处理

**Files:**
- Modify: `src/views/DashboardPage.vue`
- Modify: `src/components/dashboard/StatsCards.vue`
- Modify: `src/components/dashboard/ExecutionHistoryTable.vue`

- [ ] **Step 1: 添加后端断线状态处理**

在 DashboardPage 中检测 WS 连接状态。参考 `src/App.vue` 中已有的断线检测模式：

```vue
<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { wsBridge } from '@/lib/ws-bridge'
// ...existing imports...

const wsConnected = ref(true)

onMounted(() => {
  wsBridge.on('connected', () => { wsConnected.value = true })
  wsBridge.on('disconnected', () => { wsConnected.value = false })
})

// ...existing code...
</script>

<template>
  <!-- 在 SidebarInset 内容区域顶部添加断线提示 -->
  <div v-if="!wsConnected" class="border-b bg-destructive/10 px-4 py-2 text-center text-sm text-destructive">
    后端服务未连接，统计数据无法加载
  </div>
  <!-- ...rest of template... -->
</template>
```

**注意**：确认 `wsBridge` 的事件名称是 `connected`/`disconnected` 还是其他。查看 `src/lib/ws-bridge.ts` 中 emit 的事件名。

- [ ] **Step 2: 确认 wsBridge 事件名**

Run: `grep -n "emit\|on(" "G:/programming/nodejs/work_fox/src/lib/ws-bridge.ts" | head -20`

- [ ] **Step 3: 添加完全空状态处理**

当 `stats` 和 `executions` 都为空且不在加载中时，显示一个居中的空状态引导：

```vue
<!-- 在概览模式中，当没有任何数据时 -->
<div v-if="!store.statsLoading && !store.stats?.workflowCount" class="flex flex-1 items-center justify-center py-20">
  <Empty
    description="还没有任何工作流数据"
    icon="workflow"
  />
</div>
```

- [ ] **Step 4: Commit**

```bash
git add src/views/DashboardPage.vue src/components/dashboard/
git commit -m "feat(dashboard): add connection status and empty state handling"
```

---

### Task 3: 响应式布局调优

**Files:**
- Modify: `src/components/dashboard/StatsCards.vue`
- Modify: `src/views/DashboardPage.vue`

- [ ] **Step 1: 调整卡片响应式断点**

确认 StatsCards 在不同屏幕宽度下正确响应：
- 大屏（lg）：3 列
- 中屏（md）：2 列
- 小屏（sm）：1 列

当前实现 `grid-cols-1 sm:grid-cols-2 md:grid-cols-3` 已覆盖。验证即可。

- [ ] **Step 2: 侧边栏移动端适配**

shadcn-vue Sidebar 的 `collapsible="offcanvas"` 已自动处理移动端。确认在窄屏下 Sidebar 正常收起。

- [ ] **Step 3: 图表高度适配**

确认 ExecutionChart 在不同容器宽度下高度一致（固定 `h-[300px]`）。

- [ ] **Step 4: 验证**

在浏览器中调整窗口大小，确认响应式正常。

- [ ] **Step 5: Commit（如有改动）**

```bash
git add src/components/dashboard/
git commit -m "style(dashboard): adjust responsive layout breakpoints"
```

---

### Task 4: Dark Mode 兼容

**Files:**
- Modify: `src/styles/globals.css`（如需添加 chart 颜色变量）

- [ ] **Step 1: 确认 chart 颜色变量在 dark mode 下正常**

Run: `grep -A5 "dark" "G:/programming/nodejs/work_fox/src/styles/globals.css" | grep chart`

如果 chart 颜色使用 CSS 变量（如 `hsl(var(--chart-1))`），确认 dark 模式下有对应覆盖：

```css
.dark {
  --chart-1: ...;
  --chart-2: ...;
}
```

- [ ] **Step 2: 测试 dark mode**

在应用中切换 dark mode（设置面板），确认 Dashboard 页面所有组件颜色正常。

- [ ] **Step 3: Commit（如有改动）**

```bash
git add src/styles/globals.css
git commit -m "style(dashboard): ensure chart colors work in dark mode"
```

---

### Task 5: 最终集成测试

- [ ] **Step 1: 全量编译**

Run: `cd "G:/programming/nodejs/work_fox" && pnpm build 2>&1 | tail -10`

- [ ] **Step 2: 启动完整应用**

Run: `cd "G:/programming/nodejs/work_fox" && pnpm dev`

验证完整流程：
1. Home 页面 → 点击 Dashboard 入口 → 跳转到 `/dashboard`
2. Dashboard 概览模式 → 统计卡片、图表、表格正常显示
3. 切换日期范围（今日/本周/全部）→ 表格数据更新
4. 左侧点击工作流 → 右侧切换到详情模式
5. 点击"返回概览" → 回到概览模式
6. Sidebar 文件夹展开/折叠正常
7. 切换 dark mode → 样式正常
8. 调整窗口大小 → 响应式正常

- [ ] **Step 3: 修复所有发现的问题**

- [ ] **Step 4: 最终 Commit**

```bash
git add -A
git commit -m "feat(dashboard): complete dashboard page with navigation integration"
```
