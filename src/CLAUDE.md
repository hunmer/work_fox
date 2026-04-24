[根目录](../CLAUDE.md) > **src**

# 渲染进程（Vue 3 SPA）

> WorkFox 的前端渲染层，基于 Vue 3 + Pinia + Vue Router + Tailwind CSS 构建的单页应用，负责工作流编辑器、Chat 对话面板、设置管理等所有用户界面。支持 Electron 桌面模式和纯浏览器 Web 模式。

## 模块职责

1. **工作流可视化编辑**：基于 Vue Flow 的拖拽式 DAG 编辑器，支持节点拖入/连线/属性编辑/执行调试，含嵌入式子工作流和复合节点（loop 等）
2. **AI Chat 对话**：多会话管理、流式输出渲染、工具调用展示、thinking blocks，Chat 工具可直接操作工作流图
3. **插件视图**：加载和展示第三方插件提供的自定义 UI，含 Electron 本地 view 与 Web CDN view
4. **设置管理**：AI Provider 配置、快捷键绑定、主题切换、Agent 全局设置
5. **命令面板**：全局命令搜索与执行面板
6. **Web 模式支持**：通过 `src/web/` 目录的 BrowserAPIAdapter 实现脱离 Electron 运行
7. **复合节点 UI**：嵌入式子工作流编辑器（EmbeddedWorkflowEditor）、Loop 循环体容器、条件编辑器、变量选择器

## 入口与启动

### Electron 模式

- **HTML 入口**：`index.html`（根目录）-> `src/main.ts`
- 启动流程：
  1. 创建 Pinia 实例和 Vue Router
  2. 初始化 ThemeStore（恢复主题偏好）
  3. 挂载 App.vue
  4. App.vue `onMounted` 时初始化 PluginStore、AIProviderStore、TabStore

### Web 模式

- **HTML 入口**：`index-web.html`（根目录）-> `src/web/web-entry.ts`
- 启动流程：
  1. 在模块顶层注入 `BrowserAPIAdapter` 到 `window.api`（在任何 store 导入之前）
  2. 通过 `wsBridge.connect()` 连接 backend
  3. 创建 Pinia、Vue Router、ThemeStore，挂载 App.vue
  4. 连接失败时在离线模式下运行

## 页面路由

| 路径 | 组件 | 功能 |
|---|---|---|
| `/` | 重定向到 `/home` | - |
| `/home` | `HomePage.vue` | 主页（标签页管理） |
| `/editor` | `EditorPage.vue` | 工作流编辑器 |
| `/gallery` | `GalleryPage.vue` | 资源画廊 |

## 对外接口

渲染进程不直接对外暴露接口，而是通过两类桥接通信：

- `window.api`：Electron preload 注入（桌面模式）或 BrowserAPIAdapter（Web 模式），统一 API 签名
- `wsBridge`：WebSocket 桥接层，承载 workflow / execution / plugin / chat 等 backend 通道

### 关键通信调用

- `window.api.chat.completions(params)` -- 发送 AI 对话请求
- `window.api.chat.abort(requestId)` -- 中止对话
- `window.api.plugin.*` -- Electron 本地插件管理
- `window.api.agent.execTool(type, params)` -- 执行工具
- `window.api.on(channel, callback)` -- 监听推送事件（IPC 或 WS）
- `wsBridge.invoke(channel, data)` -- 调用 backend WS 通道（类型安全）
- `wsBridge.on(channel, handler)` -- 订阅 backend 事件（execution / connection）
- `wsBridge.setInteractionHandler(fn)` -- 注册交互式操作处理函数

## 目录结构

