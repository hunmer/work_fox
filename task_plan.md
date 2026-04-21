# WorkFox Backend Migration Plan

## Goal

基于 [docs/superpowers/specs/2026-04-21-workfox-backend-migration-design.md](/Users/Zhuanz/Documents/work_fox/docs/superpowers/specs/2026-04-21-workfox-backend-migration-design.md) 输出一份可执行的详细编写计划，将工作流 runtime 与插件系统从 Electron 本地迁移到 Node.js 后端，同时控制前端改动范围、保持现有工作流编辑体验，并为后续分阶段实施提供明确依赖顺序、验收标准和风险控制。

## Scope

- 规划 Node.js Backend 服务形态、目录结构和启动方式
- 规划 WebSocket 协议、Bridge 层、请求响应与流式事件模型
- 规划工作流存储、版本、执行日志、操作历史从 IPC 到 WS 的迁移步骤
- 规划工作流执行引擎从前端迁移到后端的拆分方式
- 规划插件系统 server/client 拆分、插件清单演进、内置插件迁移策略
- 规划前端 store 与执行态 UI 的适配方案
- 规划测试、切换、灰度和回滚方案

## Non-Goals

- 本轮不直接实现后端服务或前端改造
- 不改变 DAG 编辑器交互和 Vue Flow 结构
- 不引入数据库、多用户、鉴权体系
- 不迁移本地 Agent SDK、AI Provider 管理和 Chat 历史

## Current Status

- `Phase 1` 已完成：读取设计文档与仓库现状，建立详细计划
- `Phase 2` 已完成：明确 backend 目录、进程边界、启动链路、配置与构建策略
- `Phase 3` 已完成：建立 shared 类型、WS 协议、执行事件、错误模型和通道契约
- `Phase 4` 已完成：后端服务骨架、health/version、WS router、system channels 已可运行
- `Phase 5` 进行中：前端 WS Bridge、workflow 数据访问适配、plugin store/domain adapter 已落地，执行态 UI 事件订阅尚未接入
- `Phase 6` 进行中：workflow/folder/version/executionLog/operationHistory 与 plugin 元数据/配置查询已迁到 backend，import/export 与 execution channels 尚未迁移
- `Phase 7` 进行中：backend execution runner 已落地，Node 可闭环节点与部分需本地桥接节点已接入；execution snapshot/backlog recovery 已补齐，仍需后续浏览器节点 capability 清单化
- `Phase 8` 已完成：interaction session manager、renderer interaction handler、`agent_run` / `window-manager` / `delay` bridge、reconnect resend、execution recovery 与前端可观测状态已落地
- `Phase 9` 进行中：插件 `entries`、workflow/tools/api loader contract 与 runtime type 已开始成为 shared source-of-truth，Electron `plugin manager` 已拆为 catalog/runtime host/orchestrator，local bridge workflow node capability 已从 renderer/Electron 硬编码中抽离
- `Phase 10` 已完成：`workflow store` 已切到 backend-only execution path，execution recovery/重连刷新生效，已迁移 domain 的旧 IPC 与旧本地执行 fallback 已清理

## Implementation Phases

### Phase 1. 基线梳理与迁移边界确认
Status: `completed`

目标：
- 将设计文档中的迁移范围映射到当前代码位置
- 识别当前前后端耦合点和迁移阻塞项

输出：
- 当前工作流、插件、IPC、执行链路的代码清单
- 详细实施计划与风险清单

完成标准：
- 能明确列出每一类 IPC 通道、实现文件、消费者和迁移优先级
- 能明确指出必须保留在 Electron 本地的能力

### Phase 2. 目标架构与目录布局设计
Status: `completed`

目标：
- 为后端服务建立稳定的工程边界，避免把 Electron Main 逻辑原样搬过去

