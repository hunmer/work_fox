[根目录](../CLAUDE.md) > **backend**

# Backend 服务（Node.js 子进程）

> WorkFox 的独立后端服务，由 Electron 主进程 fork 启动，提供 HTTP 健康检查 + WebSocket API，负责工作流执行、数据持久化、插件注册、Chat 流式运行等核心能力。也支持在 Web 模式下独立运行。

## 模块职责

1. **WebSocket 服务器**：基于 `ws` 库的 WS 服务器，通过 `WSRouter` 分发请求到注册的 channel handler
2. **工作流执行**：`ExecutionManager` 管理工作流的生命周期（start/pause/resume/stop），支持 execution recovery
3. **交互式操作**：`InteractionManager` 处理需要客户端参与的执行步骤（agent_chat、node_execution 等），支持断线重连
4. **数据持久化**：JSON 文件存储（workflow / version / execution-log / operation-history / ai-provider / chat-history / settings）
5. **插件注册**：`BackendPluginRegistry` 扫描和加载 server 类型插件，执行 workflow handler，并提供 `plugin:install/uninstall` 与 backend `agent:execTool`
6. **Chat 运行时**：`ChatRuntime` 封装 Claude Agent SDK，支持 Web 模式下的流式对话
7. **连接管理**：`ConnectionManager` 管理 WS 客户端会话、心跳、token 验证、重连处理

## 入口与启动

- **入口文件**：`main.ts`
- 启动流程：
  1. `loadBackendConfig()` 从环境变量加载配置
  2. 创建 Logger、HTTP/WS 服务器、StoragePaths
  3. 初始化各 domain Store（workflow / version / execution-log / operation-history / ai-provider / chat-history / settings）
  4. 创建 `BackendPluginRegistry` 并加载插件
  5. 创建 `InteractionManager` 和 `ExecutionManager`
  6. 注册所有 WS channel handlers（storage / plugin / execution / app / fs / chat）
  7. 创建 `ChatRuntime` 并注册 chat channels
  8. 启动服务器，向 stdout 输出 `WORKFOX_BACKEND_READY` JSON 行
- 关闭流程：监听 SIGINT/SIGTERM，调用 `backend.stop()` 优雅关闭

### BackendConfig 配置项

```typescript
interface BackendConfig {
  host: string           // WORKFOX_BACKEND_HOST，默认 127.0.0.1
  port: number           // WORKFOX_BACKEND_PORT，默认 0（随机）
  userDataDir: string    // 用户数据目录
  pluginDir: string      // 插件目录，默认 {userDataDir}/plugins
  logLevel: string       // 日志级别
  dev: boolean           // 开发模式
  requestTimeoutMs: number      // 请求超时，默认 30s
  interactionTimeoutMs: number  // 交互超时，默认 300s
  heartbeatIntervalMs: number   // 心跳间隔，默认 15s
  appVersion: string     // 应用版本
  sessionToken?: string  // 会话认证 token
}
```

## 对外接口

### HTTP 端点

| 路径 | 方法 | 功能 |
|---|---|---|
| `/health` | GET | 健康检查（返回 ok/version/uptimeSec） |
| `/version` | GET | 版本信息（返回 version/protocolVersion） |

### WS Channel Handlers（`ws/`）

| 文件 | 注册频道 | 功能 |
|---|---|---|
| `channels.ts` | `system:ping`, `system:echo` | 系统通道 |
| `storage-channels.ts` | `workflow:*`, `workflowFolder:*`, `workflowVersion:*`, `executionLog:*`, `operationHistory:*` | 数据 CRUD |
| `execution-channels.ts` | `workflow:execute`, `workflow:pause/resume/stop`, `workflow:get-execution-recovery` | 工作流执行控制 |
| `plugin-channels.ts` | `plugin:*`, `workflow:*-plugin-scheme` | 插件管理与配置 |
| `app-channels.ts` | `aiProvider:*`, `chatHistory:*`, `agentSettings:*`, `shortcut:*`, `tabs:*`, `app:getVersion`, `agent:execTool` | 应用全局通道与 backend 工具执行 |
| `fs-channels.ts` | `fs:*` | 文件系统操作 |
| `chat-channels.ts` | `chat:completions`, `chat:abort` | Chat 流式对话 |

