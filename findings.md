# Findings

## Source Document

- 目标设计文档：`docs/superpowers/specs/2026-04-21-workfox-backend-migration-design.md`
- 文档提出 5 个迁移阶段，总周期预估 7-9 周，但目前粒度偏“里程碑级”，尚未细化到仓库模块、依赖顺序和验收口径

## Current Codebase Baseline

### Workflow Engine

- 当前工作流引擎位于 [src/lib/workflow/engine.ts](/Users/Zhuanz/Documents/work_fox/src/lib/workflow/engine.ts)
- 引擎当前运行在 renderer
- 主要耦合点：
  - 依赖 `vue` 的 `toRaw`
  - 依赖 `window.api` 读取插件配置
  - 依赖 `@/stores/ai-provider`
  - 在 store 内被直接实例化和管理生命周期
- 已有能力：
  - 拓扑排序
  - pause/resume/stop
  - 分支控制
  - 单节点调试
  - 执行日志聚合

### Frontend Workflow Store

- 主要入口位于 [src/stores/workflow.ts](/Users/Zhuanz/Documents/work_fox/src/stores/workflow.ts)
- 该 store 同时承载：
  - workflow CRUD
  - folder CRUD
  - version 管理
  - execution log 管理
  - operation history
  - 本地执行控制
  - 单节点调试
- 风险：
  - 数据访问、执行控制、UI 状态耦合过深
  - 如果直接替换执行链路，回归面会比较大

### Preload IPC Surface

- preload 暴露面位于 [preload/index.ts](/Users/Zhuanz/Documents/work_fox/preload/index.ts)
- 已暴露完整 workflow 相关 API：
  - `workflow.*`
  - `workflowFolder.*`
  - `workflowVersion.*`
  - `executionLog.*`
  - `operationHistory.*`
  - `plugin.getWorkflowNodes/listWorkflowPlugins/getAgentTools/getConfig/saveConfig`
- 结论：
  - 这些接口是 WS adapter 的直接映射源
  - 本地能力与后端能力目前共用同一个 `window.api` 命名空间，后续必须拆分职责

### Electron Storage Services

- 工作流存储位于 [electron/services/workflow-store.ts](/Users/Zhuanz/Documents/work_fox/electron/services/workflow-store.ts)
- 版本快照位于 [electron/services/workflow-version.ts](/Users/Zhuanz/Documents/work_fox/electron/services/workflow-version.ts)
- 执行日志位于 [electron/services/execution-log.ts](/Users/Zhuanz/Documents/work_fox/electron/services/execution-log.ts)
- 操作历史位于 [electron/services/operation-history.ts](/Users/Zhuanz/Documents/work_fox/electron/services/operation-history.ts)
- 当前特点：
  - 基于本地文件系统 / JSON 文件
  - 与 Electron `app.getPath('userData')` 紧耦合
  - 适合迁移到 backend，但需要抽象统一 data root

### Plugin System

- 插件管理器位于 [electron/services/plugin-manager.ts](/Users/Zhuanz/Documents/work_fox/electron/services/plugin-manager.ts)
- 当前单个 manager 负责：
  - 插件目录扫描
  - 激活/停用
  - workflow 节点注册
  - API 注册
  - agent tools 注册
  - view/icon 读取
  - disabled 列表管理
- 结论：
  - 设计文档中的 server/client 拆分是必要的
  - 如果不先拆职责，后端插件系统会被 Electron API 污染

## IPC To WS Candidates

### Priority 1: 低风险 CRUD

- `workflow:list/get/create/update/delete`
- `workflowFolder:list/create/update/delete`
- `workflowVersion:list/add/get/delete/clear/nextName`
- `executionLog:list/save/delete/clear`
- `operationHistory:load/save/clear`
- `workflow:list-plugin-schemes/read-plugin-scheme/create-plugin-scheme/save-plugin-scheme/delete-plugin-scheme`

原因：
- 这些通道基本是请求响应式，协议迁移简单
- 先迁移能让后端先承接数据层

### Priority 2: 节点注册与插件查询

- `plugin:get-workflow-nodes`
- `plugin:list-workflow-plugins`
- `plugin:get-agent-tools`
- `plugin:get-config/save-config`

原因：
- 它们是执行引擎迁移和前端节点选择器的前置条件

### Priority 3: 执行链路

- `workflow:execute`

原因：
- 这是唯一需要双向流式事件和交互回调的复杂通道
- 必须在协议、存储、插件注册、interaction manager 都稳定后再切

## Architectural Constraints