任务：
1. 确定后端放置位置：优先评估 `backend/` 或 `server/` 目录，独立于 `electron/` 与 `src/`
2. 设计基础目录：
   - `backend/app`：Express/ws 启动与生命周期
   - `backend/ws`：协议、连接、请求路由、事件分发
   - `backend/workflow`：engine、context、dispatcher、resolver
   - `backend/storage`：workflow、folder、version、execution-log、operation-history
   - `backend/plugins`：plugin-manager、registry、sandbox api、tool bridge
   - `backend/shared`：types、errors、logger、utils
3. 规划启动方式：
   - Electron main 负责拉起后端子进程
   - preload/renderer 只感知 WS 地址和连接状态
4. 规划配置来源：
   - 端口、数据根目录、日志级别、开发/生产模式
5. 规划进程责任：
   - Electron main：桌面壳、本地系统能力、Agent SDK、窗口管理
   - Backend：工作流域服务、插件域服务、持久化、执行协调

依赖：
- 需要先完成当前 Electron 侧服务职责清点

完成标准：
- 有明确目录和模块职责，不出现 Electron API 泄漏到 backend
- 启动链路、进程间边界和运行时配置有书面定义

产物：
- [docs/superpowers/plans/2026-04-21-workfox-backend-migration-architecture.md](/Users/Zhuanz/Documents/work_fox/docs/superpowers/plans/2026-04-21-workfox-backend-migration-architecture.md)

### Phase 3. 共享类型与协议层建设
Status: `completed`

目标：
- 在大规模迁移前先稳定通信契约，避免后续反复改 store 和后端 handler

任务：
1. 新建 shared 类型层：
   - `shared/ws-protocol.ts`
   - `shared/workflow-types.ts`
   - `shared/plugin-types.ts`
   - `shared/execution-events.ts`
2. 定义 WS 基础协议：
   - `request`
   - `response`
   - `event`
   - `error`
   - `interaction_required`
   - `interaction_response`
3. 定义执行事件枚举：
   - `workflow:started`
   - `workflow:paused`
   - `workflow:resumed`
   - `workflow:completed`
   - `workflow:error`
   - `node:start`
   - `node:progress`
   - `node:complete`
   - `node:error`
4. 定义错误模型：
   - 协议错误
   - 业务错误
   - 插件错误
   - 交互超时错误
   - 连接状态错误
5. 为每个现有 IPC 通道建立映射表：
   - 通道名
   - 参数结构
   - 返回结构
   - 是否保序
   - 是否需要超时
   - 是否需要幂等

依赖：
- Phase 2 目录布局明确

完成标准：
- 前端和后端都能只依赖 shared 类型编译
- 迁移通道有完整的类型契约和错误语义

产物：
- [shared/ws-protocol.ts](/Users/Zhuanz/Documents/work_fox/shared/ws-protocol.ts)
- [shared/workflow-types.ts](/Users/Zhuanz/Documents/work_fox/shared/workflow-types.ts)
- [shared/plugin-types.ts](/Users/Zhuanz/Documents/work_fox/shared/plugin-types.ts)
- [shared/execution-events.ts](/Users/Zhuanz/Documents/work_fox/shared/execution-events.ts)
- [shared/errors.ts](/Users/Zhuanz/Documents/work_fox/shared/errors.ts)
- [shared/channel-contracts.ts](/Users/Zhuanz/Documents/work_fox/shared/channel-contracts.ts)
- [shared/channel-metadata.ts](/Users/Zhuanz/Documents/work_fox/shared/channel-metadata.ts)

### Phase 4. 后端服务骨架与 WS 路由
Status: `completed`

目标：
- 先打通连接，再逐步迁移业务，而不是边迁移边造底座

任务：
1. 创建 Express + `ws` 服务
2. 实现健康检查和握手：
   - `GET /health`
   - `GET /version`
   - `ws://localhost:<port>`
3. 实现 WS 连接管理：
   - client id
   - request correlation id
   - 心跳 ping/pong
   - 连接断开清理
4. 实现 WS router：
   - 按 `channel` 分发
   - 请求超时
   - 错误封装
5. 实现最小验证通道：
   - `system:ping`
   - `system:echo`

