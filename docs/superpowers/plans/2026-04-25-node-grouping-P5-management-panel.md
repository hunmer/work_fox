# P5: 分组管理面板

> 前置依赖：P3 Store 方法
> 设计规格：`docs/superpowers/specs/2026-04-25-node-grouping-design.md` 第 5 节

## 目标

在编辑器右侧工具栏新增分组管理入口，使用 FloatingPanel 展示管理面板。

## 任务

### 1. 工具栏新增入口

文件：`src/components/workflow/WorkflowEditor.vue:561~568`

在右侧 50px 工具栏中新增按钮，图标 `Layers`，点击切换 FloatingPanel 显隐。

### 2. 新增 GroupManagePanel.vue

文件：`src/components/workflow/GroupManagePanel.vue`

面板内容：
- 响应式列表，遍历 `store.currentWorkflow.groups`
- 每行：左侧 Checkbox + 分组名称 + 右侧编辑/删除按钮
- 右上角：批量删除按钮（删除所有勾选的分组）
- 编辑模式：点击编辑按钮，名称变为 inline-input

### 3. FloatingPanel 集成

```vue
<FloatingPanel
  v-model:visible="groupPanelVisible"
  title="分组管理"
  :x="panelX" :y="panelY"
  :width="320" :height="300"
>
  <GroupManagePanel />
</FloatingPanel>
```

### 4. 画布联动

- 点击分组名称 → 调用 VueFlow `fitView` 聚焦到分组 bounding box
- 创建/删除分组 → 列表自动刷新（响应式驱动）

## 验证

- 工具栏按钮打开面板
- 列表显示所有分组
- 编辑/删除/批量删除功能正常
- 点击分组名画布聚焦