- Agent SDK 必须保留在 Electron 本地
- AI Provider 管理和秘钥保留在本地
- Chat 流式 IPC 与 workflow 后端迁移是两套链路，不能混为一谈
- 工作流编辑器继续在 renderer，本轮不改 DAG UI 结构
- 文件系统存储仍是单用户本地 JSON，无需数据库

## Implementation Recommendations

1. 先做 shared 协议层和 WS bridge，再迁移具体业务通道
2. 在迁移初期允许 IPC/WS 双栈共存，通过 feature flag 切换
3. 不要直接把 `src/lib/workflow/engine.ts` 移动到 backend；应该先拆分为纯逻辑模块
4. 插件系统优先支持内置插件，第三方插件兼容可以后补
5. 把 execution session 作为一等概念设计，否则无法正确处理 pause/resume、interaction、reconnect

## Open Questions

- backend 服务最终是随 Electron 启动的子进程，还是作为嵌入式 server 模块在 main 进程内启动
- `run_code`、文件访问等节点在 backend 的安全边界是什么
- 单节点调试是否必须在第一阶段跟随主执行链一起迁移
- 插件 `info.json` 的兼容默认值如何定义，避免老插件全部失效

## Planning Outcome

- 已形成一份面向实施的详细阶段计划，覆盖架构、协议、数据、执行、插件、前端和测试切换

## Phase 2 Architecture Findings

- 当前 `electron.vite.config.ts` 只构建 Electron main、preload 和 renderer，没有 backend 构建目标。
- 当前 `electron/main.ts` 在 `app.whenReady()` 后注册全部 IPC、注册内置节点并加载插件；后端迁移需要保留本地 IPC 能力用于兼容和回退。
- Backend 推荐作为独立 Node 子进程由 Electron Main 拉起，而不是嵌入 Electron Main bundle。
- Electron Main 应继续负责 `app.getPath('userData')`、插件目录解析和本地桌面能力，然后通过环境变量把数据目录与插件目录传给 backend。
- Backend 目录应禁止引入 `electron`，否则会破坏可测试性和后续独立服务边界。
- Phase 2 详细架构产物已写入 `docs/superpowers/plans/2026-04-21-workfox-backend-migration-architecture.md`。

## Phase 3 Protocol Findings

- 新增根目录 `shared/` 作为前后端共享协议来源。
- `shared/ws-protocol.ts` 定义 request、response、event、error、interaction_required、interaction_response。
- `shared/execution-events.ts` 定义工作流和节点执行事件，并为 execution session 预留 `executionId`。
- `shared/channel-contracts.ts` 覆盖当前计划迁移的 workflow、folder、version、executionLog、operationHistory、plugin、workflow:execute/pause/resume/stop 通道。
- `shared/channel-metadata.ts` 记录通道优先级、是否保序、是否幂等、超时和是否流式。
- `shared/workflow-types.ts` 以 renderer 的 `src/lib/workflow/types.ts` 为基础，作为后续统一类型来源。
- `shared/plugin-types.ts` 为插件 `type: server | client | both` 和 entries 字段预留类型。
- 已将 `shared/**/*` 纳入 `tsconfig.node.json` 与 `tsconfig.web.json`，并在路径别名里加入 `@shared/*`。

## Verification Findings

- `shared/` 独立 TypeScript 检查通过。
- 现在 `pnpm build` 已通过。此前 renderer 对 `@tiptap/vue-3` 的解析失败已因依赖安装恢复。
- `pnpm exec tsc -p tsconfig.web.json --noEmit` 和 `pnpm exec tsc -p tsconfig.node.json --noEmit` 暴露多处仓库既有类型问题，包括 notification options、workflow engine status、nullable workflowStore、missing `src/types/split`、node project include 等。

## Phase 4 Backend Findings

- backend 现已采用独立 `tsconfig.backend.json` 编译到 `out/backend/main.js`。
- Electron Main 会通过 [backend-process.ts](/Users/Zhuanz/Documents/work_fox/electron/services/backend-process.ts) 启动 backend 子进程，并通过 preload 暴露 endpoint/status。
- backend 已支持：
  - `GET /health`
  - `GET /version`
  - WebSocket `/ws`
  - `system:ping`
  - `system:echo`
- WebSocket 已具备：
  - client id
  - request/response
  - error envelope
  - heartbeat ping
  - token 校验

## Phase 5/6 Integration Findings