所有通道的类型契约定义在 `shared/channel-contracts.ts`，元数据在 `shared/channel-metadata.ts`。

## 关键依赖与配置

- **express** 5.x：HTTP 服务器
- **ws** 8.x：WebSocket 服务器
- **@anthropic-ai/claude-agent-sdk**：Claude Agent 运行时（ChatRuntime 中动态导入）

### 数据存储

所有数据以 JSON 文件存储在 `{userDataDir}` 下：

| Store | 文件路径模式 |
|---|---|
| `BackendWorkflowStore` | `{userDataDir}/workflows/{id}.json` |
| `BackendWorkflowVersionStore` | `{userDataDir}/workflow-versions/{workflowId}/{versionId}.json` |
| `BackendExecutionLogStore` | `{userDataDir}/execution-logs/{workflowId}/{logId}.json` |
| `BackendOperationHistoryStore` | `{userDataDir}/operation-history/{workflowId}.json` |
| `BackendAIProviderStore` | `{userDataDir}/ai-providers.json` |
| `BackendChatHistoryStore` | `{userDataDir}/chat-history/{workflowId}/{sessionId}.json` |
| `BackendSettingsStore` | `{userDataDir}/{filename}`（可配置文件名） |

## 数据模型

所有数据模型定义在 `shared/workflow-types.ts`，backend 和前端共享同一类型定义。

### 关键类型

- **Workflow**: 工作流（id / name / folderId / nodes / edges / enabledPlugins / agentConfig / pluginConfigSchemes）
- **WorkflowFolder**: 文件夹（id / name / parentId / order）
- **WorkflowVersion**: 版本快照（id / workflowId / name / snapshot）
- **ExecutionLog**: 执行日志（id / workflowId / steps / status）
- **ExecutionRecoveryState**: 执行恢复状态（executionId / status / log / context / recentEvents）

## 核心组件

### WSRouter（`ws/router.ts`）

- 职责：根据 channel 名称分发到注册的 handler
- 支持：超时控制（基于 `channel-metadata.ts`）、错误标准化（`BackendErrorShape`）

### ConnectionManager（`ws/connection-manager.ts`）

- 职责：管理 WS 客户端会话（clientId / socket / lastSeenAt）
- 功能：心跳、token 验证、客户端连接/断连事件、interaction 响应路由
- 每个客户端有唯一 clientId，支持断线重连后恢复交互操作

### ExecutionManager（`workflow/execution-manager.ts`）

- 职责：管理工作流执行会话（ExecutionSession）
- 功能：start（拓扑排序 + 顺序执行）、pause/resume/stop、switch 分支路由、插件配置加载
- 执行流程：
  1. 构建拓扑排序执行顺序
  2. 顺序执行节点，遇到 `main_process_bridge` 类型发起 Interaction
  3. 插件节点通过 `BackendPluginRegistry` 执行 handler
  4. 每步执行发射 execution events（node:start / node:complete / node:error 等）
  5. 支持执行恢复（finishedRecoveries 缓存 + TTL 过期清理）

### InteractionManager（`workflow/interaction-manager.ts`）

- 职责：处理需要客户端参与的执行步骤
- 支持的交互类型：`agent_chat`（AI 对话）、`node_execution`（工具执行）、`file_select`、`form`、`confirm`、`custom`
- 流程：发送 `interaction_required` -> 等待 `interaction_response`（支持超时和取消）
- 断线重连：客户端重连后自动重新发送待处理的交互请求

### BackendPluginRegistry（`plugins/plugin-registry.ts`）

- 职责：扫描和加载 server 类型插件
- 默认扫描目录：
  - `{userDataDir}/plugins`
  - `resources/plugins`（兼容内置插件）