依赖：
- Phase 3 协议定义完成

完成标准：
- Renderer 可通过 WSBridge 建立连接、发请求、收响应、收事件
- 断线和超时有基础可观测输出

产物：
- [backend/main.ts](/Users/Zhuanz/Documents/work_fox/backend/main.ts)
- [backend/app/create-server.ts](/Users/Zhuanz/Documents/work_fox/backend/app/create-server.ts)
- [backend/ws/router.ts](/Users/Zhuanz/Documents/work_fox/backend/ws/router.ts)
- [backend/ws/connection-manager.ts](/Users/Zhuanz/Documents/work_fox/backend/ws/connection-manager.ts)
- [backend/ws/channels.ts](/Users/Zhuanz/Documents/work_fox/backend/ws/channels.ts)
- [electron/services/backend-process.ts](/Users/Zhuanz/Documents/work_fox/electron/services/backend-process.ts)
- [electron/ipc/backend.ts](/Users/Zhuanz/Documents/work_fox/electron/ipc/backend.ts)
- [tsconfig.backend.json](/Users/Zhuanz/Documents/work_fox/tsconfig.backend.json)

### Phase 5. 前端 WS Bridge 与 API 适配层
Status: `in_progress`

目标：
- 把现有 `window.api` 消费面统一收口，为后续 store 迁移降风险

任务：
1. 新建 `src/lib/ws-bridge.ts`
2. 实现能力：
   - `connect`
   - `disconnect`
   - `reconnect`
   - `invoke`
   - `on/off`
   - `onInteraction`
3. 新建前端服务适配层，例如：
   - `src/lib/backend-api/workflow.ts`
   - `src/lib/backend-api/plugin.ts`
4. 定义兼容策略：
   - 保留 `window.api` 仅用于本地能力
   - 后端迁移域统一走 `wsBridge.invoke`
5. 给 store 一个稳定注入点，避免业务层直接操作 WebSocket

依赖：
- Phase 4 服务骨架可连通

完成标准：
- 有可替代 `window.api.workflow*`、`workflowFolder*`、`workflowVersion*` 等的统一客户端层
- store 层不直接处理 WS 协议细节

当前进展：
- 已新增 [src/lib/ws-bridge.ts](/Users/Zhuanz/Documents/work_fox/src/lib/ws-bridge.ts)
- 已新增 workflow/folder/version/log/history 的 backend adapter
- 已将 [src/stores/workflow.ts](/Users/Zhuanz/Documents/work_fox/src/stores/workflow.ts) 切换为通过 adapter 访问数据域
- 已将 [src/stores/plugin.ts](/Users/Zhuanz/Documents/work_fox/src/stores/plugin.ts) 切换为通过 domain adapter 访问迁移后的 plugin/workflow scheme 通道
- 已将 [src/components/chat/ChatPanel.vue](/Users/Zhuanz/Documents/work_fox/src/components/chat/ChatPanel.vue) 改为通过 plugin store 读取 agent tools
- 尚未覆盖 workflow execution 的事件订阅、重连恢复和 interaction handler

### Phase 6. 持久化域迁移
Status: `in_progress`

目标：
- 先迁移低风险 CRUD 和文件存储，为执行引擎迁移扫清依赖

任务：
1. 将以下实现从 `electron/services` 拆到 `backend/storage`：
   - `workflow-store.ts`
   - `workflow-version.ts`
   - `execution-log.ts`
   - `operation-history.ts`
2. 抽象统一文件系统根目录，避免各模块自行拼路径
3. 将现有 IPC handler 映射为 WS handler：
   - `workflow:list/get/create/update/delete`
   - `workflowFolder:list/create/update/delete`
   - `workflowVersion:list/add/get/delete/clear/nextName`
   - `executionLog:list/save/delete/clear`
   - `operationHistory:load/save/clear`
   - `workflow:list-plugin-schemes/read-plugin-scheme/create-plugin-scheme/save-plugin-scheme/delete-plugin-scheme`