- workflow 数据域 adapter 已新增，feature flag 为：
  - `localStorage['workfox.useWorkflowBackend'] = '1'`
  - 或 `VITE_USE_WORKFLOW_BACKEND=1`
- [src/stores/workflow.ts](/Users/Zhuanz/Documents/work_fox/src/stores/workflow.ts) 已改为通过 adapter 访问 workflow CRUD、folder、version、executionLog、operationHistory。
- backend 已接通以下存储通道：
  - `workflow:list/get/create/update/delete`
  - `workflow:list-plugin-schemes/read-plugin-scheme/create/save/delete`
  - `workflowFolder:list/create/update/delete`
  - `workflowVersion:list/add/get/delete/clear/nextName`
  - `executionLog:list/save/delete/clear`
  - `operationHistory:load/save/clear`
- backend smoke test 已验证：
  - `/health` 返回正常
  - WS `system:ping` 返回正常
  - WS `workflow:list` 返回正常

## Plugin Domain Migration Findings

- backend 已新增最小 `plugin registry`，直接从 `WORKFOX_PLUGIN_DIR` 扫描 `info.json`、`workflow.js`、`tools.js`。
- 当前 backend 插件域已支持：
  - `plugin:list`
  - `plugin:enable`
  - `plugin:disable`
  - `plugin:get-workflow-nodes`
  - `plugin:list-workflow-plugins`
  - `plugin:get-agent-tools`
  - `plugin:get-config`
  - `plugin:save-config`
- 插件配置文件继续复用现有用户目录结构：
  - `plugin-data/<pluginId>/data.json`
  - `plugin-data/disabled.json`
- 前端已新增 `src/lib/backend-api/plugin-domain.ts`，在 backend flag 打开时让 plugin store 走 WS 通道，同时保留 `getView/getIcon/import/openFolder/install/uninstall` 继续走 Electron 本地 API。
- [src/stores/plugin.ts](/Users/Zhuanz/Documents/work_fox/src/stores/plugin.ts) 已切换为统一 domain adapter，不再直接依赖 `window.api.plugin.*` 的已迁移通道。
- [src/components/chat/ChatPanel.vue](/Users/Zhuanz/Documents/work_fox/src/components/chat/ChatPanel.vue) 已改为通过 plugin store 拉取 agent tools，避免聊天面板绕过 domain adapter。
- backend smoke test 已验证：
  - `plugin:list-workflow-plugins` 可返回内置 workflow 插件及 `nodeCount`
  - `plugin:get-config` 可返回配置数据

## Remaining Execution Gap

- `workflow:execute/pause/resume/stop` 仍未迁移到 backend，本质阻塞点是 [src/lib/workflow/engine.ts](/Users/Zhuanz/Documents/work_fox/src/lib/workflow/engine.ts) 仍耦合：
  - `vue` 的 `toRaw`
  - `window.api`
  - `useAIProviderStore`
  - renderer chat/agent stream
- 这意味着“执行通道迁移”和“引擎解耦”不能再拆成纯通道工作；下一步应按 Phase 7 先抽 execution runner/context resolver/node dispatcher，再接 execution events 和 UI 订阅。

## Execution Event Groundwork Findings

- `WorkflowEngine` 已开始输出 shared execution events，store 不再只依赖 `onLogUpdate` 直接写状态。
- [src/stores/workflow.ts](/Users/Zhuanz/Documents/work_fox/src/stores/workflow.ts) 已新增统一 `handleExecutionEvent(...)`，将以下状态更新收口到同一入口：
  - `executionStatus`
  - `executionLog`
  - `executionContext`
  - execution history append
- 这让“本地 engine 事件”和“未来 backend WS 事件”可以共用同一套 UI 状态机，后续切换 backend 时不必再重写 `ExecutionBar` / `CustomNodeWrapper` 的状态来源。
- 当前 backend 侧仅完成了前端订阅入口和 adapter method 预留：
  - `workflow.pause(executionId)`
  - `workflow.resume(executionId)`
  - `workflow.stop(executionId)`

## Backend Execution Findings

- backend 已新增 [execution-manager.ts](/Users/Zhuanz/Documents/work_fox/backend/workflow/execution-manager.ts) 与 [execution-channels.ts](/Users/Zhuanz/Documents/work_fox/backend/ws/execution-channels.ts)，真正接通：
  - `workflow:execute`
  - `workflow:pause`
  - `workflow:resume`
  - `workflow:stop`
- backend execution session 已具备：
  - `executionId`
  - `pauseRequested`
  - `stopRequested`
  - `currentIndex`
  - execution log 构建
  - execution history 持久化

