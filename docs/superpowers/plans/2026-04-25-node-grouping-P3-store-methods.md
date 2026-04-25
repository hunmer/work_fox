# P3: WorkflowStore 分组管理方法

> 前置依赖：P1 数据模型
> 设计规格：`docs/superpowers/specs/2026-04-25-node-grouping-design.md` 第 4、6、7 节

## 目标

在 WorkflowStore 中实现分组 CRUD、状态切换、自动排序、删除清理等核心逻辑。

## 任务

### 1. 基础查询方法

- `getGroupOfNode(nodeId)` — 查找节点所属分组
- `getDescendantNodeIds(groupId)` — 递归获取所有子孙节点 ID
- `getDescendantGroupIds(groupId)` — 递归获取所有子分组 ID
- `getParentGroup(groupId)` — 查找父分组

### 2. 分组 CRUD

- `createGroup(nodeIds, name?)` — 创建分组，自动从其他分组移除这些节点
- `ungroup(groupId)` — 解除分组保留节点，子分组提升到父分组或顶层
- `deleteGroup(groupId)` — 递归删除分组及其所有子孙节点
- `addNodesToGroup(groupId, nodeIds)` — 冲突处理：自动从旧分组移除
- `removeNodesFromGroup(groupId, nodeIds)` — 移除节点

### 3. 状态切换

- `toggleGroupLock(groupId)` — 切换固定
- `toggleGroupDisabled(groupId)` — 切换禁用
  - 禁用：遍历子孙节点，记录状态到 savedNodeStates，设为 disabled
  - 恢复：从 savedNodeStates 还原

### 4. 节点删除清理

在现有 `removeNode` 方法中增加后处理：
- 查找被删节点所属分组
- 从 `childNodeIds` 中移除
- 空分组自动删除

### 5. 网格排列算法

`arrangeGroupNodes(groupId)`：
- 获取直接子节点
- 计算可用区域（bounding box - HEADER_HEIGHT - PADDING）
- `列数 = floor(宽度 / (节点平均宽度 + GRID_GAP))`
- 按网格排列，居中放置
- 子分组作为整体参与排列

### 6. 手动调大小流程

- `manualResizing` 标志位
- resize 触发时置 true，调用 arrangeGroupNodes
- 排列完成后置 false，回到 bounding box 模式

## 参数常量

```typescript
const GRID_GAP = 30
const PADDING = 20
const HEADER_HEIGHT = 32
```

## 验证

- 创建/解除/删除分组数据正确
- 一对一冲突处理正确（节点从旧分组自动移到新分组）
- 禁用/恢复状态记忆正确
- 删除节点后分组数据同步清理
