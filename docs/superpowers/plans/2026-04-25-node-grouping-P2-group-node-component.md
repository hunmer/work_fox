# P2: 分组节点组件

> 前置依赖：P1 数据模型
> 设计规格：`docs/superpowers/specs/2026-04-25-node-grouping-design.md` 第 2 节

## 目标

实现 GroupNode.vue 组件，注册到 VueFlow，实现分组在画布上的渲染与交互。

## 任务

### 1. 新增 GroupNode.vue

文件：`src/components/workflow/GroupNode.vue`

渲染内容：
- 标题栏：半透明背景，左可编辑名称，右下拉操作菜单
- 内容区：透明 + 虚线边框，`pointer-events: none`
- 状态：固定态（锁图标+实线边框）、禁用态（红色遮罩）
- NodeResizer：四角 resize handle（非预览模式）

操作菜单项：整理节点、切换固定、切换禁用、解除分组、删除分组

### 2. 注册 VueFlow 节点类型

文件：`src/components/workflow/WorkflowCanvas.vue`

在 `nodeTypes` 中注册 `{ group: GroupNode }`。

### 3. VueFlow 节点映射

文件：`src/composables/workflow/useFlowCanvas.ts`

在 `nodes` computed 中追加分组节点：
- 遍历 `store.currentWorkflow.groups`
- 计算 bounding box 作为 position
- 设置 `type: 'group'`，`z-index: -1`

### 4. Bounding Box 同步

文件：`src/composables/workflow/useFlowCanvas.ts`

在 `onNodesChange` 中：
- 监听节点 position 变化
- 查找节点所属分组
- 重新计算分组 bounding box
- 更新 VueFlow 中对应 group 节点
- 嵌套分组由内向外逐层更新

## 验证

- 手动创建 group 数据，确认画布渲染正确
- 拖动子节点，分组边界实时跟随
- 分组 z-index 低于普通节点
