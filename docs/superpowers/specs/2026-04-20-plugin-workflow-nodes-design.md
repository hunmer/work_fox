# 插件注册工作流节点 - 设计文档

## 目标

将硬编码的工作流节点（尤其窗口管理类）改为插件系统提供，插件通过独立 `workflow.js` 注册自定义节点，工作流可选择性启用插件。

## 方案

方案 A：插件 `workflow.js` 声明式注册。插件导出节点定义 + handler，PluginContext 扩展 API 暴露主进程能力。

## 1. 插件文件结构

```
plugins/my-plugin/
  info.json          # 插件元信息
  main.js            # 插件生命周期（activate/deactivate）
  workflow.js        # 可选，提供工作流节点
  icon.png
```

### info.json 新增字段

```json
{
  "id": "workfox.window-manager",
  "hasWorkflow": true
}
```

`hasWorkflow: true` 声明此插件提供工作流节点。PluginManager 加载时检查此字段，存在则加载 `workflow.js`。

### workflow.js 导出规范

```js
module.exports = {
  nodes: [
    {
      type: 'create_window',
      label: '创建窗口',
      category: '窗口管理',
      icon: 'AppWindow',
      description: '创建独立浏览器窗口',
      properties: [
        { key: 'url', label: 'URL', type: 'text', required: true },
        { key: 'width', label: '宽度', type: 'number', default: 1280 },
        { key: 'height', label: '高度', type: 'number', default: 800 }
      ],
      handles: { source: true, target: true },
      handler: async (ctx, args) => {
        const win = await ctx.api.createWindow(args)
        return { success: true, data: { windowId: win.id } }
      }
    }
  ]
}
```

类型复用现有 `NodeTypeDefinition`，增加可选 `handler` 和 `handles` 字段。handler 签名：

```ts
type NodeHandler = (ctx: PluginNodeContext, args: Record<string, any>) => Promise<ToolResult>
```

## 2. PluginContext API 扩展

当前 PluginContext 只有 events、storage、logger、sendToRenderer。新增 `api` 命名空间暴露主进程能力。

### 新增接口

```ts
interface PluginContext {
  api?: {
    createWindow(opts: { url, title?, width?, height? }): Promise<{ id, webContentsId }>
    closeWindow(windowId: number): Promise<void>
    navigateWindow(windowId: number, url: string): Promise<void>
    focusWindow(windowId: number): Promise<void>
    screenshotWindow(windowId: number): Promise<string>
    getWindowDetail(windowId: number): Promise<object>
    listWindows(): Promise<object[]>
  }
}
```

### 安全约束

- 只有 `hasWorkflow: true` 的插件，context 才注入 `api`
- handler 执行时 catch 错误，返回 `{ success: false, message: err.message }`
- 未来其他能力（DOM操作、网络请求等）通过 `api` 逐步扩展

### 实现

在 `plugin-context.ts` 中注入窗口管理器引用。将现有 `workflow-tool-executor.ts` 中的窗口操作逻辑提取为独立模块供 `api` 调用。

## 3. 节点注册流程

### PluginManager 加载流程

```
PluginManager.load(pluginDir)
  1. 读 info.json → 检查 hasWorkflow
  2. hasWorkflow && 存在 workflow.js → require workflow.js
  3. 将 workflow.nodes 注册到 WorkflowNodeRegistry（主进程侧）
  4. 通知渲染进程节点列表变更（IPC）
```

### 主进程 WorkflowNodeRegistry（新增）

文件：`electron/services/workflow-node-registry.ts`

```ts
// 插件节点注册表
registerPluginNodes(pluginId: string, nodes: NodeDefinition[], handlers: HandlerMap): void
unregisterPluginNodes(pluginId: string): void
getPluginNodeDefinitions(): PluginNodeManifest[]
getHandler(nodeType: string): NodeHandler | undefined
```

### workflow-tool-executor.ts 变更

