[根目录](../CLAUDE.md) > **src**

# 渲染进程（Vue 3 SPA）

> WorkFox 的前端渲染层，基于 Vue 3 + Pinia + Vue Router + Tailwind CSS 构建的单页应用，负责工作流编辑器、Chat 对话面板、设置管理等所有用户界面。

## 模块职责

1. **工作流可视化编辑**：基于 Vue Flow 的拖拽式 DAG 编辑器，支持节点拖入/连线/属性编辑/执行调试
2. **AI Chat 对话**：多会话管理、流式输出渲染、工具调用展示、thinking blocks
3. **插件视图**：加载和展示第三方插件提供的自定义 UI
4. **设置管理**：AI Provider 配置、快捷键绑定、主题切换、Agent 全局设置
5. **命令面板**：全局命令搜索与执行面板

## 入口与启动

- **HTML 入口**：`index.html`（根目录）-> `src/main.ts`
- 启动流程：
  1. 创建 Pinia 实例和 Vue Router
  2. 初始化 ThemeStore（恢复主题偏好）
  3. 挂载 App.vue
  4. App.vue `onMounted` 时初始化 PluginStore、AIProviderStore、TabStore

## 页面路由

| 路径 | 组件 | 功能 |
|---|---|---|
| `/` | 重定向到 `/home` | - |
| `/home` | `HomePage.vue` | 主页（标签页管理） |
| `/editor` | `EditorPage.vue` | 工作流编辑器 |
| `/gallery` | `GalleryPage.vue` | 资源画廊 |

## 对外接口

渲染进程不直接对外暴露接口，而是通过两类桥接通信：

- `window.api`：Electron preload 注入，本地桌面能力与兼容 IPC
- `wsBridge`：workflow backend WS 通道，承载已迁移的 workflow / execution / plugin domain

### 关键 IPC 调用

- `window.api.chat.completions(params)` -- 发送 AI 对话请求
- `window.api.chat.abort(requestId)` -- 中止对话
- `window.api.plugin.*` -- 插件管理
- `window.api.agent.execTool(type, params)` -- 执行工具
- `window.api.on(channel, callback)` -- 监听主进程推送事件
- `wsBridge.invoke(channel, data)` -- 调用 backend workflow / execution / plugin channels
- `wsBridge.on(channel, handler)` -- 订阅 backend execution / connection 事件

## 目录结构