4. 处理 import/export 的边界：
   - 与本地文件选择器有关的通道保持 Electron 发起
   - 真正的文件读写交给 backend 执行
5. 为每个存储模块补充数据损坏容错和目录初始化逻辑

依赖：
- Phase 4 和 Phase 5 已打通基础调用

完成标准：
- 前端可以不依赖 Electron IPC 完成工作流列表、读写、版本、日志、操作历史管理
- 数据文件结构向后兼容现有用户目录

当前进展：
- 已迁移 workflow / workflowFolder / workflowVersion / executionLog / operationHistory 到 backend storage
- 已注册对应 WS channels
- 已新增 backend plugin registry 与 `plugin:list/enable/disable/get-workflow-nodes/list-workflow-plugins/get-agent-tools/get-config/save-config` 通道
- 暂未迁移 `workflow:importOpenFile/exportSaveFile`
- 暂未迁移 `workflow:execute/pause/resume/stop`
- 暂未迁移插件 view/icon/import/install/uninstall 等仍依赖 Electron 本地能力的通道

### Phase 7. 工作流引擎解耦与后端迁移
Status: `in_progress`

目标：
- 将 `src/lib/workflow/engine.ts` 从前端依赖中剥离，形成纯服务端执行引擎

任务：
1. 拆分现有引擎的耦合：
   - 去掉 `vue` 的 `toRaw`
   - 去掉 `window.api` 依赖
   - 去掉 `useAIProviderStore` 直接引用
   - 去掉 renderer 侧工具执行耦合
2. 将引擎按职责拆分为：
   - `execution-planner`：拓扑排序、分支可达性
   - `context-resolver`：`__data__` / `__config__` / `context` 解析
   - `node-dispatcher`：按节点类型分派
   - `execution-runner`：pause/resume/stop 生命周期
   - `execution-log-builder`：step/log 结构生成
3. 设计节点执行分类：
   - 纯后端节点：toast/switch/run_code/fetch/file 等
   - 交互型节点：file_select/form/confirm
   - 本地代理节点：`agent_run`
   - 插件节点：server handler
4. 将执行结果通过 WS 事件推送给前端
5. 为引擎增加执行会话标识：
   - execution id
   - current node id
   - pause state
   - pending interaction
6. 规划 debugSingleNode 的后续归属：
   - 独立 debug handler
   - 或复用单节点 execution session

依赖：
- Phase 6 的配置和存储接口完成

完成标准：
- 引擎不再依赖 renderer 运行时
- 工作流执行、暂停、恢复、停止都能由 backend 主导

当前进展：
- [src/lib/workflow/engine.ts](/Users/Zhuanz/Documents/work_fox/src/lib/workflow/engine.ts) 已开始发出统一 execution events：
  - `workflow:started`
  - `workflow:paused`
  - `workflow:resumed`
  - `workflow:completed`
  - `workflow:error`
  - `node:start`
  - `node:complete`
  - `node:error`
  - `execution:log`
  - `execution:context`
- 当前仍未拆除 renderer 依赖：
  - `window.api`
  - `useAIProviderStore`
  - `listenToChatStream`
  - `toRaw`
- backend 已新增 [execution-manager.ts](/Users/Zhuanz/Documents/work_fox/backend/workflow/execution-manager.ts)，并接入：
  - `workflow:execute`
  - `workflow:pause`
  - `workflow:resume`
  - `workflow:stop`
- backend 当前支持执行的节点类型：
  - built-in：`start` / `end` / `run_code` / `toast` / `switch` / `gallery_preview` / `music_player`
  - plugin：可在 Node.js 内闭环的 `workflow.js` handlers，例如 `workfox.file-system`、`workfox.fetch`、`workfox.fish-audio`、`workfox.jimeng`
- backend 当前明确不支持的节点类型：
  - `agent_run`
  - 浏览器工具节点
  - `window-manager` 等依赖 Electron 本地窗口能力的插件节点

### Phase 8. 交互回调与 agent_run 桥接
Status: `completed`

