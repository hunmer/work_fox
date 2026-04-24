[根目录](../CLAUDE.md) > **electron**

# Electron 主进程

> WorkFox 的 Electron 主进程模块，负责窗口管理、IPC 注册、Claude Agent 运行时、Backend 子进程管理、插件生命周期等核心桌面后端逻辑。

## 模块职责

主进程是桌面应用的后端核心，承担以下职责：

1. **窗口生命周期管理**：无边框窗口创建、最大化状态恢复、macOS activate 处理、`local://` 自定义协议注册（支持音视频 Range 请求）
2. **IPC 通信枢纽**：注册所有 IPC handlers，桥接渲染进程请求与后端服务
3. **Claude Agent 运行时**：通过 `@anthropic-ai/claude-agent-sdk` 执行 AI 代理任务，支持流式输出、工具调用、thinking blocks
4. **Backend 子进程管理**：通过 `backend-process.ts` fork Node.js 后端服务，管理生命周期和 endpoint 发现
5. **插件管理**：扫描、加载、启用/禁用第三方插件，提供事件总线、存储 API 和运行时宿主
6. **工作流节点注册**：内置节点定义 + 插件节点注册，统一调度

## 入口与启动

- **入口文件**：`main.ts`
- 启动流程：
  1. `app.whenReady()` 后注册 `local://` 自定义协议
  2. 调用 `createWindow()` 创建无边框窗口
  3. 注册所有 IPC handlers（workflow / chat / plugin / shortcut / tabs / agent-settings / backend / fs）
  4. `workflowNodeRegistry.registerBuiltinNodes()` 注册内置节点
  5. `pluginManager.loadAll()` 扫描并加载内置插件
  6. `backendProcessManager.start()` fork 后端子进程，等待 `WORKFOX_BACKEND_READY` 信号
  7. `registerGlobalShortcuts()` 注册全局快捷键
- 关闭流程：
  1. `unregisterGlobalShortcuts()` 清理全局快捷键
  2. `pluginManager.shutdown()` 关闭插件
  3. `backendProcessManager.stop()` 终止后端子进程
  4. 非 macOS 平台 `app.quit()`

## 对外接口

### IPC Handlers（`ipc/`）

| 文件 | 注册频道前缀 | 功能 |
|---|---|---|
| `chat.ts` | `agent:execTool`, `chatHistory:*` | 工具执行、聊天历史 |
| `workflow.ts` | `workflow:list/get/create/update/delete`, `workflowFolder:*`, `workflow:importOpenFile/exportSaveFile` | 工作流 CRUD（兼容层，部分已迁移到 backend） |
| `plugin.ts` | `plugin:list/enable/disable/get-view/get-icon/import-zip/open-folder/install/uninstall/get-workflow-nodes/list-workflow-plugins/get-agent-tools` | 插件管理 |
| `shortcut.ts` | `shortcut:list/update/toggle/clear/reset` | 快捷键管理 |
| `tabs.ts` | `tabs:load/save` | 标签页状态持久化 |
| `agent-settings.ts` | `agentSettings:get/set` | Agent 全局设置 |
| `backend.ts` | `backend:get-endpoint`, `backend:get-status` | Backend 子进程 endpoint 发现 |
| `fs.ts` | `fs:listDir/delete/createFile/createDir/openInExplorer/rename` | 文件系统操作 |

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
| 全局配置 | electron-store | `{userDataPath}/config.json` |
| 工作流 | 独立 JSON 文件 | `{userDataPath}/workflows/{id}.json` |
| Agent 工作目录 | 文件系统 | `{userDataPath}/agent-workflows/{workflowId}/` |
| 插件 | 文件系统 | `resources/plugins/`（开发）或 `process.resourcesPath/plugins/`（打包） |
| 插件禁用列表 | JSON 文件 | `{userDataPath}/plugin-data/disabled.json` |
| 后端子进程入口 | 编译产物 | `{appPath}/out/backend/main.js` |

### Backend 子进程环境变量

| 变量 | 说明 |
|---|---|
| `WORKFOX_BACKEND_PORT` | 后端监听端口（默认 0 = 随机） |
| `WORKFOX_BACKEND_HOST` | 后端监听地址（默认 127.0.0.1） |
| `WORKFOX_USER_DATA_DIR` | 用户数据目录 |
| `WORKFOX_PLUGIN_DIR` | 插件目录 |
| `WORKFOX_BACKEND_TOKEN` | 会话认证 token |
| `WORKFOX_APP_VERSION` | 应用版本号 |

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
A: 需同时更新 `preload/index.ts` 中的 `api` 对象定义和对应的 `electron/ipc/*.ts` handler。如果是 backend 通道，还需更新 `shared/channel-contracts.ts` 和 `backend/ws/*-channels.ts`。

**Q: 工作流类型为什么在两处定义？**
A: `shared/workflow-types.ts` 是 source-of-truth，renderer 和 backend 都消费它。Electron 主进程的 `store.ts` 有自己的局部类型，应逐步对齐到 shared。

**Q: Claude Agent SDK 的二进制包如何管理？**
A: 通过 `@anthropic-ai/claude-agent-sdk` 依赖自动安装，SDK 内部按平台加载对应二进制。Electron 主进程和 backend 的 `ChatRuntime` 都使用它。

**Q: Backend 子进程如何被发现？**
A: `backend-process.ts` fork 子进程后等待 stdout 输出 `WORKFOX_BACKEND_READY` JSON 行，解析出 WS URL。渲染进程通过 `window.api.backend.getEndpoint()` 获取 URL 和 token。

## 相关文件清单

```
electron/
  main.ts                              应用入口（窗口、协议、IPC、插件、backend）
  ipc/
    chat.ts                            Chat/AI IPC handlers（流式桥接）
    workflow.ts                        工作流 CRUD IPC（兼容层）
    plugin.ts                          插件管理 IPC
    shortcut.ts                        快捷键 IPC
    tabs.ts                            标签页 IPC
    agent-settings.ts                  Agent 设置 IPC
    backend.ts                         Backend 子进程 endpoint IPC
    fs.ts                              文件系统操作 IPC
  services/
    claude-agent-runtime.ts            Claude Agent SDK 运行时核心
    claude-tool-adapter.ts             Claude 工具适配器（SDK -> IPC 桥接）
    backend-process.ts                 Backend 子进程生命周期管理
    workflow-store.ts                  工作流文件存储
    workflow-node-registry.ts          工作流节点注册表（内置 + 插件）
    workflow-browser-node-runtime.ts   浏览器节点运行时
    builtin-nodes.ts                   内置节点定义
    plugin-manager.ts                  插件管理器（总入口）
    plugin-runtime-host.ts             插件运行时宿主
    plugin-catalog.ts                  插件目录扫描与元数据
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
| 2026-04-22 | 增量更新 | 补充 backend-process、plugin-catalog/runtime-host、local:// 协议、IPC 变更、环境变量等 |
| 2026-04-20 | 初始化 | 首次生成模块文档 |