`executeWorkflowTool` 查找 handler 顺序：
1. 内置 WORKFLOW_TOOL_HANDLERS
2. 插件注册的 handler（通过 WorkflowNodeRegistry）

内置的窗口管理 handler 移除，由窗口管理插件提供。

### tools.ts 变更

`createWindowTools()` 中的窗口管理工具定义移除，改为从插件获取。

## 4. 工作流数据模型变更

### Workflow 新增字段

```ts
interface Workflow {
  // 现有字段不变
  id: string
  name: string
  folderId: string | null
  description?: string
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  createdAt: number
  updatedAt: number

  // 新增
  enabledPlugins: string[]  // 已启用的插件 ID 列表
}
```

`enabledPlugins` 存储当前工作流启用了哪些插件。前端根据此字段过滤展示的节点。

## 5. NodeSidebar UI 变更

### 搜索框右侧加号按钮

```
┌─────────────────────────┐
│ [搜索节点...]       [+] │
├─────────────────────────┤
│ 内置节点分类...          │
│ 插件节点分类...          │
└─────────────────────────┘
```

### PluginPickerDialog.vue（新增）

点击 [+] 弹出独立对话框，列出所有 `hasWorkflow: true` 的插件：

- 显示：图标、名称、描述、提供的节点数量
- 复选框切换启用/禁用
- 切换后更新当前工作流的 `enabledPlugins` 字段

### NodeSidebar 数据流

1. 读取当前工作流的 `enabledPlugins`
2. 通过 IPC 获取这些插件注册的节点定义
3. 合并到 categories computed 中展示
4. 插件节点与内置节点使用相同拖拽逻辑

## 6. IPC 新增

| 通道 | 说明 |
|------|------|
| `plugin:get-workflow-nodes` (pluginId) | 获取指定插件的节点定义列表 |
| `plugin:list-workflow-plugins` | 获取所有 hasWorkflow 的插件列表 |

## 7. 现有窗口管理节点迁移

将窗口管理节点从内置代码迁移为 `plugins/window-manager/` 插件：

- `workflow.js` 导出 7 个窗口节点（create/navigate/close/list/focus/screenshot/get_window_detail）
- `main.js` 标准 activate/deactivate
- 从 `workflow-tool-executor.ts` 的 NODE_TYPE_DEFINITIONS 中移除窗口管理类
- 从 `tools.ts` 的 createWindowTools() 中移除窗口管理工具
- 从 `nodeRegistry.ts` 的 toolSchemas 和 iconMap 中移除窗口管理条目

## 8. 涉及文件清单

| 文件 | 变更类型 |
|------|----------|
| `electron/services/plugin-context.ts` | 修改 - 新增 api 命名空间 |
| `electron/services/plugin-manager.ts` | 修改 - 加载 workflow.js |
| `electron/services/plugin-types.ts` | 修改 - PluginContext 新增 api |
| `electron/services/workflow-node-registry.ts` | 新增 - 插件节点注册表 |
| `electron/services/workflow-tool-executor.ts` | 修改 - 移除窗口节点，查插件 handler |
| `electron/ipc/plugin.ts` | 修改 - 新增 IPC 通道 |
| `src/types/plugin.ts` | 修改 - 同步 PluginContext 类型 |
| `src/lib/workflow/types.ts` | 修改 - Workflow 新增 enabledPlugins |
| `src/lib/workflow/nodeRegistry.ts` | 修改 - 移除窗口节点，合并插件节点 |
| `src/lib/agent/tools.ts` | 修改 - 移除 createWindowTools |
| `src/components/workflow/NodeSidebar.vue` | 修改 - 加号按钮 + 插件节点展示 |
| `src/components/workflow/PluginPickerDialog.vue` | 新增 - 插件选择对话框 |
| `src/stores/plugin.ts` | 修改 - 新增工作流插件相关方法 |
| `plugins/window-manager/` | 新增 - 窗口管理插件 |
