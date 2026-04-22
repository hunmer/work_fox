[根目录](../CLAUDE.md) > **shared**

# 共享协议与类型

> WorkFox 前后端共享的 TypeScript 类型定义、WS 协议、执行事件协议和插件能力加载器。renderer / backend / Electron 三端共同消费此目录中的 source-of-truth。

## 模块职责

1. **类型安全契约**：`channel-contracts.ts` 定义所有 backend WS 通道的请求/响应类型映射（`BackendChannelMap`）
2. **WS 消息协议**：`ws-protocol.ts` 定义 WS 消息格式（request/response/event/error/interaction）
3. **执行事件协议**：`execution-events.ts` 定义工作流执行全生命周期事件类型和 recovery 协议
4. **工作流类型**：`workflow-types.ts` 定义工作流核心数据模型（Workflow/Node/Edge/ExecutionLog 等）
5. **插件类型**：`plugin-types.ts` 定义插件元信息、配置、工具、节点类型
6. **错误处理**：`errors.ts` 定义统一的 `BackendErrorShape` 和错误码
7. **通道元数据**：`channel-metadata.ts` 定义所有 WS 通道的超时、优先级、幂等性、流式标记
8. **插件加载**：`plugin-entry.ts` 和 `plugin-capability-loader.ts` 定义插件入口文件解析和能力模块加载

## 入口与启动

- **入口文件**：`index.ts`（re-export 所有模块）
- 此模块为纯类型和工具函数，无副作用，无需启动

## 对外接口

### 核心 exports

