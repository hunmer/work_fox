# 迁移 AI Agent 操作到 Backend ChatRuntime

## Context

当前 Electron 桌面模式通过 `electron/services/claude-agent-runtime.ts` 在主进程运行 Claude Agent SDK，而 Web 模式通过 `backend/chat/chat-runtime.ts` 运行。两套并行运行时导致：

1. `search_node_usage` 找不到 server 插件节点（如 `epub-parser`），因为主进程 registry 不包含 server 插件
2. 工具执行逻辑在 Electron 和 backend 各维护一份，重复且容易不一致
3. 新功能需要两端同步实现

**目标**：Electron 模式也统一走 backend 的 ChatRuntime + WS 通道，移除主进程中的 Claude Agent SDK 运行时。Electron 只负责窗口管理和 client 插件。

## 实施计划

### Phase 1: Backend ChatRuntime 补齐工具基础设施

Backend ChatRuntime 当前是单轮、无工具支持的残缺版。需要补齐。

#### 1.1 创建 `backend/chat/chat-tool-adapter.ts`

参照 `electron/services/claude-tool-adapter.ts`，创建 backend 版工具适配器：

- `workfox_workflow` MCP Server：16 个工作流编辑工具
- `workfox_browser` MCP Server：浏览器工具发现（list_categories 等）
- `workfox_plugin` MCP Server：server 插件 agent tools（从 `BackendPluginRegistry` 获取）

关键区别：backend 版不需要 Electron IPC，直接调用 backend 内部服务。

#### 1.2 创建 `backend/chat/chat-workflow-tool-executor.ts`

参照 `electron/services/workflow-tool-executor.ts`，创建 backend 版工作流工具执行器：

- 使用 `BackendWorkflowStore` 读写工作流（已在 backend 中存在）
- 使用 `BackendPluginRegistry` 获取节点定义（包含 server 插件）
- 节点类型定义合并：内置节点 + server 插件节点
- 工作流变更通知通过 WS event（而非 IPC）
- renderer-only 工具（`get_current_workflow`、`execute_workflow_*`）通过 interaction bridge

#### 1.3 修改 `backend/chat/chat-runtime.ts`

- `maxTurns: 1` → `maxTurns: 20`
- 注入 MCP servers、tool hooks、canUseTool
- 补齐 stream event 处理：`tool_progress`、`tool_use_summary`、`content_block_start`（tool_use 类型）
- 构造函数增加 `workflowStore`、`pluginRegistry`、`interactionManager` 依赖

#### 1.4 修改 `backend/main.ts`

- 传递 `workflowStore`、`pluginRegistry`、`interactionManager` 给 `ChatRuntime`

**验证**：Web 模式下，发送带 `_mode: 'workflow'` 的 chat:completions，backend 能执行 `get_workflow`、`create_node` 等纯后端工具并流式返回工具调用事件。

---

### Phase 2: Interaction Bridge 扩展

为 renderer-only 工具和 client 插件工具建立交互桥接。

#### 2.1 新增 `chat_tool` interaction type

修改 `shared/ws-protocol.ts`：
```
InteractionType 增加 'chat_tool'
```

#### 2.2 工具执行分流

在 `chat-tool-adapter.ts` 中：
- 纯后端工具（get_workflow、create_node、search_node_usage 等）：直接在 backend 执行
- Renderer-only 工具（get_current_workflow、execute_workflow_sync/async、get_workflow_result）：通过 `interactionManager.request()` 发送 `chat_tool` 交互到客户端执行

#### 2.3 客户端交互处理

修改 renderer 的 WS interaction handler（`src/lib/ws-bridge.ts` 或 `src/stores/workflow.ts`）：
- 处理 `chat_tool` 类型的交互请求
- 调用 `executeRendererWorkflowTool(toolName, args)` 返回结果

#### 2.4 工作流变更通知

当 backend 工具修改工作流时，通过 WS event `workflow:updated` 通知 renderer。renderer workflow store 监听此事件更新 Pinia 状态。

**验证**：Web 模式下，`get_current_workflow` 能正确返回 renderer Pinia store 中的画布状态；`create_node` 后 renderer 能收到变更通知。

---

### Phase 3: Client 插件节点注册

让 backend `search_node_usage` / `list_node_types` 包含 client 插件节点。

#### 3.1 创建 `backend/chat/client-node-cache.ts`

简单的内存缓存，存储 renderer 注册的 client 插件节点定义。

#### 3.2 新增 WS 通道

- `chat:register-client-nodes`：renderer 连接 backend 后，发送 client 插件节点定义
- 客户端断开时自动清理

#### 3.3 合并节点定义

在 `chat-workflow-tool-executor.ts` 的 `getAllNodeTypeDefinitions()` 中合并：
1. 内置节点
2. Server 插件节点（从 `BackendPluginRegistry`）
3. Client 插件节点（从 `ClientNodeCache`）

#### 3.4 Renderer 注册

修改 `src/stores/plugin.ts`：在插件加载/变化时，通过 `wsBridge.invoke('chat:register-client-nodes', ...)` 注册 client 插件节点。