目标：
- 解决最关键的跨端执行问题，即后端引擎如何安全等待 Electron 本地能力返回

任务：
1. 实现 interaction session manager：
   - pending request 缓存
   - timeout/cancel
   - response correlation
2. 明确前端 interaction handler 入口
3. 定义 `agent_run` 数据结构：
   - messages
   - workflow metadata
   - runtime config
   - tool enablement
4. Electron 收到 `interaction_required(type=agent_chat)` 后：
   - 调本地 Claude Agent SDK
   - 将流式结果发给前端展示
   - 完成后回传 `interaction_response`
5. 为文件选择、确认框、自定义表单统一交互协议
6. 处理异常：
   - 用户取消
   - Agent 中断
   - 超时
   - Electron 断连

依赖：
- Phase 7 后端引擎已支持等待交互

完成标准：
- `agent_run` 不在 backend 本地执行，但 backend 能可靠挂起并恢复流程
- 各类交互节点的取消和超时行为一致

当前进展：
- 已新增 backend interaction session manager，支持：
  - pending request 缓存
  - client 定向投递
  - response correlation
  - timeout / disconnect 清理
- backend `workflow:execute` 已绑定发起执行的 WS client，`agent_run` 会通过 `interaction_required(type=agent_chat)` 回到 Electron 本地执行
- `window-manager` 节点已通过 `interaction_required(type=node_execution)` 回到 Electron Main 侧现有 `agent:execTool` 通道执行
- 当前唯一的浏览器 workflow 节点 `delay` 已通过 `interaction_required(type=node_execution)` 回到 Electron 本地执行
- renderer 已新增统一 interaction handler，并复用现有：
  - `window.api.chat.completions`
  - `window.api.agent.execTool`
- WS bridge 已新增稳定 `clientId` 与自动重连；backend 会在短暂断线期间保留 pending interaction，并在同一 client 重连后重发
- workflow store 与 [src/components/workflow/ExecutionBar.vue](/Users/Zhuanz/Documents/work_fox/src/components/workflow/ExecutionBar.vue) 已暴露并显示 backend reconnecting / error 状态
- backend 已新增 `workflow:get-execution-recovery`，可按 stable `clientId + workflowId (+ executionId)` 返回 active session snapshot、recent backlog 以及短 TTL 的 finished recovery
- [src/stores/workflow.ts](/Users/Zhuanz/Documents/work_fox/src/stores/workflow.ts) 会在 `ws:connected/ws:reconnected` 后补拉 execution snapshot，并用 `ExecutionLog.snapshot` 覆盖当前 workflow 图状态
- `WorkflowEngine` 本地执行路径已抽出共享 `agent_run` helper，避免本地执行和 backend interaction bridge 维护两套 Claude Agent 调用逻辑
- 尚未补充：
  - 浏览器工具节点扩容后的统一 registry / capability 声明

### Phase 9. 插件系统拆分与注册表迁移
Status: `in_progress`

目标：
- 把现有 `electron/services/plugin-manager.ts` 的混合职责拆开，支持 server/client/both 三类插件

任务：
1. 扩展 `info.json`：
   - `type: server | client | both`
   - 明确 server entry、client entry、workflow entry、tools entry
2. 重构插件加载器：
   - backend plugin manager 负责 server 部分
   - Electron 或 renderer plugin manager 保留 client/view 部分
3. 迁移注册中心：
   - `workflow-node-registry`
   - agent tools registry
   - plugin config storage
4. 将后端插件上下文抽象为可注入服务：
   - storage
   - events
   - logger
   - fetch
   - sandbox fs
5. 规划兼容期：
   - 旧插件缺少 `type` 时按默认规则降级
   - 内置插件先迁移，第三方插件后适配
6. 迁移节点查询通道：
   - `plugin:get-workflow-nodes`
   - `plugin:list-workflow-plugins`
   - `plugin:get-agent-tools`

依赖：
- Phase 3 共享插件类型
- Phase 6/7 的 backend 执行和存储基础

