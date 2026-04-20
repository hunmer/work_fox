[根目录](../CLAUDE.md) > **electron**

# Electron 主进程

> WorkFox 的 Electron 主进程模块，负责窗口管理、IPC 注册、Claude Agent 运行时、工作流/插件持久化等核心后端逻辑。

## 模块职责

主进程是整个应用的后端核心，承担以下职责：

1. **窗口生命周期管理**：无边框窗口创建、最大化状态恢复、macOS activate 处理
2. **IPC 通信枢纽**：注册所有 IPC handlers，桥接渲染进程请求与后端服务
3. **Claude Agent 运行时**：通过 `@anthropic-ai/claude-agent-sdk` 执行 AI 代理任务，支持流式输出、工具调用
4. **数据持久化**：工作流文件存储、全局配置（electron-store）、聊天历史、快捷键绑定
5. **插件管理**：加载、启用/禁用、卸载第三方插件，提供事件总线和存储 API

## 入口与启动

- **入口文件**：`main.ts`
- 启动流程：
  1. `app.whenReady()` 后调用 `createWindow()`
  2. 注册所有 IPC handlers（workflow / chat / plugin / shortcut / tabs / agent-settings）
  3. `pluginManager.loadAll()` 加载内置插件
  4. `registerGlobalShortcuts()` 注册全局快捷键

## 对外接口

### IPC Handlers（`ipc/`）

| 文件 | 注册频道前缀 | 功能 |
|---|---|---|
| `chat.ts` | `chat:completions`, `chat:abort`, `agent:execTool`, `workflow-tool:respond` | AI 对话、工具执行 |
| `workflow.ts` | `workflow:list/get/create/update/delete`, `workflowFolder:*`, `workflow:importOpenFile/exportSaveFile` | 工作流 CRUD |
| `workflow-version.ts` | `workflowVersion:list/add/get/delete/clear/nextName` | 版本快照管理 |
| `execution-log.ts` | `executionLog:list/save/delete/clear` | 执行日志记录 |
| `plugin.ts` | `plugin:list/enable/disable/get-view/get-icon/import-zip/open-folder/install/uninstall/get-workflow-nodes/list-workflow-plugins/get-agent-tools` | 插件管理 |
| `shortcut.ts` | `shortcut:list/update/toggle/clear/reset` | 快捷键管理 |
| `tabs.ts` | `tabs:load/save` | 标签页状态持久化 |
| `agent-settings.ts` | `agentSettings:get/set` | Agent 全局设置 |

### 窗口控制（内联于 main.ts）

- `window:minimize` / `window:maximize` / `window:close` / `window:isMaximized`
- `app:getVersion` / `shell:openExternal`

## 关键依赖与配置

- **electron-store**：全局配置持久化（AI providers / shortcuts / tabs / agent settings）
- **@anthropic-ai/claude-agent-sdk**：Claude Agent 运行时（二进制包按平台分发）
- **adm-zip**：插件 zip 包导入
- **eventemitter2**：插件事件总线

### 数据存储路径

| 数据 | 存储方式 | 路径 |
|---|---|---|
| 全局配置 | electron-store | `~/Library/Application Support/WorkFox/config.json`（macOS） |
| 工作流 | 独立 JSON 文件 | `{userDataPath}/workflows/{id}.json` |
| Agent 工作目录 | 文件系统 | `{userDataPath}/agent-workflows/{workflowId}/` |
| 插件 | 文件系统 | `resources/plugins/` 或 `process.resourcesPath/plugins/` |
| 插件禁用列表 | JSON 文件 | `{userDataPath}/plugin-data/disabled.json` |

## 数据模型

### AIProvider

```typescript
interface AIProvider {
  id: string; name: string; apiBase: string; apiKey: string;
  models: AIModel[]; enabled?: boolean;
}
```

### Workflow

```typescript
interface Workflow {
  id: string; name: string; folderId: string | null; description?: string;
  nodes: WorkflowNode[]; edges: WorkflowEdge[];
  createdAt: number; updatedAt: number;
  enabledPlugins?: string[]; agentConfig?: WorkflowAgentConfig;
}
```

### AgentGlobalSettings

```typescript
interface AgentGlobalSettings {
  workspaceDir: string;
  skills: AgentResourceItem[];
  mcps: AgentResourceItem[];
}
```

## 测试与质量

当前无自动化测试。`ai-provider-test.ts` 提供手动连接测试功能。

## 常见问题 (FAQ)

**Q: 修改 IPC 接口后需要做什么？**
A: 需同时更新 `preload/index.ts` 中的 `api` 对象定义和对应的 `electron/ipc/*.ts` handler。

**Q: 工作流类型为什么在两处定义？**
A: `electron/services/store.ts` 定义了主进程使用的类型，`src/lib/workflow/types.ts` 定义了渲染进程使用的类型。需保持同步。

**Q: Claude Agent SDK 的二进制包如何管理？**
A: 通过 `@anthropic-ai/claude-agent-sdk-{platform}-{arch}` 平台特定包分发，在 `claude-agent-runtime.ts` 中动态加载。

## 相关文件清单

```
electron/
  main.ts                              应用入口
  ipc/
    chat.ts                            Chat/AI IPC handlers
    workflow.ts                        工作流 CRUD IPC
    workflow-version.ts                版本管理 IPC
    execution-log.ts                   执行日志 IPC
    plugin.ts                          插件管理 IPC
    shortcut.ts                        快捷键 IPC
    tabs.ts                            标签页 IPC
    agent-settings.ts                  Agent 设置 IPC
  services/
    claude-agent-runtime.ts            Claude Agent 运行时核心
    claude-tool-adapter.ts             Claude 工具适配器
    workflow-store.ts                  工作流文件存储
    workflow-tool-dispatcher.ts        工作流工具调度
    workflow-tool-executor.ts          工作流工具执行
    workflow-node-registry.ts          工作流节点注册表
    workflow-version.ts                版本快照服务
    execution-log.ts                   执行日志服务
    plugin-manager.ts                  插件管理器
    plugin-context.ts                  插件上下文 API
    plugin-event-bus.ts                插件事件总线
    plugin-storage.ts                  插件存储
    plugin-fs-api.ts                   插件文件系统 API
    plugin-fetch-api.ts                插件网络请求 API
    plugin-types.ts                    插件类型定义
    store.ts                           全局 electron-store
    chat-history-store.ts              聊天历史存储
    shortcut-manager.ts                快捷键管理
    window-manager.ts                  窗口管理服务
    ai-provider-test.ts                AI Provider 连接测试
  utils/
    json-store.ts                      JSON 文件存储工具类
```

## 变更记录 (Changelog)

| 日期 | 操作 | 说明 |
|---|---|---|
| 2026-04-20 | 初始化 | 首次生成模块文档 |