**验证**：Electron 模式下，client 插件节点能通过 `search_node_usage` 搜索到。

---

### Phase 4: Electron 路由 Chat 到 Backend WS

将 Electron 模式的 chat completions 从 IPC 切换到 WS。

#### 4.1 修改 `src/lib/agent/agent.ts`

`runAgentStream()` 改为通过 `wsBridge.invoke('chat:completions', payload)` 调用 backend，而非 `window.api.chat.completions(payload)`。

#### 4.2 统一 Stream 监听

当前 `listenToChatStream()` 通过 `window.api.on()` 监听 IPC 事件。改为通过 `wsBridge.on()` 监听 WS 事件（Web 模式已有此路径）。

在 Electron 模式下，wsBridge 已连接 backend，WS 事件和 IPC 事件使用相同的 channel 名（`chat:chunk` 等），只需切换订阅源。

#### 4.3 保持 IPC fallback

当 WS 未连接时，回退到现有 IPC 路径（兼容极端情况）。

**验证**：Electron 模式下，发送 chat 消息，确认走 WS → backend → 流式返回。工具调用正常工作。思考块、usage 统计正常。

---

### Phase 5: Client 插件 Agent Tool 桥接

让 backend ChatRuntime 能执行 client 插件的 agent tools。

#### 5.1 注册 client 插件 agent tool schema

类似 Phase 3 的节点注册，renderer 通过 WS 通道将 client 插件的 agent tool schema 注册到 backend。

#### 5.2 通过 interaction bridge 执行

backend `chat-tool-adapter.ts` 识别 client 插件工具，通过 `chat_tool` interaction 发到 renderer，renderer 调用 `window.api.agent.execTool()` 执行。

**验证**：Client 插件的 agent tool 能在 chat 中被调用并返回结果。

---

### Phase 6: 清理 Electron Agent Runtime

确认所有功能通过 backend 路径正常后，移除 Electron 主进程中的 agent 相关代码。

#### 可移除文件
- `electron/services/claude-agent-runtime.ts`
- `electron/services/claude-tool-adapter.ts`
- `electron/services/workflow-tool-dispatcher.ts`
- `electron/services/workflow-tool-executor.ts`

#### 需修改文件
- `electron/ipc/chat.ts`：移除 `chat:completions`、`chat:abort`、`workflow-tool:respond` handlers
- `electron/main.ts`：移除相关 import 和注册
- `preload/index.ts`：简化 chat API（保留 stub 或移除）

#### 保留
- `electron/services/workflow-node-registry.ts`：client 插件节点定义仍需管理
- `electron/services/plugin-manager.ts`：client 插件生命周期管理
- `electron/services/plugin-runtime-host.ts`：client 插件运行时

**验证**：全面回归测试——chat、工作流编辑、工具调用、流式输出、abort、多标签页。

---

## 关键文件索引

### Backend 需新建
- `backend/chat/chat-tool-adapter.ts` — MCP tool server 创建
- `backend/chat/chat-workflow-tool-executor.ts` — 工作流工具执行
- `backend/chat/client-node-cache.ts` — client 插件节点缓存

### Backend 需修改
- `backend/chat/chat-runtime.ts` — 多轮对话 + 工具支持
- `backend/ws/chat-channels.ts` — 新增 register-client-nodes handler
- `backend/main.ts` — 传递新依赖给 ChatRuntime

### Shared 需修改
- `shared/ws-protocol.ts` — 新增 chat_tool interaction type

### Renderer 需修改
- `src/lib/agent/agent.ts` — WS 路由切换
- `src/lib/agent/stream.ts` — 统一事件监听源
- `src/stores/workflow.ts` — 处理 chat_tool interaction + workflow:updated WS event
- `src/stores/plugin.ts` — 注册 client 插件节点到 backend

### Electron 需修改/移除（Phase 6）
- `electron/ipc/chat.ts` — 移除 chat handlers
- `electron/main.ts` — 移除 agent runtime 相关代码
- `preload/index.ts` — 简化 chat API

### 参考实现（不修改，作为模板）
- `electron/services/claude-agent-runtime.ts` — stream event bridge 逻辑
- `electron/services/claude-tool-adapter.ts` — MCP server 创建模式
- `electron/services/workflow-tool-executor.ts` — 工作流工具 handler 逻辑
- `backend/workflow/interaction-manager.ts` — interaction bridge 模式

## 验证策略

每个 Phase 完成后：
```bash
pnpm exec tsc -p tsconfig.web.json --noEmit
pnpm build:backend
pnpm smoke:backend
```

功能验证：
1. Phase 1：Web 模式 chat + workflow 工具调用
2. Phase 2：Web 模式 renderer-only 工具交互
3. Phase 3：Electron 模式 search_node_usage 找到所有节点类型
4. Phase 4：Electron 模式 chat 走 WS
5. Phase 5：Client 插件 agent tool 调用
6. Phase 6：移除 Electron agent runtime 后全面回归