完成标准：
- 节点定义来源从 renderer 本地注册改为 backend 主导
- 插件 server/client 职责清晰，内置插件可逐个迁移

当前进展：
- 已新增 [shared/plugin-entry.ts](/Users/Zhuanz/Documents/work_fox/shared/plugin-entry.ts)，统一解析 `main/server/client/workflow/tools/api/view` 入口文件，Electron plugin manager 与 backend plugin registry 已共用这套解析逻辑
- 已新增 [shared/workflow-local-bridge.ts](/Users/Zhuanz/Documents/work_fox/shared/workflow-local-bridge.ts)，把本地 bridge workflow 节点定义抽为 shared capability source-of-truth
- [src/lib/workflow/nodeRegistry.ts](/Users/Zhuanz/Documents/work_fox/src/lib/workflow/nodeRegistry.ts)、[backend/workflow/execution-manager.ts](/Users/Zhuanz/Documents/work_fox/backend/workflow/execution-manager.ts)、[electron/services/workflow-browser-node-runtime.ts](/Users/Zhuanz/Documents/work_fox/electron/services/workflow-browser-node-runtime.ts)、[electron/ipc/chat.ts](/Users/Zhuanz/Documents/work_fox/electron/ipc/chat.ts) 已切到消费 shared local bridge capability，避免 `delay` 这类节点继续在 renderer/Electron/backend 三处散落维护
- [electron/services/plugin-manager.ts](/Users/Zhuanz/Documents/work_fox/electron/services/plugin-manager.ts) 已从单文件“大一统实现”改为 orchestration 层，并新增：
  - [plugin-catalog.ts](/Users/Zhuanz/Documents/work_fox/electron/services/plugin-catalog.ts) 负责扫描 manifest、disabled state、view/icon 读取、ZIP 导入、URL 安装、卸载
  - [plugin-runtime-host.ts](/Users/Zhuanz/Documents/work_fox/electron/services/plugin-runtime-host.ts) 负责 plugin module 激活/停用、workflow/api/tools 注册
- 已新增 [shared/plugin-capability-loader.ts](/Users/Zhuanz/Documents/work_fox/shared/plugin-capability-loader.ts)，统一：
  - `workflow.js` 加载
  - `tools.js` 加载
  - `api.js` 加载
  - `type -> requires main-process bridge` 判定
- [backend/plugins/plugin-registry.ts](/Users/Zhuanz/Documents/work_fox/backend/plugins/plugin-registry.ts) 与 [electron/services/plugin-runtime-host.ts](/Users/Zhuanz/Documents/work_fox/electron/services/plugin-runtime-host.ts) 已共用这套 loader contract
- [electron/ipc/plugin.ts](/Users/Zhuanz/Documents/work_fox/electron/ipc/plugin.ts) 与 [electron/services/workflow-store.ts](/Users/Zhuanz/Documents/work_fox/electron/services/workflow-store.ts) 已开始优先读取 manifest defaults，而不是强依赖已激活 runtime instance
- 内置插件 `info.json` 已开始显式声明 `type` 与 `entries`：
  - `workfox.fetch` / `workfox.file-system` / `workfox.fish-audio` / `workfox.jimeng` 标记为 `server`
  - `workfox.window-manager` 标记为 `both`
- backend plugin registry 已移除 `window-manager` 的 plugin-id 兼容 fallback，当前仅按 shared loader 中的 runtime type 判定是否需要 main-process bridge
- Electron local mode 与 backend mode 的 `PluginMeta`/`PluginInfo` 口径已进一步对齐到 `type/hasWorkflow/entries`

### Phase 10. 前端 Store 与执行 UI 改造
Status: `completed`

目标：
- 在不重写业务逻辑的前提下，把 store 从“本地执行驱动”切到“后端事件驱动”

任务：
1. 重构 `src/stores/workflow.ts`：
   - CRUD 走后端 API adapter
   - execution actions 改为发 `workflow:execute/pause/resume/stop`
   - `WorkflowEngine` 实例从 store 中移除
