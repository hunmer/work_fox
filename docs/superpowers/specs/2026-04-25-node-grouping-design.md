# Node Grouping Design

> 日期：2026-04-25
> 状态：Draft

## 概述

为工作流编辑器添加节点分组功能。用户可以选中多个节点，右键创建分组，将节点用可视化容器包裹。分组是纯视觉容器，不影响工作流执行。支持嵌套分组、分组内节点自由移动、手动调大小触发自动排序、分组管理面板。

## 需求决策

| 决策项 | 结论 |
|--------|------|
| 执行角色 | 纯视觉容器，执行时透明穿透 |
| 尺寸策略 | 实时跟随子节点 bounding box + padding |
| 手动调大小 | 触发网格排序，排序后回到 bounding box 模式 |
| 排序算法 | 网格等距排列 |
| 数据存储 | Workflow 模型字段，随工作流持久化到后端 |
| 成员关系 | 一对一（一个节点最多属于一个分组） |
| 嵌套 | 支持分组嵌套分组 |
| 固定 | 只锁分组结构（不可解除/删除），节点仍可移动 |
| 禁用 | 记忆每个节点原始状态，恢复时还原 |

## 实现方案

**方案：分组作为独立数据模型 + VueFlow 自定义节点渲染**

在 `Workflow` 类型上新增 `groups: WorkflowGroup[]` 字段。同时注册一个 `group` 节点类型到 VueFlow，分组以虚拟节点形式渲染在画布上。复用 VueFlow 坐标系统、NodeResizer 组件，避免手动同步 pan/zoom。

## 1. 数据模型

### 新增类型 `WorkflowGroup`

文件：`shared/workflow-types.ts`

```typescript
export interface WorkflowGroup {
  id: string
  name: string
  childNodeIds: string[]                         // 直接子节点 ID（不含嵌套子分组的子节点）
  childGroupIds: string[]                        // 直接子分组 ID（嵌套）
  locked: boolean                                // 固定状态
  disabled: boolean                              // 分组级禁用开关
  savedNodeStates: Record<string, NodeRunState>  // 禁用前记忆每个节点的状态
}
```

### 修改 `Workflow` 接口

```typescript
export interface Workflow {
  // ... 现有字段 ...
  groups?: WorkflowGroup[]  // 所有分组，可选字段保持向后兼容
}
```

**设计要点**：
- `childNodeIds` / `childGroupIds` 是扁平 ID 列表，通过递归查询嵌套关系
- `savedNodeStates` 只在 `disabled = true` 时有值
- `groups` 可选，旧工作流完全向后兼容
- 分组没有 `position` 字段——position 和 size 由子节点 bounding box 实时计算

## 2. 分组节点组件

### 新增组件

文件：`src/components/workflow/GroupNode.vue`

注册为 VueFlow 的 `group` 节点类型。

### 渲染结构

```
┌─────────────────────────────────────────┐
│ [可编辑名称]              [按钮组: ↓]   │  ← 标题栏（半透明背景）
│                                         │
│   (子节点渲染在此区域内)                  │  ← 透明内容区 + 虚线边框
│                                         │
└─────────────────────────────────────────┘
```

- **标题栏**：半透明背景，左侧 inline-input 显示分组名（双击可编辑），右侧下拉按钮展开操作菜单
- **内容区**：透明背景 + 虚线边框，子节点渲染在上方（z-index 更高）
- **固定态视觉**：标题栏加锁图标，边框变为实线
- **禁用态视觉**：整体覆盖红色半透明遮罩
- **NodeResizer**：始终显示四角 resize handle（非预览模式下）

### 操作菜单项

标题栏右侧下拉菜单：
1. **整理节点** — 触发网格排列
2. **切换固定** — locked 切换
3. **切换禁用** — disabled 切换
4. **解除分组** — locked 时禁用此项
5. **删除分组** — 含子节点一起删除

### Z-Index 策略

- Group 节点 CSS `z-index: -1`，始终在普通节点下方
- 标题栏 `pointer-events: auto`，内容区 `pointer-events: none`
- Resize handle 通过 `pointer-events: auto` 保持可操作

### Position/Size 同步

- 在 `useFlowCanvas.ts` 的 `onNodesChange` 中监听节点位置变化
- 节点位置变化时，查找其所属分组，重新计算该分组的 bounding box
- 通过 VueFlow 的 `updateNode` 更新 group 节点的 position 和 dimensions
- 嵌套分组时，从最内层向外逐层更新

## 3. 右键菜单集成

### 改动位置

文件：`src/components/workflow/CustomNodeWrapper.vue`

### 菜单逻辑

**多选时（≥2 个节点选中）**：显示多选菜单
- 合并成组
- 批量删除

**单选时**：保持现有菜单，新增一项
- 加入分组（弹出已有分组列表供选择）

实现方式：通过 `store.selectedNodeIds.length >= 2` 切换菜单内容。

## 4. WorkflowStore 新增方法

文件：`src/stores/workflow.ts`