## Phase 8 Reconnect Observability Findings

- `src/lib/ws-bridge.ts` 现已补齐前端可消费的连接事件：
  - `ws:connected`
  - `ws:reconnected`
  - `ws:reconnecting`
  - `ws:error`
- [src/stores/workflow.ts](/Users/Zhuanz/Documents/work_fox/src/stores/workflow.ts) 已将 backend 连接状态收口为：
  - `backendConnectionState`
  - `backendReconnectAttempt`
  - `backendLastError`
- [src/components/workflow/ExecutionBar.vue](/Users/Zhuanz/Documents/work_fox/src/components/workflow/ExecutionBar.vue) 已在执行栏提示“后端重连中 / 后端异常”，满足 interaction 恢复阶段的最低可观测性要求。
- backend 现会发出完整 execution event 流：
  - `workflow:started/paused/resumed/completed/error`
  - `node:start/progress/complete/error`
  - `execution:log`
  - `execution:context`
- backend 插件 registry 已从“元数据读取”扩展为“可执行 handler registry”，复用现有插件 `workflow.js` 中的 handler。
- backend 已新增 Node 侧内置插件 API：
  - `fetchText/fetchJson/fetchBuffer/fetchBuffers/postJson`
  - `writeFile/readFile/editFile/deleteFile/listFiles/createDir/removeDir/stat/exists/rename/copyFile`
- 现阶段可在 backend 跑通的节点：
  - built-in：`start` / `end` / `run_code` / `toast` / `switch` / `gallery_preview` / `music_player`
  - plugin：`file-system`、`fetch`，以及理论上基于 HTTP/FS 的 `fish-audio`、`jimeng`
- 现阶段仍不支持的节点：
  - `agent_run`
  - 浏览器工具节点
  - `window-manager` 等依赖 Electron 本地窗口能力的插件节点
- pause/resume 首版实现曾在 `_delay` 期间错误跳过节点，已通过 `executeNode -> interrupted` 返回值修复。

## Verification Findings

- backend smoke test 已验证：
  - `workflow:create -> workflow:execute -> workflow:completed`
  - `execution:log` / `execution:context` / `node:*` 事件流
  - `executionLog:list` 可读到 backend 落盘日志
  - plugin 节点 `write_file` / `read_file` 可在 backend 正常执行
  - `workflow:pause -> workflow:paused -> workflow:resume -> workflow:completed` 正常

## Interaction Bridge Findings

- backend 已新增 [interaction-manager.ts](/Users/Zhuanz/Documents/work_fox/backend/workflow/interaction-manager.ts)，负责：
  - 按 `executionId + requestId` 挂起交互
  - 仅向发起 `workflow:execute` 的 WS client 定向下发 `interaction_required`
  - 处理 timeout、cancel、renderer 断连
- [connection-manager.ts](/Users/Zhuanz/Documents/work_fox/backend/ws/connection-manager.ts) 现在同时支持：
  - 广播 execution events
  - 定向向单个 renderer/client 发 interaction request
  - 接收 `interaction_response`
- backend execution 已支持两类本地桥接：
  - `agent_run` -> `interaction_required(type=agent_chat)`
  - `window-manager` 节点 -> `interaction_required(type=node_execution)`
- 当前 workflow 里的浏览器工具节点只有 `delay`；它并不来自插件目录，而是 renderer 的 [nodeRegistry.ts](/Users/Zhuanz/Documents/work_fox/src/lib/workflow/nodeRegistry.ts) 基于 `BROWSER_TOOL_LIST` 动态生成。
- 因此“补浏览器工具节点 bridge”的当前落地点不是 backend plugin registry，而是 Electron 本地 `agent:execTool` fallback。现已新增 [workflow-browser-node-runtime.ts](/Users/Zhuanz/Documents/work_fox/electron/services/workflow-browser-node-runtime.ts) 承接 `delay`，并让 backend `delay` 节点走同一条 `node_execution` interaction bridge。
- 断线恢复首版已落地：
  - [src/lib/ws-bridge.ts](/Users/Zhuanz/Documents/work_fox/src/lib/ws-bridge.ts) 会持久化 stable `clientId` 并在 WS close 后自动重连
  - [connection-manager.ts](/Users/Zhuanz/Documents/work_fox/backend/ws/connection-manager.ts) 允许 renderer 用稳定 `clientId` 重新附着同一逻辑客户端
  - [interaction-manager.ts](/Users/Zhuanz/Documents/work_fox/backend/workflow/interaction-manager.ts) 在断线后不会立刻 fail pending interaction，而是保留一段 grace period；若同一 `clientId` 重连，则自动重发未完成的 `interaction_required`