```
src/
  main.ts                              Electron 模式入口
  App.vue                              根组件（挂载 RouterView + Toaster + CommandPalette）
  env.d.ts                             环境类型声明
  web/
    web-entry.ts                       Web 模式入口（BrowserAPIAdapter 注入 + WS 连接）
    browser-api-adapter.ts             window.api 的 WS 桥接实现
    stubs.ts                           不可用 API 的 no-op 桩函数
  router/
    index.ts                           路由配置（hash 模式）
  types/
    index.ts                           全局类型定义（核心）
    plugin.ts                          插件相关类型
    command.ts                         命令面板类型
    split.ts                           分屏面板类型
  styles/
    globals.css                        Tailwind + 主题变量（light/dark）
  stores/
    chat.ts                            Chat 会话/消息管理（工厂模式 createChatStore）
    workflow.ts                        工作流编辑状态（Undo/Redo + backend-first execution）
    ai-provider.ts                     AI Provider/Model 选择
    tab.ts                             多标签页管理
    plugin.ts                          插件状态
    chat-ui.ts                         Chat UI 状态（工具选择等）
    agent-settings.ts                  Agent 全局设置
    shortcut.ts                        快捷键状态
    theme.ts                           主题管理
    userProfile.ts                     用户配置
  lib/
    utils.ts                           通用工具函数（cn 合并等）
    lucide-resolver.ts                 Lucide 图标动态解析
    chat-db.ts                         IndexedDB 聊天数据库（Dexie）
    ws-bridge.ts                       WebSocket 连接管理、请求/响应配对、事件分发、断线重连
    agent/
      agent.ts                         Agent 流式请求管理器（runAgentStream）
      stream.ts                        流式事件监听与解析（IPC / WS 双通道）
      tools.ts                         工具发现系统（分类/列表/详情/执行）
      system-prompt.ts                 浏览器模式系统提示词
      workflow-prompt.ts               工作流模式系统提示词
      workflow-tools.ts                工作流编辑 AI 工具定义
      workflow-renderer-tools.ts       工作流渲染端工具执行
    workflow/
      types.ts                         工作流类型定义
      engine.ts                        本地 fallback 执行引擎（单节点调试用）
      nodeRegistry.ts                  节点注册表（内置 + 插件）
      agent-run.ts                     agent_run 节点执行逻辑
      nodes/
        index.ts                       节点定义汇总
        flowControl.ts                 流程控制节点（start/end/run_code/toast/switch）
        ai.ts                          AI 节点（agent_run）
        display.ts                     展示节点（gallery_preview）
    backend-api/
      workflow-domain.ts               工作流 domain API 聚合
      workflow.ts                      工作流 CRUD + plugin scheme + execution + recovery
      workflow-folder.ts               文件夹 CRUD
      workflow-version.ts              版本快照 CRUD
      execution-log.ts                 执行日志 CRUD
      operation-history.ts             操作历史 CRUD
      plugin.ts                        插件管理（节点/工具/配置）
      plugin-domain.ts                 插件 domain API 聚合
      interaction.ts                   交互式操作处理（agent_chat / node_execution）
    plugins/
      web-client-runtime.ts            Web client 插件 CDN manifest/runtime/view 加载器
  composables/
    workflow/
      useFlowCanvas.ts                 Vue Flow 画布操作
      useClipboard.ts                  节点/边剪贴板
      useConnectionDrop.ts             拖拽连线
      useEdgeInsert.ts                 连线插入
      usePanelSizes.ts                 面板尺寸管理
      useWorkflowFileActions.ts        工作流文件操作
      useEditorShortcuts.ts            编辑器快捷键
      useExecutionPanel.ts             执行面板状态
      useEditorLayout.ts               编辑器布局
    useCommandPalette.ts               命令面板 composable
    useNotification.ts                 通知 composable
    useShortcutActions.ts              快捷键动作
  components/
    chat/
      ChatPanel.vue                    Chat 面板主组件
      ChatInput.vue                    消息输入框（含 Tiptap 富文本编辑器）
      ChatMessage.vue                  单条消息渲染
      ChatMessageList.vue              消息列表
      ToolCallCard.vue                 工具调用卡片
      ThinkingBlock.vue                Thinking 展示块
      ModelSelector.vue                模型选择器
      SessionManager.vue              会话管理器
      WorkflowWorkspaceDialog.vue     工作流工作区配置对话框
      FileTreeNode.vue                 文件树节点
      WorkspaceFileTree.vue            工作区文件树
      tiptap/                          Tiptap 富文本编辑器集成（@mention 等）
        ChatInputEditor.vue
        MentionBadge.vue
        SuggestionPopup.vue
        useMentionConfig.ts
        types.ts
        index.ts
    workflow/
      WorkflowEditor.vue              工作流编辑器主组件
      WorkflowList.vue                工作流列表
      WorkflowListDialog.vue          工作流列表对话框
      WorkflowDialog.vue              工作流创建/编辑对话框
      WorkflowFolderTree.vue          文件夹树
      CustomNodeWrapper.vue           自定义节点包装器
      CustomEdge.vue                  自定义连线
      EmbeddedWorkflowNode.vue        嵌入式子工作流节点
      EmbeddedWorkflowEdge.vue        嵌入式子工作流连线
      EmbeddedWorkflowEditor.vue      嵌入式子工作流编辑器（独立 VueFlow 画布）
      LoopBodyContainer.vue           Loop 循环体容器（内嵌 EmbeddedWorkflowEditor）
      TableViewComponent.vue          表格展示组件（用于节点输出展示）
      NodeSidebar.vue                 节点侧边栏（拖拽添加）
      NodeProperties.vue              节点属性面板
      NodeSelectDialog.vue            节点选择对话框
      NodeSelectorDailog.vue          节点选择器（备用）
      RightPanel.vue                  右侧面板
      RightProperties.vue             右侧属性面板
      RightVersion.vue                右侧版本面板
      RightOperations.vue             右侧操作面板
      RightAssistant.vue              右侧助手面板
      ActivityBar.vue                 活动栏
      EditorToolbar.vue              编辑器工具栏
      CanvasToolbar.vue              画布工具栏
      ExecutionBar.vue               执行控制栏
      VersionControl.vue             版本控制
      OperationHistory.vue           操作历史（Undo/Redo）
      ConditionEditor.vue            条件编辑器（switch 节点）
      OutputFieldEditor.vue          输出字段编辑器
      VariablePicker.vue             变量选择器
      VariableFieldMenu.vue          变量字段菜单
      PluginPickerDialog.vue         插件选择对话框
      SubWorkflowSelector.vue        子工作流选择器
      WelcomePage.vue                欢迎页
      dragDrop.ts                     拖拽工具
      nodeSidebarContext.ts           节点侧边栏上下文
      workflowLayoutContext.ts        工作流布局上下文
      workflowCanvasContext.ts        工作流画布上下文
    settings/
      SettingsDialog.vue             设置对话框
      SettingsModels.vue             AI Provider 设置
      SettingsShortcut.vue           快捷键设置
      SettingsTheme.vue              主题设置
      SettingsAbout.vue              关于页面
      SettingsAgent.vue              Agent 设置
    gallery/
      GalleryViewer.vue              资源画廊查看器
      MusicPlayer.vue                音乐播放器
    command-palette/
      CommandPaletteDialog.vue       命令面板
    ui/                              基础 UI 组件库（shadcn-vue 风格）
      button/ input/ textarea/ select/ dialog/ dropdown-menu/
      popover/ scroll-area/ separator/ tabs/ tooltip/ switch/
      badge/ checkbox/ collapsible/ resizable/ command/
      context-menu/ sheet/ skeleton/ sonner/ toggle/ kbd/
      alert-dialog/ avatar/ code-editor/ json-editor/
      menubar/ progress/ stepper/ label/ field/ spinner/ empty/
      golden-layout/ hover-card/ input-group/ table/
  views/
    HomePage.vue                     主页
    EditorPage.vue                   编辑器页
    GalleryPage.vue                  画廊页
    NotFoundPage.vue                 404 页
```

