# WorkFox 后端迁移设计文档

> 将工作流 runtime 和插件系统从 Electron 本地迁移至 Node.js 后端服务，前端通过 WebSocket 通信。

## 1. 迁移范围

### 迁移到后端

- 工作流 runtime 引擎（拓扑排序、节点分发、变量解析、执行控制）
- 后端插件系统（节点 handler、Agent 工具、插件生命周期）
- 工作流持久化（文件存储）
- 节点类型注册表
- 执行日志

### 保留在 Electron 本地

- Agent SDK 运行时（Claude Agent SDK）
- Chat 面板 / AI Provider 管理
- 工作流 DAG 编辑（拖拽、连线、属性面板）
- 前端 UI 插件系统（自定义视图、节点渲染）
- 快捷键、标签页、主题等本地设置
- electron-store 全局配置

## 2. 整体架构

```
┌─────────────────────────────────────────────┐
│  Electron (Renderer)                        │
│  ┌─────────┐ ┌──────────┐ ┌──────────────┐ │
│  │ Vue SPA │ │ Agent SDK│ │ 前端插件系统  │ │
│  │(编辑UI) │ │(本地运行)│ │(自定义UI展示) │ │
│  └────┬────┘ └─────┬────┘ └──────┬───────┘ │
│       │            │              │         │
│       └──────┬─────┘              │         │
│              │ WebSocket          │         │
│  ┌───────────▼────────────────────▼───────┐ │
│  │        WS Bridge (替换 IPC)            │ │
│  └───────────┬────────────────────────────┘ │
└──────────────┼──────────────────────────────┘
               │ WebSocket (ws://localhost:PORT)
┌──────────────▼──────────────────────────────┐
│  Node.js Backend (Express + ws)             │
│  ┌──────────────┐  ┌─────────────────────┐  │
│  │ 工作流引擎   │  │ 后端插件系统        │  │
│  │(从renderer迁移)│  │(从main进程迁移)    │  │
│  └──────────────┘  └─────────────────────┘  │
│  ┌──────────────┐  ┌─────────────────────┐  │
│  │ 工作流持久化 │  │ 节点注册表          │  │
│  │(文件系统)    │  │(从后端+前端合并)    │  │
│  └──────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────┘
```

## 3. 技术选型

| 项目 | 选择 | 理由 |
|------|------|------|
| 后端框架 | Express + ws | 与前端统一语言，ws 是最成熟的 Node.js WebSocket 库 |
| 存储方案 | 文件系统（JSON） | 与现有结构保持一致，单用户场景无需数据库 |
| 用户体系 | 单用户，无认证 | 当前阶段不需要多用户支持 |
| 协议风格 | IPC 镜像映射 | 最小化前端改动，IPC 通道一对一映射为 WS 消息 |

## 4. WebSocket 协议设计

### 4.1 消息格式

```typescript
// 请求-响应模式
interface WSRequest {
  id: string           // 唯一请求 ID
  channel: string      // 原 IPC 通道名
  data: any            // 请求参数
}

interface WSResponse {
  id: string           // 对应请求 ID
  channel: string
  type: 'response'
  data: any
}

// 流式事件
interface WSEvent {
  channel: string
  type: 'event'
  data: any
}

// 错误
interface WSError {
  id: string
  type: 'error'
  error: { code: string, message: string }
}
```

### 4.2 交互回调协议

节点执行需要前端用户输入时，引擎暂停并通过 WS 请求交互：

```typescript
// 后端 → 前端：请求交互
interface InteractionRequest {
  type: 'interaction_required'
  nodeId: string
  interactionType: 'file_select' | 'form' | 'confirm' | 'agent_chat' | 'custom'
  schema: any         // 描述需要的输入
  timeout?: number    // 超时毫秒数（可选）
}

// 前端 → 后端：返回交互结果
interface InteractionResponse {
  type: 'interaction_response'
  nodeId: string
  data: any            // 用户提供的输入
  cancelled?: boolean  // 用户取消
}
```

适用场景：
- `agent_run` 节点：Agent 对话、确认操作
- 文件选择节点：选择本地文件路径
- 确认操作节点：执行前确认
- 自定义表单节点：插件定义的输入表单