- renderer 已新增 [src/lib/backend-api/interaction.ts](/Users/Zhuanz/Documents/work_fox/src/lib/backend-api/interaction.ts)，统一把 interaction request 映射回现有本地执行能力：
  - `agent_chat` 复用 `window.api.chat.completions`
  - `node_execution` 复用 `window.api.agent.execTool`
- 为避免本地执行与后端桥接逻辑分叉，已抽出 [src/lib/workflow/agent-run.ts](/Users/Zhuanz/Documents/work_fox/src/lib/workflow/agent-run.ts) 作为共享 `agent_run` 执行 helper，`WorkflowEngine` 本地路径与 WS interaction handler 共用这套实现。
- 本轮完成后，backend build 通过；`tsconfig.web.json` 仍失败，但失败项回到仓库既有问题，未新增 interaction bridge 相关报错。
- 剩余缺口：
  - 浏览器工具节点一旦从 `delay` 扩容到更多本地能力，需要独立的 capability/source-of-truth，而不是继续散落在 renderer node registry 和 Electron runtime 两处

## Execution Recovery Findings

- backend 已新增 `workflow:get-execution-recovery` 通道，按 `stable clientId + workflowId (+ executionId)` 查询当前 execution recovery。
- [backend/workflow/execution-manager.ts](/Users/Zhuanz/Documents/work_fox/backend/workflow/execution-manager.ts) 现在会为每个 active session 维护：
  - 最新 `ExecutionLog.snapshot`
  - 最新 execution context
  - bounded recent event backlog（当前上限 100 条）
  - `lastUpdatedAt`
- execution 完成或报错时，manager 会保留一个短 TTL（2 分钟）的 finished recovery，因此前端即使错过最终 `workflow:completed/error` 事件，重连后仍能拿到最终状态与 context。
- [src/stores/workflow.ts](/Users/Zhuanz/Documents/work_fox/src/stores/workflow.ts) 在 backend 模式下会在 `ws:connected` / `ws:reconnected` 后主动调用 recovery 接口：
  - 若找到 active execution，则恢复 `executionStatus`、`executionLog`、`executionContext`
  - 若 execution 已结束，则恢复最终状态并刷新 execution logs 列表
  - 若 log 带 `snapshot`，则直接覆盖当前 workflow nodes/edges，避免 UI 停留在断线前的旧图状态
- 这意味着当前已具备“interaction resend + execution snapshot recovery”的最小闭环；仍未做的是更强语义的按 cursor 增量追平，现阶段前端主要依赖 latest snapshot，而不是逐条重放 backlog 事件。

## Phase 9 Capability And Entry Findings

- 已新增 [shared/plugin-entry.ts](/Users/Zhuanz/Documents/work_fox/shared/plugin-entry.ts)，用于统一解析插件 `entries` 字段并为 `main/server/client/workflow/tools/api/view` 提供 fallback 默认文件名。
- [electron/services/plugin-manager.ts](/Users/Zhuanz/Documents/work_fox/electron/services/plugin-manager.ts) 与 [backend/plugins/plugin-registry.ts](/Users/Zhuanz/Documents/work_fox/backend/plugins/plugin-registry.ts) 已共用同一套 entry 解析逻辑，不再把 `main.js` / `workflow.js` / `tools.js` / `api.js` 写死在各自实现里。
- 已新增 [shared/workflow-local-bridge.ts](/Users/Zhuanz/Documents/work_fox/shared/workflow-local-bridge.ts)，把当前需要走本地 bridge 的 workflow 节点能力声明为 shared source-of-truth。
- [src/lib/workflow/nodeRegistry.ts](/Users/Zhuanz/Documents/work_fox/src/lib/workflow/nodeRegistry.ts) 不再直接从 `BROWSER_TOOL_LIST` 生成 workflow 节点定义；workflow 编辑器里这类本地 bridge 节点现在改由 shared local capability 驱动。
- [backend/workflow/execution-manager.ts](/Users/Zhuanz/Documents/work_fox/backend/workflow/execution-manager.ts)、[electron/services/workflow-browser-node-runtime.ts](/Users/Zhuanz/Documents/work_fox/electron/services/workflow-browser-node-runtime.ts)、[electron/ipc/chat.ts](/Users/Zhuanz/Documents/work_fox/electron/ipc/chat.ts) 已改为按 shared local capability 判断本地 bridge 节点，而不是继续散落地硬编码 `delay`。
- 内置插件 metadata 已开始显式化：
  - `workfox.fetch` / `workfox.file-system` / `workfox.fish-audio` / `workfox.jimeng` 标记为 `type: server`
  - `workfox.window-manager` 标记为 `type: both`
  - 并补充了 `entries` 字段，作为后续 server/client 拆分的兼容入口
