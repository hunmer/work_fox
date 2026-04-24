[根目录](../CLAUDE.md) > **electron**

# Electron 主进程

> WorkFox 的 Electron 主进程模块，仅保留桌面平台能力：窗口管理、插件生命周期、交互桥接、Backend 子进程管理。数据 CRUD 已迁移到 backend WS 通道。

## 模块职责

主进程只承担 **平台专属能力**：

1. **窗口生命周期管理**：无边框窗口创建、最大化状态恢复、`local://` 自定义协议注册（支持音视频 Range 请求）
2. **交互桥接**：`agent:execTool` IPC handler，执行工作流本地桥接节点（如 `delay`）和插件工作流节点
3. **Backend 子进程管理**：fork Node.js 后端服务，管理生命周期和 endpoint 发现
4. **插件管理**：扫描、加载、启用/禁用本地 client 插件，提供事件总线、存储 API 和运行时宿主
5. **工作流节点注册**：内置节点定义 + 插件节点注册，统一调度
6. **全局快捷键**：通过 `globalShortcut` API 注册系统级快捷键
7. **原生对话框**：工作流导入/导出文件对话框

## 入口与启动

- **入口文件**：`main.ts`
- 启动流程：
  1. `app.whenReady()` 后注册 `local://` 自定义协议
  2. 注册 IPC handlers（agent:execTool / plugin / workflow / backend / fs:openInExplorer / window / app / shell）
  3. `workflowNodeRegistry.registerBuiltinNodes()` 注册内置节点
  4. `pluginManager.loadAll()` 扫描并加载内置插件
  5. `backendProcessManager.start()` fork 后端子进程
  6. `registerGlobalShortcuts()` 注册全局快捷键
  7. `createWindow()` 创建无边框窗口
- 关闭流程：
  1. `unregisterGlobalShortcuts()` 清理全局快捷键
  2. `pluginManager.shutdown()` 关闭插件
  3. `backendProcessManager.stop()` 终止后端子进程
  4. 非 macOS 平台 `app.quit()`

## 对外接口

### IPC Handlers（`ipc/`）

| 文件 | 注册频道 | 功能 |
|---|---|---|
| `chat.ts` | `agent:execTool` | 工具执行（工作流节点 + 本地桥接节点） |
| `workflow.ts` | `workflow:*`, `workflowFolder:*`, `workflow:importOpenFile/exportSaveFile` | 工作流文件对话框（部分已迁移到 backend） |
| `plugin.ts` | `plugin:*` | Electron 本地插件管理 |
| `backend.ts` | `backend:get-endpoint`, `backend:get-status` | Backend 子进程 endpoint 发现 |
| `fs.ts` | `fs:openInExplorer` | 在文件管理器中显示文件 |

### 窗口控制（内联于 main.ts）

- `window:minimize` / `window:maximize` / `window:close` / `window:isMaximized`
- `app:getVersion` / `shell:openExternal`

### 已迁移到 Backend WS 的通道

| 原 IPC 频道 | 当前 WS 通道 | 消费方 |
|---|---|---|
| `aiProvider:*` | `aiProvider:*` | `src/stores/ai-provider.ts` |
| `chatHistory:*` | `chatHistory:*` | `src/lib/chat-db.ts` |
| `agentSettings:get/set` | `agentSettings:get/set` | `src/stores/agent-settings.ts` |
| `tabs:load/save` | `tabs:load/save` | `src/stores/tab.ts` |
| `shortcut:*` | `shortcut:*` | `src/stores/shortcut.ts` |
| `chat:completions/abort` | `chat:completions/abort` | `src/lib/agent/agent.ts` |
| `fs:listDir/delete/createFile/createDir/rename` | `fs:*` | `src/lib/backend-api/fs.ts` |

## 关键依赖与配置

- **electron-store**：持久化快捷键绑定、窗口最大化状态
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

### Workflow（store.ts 局部类型）

```typescript
interface Workflow {
  id: string; name: string; folderId: string | null; description?: string;
  nodes: WorkflowNode[]; edges: WorkflowEdge[];
  createdAt: number; updatedAt: number;
  enabledPlugins?: string[]; agentConfig?: WorkflowAgentConfig;
}
```

### ShortcutBinding

```typescript
interface ShortcutBinding {
  id: string; accelerator: string; global: boolean; enabled: boolean;
}
```

## 常见问题 (FAQ)

**Q: Electron 主进程还保留了哪些 IPC？**
A: 仅保留平台专属能力：`agent:execTool`（工作流节点执行桥接）、`plugin:*`（本地插件管理）、`workflow:importOpenFile/exportSaveFile`（原生文件对话框）、`backend:*`（子进程发现）、`fs:openInExplorer`（文件管理器）、`window:*`（窗口控制）。所有数据 CRUD 已迁移到 backend WS。

**Q: 快捷键为什么分两层？**
A: 快捷键配置存储在 backend WS（`shortcut:*` 通道），但 `globalShortcut.register()` 必须在 Electron 主进程执行。`shortcut-manager.ts` 从 `store.ts` 读取绑定，由 `main.ts` 在启动时直接调用 `registerGlobalShortcuts()`。

**Q: 交互桥接是什么？**
A: backend 工作流执行中，`agent_run` 和本地桥接节点（如 `delay`）需要回到 Electron 主进程执行。backend 通过 WS interaction 发起请求，renderer 收到后调用 `window.api.agent.execTool`，最终路由到 `chat.ts` 的 `agent:execTool` handler。

## 相关文件清单

```
electron/
  main.ts                              应用入口（窗口、协议、IPC、插件、backend）
  ipc/
    chat.ts                            agent:execTool（工作流节点执行桥接）
    workflow.ts                        工作流文件对话框 IPC
    plugin.ts                          插件管理 IPC
    backend.ts                         Backend 子进程 endpoint IPC
    fs.ts                              fs:openInExplorer IPC
  services/
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
    store.ts                           全局 electron-store（快捷键绑定、窗口状态）
    shortcut-manager.ts                快捷键管理（globalShortcut 注册）
    window-manager.ts                  窗口管理服务
  utils/
    json-store.ts                      JSON 文件存储工具类
```

## 变更记录 (Changelog)

| 日期 | 操作 | 说明 |
|---|---|---|
| 2026-04-24 | 死代码清理 | 删除 tabs/agent-settings/chat-history-store/ai-provider-test，chat.ts/fs.ts/shortcut.ts 移除已迁移 handler，store.ts 移除已迁移方法 |
| 2026-04-22 | 增量更新 | 补充 backend-process、plugin-catalog/runtime-host、local:// 协议、IPC 变更、环境变量等 |
| 2026-04-20 | 初始化 | 首次生成模块文档 |