### 4.3 需要迁移的 IPC 通道

| 分组 | 通道前缀 | 方向 | 说明 |
|------|---------|------|------|
| 工作流 CRUD | `workflow:list/get/create/update/delete` | 请求-响应 | 工作流增删改查 |
| 工作流导入导出 | `workflow:importOpenFile/exportSaveFile` | 请求-响应 | 文件操作 |
| 插件配置方案 | `workflow:list-plugin-schemes/read-plugin-scheme/create-plugin-scheme/save-plugin-scheme/delete-plugin-scheme` | 请求-响应 | 插件配置管理 |
| 文件夹管理 | `workflowFolder:list/create/update/delete` | 请求-响应 | 文件夹 CRUD |
| 版本管理 | `workflowVersion:list/add/get/delete/clear/nextName` | 请求-响应 | 版本快照 |
| 执行日志 | `executionLog:list/save/delete/clear` | 请求-响应 | 日志持久化 |
| 操作历史 | `operationHistory:load/save/clear` | 请求-响应 | 撤销/重做 |
| 工作流执行 | `workflow:execute` | 流式（双向） | 节点执行进度 + 交互回调 |
| 节点类型 | `plugin:get-workflow-nodes/list-workflow-plugins` | 请求-响应 | 从后端获取可用节点 |
| 插件管理 | `plugin:list/enable/disable/install/uninstall/get-agent-tools` | 请求-响应 | 后端插件生命周期 |
| 插件配置 | `plugin:get-config/save-config` | 请求-响应 | 插件配置读写 |

### 4.4 保留本地 IPC 的通道

| 分组 | 通道前缀 | 理由 |
|------|---------|------|
| Chat 流式 | `chat:completions/chunk/tool-call/tool-result/thinking/usage/done/error` | Agent 在本地运行 |
| Agent 工具 | `agent:execTool` | 本地 Agent 工具执行 |
| Agent 设置 | `agentSettings:get/set` | Agent 配置本地管理 |
| AI Provider | `aiProvider:list/create/update/delete/test` | API 密钥留在本地 |
| 前端插件 UI | `plugin:get-view/get-icon` | UI 渲染在本地 |
| Chat 历史 | `chatHistory:*` | Chat 数据本地存储 |

## 5. 工作流引擎迁移

### 5.1 搬迁清单

从 `src/lib/workflow/engine.ts` 搬迁到后端的核心模块：

- `WorkflowEngine` 类（拓扑排序、执行控制）
- 变量解析器（`__data__` / `__config__` / `context` 引用解析）
- 节点分发器（`dispatchNode` 逻辑）
- 插件配置加载

### 5.2 执行流程（迁移后）

```
1. 前端发起执行：wsBridge.invoke('workflow:execute', { workflowId, input })
2. 后端引擎加载工作流 + 插件配置
3. 拓扑排序确定执行顺序
4. 逐节点执行：
   a. 普通节点（toast/switch/run_code 等）：后端直接执行
   b. 需交互节点（agent_run/文件选择等）：暂停 → WS 推送交互请求 → 等待前端响应 → 继续
   c. 插件自定义节点：后端插件 handler 执行
5. 每个节点状态变化通过 WS 事件推送：node:start / node:progress / node:complete / node:error
6. 工作流完成：推送 workflow:complete 或 workflow:error
```

### 5.3 agent_run 节点特殊处理

agent_run 节点需要调用本地 Claude Agent SDK，通过交互回调机制实现：

```
后端执行到 agent_run 节点
→ WS 推送 { type: 'interaction_required', interactionType: 'agent_chat', schema: { messages, config } }
→ Electron 端接收后调用本地 Agent SDK
→ Agent 流式输出通过 WS 推送回前端展示
→ Agent 完成后返回结果
→ WS 回传 { type: 'interaction_response', data: { result } }
→ 后端引擎继续执行下一个节点
```

## 6. 插件系统拆分

### 6.1 后端插件接口