2. 将 `executionLog` 和 `executionContext` 改为订阅 WS 事件更新
3. 评估以下组件改造点：
   - `ExecutionBar.vue`
   - `CustomNodeWrapper.vue`
   - `OperationHistory.vue`
   - `VersionControl.vue`
   - `PluginPickerDialog.vue`
4. 定义 store 初始化时机：
   - WS 连接成功后加载数据
   - 断线后恢复执行态和列表数据
5. 保持编辑域逻辑本地：
   - 拖拽
   - 连线
   - 节点属性编辑
   - undo/redo 交互体验

依赖：
- Phase 5、6、7、8、9

完成标准：
- 用户仍在原有编辑器里工作，但执行态来自 backend
- UI 不再依赖前端本地引擎实例

当前进展：
- [src/stores/workflow.ts](/Users/Zhuanz/Documents/work_fox/src/stores/workflow.ts) 的 execution state 已开始统一从 execution events 更新
- 已预埋 backend execution event 订阅入口，后续 backend `workflow:execute/pause/resume/stop` 落地后可复用同一状态机
- backend `workflow:execute/pause/resume/stop` 已落地，workflow store 执行链路现只走 backend
- workflow store 已不再持有 store 级 `WorkflowEngine` 实例，执行控制侧的本地 fallback 已删除；仅单节点调试仍保留独立本地 `WorkflowEngine`
- 已迁移 domain 对应的 preload/Electron 旧 IPC 已删除，仅保留 import/export 与本地桌面能力相关 IPC
- 已在 `ws:connected/ws:reconnected` 后主动刷新列表数据并触发 execution recovery
- 已修正首次 connect 重复触发 `ws:reconnected` 的问题，避免初次进入页面时重复 recovery / reload
- [src/lib/agent/workflow-renderer-tools.ts](/Users/Zhuanz/Documents/work_fox/src/lib/agent/workflow-renderer-tools.ts) 已切到真实 `executionId` + 终态等待 / 异步轮询，不再假设 `startExecution()` 立即返回最终 log
- `WorkflowEngine.currentLog` 与执行历史保留真实 `executionId`，同步/异步工具查询与 backend recovery/persisted logs 已能对齐

### Phase 11. 内置插件迁移与兼容验证
Status: `in_progress`

目标：
- 逐个迁移内置插件，避免一次性切换导致整个执行链不可用

任务：
1. 建立插件迁移清单：
   - `window-manager`
   - `file-system`
   - `fetch`
   - `jimeng`
2. 为每个插件定义：
   - 是否需要 server 部分
   - 是否保留 client view
   - 是否依赖 Electron 原生能力
   - 是否需要通过 interaction 回到本地
3. 先迁移纯服务型插件，再迁移依赖桌面能力的插件
4. 为插件配置方案、默认值、schema 做兼容校验

依赖：
- Phase 9 插件框架完成

完成标准：
- 至少内置关键插件能在新架构下稳定执行
- 插件配置和节点定义对现有工作流保持兼容

当前进展：
- 内置插件 `workfox.fetch` / `workfox.file-system` / `workfox.fish-audio` / `workfox.jimeng` 已声明为 `server`
- `workfox.window-manager` 已声明为 `both`，并通过 interaction bridge 回到 Electron 本地执行
- plugin entry / capability loader / runtime type 已统一到 shared source-of-truth，backend build 与全量 app build 当前均通过
- 尚未补一轮面向内置插件矩阵的显式回归用例，因此该阶段先保留 `in_progress`

### Phase 12. 测试、切换与收尾
Status: `in_progress`

目标：
- 降低切换风险，确保迁移可回退、可验证、可观测

任务：
1. 测试分层：
   - shared 类型与协议单测
   - storage 模块单测
   - workflow engine 单测
   - plugin loader 单测
   - WS bridge 集成测试
   - 端到端工作流回归测试