## 关键依赖与配置

- **Vue 3** 5.x：Composition API + `<script setup>`
- **Pinia** 2.x：状态管理
- **Vue Router** 4.x：路由（hash 模式）
- **Vue Flow** 1.x：工作流画布（@vue-flow/core + background/controls/minimap/node-resizer）
- **Dexie** 4.x：IndexedDB 封装（Chat 会话/消息持久化）
- **Tailwind CSS** 4.x：样式系统
- **radix-vue / reka-ui**：无头 UI 组件
- **shiki**：代码高亮
- **vue-sonner**：Toast 通知
- **vue-stream-markdown**：Markdown 流式渲染
- **vuedraggable**：拖拽排序
- **zod** 4.x：运行时 schema 校验
- **lucide-vue-next**：图标库
- **Tiptap**：富文本编辑器（ChatInput 中的 @mention）
- **Monaco Editor**：代码编辑器组件
- **golden-layout**：可拖拽分屏布局
- **@tanstack/vue-table**：表格组件（TableViewComponent）
- **katex**：LaTeX 数学公式渲染

## 数据模型

### ChatSession

```typescript
interface ChatSession {
  id: string; title: string; scope: string; // 'agent' | 'workflow'
  workflowId?: string | null; browserViewId: string | null;
  modelId: string; providerId: string;
  createdAt: number; updatedAt: number; messageCount: number;
}
```