| 文件 | 主要导出 | 消费者 |
|---|---|---|
| `channel-contracts.ts` | `BackendChannelMap`, `BackendChannel`, `ChannelRequest<C>`, `ChannelResponse<C>` | backend/ws/*, src/lib/backend-api/*, src/lib/ws-bridge.ts |
| `channel-metadata.ts` | `backendChannelMetadata`, `ChannelMetadata` | backend/ws/router.ts |
| `ws-protocol.ts` | `WSRequest`, `WSResponse`, `WSEvent`, `WSError`, `InteractionRequest`, `InteractionResponse`, `WSClientHello` | backend/ws/connection-manager.ts, src/lib/ws-bridge.ts |
| `execution-events.ts` | `ExecutionEventChannel`, `ExecutionEventMap`, `ExecutionRecoveryState`, `WorkflowExecuteRequest` | backend/workflow/*, src/stores/workflow.ts, src/lib/workflow/engine.ts |
| `workflow-types.ts` | `Workflow`, `WorkflowNode`, `WorkflowEdge`, `ExecutionLog`, `NodeTypeDefinition` | 全项目 |
| `plugin-types.ts` | `PluginInfo`, `PluginMeta`, `AgentToolDefinition`, `PluginConfigField` | electron/services/*, backend/plugins/* |
| `errors.ts` | `BackendErrorShape`, `BackendErrorCode`, `createErrorShape` | backend/*, shared/workflow-local-bridge.ts |
| `plugin-entry.ts` | `PluginEntryKind`, `resolvePluginEntryFile` | shared/plugin-capability-loader.ts |
| `plugin-capability-loader.ts` | `loadPluginWorkflowModule`, `loadPluginToolsModule`, `loadPluginApiModule`, `isMainProcessBridgePlugin` | electron/services/*, backend/plugins/* |
| `workflow-local-bridge.ts` | `LOCAL_BRIDGE_WORKFLOW_NODES`, `isLocalBridgeWorkflowNode` | backend/workflow/execution-manager.ts, electron/services/* |

### WS 通道列表（`BackendChannelMap`）

通道分组：

- **系统**: `system:ping`, `system:echo`
- **工作流 CRUD**: `workflow:list/get/create/update/delete`
- **工作流插件配置**: `workflow:list-plugin-schemes/read-plugin-scheme/create-plugin-scheme/save-plugin-scheme/delete-plugin-scheme`
- **文件夹**: `workflowFolder:list/create/update/delete`
- **版本**: `workflowVersion:list/add/get/delete/clear/nextName`
- **执行日志**: `executionLog:list/save/delete/clear`
- **操作历史**: `operationHistory:load/save/clear`
- **执行控制**: `workflow:execute`, `workflow:pause/resume/stop`, `workflow:get-execution-recovery`
- **插件**: `plugin:list/enable/disable/install/uninstall/get-workflow-nodes/list-workflow-plugins/get-agent-tools/get-config/save-config`
- **AI Provider**: `aiProvider:list/create/update/delete/test`
- **聊天历史**: `chatHistory:listSessions/createSession/updateSession/deleteSession/listMessages/addMessage/updateMessage/deleteMessage/deleteMessages/clearMessages`
- **设置**: `agentSettings:get/set`, `shortcut:list/update/toggle/clear/reset`, `tabs:load/save`
- **应用**: `app:getVersion`
- **文件系统**: `fs:listDir/delete/createFile/createDir/rename`
- **Chat**: `chat:completions`, `chat:abort`
- **工具**: `agent:execTool`, `workflowTool:respond`

### 执行事件列表（`ExecutionEventChannel`）

- `workflow:started` / `workflow:paused` / `workflow:resumed` / `workflow:completed` / `workflow:error`
- `node:start` / `node:progress` / `node:complete` / `node:error`
- `execution:log` / `execution:context`

### 错误码（`BackendErrorCode`）

`BAD_REQUEST` | `UNAUTHORIZED` | `NOT_FOUND` | `CONFLICT` | `TIMEOUT` | `CANCELLED` | `CONNECTION_CLOSED` | `CHANNEL_NOT_FOUND` | `HANDLER_FAILED` | `VALIDATION_FAILED` | `STORAGE_ERROR` | `WORKFLOW_ERROR` | `PLUGIN_ERROR` | `INTERACTION_TIMEOUT` | `INTERNAL_ERROR`

## 关键依赖与配置

- 无外部依赖（纯 TypeScript 类型 + 少量同步工具函数）
- 通过 `@shared/*` 路径别名在 renderer / backend / Electron 中导入

## 数据模型

核心类型定义见 `workflow-types.ts`：

- **Workflow**: 完整工作流（含 nodes/edges/enabledPlugins/agentConfig/pluginConfigSchemes）
- **WorkflowNode**: 工作流节点（含 type/label/position/data/nodeState）
- **WorkflowEdge**: 工作流连线（含 source/target/sourceHandle/targetHandle）
- **NodeTypeDefinition**: 节点类型定义（含 properties/handles/outputs）
- **ExecutionLog / ExecutionStep**: 执行日志与步骤
- **WorkflowVersion**: 版本快照
- **OperationEntry**: 操作历史条目

## 测试与质量

无独立测试。类型安全性通过 TypeScript 编译检查保证：
- `pnpm exec tsc -p tsconfig.web.json --noEmit`（renderer 端类型检查）
- `pnpm build:backend`（backend 端类型检查）

## 常见问题 (FAQ)

**Q: 新增 WS 通道需要改哪些文件？**
A: 1) `channel-contracts.ts` 添加 `ChannelContract`；2) `channel-metadata.ts` 添加元数据；3) backend `ws/` 创建 handler；4) renderer `lib/backend-api/` 创建适配函数。可选：更新 `preload/index.ts`。

**Q: plugin-entry.ts 和 plugin-capability-loader.ts 的区别？**
A: `plugin-entry.ts` 解析插件的入口文件路径（如 `main.js` / `workflow.js`）；`plugin-capability-loader.ts` 实际加载这些入口模块并导出结构化结果。

**Q: LocalBridge 节点是什么？**
A: `workflow-local-bridge.ts` 定义必须在 Electron 主进程执行的节点（如 `delay`）。Backend 执行到这类节点时通过 InteractionManager 发起 WS 交互请求，回到客户端执行。

## 相关文件清单

```
shared/
  index.ts                             统一 re-export
  channel-contracts.ts                 WS 通道类型契约（BackendChannelMap）
  channel-metadata.ts                  通道元数据（超时/优先级/幂等性）
  ws-protocol.ts                       WS 消息协议（request/response/event/interaction）
  execution-events.ts                  执行事件协议与 recovery 类型
  workflow-types.ts                    工作流核心数据模型
  plugin-types.ts                      插件类型（PluginInfo/PluginMeta/AgentToolDefinition）
  plugin-entry.ts                      插件入口文件路径解析
  plugin-capability-loader.ts          插件能力模块加载器
  workflow-local-bridge.ts             主进程桥接节点定义
  errors.ts                            后端错误码与错误构造器
```

## 变更记录 (Changelog)

| 日期 | 操作 | 说明 |
|---|---|---|
| 2026-04-22 | 初始化 | 首次生成 shared 模块文档 |
