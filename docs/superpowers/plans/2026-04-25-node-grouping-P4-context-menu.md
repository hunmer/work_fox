# P4: 右键菜单集成

> 前置依赖：P2 分组节点组件 + P3 Store 方法
> 设计规格：`docs/superpowers/specs/2026-04-25-node-grouping-design.md` 第 3 节

## 目标

在节点右键菜单中集成分组操作：多选合并成组、单选加入分组。

## 任务

### 1. 多选菜单

文件：`src/components/workflow/CustomNodeWrapper.vue`

在 `ContextMenuContent` 中，当 `store.selectedNodeIds.length >= 2` 时显示：
- **合并成组** — 调用 `store.createGroup(store.selectedNodeIds)`
- **批量删除** — 调用现有 `useClipboard.deleteSelected()`

### 2. 单选菜单新增项

在现有单选菜单中新增：
- **加入分组** — 弹出已有分组列表 Popover，选择目标分组后调用 `store.addNodesToGroup(groupId, [props.id])`

### 3. 分组节点右键菜单

文件：`src/components/workflow/GroupNode.vue`

GroupNode 自身的右键菜单复用操作菜单项（整理、固定、禁用、解除、删除），通过 ContextMenu 组件实现。

## 验证

- 多选 2+ 节点，右键出现"合并成组"
- 单选节点，右键出现"加入分组"选项
- 分组节点右键出现分组操作菜单