### ChatMessage

```typescript
interface ChatMessage {
  id: string; sessionId: string;
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string; toolCalls?: ToolCall[]; toolResult?: unknown;
  thinkingBlocks?: ChatThinkingBlock[]; images?: string[];
  modelId?: string; usage?: TokenUsage; createdAt: number;
}
```

### WorkflowNode

```typescript
interface WorkflowNode {
  id: string; type: string; label: string;
  position: { x: number; y: number };
  data: Record<string, any>;
  nodeState?: 'normal' | 'disabled' | 'skipped';
  composite?: WorkflowNodeCompositeMeta; // 复合节点元信息
}
```

### EmbeddedWorkflow

```typescript
interface EmbeddedWorkflow {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}
```

## Backend Workflow Mode

- backend workflow/domain 已为默认主路径：
  - CRUD / version / execution log / operation history 走 `lib/backend-api/` 适配层
  - execution state 来自 WS execution events 和 recovery
  - `agent_run` / 本地 bridge 节点通过 WS interaction handler 回到 Electron
  - 已迁移 domain 的旧 preload IPC 与 workflow 本地执行 fallback 已删除

## 复合节点与嵌入式工作流

- **复合节点**：loop 等节点在创建时通过 `CompoundNodeDefinition` 自动生成多个子节点（含 composite 元信息）
- **嵌入式编辑器**：`EmbeddedWorkflowEditor` 提供独立的 VueFlow 画布，支持节点拖入/连线/属性编辑
- **Loop 容器**：`LoopBodyContainer` 包裹 `EmbeddedWorkflowEditor`，管理 loop_body 子工作流
- **全屏模式**：嵌入式编辑器支持全屏展开，调整宿主节点尺寸
- **变量选择**：`VariablePicker` 支持引用上游节点输出（`{{ __data__["nodeId"].field }}`）

## Workflow 组件详解

### 核心编辑器

| 组件 | 行数 | 职责 |
|---|---|---|
| `WorkflowEditor.vue` | 644 | 主编排器：GoldenLayout 分屏布局、面板集成、自动保存、快捷键、拖放、文件操作 |
| `WorkflowCanvas.vue` | 55 | VueFlow 画布容器，注入 canvas context，渲染节点/边/MiniMap/Controls |
| `CustomNodeWrapper.vue` | 571 | 节点全生命周期：状态(normal/disabled/skipped)、执行状态、自定义视图(gallery_preview/music_player/table_display/loop_body/sub_workflow)、上下文菜单、动态 handle |
| `CustomEdge.vue` | 87 | 带插入按钮的自定义边，复合边样式(locked/generated) |