2. 建立金丝雀开关：
   - `USE_WORKFLOW_BACKEND=true/false`
   - 允许 IPC/WS 双栈短期共存
3. 定义回归用例：
   - CRUD
   - 版本恢复
   - 执行日志持久化
   - 断线重连
   - 交互节点超时/取消
   - agent_run 成功/失败
   - 插件节点执行
4. 清理死代码：
   - renderer 本地引擎旧逻辑
   - 已迁移 IPC handlers
   - 失效 registry/manager
5. 更新文档：
   - `CLAUDE.md`
   - 开发启动说明
   - 插件开发文档

依赖：
- 前述阶段全部完成

完成标准：
- 新架构默认启用且通过回归
- 保留明确回退手段

当前进展：
- `pnpm exec tsc -p tsconfig.web.json --noEmit` 已通过
- `pnpm build:backend` 已通过
- `pnpm build` 已通过，修复了 renderer 对 `@shared/*` alias 的打包解析问题
- 已新增 [scripts/backend-smoke-test.mjs](/Users/Zhuanz/Documents/work_fox/scripts/backend-smoke-test.mjs)，并通过 `pnpm smoke:backend` 验证 backend HTTP/WS、workflow CRUD、plugin schemes、execution pause/resume/recovery、executionLog 持久化与内置 server plugins
- 已新增 [docs/superpowers/plans/2026-04-22-workfox-backend-migration-verification.md](/Users/Zhuanz/Documents/work_fox/docs/superpowers/plans/2026-04-22-workfox-backend-migration-verification.md)，收敛 Phase 11/12 的验证命令、覆盖范围和仍需人工检查的 Electron-local 场景
- 仍未补充更细粒度单测，以及 `agent_run` / `window-manager` 的自动化端到端验证，因此当前保持 `in_progress`

## Milestones

1. M1: WS 基础设施与前端 Bridge 连通
2. M2: CRUD/版本/日志/历史迁移完成
3. M3: 后端工作流引擎可执行标准工作流
4. M4: `agent_run` 交互桥接完成
5. M5: 插件系统 server/client 拆分完成
6. M6: 前端默认使用 backend 执行链路

## Key Decisions

- 优先迁移持久化与协议层，再迁移执行引擎，避免一次性切换太多变量
- `window.api` 保留给桌面本地能力，不再作为后端业务 API 入口
- 工作流执行需要引入 execution session 概念，否则无法支撑重连恢复和交互挂起
- `agent_run` 不能简单搬到后端，必须通过 interaction 协议桥接回 Electron 本地
- 插件系统必须先做 server/client 拆分，否则“迁移插件系统”只会变成把 Electron 代码复制到 backend

## Risks And Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| 现有 `WorkflowEngine` 直接依赖 `window.api`、Vue、AI store | 无法直接搬迁 | 先做职责拆分，再迁移 |
| `src/stores/workflow.ts` 集成了 CRUD、执行、日志、版本、撤销重做 | 改动面大，回归风险高 | 先引入 API adapter，再逐块替换 |
| 插件管理器同时负责 view、workflow、tools、config、生命周期 | 容易把桌面依赖带到 backend | 明确 server/client manager 分层 |
| `agent_run` 需要本地 Agent SDK | 后端执行链会被卡住 | 使用 interaction session manager 挂起恢复 |
| 断线重连后执行上下文丢失 | 用户无法继续交互流程 | backend 保存 execution session，前端重连后重新订阅 |
| 旧插件未声明 `type` | 新加载器兼容失败 | 设计默认兼容规则并优先迁移内置插件 |

## Acceptance Criteria

- 详细计划覆盖架构、协议、数据迁移、引擎迁移、插件迁移、前端适配、测试和回滚
- 每个阶段都有明确目标、依赖和完成标准
- 计划已结合当前仓库实际文件与耦合点，而不是脱离代码的抽象方案

## Errors Encountered

| Error | Attempt | Resolution |
|-------|---------|------------|
| 无 | 0 | 本轮仅做文档规划，未遇到执行错误 |