- 会忽略 `type: 'client'`
- 功能：加载 `info.json` 元数据、`workflow.js` 节点定义和 handler、`tools.js` Agent 工具定义
- 支持在线安装 / 卸载 server 插件（ZIP 下载到 backend 插件目录）
- 插件禁用状态持久化到 `disabled.json`
- 内置能力：`builtin-fs-api`（文件系统）、`builtin-fetch-api`（HTTP 请求）

### ChatRuntime（`chat/chat-runtime.ts`）

- 职责：Web 模式下的 Chat 流式对话运行时
- 功能：通过动态 `import()` 加载 Claude Agent SDK，驱动 `query()` 流式迭代
- 事件转发：content_block_delta -> chat:chunk、thinking_delta -> chat:thinking、usage -> chat:usage
- 支持通过 AbortController 中止

## 测试与质量

- Smoke 测试：`pnpm smoke:backend`（`scripts/backend-smoke-test.mjs`）
- TypeScript 编译检查：`pnpm build:backend`（`tsc -p tsconfig.backend.json`）

## 常见问题 (FAQ)

**Q: Backend 如何被 Electron 发现？**
A: 主进程通过 `fork()` 启动 backend，监听 stdout 的 `WORKFOX_BACKEND_READY` 行获取 WS URL 和 token。渲染进程通过 `window.api.backend.getEndpoint()` 获取。

**Q: 如何新增 WS 通道？**
A: 1) 在 `shared/channel-contracts.ts` 添加类型；2) 在 `shared/channel-metadata.ts` 添加元数据；3) 在 `backend/ws/` 创建 handler 注册函数；4) 在 `backend/main.ts` 调用注册。

**Q: 插件在 backend 如何执行？**
A: `type: 'server'` 的插件在 `BackendPluginRegistry` 中加载。执行时既可以由 `ExecutionManager` 调用 `pluginRegistry.executeWorkflowNode()`，也可以通过 backend WS `agent:execTool` 直接调用。

**Q: ChatRuntime 和 Electron 的 claude-agent-runtime 有什么区别？**
A: 两者都封装 Claude Agent SDK。Electron 版本通过 IPC 流式推送事件，Backend 版本通过 WS `ChatEventSender` 推送。Backend 版本使用动态 `import()` 因为 ESM/CJS 兼容性。

## 相关文件清单

```
backend/
  main.ts                              入口，组装所有服务并启动
  app/
    config.ts                          BackendConfig 环境变量加载
    logger.ts                          日志工具
    create-server.ts                   HTTP + WS 服务器工厂
  ws/
    router.ts                          WSRouter（channel dispatch + 超时）
    connection-manager.ts              ConnectionManager（会话/心跳/token/重连）
    channels.ts                        系统通道（ping/echo）
    storage-channels.ts                数据 CRUD 通道
    execution-channels.ts              工作流执行控制通道
    plugin-channels.ts                 插件管理通道
    app-channels.ts                    应用全局通道（AI provider/chat history/settings/shortcut/tabs）
    fs-channels.ts                     文件系统操作通道
    chat-channels.ts                   Chat 流式对话通道
  workflow/
    execution-manager.ts               工作流执行管理器
    interaction-manager.ts             交互式操作管理器
  storage/
    paths.ts                           存储路径管理
    json-store.ts                      JSON 文件存储工具
    workflow-store.ts                  工作流 CRUD
    workflow-version-store.ts          版本快照 CRUD
    execution-log-store.ts             执行日志 CRUD
    operation-history-store.ts         操作历史 CRUD
    ai-provider-store.ts               AI Provider CRUD
    chat-history-store.ts              聊天历史 CRUD
    settings-store.ts                  通用键值设置存储
  plugins/
    plugin-registry.ts                 后端插件注册表
    builtin-fetch-api.ts               内置 HTTP 请求能力
    builtin-fs-api.ts                  内置文件系统能力
  chat/
    chat-runtime.ts                    Chat 运行时（Claude Agent SDK 封装）
    chat-event-sender.ts               Chat 事件发送器
```

## 变更记录 (Changelog)

| 日期 | 操作 | 说明 |
|---|---|---|
| 2026-04-22 | 初始化 | 首次生成 backend 模块文档 |