### 嵌入式子工作流（新增）

| 组件 | 行数 | 职责 |
|---|---|---|
| `EmbeddedWorkflowEditor.vue` | 671 | 独立 VueFlow 画布：复制粘贴、删除、全屏、viewport 同步、拖放、快捷键 |
| `EmbeddedWorkflowNode.vue` | 85 | 嵌入画布简化节点 UI |
| `EmbeddedWorkflowEdge.vue` | 60 | 嵌入画布简化边 |
| `LoopBodyContainer.vue` | 108 | loop_body 容器，包裹 EmbeddedWorkflowEditor，同步 WorkflowStore |
| `SubWorkflowSelector.vue` | 58 | 子工作流选择 UI，克隆 start 节点输入字段 |

### 属性编辑与变量

| 组件 | 行数 | 职责 |
|---|---|---|
| `NodeProperties.vue` | 744 | 动态属性渲染（text/code/number/select/checkbox/array/output_fields）、变量选择、单节点调试 |
| `VariablePicker.vue` | 370 | 变量引用下拉：节点输入/输出、loop 变量、loop body 节点、配置字段 |
| `VariableFieldMenu.vue` | 65 | 递归字段菜单（object 类型嵌套子菜单） |
| `OutputFieldEditor.vue` | 197 | 输出字段 schema 编辑（string/number/boolean/object/any，支持嵌套） |
| `ConditionEditor.vue` | 158 | switch 节点条件编辑（可拖拽排序 + 变量选择） |

### 工具栏与面板

| 组件 | 行数 | 职责 |
|---|---|---|
| `EditorToolbar.vue` | 341 | 顶部工具栏：文件菜单、视图菜单、布局预设、标签栏、窗口控制 |
| `CanvasToolbar.vue` | 133 | 底部画布工具栏：自动布局(dagre)、撤销重做、MiniMap 切换 |
| `ExecutionBar.vue` | 485 | 执行控制：开始/暂停/恢复/停止、执行历史、步骤详情(输入/输出/日志) |
| `NodeSidebar.vue` | 413 | 节点面板：搜索、插件配置方案管理、拖放发起 |
| `RightPanel.vue` | 145 | 右侧面板标签容器(属性/版本/操作/AI助手) |
| `RightAssistant.vue` | 30 | 工作流作用域 Chat 会话 |
| `ActivityBar.vue` | 62 | 左侧活动栏（首页/设置） |

### 对话框与数据展示

| 组件 | 行数 | 职责 |
|---|---|---|
| `WorkflowDialog.vue` | 38 | 全屏编辑器对话框 |
| `WorkflowListDialog.vue` | 178 | 工作流选择/创建对话框（文件夹树 + 列表） |
| `NodeSelectDialog.vue` | 158 | 节点类型选择（搜索 + 分类网格） |
| `PluginPickerDialog.vue` | 84 | 插件启用/禁用（含节点数量） |
| `WelcomePage.vue` | 116 | 新建/打开/导入工作流 + 最近列表 |
| `TableViewComponent.vue` | 131 | 表格数据展示（单选/多选/交互提交模式） |

### 上下文与 composables

| 文件 | 职责 |
|---|---|
| `workflowCanvasContext.ts` | 画布级 provide/inject（flowId、nodes、edges、回调） |
| `workflowLayoutContext.ts` | 执行栏布局状态（展开/折叠） |
| `nodeSidebarContext.ts` | 插件选择器打开函数 |
| `dragDrop.ts` | 拖放 MIME 类型常量 |

## 插件系统现状

- 前端插件列表来自三路聚合：
  - backend `plugin:list` -> `server` 插件
  - Electron `plugin:list-local` -> 本地 `client` 插件
  - Web `web-client-runtime` -> 已安装 CDN `client` 插件