```
src/
  main.ts                              应用入口
  App.vue                              根组件（挂载 RouterView + Toaster + CommandPalette）
  env.d.ts                             环境类型声明
  router/
    index.ts                           路由配置（hash 模式）
  types/
    index.ts                           全局类型定义（核心）
    plugin.ts                          插件相关类型
    command.ts                         命令面板类型
  styles/
    globals.css                        Tailwind + 主题变量（light/dark）
  stores/
    chat.ts                            Chat 会话/消息管理（工厂模式）
    workflow.ts                        工作流编辑状态（Undo/Redo + backend-first execution state）
    ai-provider.ts                     AI Provider/Model 选择
    tab.ts                             多标签页管理
    plugin.ts                          插件状态
    chat-ui.ts                         Chat UI 状态（工具选择等）
    agent-settings.ts                  Agent 全局设置
    shortcut.ts                        快捷键状态
    theme.ts                           主题管理
    userProfile.ts                     用户配置
  lib/
    utils.ts                           通用工具函数
    lucide-resolver.ts                 Lucide 图标动态解析
    chat-db.ts                         IndexedDB 聊天数据库（Dexie）
    agent/
      agent.ts                         Agent 流式请求管理器
      stream.ts                        IPC 流式事件监听与解析
      tools.ts                         工具发现系统（分类/列表/详情/执行）
      system-prompt.ts                 系统提示词
      workflow-tools.ts                工作流编辑 AI 工具定义
      workflow-renderer-tools.ts       工作流渲染端工具执行
    workflow/
      types.ts                         工作流类型定义
      engine.ts                        本地 fallback 执行引擎（非 backend 主路径）
      nodeRegistry.ts                  节点注册表（内置 + 插件）
      nodes/
        index.ts                       节点定义汇总
        flowControl.ts                 流程控制节点（start/end/run_code/toast/switch）
        ai.ts                          AI 节点（agent_run）
        display.ts                     展示节点（gallery_preview）
  components/
    chat/
      ChatPanel.vue                    Chat 面板主组件
      ChatInput.vue                    消息输入框
      ChatMessage.vue                  单条消息渲染
      ChatMessageList.vue              消息列表
      ToolCallCard.vue                 工具调用卡片
      ThinkingBlock.vue                Thinking 展示块
      ModelSelector.vue                模型选择器
      ProviderManager.vue             Provider 管理器
      SessionManager.vue              会话管理器
      WorkflowWorkspaceDialog.vue     工作流工作区配置对话框
    workflow/
      WorkflowEditor.vue              工作流编辑器主组件
      WorkflowList.vue                工作流列表
      WorkflowListDialog.vue          工作流列表对话框
      WorkflowDialog.vue              工作流创建/编辑对话框
      WorkflowFolderTree.vue          文件夹树
      CustomNodeWrapper.vue           自定义节点包装器
      CustomEdge.vue                  自定义连线
      NodeSidebar.vue                 节点侧边栏（拖拽添加）
      NodeProperties.vue              节点属性面板
      NodeSelectDialog.vue            节点选择对话框
      NodeSelectorDailog.vue          节点搜索选择
      RightPanel.vue                  右侧面板
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
      WelcomePage.vue                欢迎页
    settings/
      SettingsDialog.vue             设置对话框
      SettingsModels.vue             AI Provider 设置
      SettingsShortcut.vue           快捷键设置
      SettingsTheme.vue              主题设置
      SettingsAbout.vue              关于页面
      SettingsAgent.vue              Agent 设置
    gallery/
      GalleryViewer.vue              资源画廊查看器
    command-palette/
      CommandPaletteDialog.vue       命令面板
    ui/                              基础 UI 组件库（shadcn-vue 风格）
      button/ input/ textarea/ select/ dialog/ dropdown-menu/
      popover/ scroll-area/ separator/ tabs/ tooltip/ switch/
      badge/ checkbox/ collapsible/ resizable/ command/
      context-menu/ sheet/ skeleton/ sonner/ toggle/ kbd/
      alert-dialog/
  views/
    HomePage.vue                     主页
    EditorPage.vue                   编辑器页
    GalleryPage.vue                  画廊页
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
}
```

## Backend Workflow Mode

- backend workflow/domain 已为默认主路径：
  - CRUD / version / execution log / operation history 走 backend adapter
  - execution state 来自 WS execution events 和 recovery
  - `agent_run` / 本地 bridge 节点通过 interaction handler 回到 Electron
  - 已迁移 domain 的旧 preload IPC 与 workflow 本地执行 fallback 已删除

## 测试与质量

当前已有 backend migration 的最小验证命令：

```bash
pnpm exec tsc -p tsconfig.web.json --noEmit
pnpm build:backend
pnpm smoke:backend
pnpm build
```

## 常见问题 (FAQ)

**Q: Chat Store 为什么用工厂模式？**
A: `createChatStore(scope)` 根据 scope（'agent' 或 'workflow'）创建独立的 store 实例，支持多个 Chat 面板各自维护独立的会话和消息。

**Q: 工作流引擎现在在哪里执行？**
A: 迁移后的主路径由 backend execution manager 执行；renderer 里的 `WorkflowEngine` 仅保留给单节点调试与少量本地辅助逻辑，不再承担工作流主执行路径。

**Q: UI 组件库是怎么组织的？**
A: `src/components/ui/` 采用 shadcn-vue 风格，每个组件一个独立目录，包含 Vue 组件和 `index.ts` 导出。

## 相关文件清单

参见上方"目录结构"部分。

## 变更记录 (Changelog)

| 日期 | 操作 | 说明 |
|---|---|---|
| 2026-04-20 | 初始化 | 首次生成模块文档 |