- Electron 侧已不再只有一个“大一统 plugin manager”：
  - [plugin-catalog.ts](/Users/Zhuanz/Documents/work_fox/electron/services/plugin-catalog.ts) 负责扫描 manifest、disabled state、插件资产读取、ZIP/URL 安装和卸载
  - [plugin-runtime-host.ts](/Users/Zhuanz/Documents/work_fox/electron/services/plugin-runtime-host.ts) 负责 module 激活/停用和 workflow/api/tools 注册
  - [plugin-manager.ts](/Users/Zhuanz/Documents/work_fox/electron/services/plugin-manager.ts) 现在主要做 orchestration，协调 catalog 与 runtime host
- 已新增 [shared/plugin-capability-loader.ts](/Users/Zhuanz/Documents/work_fox/shared/plugin-capability-loader.ts)，backend registry 与 Electron runtime host 现在共用同一套 capability loader：
  - `loadPluginWorkflowModule(...)`
  - `loadPluginToolsModule(...)`
  - `loadPluginApiModule(...)`
  - `isMainProcessBridgePlugin(...)`
- 这意味着 plugin capability 的入口解析和 runtime type 判定已经不再在 backend/Electron 两边各写一份，后续 Phase 9/10 的差异点主要只剩“消费这些能力的宿主是谁”，而不是“怎么发现这些能力”。
- 这让 Electron 侧已经出现了明确的 client/plugin-host 边界，后续再把剩余 manifest/default/config 查询从 runtime instance 上剥离，会比此前容易得多。
- [electron/ipc/plugin.ts](/Users/Zhuanz/Documents/work_fox/electron/ipc/plugin.ts) 与 [electron/services/workflow-store.ts](/Users/Zhuanz/Documents/work_fox/electron/services/workflow-store.ts) 已开始优先使用 manifest defaults，而不是要求 runtime instance 必须参与 metadata/defaults 读取。
- 当前仍未完成的部分：
  - backend plugin registry 与 Electron runtime host 虽已共用 loader，但仍各自维护一层“把 loaded capability 注入各自宿主”的 glue code
  - Phase 10 之前，前端 workflow store 仍处于 backend 优先 + 本地执行兜底的过渡形态

## Phase 10 Store And UI Findings

- [src/stores/workflow.ts](/Users/Zhuanz/Documents/work_fox/src/stores/workflow.ts) 现在已不再持有 store 级 `WorkflowEngine` ref；本地执行 fallback 仍保留，但只存在于 `createExecutionActions(...)` 闭包内的短生命周期 `localEngine`。
- 这让 workflow store 的主状态源进一步收口为：
  - backend mode：WS execution events + recovery API
  - local mode：临时 `localEngine` 发出的同构 execution events
- `workflow:completed` / `workflow:error` 事件现在会把终态 `ExecutionLog.snapshot` 应回 `currentWorkflow`，因此即使前端错过最后一条中间 `execution:log`，节点高亮和运行态也不会停在旧快照。
- [src/lib/ws-bridge.ts](/Users/Zhuanz/Documents/work_fox/src/lib/ws-bridge.ts) 已修正连接语义：
  - 首次 connect 不再同时触发 `ws:connected` 和 `ws:reconnected`
  - store 可以把“初次加载”和“断线恢复”都挂在这两个事件上，而不至于首次进入页面时重复 recovery / reload
- workflow store 在 backend 模式下已开始在 `ws:connected/ws:reconnected` 后主动刷新 workflow/folder 列表，因此 Phase 10 的“连接成功后加载数据、断线后恢复列表数据”已经有了最小实现。
- 当前还未收掉的 Phase 10 遗留点主要有两类：
  - 部分前端消费方仍隐含“`startExecution()` 返回后马上有最终 `executionLog`”的旧本地执行假设，例如 [src/lib/agent/workflow-renderer-tools.ts](/Users/Zhuanz/Documents/work_fox/src/lib/agent/workflow-renderer-tools.ts)
  - backend 模式虽然已不再依赖 store 级 engine，但整体仍保留 local fallback 分支，尚未彻底变成 backend-only execution path