- `PluginStore` 会补充运行时语义：
  - `runtimeSource`
  - `runtimeTransport`
- Web client 插件通过 `manifestUrl` 安装，不写入本地插件目录
- `PluginSettings.vue` 当前支持两种 view 来源：
  - Electron 本地 `view.js`
  - Web CDN `view.js`
- Client 插件可通过 `chat:register-client-nodes` / `chat:register-client-agent-tools` 注册节点和工具到 backend

### 单节点执行分流

- 本地桥接节点（如 `delay`）：
  - 走 `window.api.agent.execTool(...)`
- backend 可执行插件节点（如 `jimeng_*`）：
  - 走 backend `agent:execTool`

因此 renderer 里的 `WorkflowEngine` 不能再把所有自定义节点都当作 Electron 本地工具执行。

## 测试与质量

当前已有 backend migration 的最小验证命令：

```bash
pnpm exec tsc -p tsconfig.web.json --noEmit
pnpm build:backend
pnpm build
```

## 常见问题 (FAQ)

**Q: Chat Store 为什么用工厂模式？**
A: `createChatStore(scope)` 根据 scope（'agent' 或 'workflow'）创建独立的 store 实例，支持多个 Chat 面板各自维护独立的会话和消息。

**Q: 工作流引擎现在在哪里执行？**
A: 迁移后的主路径由 backend execution manager 执行；renderer 里的 `WorkflowEngine` 仅保留给单节点调试与少量本地辅助逻辑，不再承担工作流主执行路径。

**Q: UI 组件库是怎么组织的？**
A: `src/components/ui/` 采用 shadcn-vue 风格，每个组件一个独立目录，包含 Vue 组件和 `index.ts` 导出。

**Q: Web 模式如何工作？**
A: Web 入口 `web-entry.ts` 在模块顶层注入 `BrowserAPIAdapter` 到 `window.api`，将所有 IPC 调用桥接到 backend WS。之后连接 wsBridge，进入与 Electron 模式相同的启动流程。

**Q: wsBridge 和 window.api 的关系是什么？**
A: `wsBridge` 是底层 WS 连接管理器（`lib/ws-bridge.ts`）。Electron 模式下，`window.api` 使用 IPC，workflow domain 通过 `lib/backend-api/` 直接调用 `wsBridge`。Web 模式下，`BrowserAPIAdapter` 将所有 `window.api` 调用统一路由到 `wsBridge`。

**Q: 嵌入式工作流编辑器如何与主画布交互？**
A: `EmbeddedWorkflowEditor` 是独立的 VueFlow 实例，通过 `v-model` 与宿主节点的 `data.bodyWorkflow` 双向绑定。编辑操作通过 WorkflowStore 的 `updateEmbeddedWorkflow` 方法持久化。

**Q: Loop 节点是怎么工作的？**
A: Loop 是复合节点（`CompoundNodeDefinition`），创建时自动生成 loop 根节点和 loop_body 子节点。`LoopBodyContainer` 组件渲染嵌入式编辑器，loop_body 节点的 `bodyWorkflow` 字段存储循环体内的子工作流。

## 相关文件清单

参见上方"目录结构"部分。

## 变更记录 (Changelog)

| 日期 | 操作 | 说明 |
|---|---|---|
| 2026-04-25 | 增量更新 | 新增 EmbeddedWorkflowEditor/Node/Edge、LoopBodyContainer、TableViewComponent、条件/变量/子工作流选择器等组件；补充复合节点/嵌入式子工作流、client 插件注册通道、golden-layout/katex/tanstack-table 依赖 |
| 2026-04-23 | 增量更新 | 同步插件三路聚合、Web CDN runtime、单节点执行分流 |
| 2026-04-22 | 增量更新 | 补充 Web 模式、wsBridge、backend-api 适配层、composables、Tiptap、plugin 组件等 |
| 2026-04-20 | 初始化 | 首次生成模块文档 |