```typescript
interface ServerPlugin {
  id: string
  nodes: WorkflowNodeDefinition[]
  tools: AgentToolDefinition[]
  handlers: Record<string, (ctx: NodeContext, args: any) => Promise<any>>
  activate(context: ServerPluginContext): void
  deactivate(): void
}

interface ServerPluginContext {
  storage: KVStore
  events: EventBus
  logger: Logger
  fetch: HttpClient
  fs: FileSystem        // 沙箱化文件系统
}
```

### 6.2 前端插件接口

```typescript
interface ClientPlugin {
  id: string
  views?: ViewDefinition[]
  nodeRenderers?: Record<string, Component>
}
```

### 6.3 插件目录结构

```
plugin-xxx/
├── info.json           # 元信息（新增 type: 'server' | 'client' | 'both'）
├── server/             # 后端部分
│   ├── main.js
│   ├── workflow.js
│   ├── tools.js
│   └── api.js
├── client/             # 前端部分
│   └── view.js
└── icon.png
```

`info.json` 新增 `type` 字段，系统按类型分发到对应端。

## 7. 前端改造

### 7.1 WS Bridge 层

```typescript
// src/lib/ws-bridge.ts
class WSBridge {
  private ws: WebSocket
  private pending: Map<string, { resolve, reject }>
  private eventHandlers: Map<string, Function[]>
  private interactionHandler?: (req: InteractionRequest) => Promise<InteractionResponse>

  async invoke(channel: string, data: any): Promise<any>
  on(channel: string, handler: Function): void
  off(channel: string, handler: Function): void
  onInteraction(handler: (req: InteractionRequest) => Promise<InteractionResponse>): void

  // 连接管理
  connect(url: string): Promise<void>
  disconnect(): void
  reconnect(): Promise<void>
}
```

### 7.2 Store 层改造

Pinia stores 中的 `window.api.xxx()` 调用替换为 `wsBridge.invoke('xxx', ...)`。
改动集中在数据访问层，Store 的业务逻辑不变。

### 7.3 工作流编辑器

- DAG 编辑保留在前端（Vue Flow），不变
- 节点类型列表从后端获取
- 执行状态由 WebSocket 事件驱动

## 8. 错误处理与重连

- WebSocket 断连自动重连（指数退避，最大 30 秒）
- 重连后自动恢复执行状态（后端维护执行上下文）
- 请求超时机制（可配置，默认 30 秒）
- 交互回调超时（可配置，默认 5 分钟）

## 9. 迁移阶段计划

### 阶段 1：基础设施（1-2 周）

- 搭建 Node.js 后端项目（Express + ws）
- 实现 WS Bridge 前端层（`src/lib/ws-bridge.ts`）
- 设计并实现 WS 消息协议（请求-响应、事件、错误）
- 连通测试（ping/pong + echo channel）

### 阶段 2：工作流持久化迁移（1 周）

- 后端实现 workflow-store（从 `electron/services/workflow-store.ts` 搬迁）
- 迁移 workflow / workflowFolder / workflowVersion IPC → WS
- 迁移 executionLog / operationHistory IPC → WS
- 前端 Store 层替换 API 调用（`window.api` → `wsBridge.invoke`）
- 验证工作流 CRUD 完整性

### 阶段 3：工作流引擎迁移（2 周）

- 将 `src/lib/workflow/engine.ts` 搬迁到后端
- 实现执行事件 WS 推送（node:start/progress/complete/error）
- 实现交互回调机制（InteractionRequest/Response）
- agent_run 节点回调实现
- 前端执行状态 UI 改造（从本地引擎事件改为 WS 事件驱动）
- 端到端工作流执行测试

### 阶段 4：插件系统迁移（2 周）

- 后端插件加载器实现（从 `electron/services/plugin-manager.ts` 搬迁）
- 插件 `info.json` 增加 `type` 字段
- 节点注册表从后端获取
- 前端 UI 插件系统保留并简化
- 现有内置插件（window-manager / file-system / fetch / jimeng）逐一迁移

### 阶段 5：收尾与优化（1 周）

- WebSocket 重连与错误恢复
- 执行日志迁移验证
- 性能测试（并发执行、大数据量工作流）
- 删除已迁移的死代码
- 更新 CLAUDE.md 架构文档

**总计约 7-9 周**。