```typescript
// 创建分组
createGroup(nodeIds: string[], name?: string): void
// 生成 groupId，创建 WorkflowGroup 加入 workflow.groups
// 从已有分组中移除这些节点（因为一对一关系）

// 解除分组（保留节点）
ungroup(groupId: string): void
// 移除 group，子分组提升到父分组或顶层

// 删除分组（含节点）
deleteGroup(groupId: string): void
// 递归删除子分组及其节点

// 将节点加入分组
addNodesToGroup(groupId: string, nodeIds: string[]): void

// 从分组移除节点
removeNodesFromGroup(groupId: string, nodeIds: string[]): void

// 切换固定
toggleGroupLock(groupId: string): void

// 切换禁用
toggleGroupDisabled(groupId: string): void
// 禁用时：遍历所有子孙节点，记录当前状态到 savedNodeStates，设为 disabled
// 恢复时：从 savedNodeStates 还原每个节点的状态

// 整理节点（网格排列）
arrangeGroupNodes(groupId: string): void

// 获取节点所属分组
getGroupOfNode(nodeId: string): WorkflowGroup | undefined

// 递归获取分组所有子孙节点 ID
getDescendantNodeIds(groupId: string): string[]
```

### 加入分组冲突处理

一对一关系下，如果节点 A 已在分组 1 中，用户将其加入分组 2 时：
- 自动从分组 1 中移除
- 如果分组 1 因此变空，自动删除分组 1

## 5. 分组管理面板

### 入口位置

文件：`src/components/workflow/WorkflowEditor.vue:561~568` 右侧工具栏新增按钮，图标用 `Layers`，点击打开 FloatingPanel。

### 面板布局

```
┌─ 分组管理 ───────────────── [批量删除] [×] ┐
│                                             │
│  ☐  数据处理分组         [编辑] [删除]      │
│  ☐  输出节点组           [编辑] [删除]      │
│  ☑  AI 调用分组          [编辑] [删除]      │
│  ☐  嵌套子分组           [编辑] [删除]      │
│                                             │
└─────────────────────────────────────────────┘
```

- **Checkbox**：左侧每行一个，支持多选
- **编辑按钮**：点击进入内联编辑模式，修改分组名称
- **删除按钮**：删除单个分组（默认保留节点）
- **批量删除按钮**：右上角，删除所有勾选的分组

### 面板与画布联动

- 点击面板中的分组名 → 画布聚焦到该分组（fitView 到分组 bounding box）
- 画布中创建/删除分组 → 面板实时刷新
- 面板通过 `store.currentWorkflow.groups` 响应式驱动

### 数据流

```
FloatingPanel (GroupManagePanel)
    ↕ 读写
WorkflowStore.groups
    ↕ 同步
VueFlow group 节点
```

面板组件直接读写 store。FloatingPanel 只负责浮动容器（位置、拖拽、折叠）。

## 6. 自动排序算法

### 网格排列逻辑

```
1. 获取分组直接子节点列表
2. 计算分组当前可用区域（bounding box - 标题栏高度 - padding）
3. 确定列数 = floor(可用宽度 / (节点平均宽度 + 间距))
4. 按行列排列节点，每个节点居中放置在网格单元中
5. 更新节点 position
6. 分组 bounding box 自动跟随更新
```

参数：
- `GRID_GAP = 30` — 节点间最小间距
- `PADDING = 20` — 分组内边距
- `HEADER_HEIGHT = 32` — 标题栏高度

嵌套分组内节点排序时，只排列直接子节点，子分组作为整体参与排列。

## 7. 手动调大小流程

```
用户拖动四角 resize handle
    → VueFlow NodeResizer 触发 node dimension 变更
    → onNodeDimensionChange 拦截 group 节点变更
    → 暂时锁定 group 为手动指定尺寸
    → 触发 arrangeGroupNodes
    → 排列完成后，移除手动尺寸锁定
    → group 回到 bounding box 模式
```

通过标志位 `manualResizing` 控制，排序完成后清除，分组立即回到 bounding box 计算。

## 涉及文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `shared/workflow-types.ts` | 修改 | 新增 `WorkflowGroup` 类型，`Workflow` 增加 `groups` 字段 |
| `src/components/workflow/GroupNode.vue` | 新增 | 分组节点渲染组件 |
| `src/components/workflow/GroupManagePanel.vue` | 新增 | 分组管理面板内容组件 |
| `src/components/workflow/CustomNodeWrapper.vue` | 修改 | 多选菜单 + 加入分组菜单项 |
| `src/components/workflow/WorkflowEditor.vue` | 修改 | 工具栏新增分组管理按钮，注册 group 节点类型 |
| `src/components/workflow/WorkflowCanvas.vue` | 修改 | 注册 group 自定义节点 |
| `src/stores/workflow.ts` | 修改 | 新增分组管理方法 |
| `src/composables/workflow/useFlowCanvas.ts` | 修改 | 节点位置变化时同步分组 bounding box |
| `src/lib/workflow/nodeRegistry.ts` | 修改 | 注册 group 节点类型定义 |
| `backend/workflow/execution-manager.ts` | 修改 | 执行时过滤 group 节点 |
