# Progress

## 2026-04-21

### Session 1

- 读取 `docs/superpowers/specs/2026-04-21-workfox-backend-migration-design.md`
- 检查项目根目录，确认尚不存在 `task_plan.md`、`findings.md`、`progress.md`
- 核对当前实现位置：
  - `src/lib/workflow/engine.ts`
  - `src/stores/workflow.ts`
  - `preload/index.ts`
  - `electron/services/workflow-store.ts`
  - `electron/services/plugin-manager.ts`
- 识别关键现状：
  - 工作流引擎仍在 renderer
  - store 把数据、执行、日志、版本、撤销重做耦合在一起
  - workflow 相关能力主要通过 preload IPC 暴露
  - 插件管理器职责混合，尚未做 server/client 拆分
- 产出：
  - 新建 `task_plan.md`
  - 新建 `findings.md`
  - 新建 `progress.md`
  - 将高层设计文档扩展为面向仓库实施的详细迁移计划

### Next Recommended Step

- 根据 `task_plan.md` 的 `Phase 2` 开始产出实际架构稿，明确 backend 目录、启动链路、shared 类型层和 WS bridge 的初版文件结构

### Session 2

- 恢复 `task_plan.md`、`findings.md`、`progress.md` 上下文
- 核对 `package.json`，确认当前只有 `electron-vite` 构建脚本，没有 backend 构建脚本
- 核对 `electron.vite.config.ts` 和 tsconfig，确认当前构建入口为 Electron main、preload、renderer
- 核对 `electron/main.ts`，确认启动流程为注册 IPC、注册内置节点、加载插件、创建窗口
- 新增 Phase 2 架构产物：
  - `docs/superpowers/plans/2026-04-21-workfox-backend-migration-architecture.md`
- 更新 `task_plan.md`：
  - Phase 2 标记为 completed
  - Current Status 指向 Phase 3
- 更新 `findings.md`，记录 backend 子进程、目录边界、构建目标和 Electron API 禁止引入等结论

### Next Recommended Step

- 进入 `Phase 3`：创建 shared 类型与 WS 协议契约，优先定义 `ws-protocol`、`execution-events`、错误模型和 IPC→WS channel contract。

### Session 3

- 读取现有类型来源：
  - `src/lib/workflow/types.ts`
  - `electron/services/store.ts`
  - `electron/services/plugin-types.ts`
- 新增共享协议和类型文件：
  - `shared/errors.ts`
  - `shared/workflow-types.ts`
  - `shared/plugin-types.ts`
  - `shared/execution-events.ts`
  - `shared/ws-protocol.ts`
  - `shared/channel-contracts.ts`
  - `shared/channel-metadata.ts`
  - `shared/index.ts`
- 更新 TypeScript 配置：
  - `tsconfig.json`
  - `tsconfig.node.json`
  - `tsconfig.web.json`
- 验证：
  - `shared/` 独立 TypeScript 检查通过
  - `pnpm build` 失败于既有 renderer 依赖 `@tiptap/vue-3` 解析
  - 全量 `tsc` 暴露既有类型问题，已记录在 `findings.md`
- 更新 `task_plan.md`：
  - Phase 3 标记为 completed
  - Current Status 指向 Phase 4

### Next Recommended Step

- 进入 `Phase 4`：创建 `backend/` 服务骨架，先实现配置、logger、HTTP health/version、WS router、`system:ping` 和 `system:echo`，并新增 backend 专用 tsconfig/build 脚本。

### Session 4

- 安装 backend 运行依赖：
  - `express`
  - `ws`
- 新增 backend 骨架：
  - `backend/app/config.ts`
  - `backend/app/logger.ts`
  - `backend/app/create-server.ts`
  - `backend/ws/router.ts`
  - `backend/ws/connection-manager.ts`
  - `backend/ws/channels.ts`
  - `backend/main.ts`
  - `tsconfig.backend.json`
- 新增 Electron Main backend 管理：
  - `electron/services/backend-process.ts`
  - `electron/ipc/backend.ts`
  - `preload/index.ts` 增加 `backend.getEndpoint/getStatus`
- 更新构建链：
  - `package.json` 新增 `build:backend`
  - `build` / `pack:dir` / `scripts/build-production.js` 先执行 backend 编译
- 验证：
  - `pnpm build:backend` 通过
  - backend 手动启动后 `/health` 返回正常
  - WS `system:ping` 返回正常

### Session 5

- 新增 backend storage：
  - `backend/storage/paths.ts`
  - `backend/storage/json-store.ts`
  - `backend/storage/workflow-store.ts`
  - `backend/storage/workflow-version-store.ts`
  - `backend/storage/execution-log-store.ts`
  - `backend/storage/operation-history-store.ts`
- 新增 `backend/ws/storage-channels.ts` 并注册 workflow/folder/version/log/history 通道
- 新增前端 backend adapter：
  - `src/lib/ws-bridge.ts`
  - `src/lib/backend-api/workflow.ts`
  - `src/lib/backend-api/workflow-folder.ts`
  - `src/lib/backend-api/workflow-version.ts`
  - `src/lib/backend-api/execution-log.ts`
  - `src/lib/backend-api/operation-history.ts`
  - `src/lib/backend-api/workflow-domain.ts`
- 修改 [src/stores/workflow.ts](/Users/Zhuanz/Documents/work_fox/src/stores/workflow.ts)，让 workflow 数据域走 adapter
- 验证：
  - `pnpm build` 已通过
  - backend smoke test 验证 `system:ping` 和 `workflow:list`

### Next Recommended Step

- 继续 `Phase 5/6`：
  - 为 plugin store 增加 backend adapter
  - 接入 `workflow:execute/pause/resume/stop`
  - 增加 execution 事件订阅和前端执行态 UI 适配

### Session 6

- 恢复 `task_plan.md`、`findings.md`、`progress.md`，核对当前 Phase 4/5/6 状态与未完成项。
- 检查现状后确认：
  - plugin store 仍直接依赖 `window.api.plugin.*`
  - `ChatPanel.vue` 仍直接读取 `window.api.plugin.getAgentTools`
  - `workflow:execute/pause/resume/stop` 尚无 backend handler
  - renderer `WorkflowEngine` 仍强耦合 `window.api`、`vue`、AI provider store
- 新增 backend 插件域最小实现：
  - `backend/plugins/plugin-registry.ts`
  - `backend/ws/plugin-channels.ts`
- backend 现支持以下 plugin WS 通道：
  - `plugin:list`
  - `plugin:enable`
  - `plugin:disable`
  - `plugin:get-workflow-nodes`
  - `plugin:list-workflow-plugins`
  - `plugin:get-agent-tools`
  - `plugin:get-config`
  - `plugin:save-config`
- 新增前端 domain/runtime 文件：
  - `src/lib/backend-api/runtime.ts`
  - `src/lib/backend-api/plugin-domain.ts`
- 修改前端接入：
  - [src/stores/plugin.ts](/Users/Zhuanz/Documents/work_fox/src/stores/plugin.ts) 切到统一 plugin/workflow domain adapter
  - [src/components/chat/ChatPanel.vue](/Users/Zhuanz/Documents/work_fox/src/components/chat/ChatPanel.vue) 改为通过 plugin store 拉取 agent tools
- 验证：
  - `pnpm build:backend` 通过
  - backend smoke test 验证 `plugin:list-workflow-plugins`
  - backend smoke test 验证 `plugin:get-config`
  - `pnpm exec tsc -p tsconfig.web.json --noEmit` 仍失败于仓库既有类型问题，未新增本轮 plugin 迁移相关错误

### Next Recommended Step

- 进入 `Phase 7/10` 的衔接工作：
  - 先拆 `src/lib/workflow/engine.ts` 的 renderer 依赖
  - 再落地 `workflow:execute/pause/resume/stop`
  - 最后把 `src/stores/workflow.ts` 改成 execution event-driven

### Session 7

- 继续推进 execution 链路，优先做“事件驱动状态机收口”，避免 backend 执行通道落地前后各维护一套 UI 状态逻辑。
- 修改 [src/lib/workflow/engine.ts](/Users/Zhuanz/Documents/work_fox/src/lib/workflow/engine.ts)：
  - `EngineStatus` 扩展为包含 `completed`
  - 增加统一 execution event 回调
  - 本地执行时发出 `workflow:*`、`node:*`、`execution:log`、`execution:context`
- 修改 [src/stores/workflow.ts](/Users/Zhuanz/Documents/work_fox/src/stores/workflow.ts)：
  - 增加 `handleExecutionEvent(...)`
  - execution state 改为通过 execution events 更新
  - 预埋 backend WS event 订阅入口
  - 为未来 backend 通道预留 `pause/resume/stop` adapter 分支
- 修改 [src/lib/backend-api/workflow.ts](/Users/Zhuanz/Documents/work_fox/src/lib/backend-api/workflow.ts)：
  - 增加 `pause/resume/stop`
- 修改 [src/lib/ws-bridge.ts](/Users/Zhuanz/Documents/work_fox/src/lib/ws-bridge.ts)：
  - 放宽 pending request resolve 类型，消除本轮新增的泛型赋值错误
- 验证：
  - `pnpm build:backend` 通过
  - `pnpm exec tsc -p tsconfig.web.json --noEmit` 仍失败，但本轮新增的 execution event/store 类型错误已清掉
  - 剩余失败项仍主要是仓库既有类型问题，以及 `engine.ts` 里原有 `permissionMode` 类型不匹配

### Next Recommended Step

- 继续 Phase 7：
  - 抽离 `WorkflowEngine` 的 context resolver / execution runner
  - 去除 `window.api` 与 `useAIProviderStore` 的硬依赖
  - 再在 backend 落地真正的 `workflow:execute/pause/resume/stop`

### Session 8

- 开始真正落地 backend execution，而不是继续停留在前端过渡层。
- 新增 backend 插件执行基础设施：
  - `backend/plugins/builtin-fetch-api.ts`
  - `backend/plugins/builtin-fs-api.ts`
- 扩展 [plugin-registry.ts](/Users/Zhuanz/Documents/work_fox/backend/plugins/plugin-registry.ts)：
  - 读取并保留 `workflow.js` handler
  - 暴露 `canExecuteNode(...)`
  - 暴露 `executeWorkflowNode(...)`
  - 为 backend execution 注入 Node 侧 `fetch/fs` API
- 新增 backend execution 核心：
  - `backend/workflow/execution-manager.ts`
  - `backend/ws/execution-channels.ts`
- 修改 [main.ts](/Users/Zhuanz/Documents/work_fox/backend/main.ts)：
  - 注册 `workflow:execute/pause/resume/stop`
  - 将 execution events 通过 WS 连接广播给前端
- backend execution 首版支持：
  - built-in `start/end/run_code/toast/switch/gallery_preview/music_player`
  - Node 可闭环插件节点，如 `write_file/read_file`
- backend execution 首版仍不支持：
  - `agent_run`
  - 浏览器工具节点
  - Electron 本地窗口类插件节点
- 验证：
  - `pnpm build:backend` 通过
  - smoke test 跑通 `workflow:create -> workflow:execute -> workflow:completed`
  - smoke test 跑通 plugin `write_file/read_file`
  - smoke test 跑通 `pause/resume`
  - 修复 pause/resume 在 `_delay` 期间会跳过节点的问题

### Next Recommended Step

- 继续 Phase 7/8/9：
  - 为 `agent_run` 增加 interaction bridge
  - 为 Electron 本地窗口/浏览器能力增加 interaction 或 main-process bridge
  - 逐步把 plugin server/client 边界做清晰拆分

### Session 9

- 进入 `Phase 8`，开始把 backend execution 和 Electron 本地能力真正桥起来，而不是继续报“不支持”。
- 新增 backend interaction 基础设施：
  - `backend/workflow/interaction-manager.ts`
  - `backend/ws/connection-manager.ts` 支持定向投递和 `interaction_response`
- 修改 [backend/workflow/execution-manager.ts](/Users/Zhuanz/Documents/work_fox/backend/workflow/execution-manager.ts)：
  - `workflow:execute` 绑定发起执行的 `clientId`
  - `agent_run` 改为通过 `interaction_required(type=agent_chat)` 回到 Electron 本地执行
  - `window-manager` 节点改为通过 `interaction_required(type=node_execution)` 回到 Electron/Main 现有 `agent:execTool` 通道执行
- 修改协议与前端 bridge：
  - [shared/ws-protocol.ts](/Users/Zhuanz/Documents/work_fox/shared/ws-protocol.ts) 新增 `node_execution` interaction type 和 interaction error 字段
  - [src/lib/ws-bridge.ts](/Users/Zhuanz/Documents/work_fox/src/lib/ws-bridge.ts) 增加 interaction handler 缺失/异常时的错误响应
  - 新增 [src/lib/backend-api/interaction.ts](/Users/Zhuanz/Documents/work_fox/src/lib/backend-api/interaction.ts) 注册统一 renderer interaction handler
- 为避免重复维护 Claude Agent 调用逻辑：
  - 新增 [src/lib/workflow/agent-run.ts](/Users/Zhuanz/Documents/work_fox/src/lib/workflow/agent-run.ts)
  - [src/lib/workflow/engine.ts](/Users/Zhuanz/Documents/work_fox/src/lib/workflow/engine.ts) 本地 `agent_run` 路径改为复用共享 helper
- 修改 [src/stores/workflow.ts](/Users/Zhuanz/Documents/work_fox/src/stores/workflow.ts)，在 backend flag 打开时初始化 workflow interaction handler。
- 验证：
  - `pnpm build:backend` 通过
  - `pnpm exec tsc -p tsconfig.web.json --noEmit` 仍失败，但仅剩仓库既有错误；本轮新增的 interaction bridge / agent-run helper 类型错误已清掉

### Next Recommended Step

- 继续 `Phase 8/9`：
  - 把浏览器工具节点也纳入 backend registry 的 `node_execution` bridge
  - 补 interaction reconnect / orphaned request 恢复策略
  - 再评估是否要把更多 Electron-only 插件节点统一标记为 `requiresMainProcessBridge`

### Session 10

- 继续收口“浏览器工具节点”这条本地执行链，避免 Phase 8 只覆盖 `agent_run` / `window-manager`。
- 核对后确认：
  - 当前 workflow 侧浏览器节点实际只有 `delay`
  - 它来自 renderer [src/lib/workflow/nodeRegistry.ts](/Users/Zhuanz/Documents/work_fox/src/lib/workflow/nodeRegistry.ts)，不是 `resources/plugins/*/workflow.js`
  - Electron `agent:execTool` 之前并不能执行它
- 新增 [electron/services/workflow-browser-node-runtime.ts](/Users/Zhuanz/Documents/work_fox/electron/services/workflow-browser-node-runtime.ts)，先为 workflow 节点场景补最小本地执行能力：
  - `delay`
- 修改 [electron/ipc/chat.ts](/Users/Zhuanz/Documents/work_fox/electron/ipc/chat.ts)：
  - 当 `workflowNodeRegistry` 中找不到 handler 时，回退到 `workflow-browser-node-runtime`
- 修改 [backend/workflow/execution-manager.ts](/Users/Zhuanz/Documents/work_fox/backend/workflow/execution-manager.ts)：
  - `delay` 节点改为走 `executeMainProcessNode(...)`
  - backend 执行 `delay` 时也通过 `interaction_required(type=node_execution)` 回到 Electron 本地
- 验证：
  - `pnpm build:backend` 通过
  - `pnpm exec tsc -p tsconfig.node.json --noEmit` 仍失败，但失败项回到仓库既有 `tsconfig.node` include / Claude SDK hook typing / plugin-fs 类型问题；本轮新增的 `chat.ts` 和浏览器节点 bridge 错误已清掉

### Next Recommended Step

- 继续 `Phase 8/9`：
  - 设计 interaction reconnect / orphaned request 恢复策略
  - 为未来新增浏览器 workflow 节点准备统一 capability 清单，避免 renderer node registry 和 Electron runtime 再次分叉

### Session 11

- 继续推进 Phase 8 的“不要一断就失败”，补 interaction reconnect / resend 首版恢复机制。
- 修改 [src/lib/ws-bridge.ts](/Users/Zhuanz/Documents/work_fox/src/lib/ws-bridge.ts)：
  - 增加稳定 `clientId` 持久化
  - 连接时把 `clientId` 带给 backend
  - WS close 后自动按退避策略重连
- 修改 [backend/ws/connection-manager.ts](/Users/Zhuanz/Documents/work_fox/backend/ws/connection-manager.ts)：
  - 接受稳定 `clientId`
  - 允许同一 `clientId` 重新附着
  - 新增 `onClientConnected(...)`
- 修改 [backend/workflow/interaction-manager.ts](/Users/Zhuanz/Documents/work_fox/backend/workflow/interaction-manager.ts)：
  - pending interaction 保存完整 payload
  - client disconnect 后进入 grace period，而不是立即 reject
  - 同一 `clientId` 重连时自动重发未完成 interaction request
- 验证：
  - `pnpm build:backend` 通过
  - `pnpm exec tsc -p tsconfig.web.json --noEmit` 仍失败，但没有新增 reconnect / interaction 相关错误

### Next Recommended Step

- 继续 `Phase 8/10`：
  - 把 `ws reconnecting / reconnected / interaction resent` 暴露给前端执行态 UI
  - 再决定是否要把 execution event backlog / snapshot recovery 也补上

### Session 12

- 收口 Phase 8 的前端可观测性，优先补 execution 期间的 backend 连接状态提示。
- 修改 [src/lib/ws-bridge.ts](/Users/Zhuanz/Documents/work_fox/src/lib/ws-bridge.ts)：
  - 新增 `ws:connected`
  - 新增 `ws:reconnected`
  - 新增 `ws:reconnecting`
- 修改 [src/stores/workflow.ts](/Users/Zhuanz/Documents/work_fox/src/stores/workflow.ts)：
  - 新增 `backendConnectionState`
  - 新增 `backendReconnectAttempt`
  - 新增 `backendLastError`
  - 在 backend 模式下订阅 WS 连接事件
- 修改 [src/components/workflow/ExecutionBar.vue](/Users/Zhuanz/Documents/work_fox/src/components/workflow/ExecutionBar.vue)：
  - 在执行栏显示后端重连中 / 连接异常提示
- 验证：
  - `pnpm build:backend` 通过
  - `pnpm exec tsc -p tsconfig.web.json --noEmit` 仍失败，但失败项仍为仓库既有问题：
    - `src/composables/useNotification.ts`
    - `src/composables/workflow/useExecutionPanel.ts`
    - `src/lib/agent/workflow-renderer-tools.ts`
    - `src/lib/lucide-resolver.ts`
    - `src/types/index.ts`
  - 本轮未新增 execution / reconnect / execution bar 相关类型错误

### Next Recommended Step

- 如果继续快速推进，优先补 `execution event backlog / snapshot recovery`，否则短暂断线后前端仍可能缺少部分中间事件。

### Session 13

- 继续按既定主线推进，直接补 `execution snapshot/backlog recovery`，未扩展到其他迁移细节。
- 修改 shared 协议：
  - [shared/execution-events.ts](/Users/Zhuanz/Documents/work_fox/shared/execution-events.ts) 新增 `ExecutionRecoveryRequest/Response`、`ExecutionRecoveryState`、`ExecutionBacklogEvent`
  - [shared/channel-contracts.ts](/Users/Zhuanz/Documents/work_fox/shared/channel-contracts.ts) 新增 `workflow:get-execution-recovery`
  - [shared/channel-metadata.ts](/Users/Zhuanz/Documents/work_fox/shared/channel-metadata.ts) 为 recovery 通道登记 execution 级 metadata
- 修改 backend execution：
  - [backend/workflow/execution-manager.ts](/Users/Zhuanz/Documents/work_fox/backend/workflow/execution-manager.ts) 为 active session 维护 `lastUpdatedAt`、bounded recent backlog、finished recovery TTL cache
  - backend 在 execution 完成/失败后保留短时 recovery，避免前端错过最终事件后一直停在 running/paused
  - [backend/ws/execution-channels.ts](/Users/Zhuanz/Documents/work_fox/backend/ws/execution-channels.ts) 注册 `workflow:get-execution-recovery`
- 修改前端接入：
  - [src/lib/backend-api/workflow.ts](/Users/Zhuanz/Documents/work_fox/src/lib/backend-api/workflow.ts) 增加 `getExecutionRecovery(...)`
  - [src/stores/workflow.ts](/Users/Zhuanz/Documents/work_fox/src/stores/workflow.ts) 在 `ws:connected/ws:reconnected` 后主动补拉 recovery，并用 `ExecutionLog.snapshot` 覆盖当前 workflow 图状态
  - 若 recovery 命中最终态，前端会刷新 execution logs，避免漏掉完成/失败后的历史记录
- 验证：
  - `pnpm build:backend` 通过
  - `pnpm exec tsc -p tsconfig.web.json --noEmit` 仍失败，但仅为仓库既有错误：
    - `src/composables/useNotification.ts`
    - `src/composables/workflow/useExecutionPanel.ts`
    - `src/lib/agent/workflow-renderer-tools.ts`
    - `src/lib/lucide-resolver.ts`
    - `src/types/index.ts`
  - 本轮未新增 execution recovery 相关类型错误

### Next Recommended Step

- 若继续推进，优先把 recovery 从“latest snapshot 覆盖”增强为“按 cursor 增量补齐 backlog”，否则当前虽然不会丢最终状态，但中间 `node:progress` 仍以 snapshot 为准而非逐条重放。

### Session 14

- 切入 `Phase 9`，优先处理长期边界问题，而不是继续在 execution 细节上打转。
- 新增 shared source-of-truth：
  - [shared/plugin-entry.ts](/Users/Zhuanz/Documents/work_fox/shared/plugin-entry.ts) 统一解析插件 `entries`
  - [shared/workflow-local-bridge.ts](/Users/Zhuanz/Documents/work_fox/shared/workflow-local-bridge.ts) 统一声明本地 bridge workflow 节点 capability
- 修改插件加载与注册：
  - [electron/services/plugin-manager.ts](/Users/Zhuanz/Documents/work_fox/electron/services/plugin-manager.ts) 改为按 `entries.main/workflow/tools/api/view` 解析入口
  - [backend/plugins/plugin-registry.ts](/Users/Zhuanz/Documents/work_fox/backend/plugins/plugin-registry.ts) 改为按 `entries.workflow/tools` 解析入口
  - [electron/services/plugin-types.ts](/Users/Zhuanz/Documents/work_fox/electron/services/plugin-types.ts) 与 [shared/plugin-types.ts](/Users/Zhuanz/Documents/work_fox/shared/plugin-types.ts) 补充 `type` / `entries` 字段
- 修改本地 bridge workflow 节点消费方：
  - [src/lib/workflow/nodeRegistry.ts](/Users/Zhuanz/Documents/work_fox/src/lib/workflow/nodeRegistry.ts) 不再直接从 `BROWSER_TOOL_LIST` 生成 workflow 节点定义
  - [backend/workflow/execution-manager.ts](/Users/Zhuanz/Documents/work_fox/backend/workflow/execution-manager.ts) 改为按 shared local capability 判定是否走 main-process bridge
  - [electron/services/workflow-browser-node-runtime.ts](/Users/Zhuanz/Documents/work_fox/electron/services/workflow-browser-node-runtime.ts) 与 [electron/ipc/chat.ts](/Users/Zhuanz/Documents/work_fox/electron/ipc/chat.ts) 改为只接受 shared capability 中声明的本地 bridge 节点
- 修改内置插件 metadata：
  - `resources/plugins/*/info.json` 开始显式声明 `type` 与 `entries`
  - `window-manager` 标记为 `both`
  - `fetch` / `file-system` / `fish-audio` / `jimeng` 标记为 `server`
- 验证：
  - `pnpm build:backend` 通过
  - `pnpm exec tsc -p tsconfig.web.json --noEmit` 仍失败，但仅为仓库既有错误
  - `pnpm exec tsc -p tsconfig.node.json --noEmit` 仍失败，但失败项仍为仓库既有 include / hook typing / plugin-fs 类型问题
  - 本轮未新增 plugin entry / local bridge capability 相关错误

### Next Recommended Step

- 若继续快速推进，优先把 `plugin manager` 真正拆成 backend/client 两套职责，并把 backend registry 上对 `window-manager` 的兼容 fallback 移除，改成完全依赖 metadata/runtime type 驱动。

### Session 15

- 继续 Phase 9，不停留在 metadata 层，直接把 Electron `plugin manager` 做成分层结构。
- 新增 Electron 插件分层：
  - [electron/services/plugin-catalog.ts](/Users/Zhuanz/Documents/work_fox/electron/services/plugin-catalog.ts) 负责 manifest 扫描、disabled state、view/icon 读取、ZIP 导入、URL 安装、卸载
  - [electron/services/plugin-runtime-host.ts](/Users/Zhuanz/Documents/work_fox/electron/services/plugin-runtime-host.ts) 负责 module 激活/停用、workflow/api/tools 注册
  - [electron/services/plugin-manager.ts](/Users/Zhuanz/Documents/work_fox/electron/services/plugin-manager.ts) 改为 orchestration 层，协调 catalog 与 runtime host
- 修改上层消费：
  - [electron/ipc/plugin.ts](/Users/Zhuanz/Documents/work_fox/electron/ipc/plugin.ts) 在 `plugin:get-config` 中优先读取 manifest config defaults，不再假设 runtime instance 必定存在
  - [electron/services/workflow-store.ts](/Users/Zhuanz/Documents/work_fox/electron/services/workflow-store.ts) 创建 plugin scheme 默认值时，改为优先读取 manifest
  - [src/types/plugin.ts](/Users/Zhuanz/Documents/work_fox/src/types/plugin.ts) 与 [electron/services/plugin-types.ts](/Users/Zhuanz/Documents/work_fox/electron/services/plugin-types.ts) 补齐 `type/hasWorkflow/entries` 相关字段，继续缩小 local/backend metadata 漂移
- 验证：
  - `pnpm build:backend` 通过
  - `pnpm exec tsc -p tsconfig.node.json --noEmit` 仍失败，但本轮新增的 `plugin:get-config` 空值收窄错误已修掉；剩余失败项仍为仓库既有 include / hook typing / plugin-fs 类型问题
  - `pnpm exec tsc -p tsconfig.web.json --noEmit` 仍失败，但失败项仍为仓库既有错误
  - 本轮未新增 plugin catalog / runtime host / manager 分层相关错误

### Next Recommended Step

- 若继续推进，优先统一 backend plugin registry 和 Electron runtime host 的 workflow/tools loader contract，并移除 backend 对 `window-manager` 的 plugin-id 兼容 fallback。

### Session 16

- 继续 Phase 9，收掉 backend/Electron 两边重复的 plugin capability loader。
- 新增 [shared/plugin-capability-loader.ts](/Users/Zhuanz/Documents/work_fox/shared/plugin-capability-loader.ts)，统一提供：
  - `loadPluginWorkflowModule(...)`
  - `loadPluginToolsModule(...)`
  - `loadPluginApiModule(...)`
  - `isMainProcessBridgePlugin(...)`
- 修改 [backend/plugins/plugin-registry.ts](/Users/Zhuanz/Documents/work_fox/backend/plugins/plugin-registry.ts)：
  - workflow/tools 加载改为走 shared capability loader
  - `requiresMainProcessBridge(...)` 改为只按 runtime type 判定
  - 移除对 `window-manager` 的 plugin-id 兼容 fallback
- 修改 [electron/services/plugin-runtime-host.ts](/Users/Zhuanz/Documents/work_fox/electron/services/plugin-runtime-host.ts)：
  - workflow/api/tools 注册改为走 shared capability loader
  - 仅保留把 loaded capability 注入 Electron host/registry 的宿主 glue code
- 修改 [electron/services/workflow-node-registry.ts](/Users/Zhuanz/Documents/work_fox/electron/services/workflow-node-registry.ts)：
  - 放宽 `register(...)` 入参，允许直接接收 loader 解析后的 node 集合
- 验证：
  - `pnpm build:backend` 通过
  - `pnpm exec tsc -p tsconfig.node.json --noEmit` 仍失败，但新增的 capability loader / runtime host 类型错误已清掉；剩余失败项仍为仓库既有 include / hook typing / plugin-fs 类型问题
  - `pnpm exec tsc -p tsconfig.web.json --noEmit` 仍失败，但失败项仍为仓库既有错误

### Next Recommended Step

- 若继续推进，优先切入 `Phase 10`，收掉 workflow store 的本地执行兜底分支，让 execution path 真正只剩 backend-first，而不是继续在 plugin loader 细节上做边缘优化。

### Session 17

- 开始 `Phase 10` 收口，优先处理 workflow store 的执行态组织方式，而不是继续扩展协议或插件边界。
- 修改 [src/stores/workflow.ts](/Users/Zhuanz/Documents/work_fox/src/stores/workflow.ts)：
  - `createExecutionActions(...)` 不再依赖 store 级持久 `WorkflowEngine` ref
  - 本地模式改为闭包内 `localEngine`，仅作为非 backend 模式下的执行 fallback
  - backend `ws:connected/ws:reconnected` 时主动刷新 workflow/folder 列表并触发 execution recovery
  - `workflow:completed/workflow:error` 现在会把终态 `ExecutionLog.snapshot` 应回当前画布，避免节点状态停留在最后一条中间 `execution:log`
- 修改 [src/lib/ws-bridge.ts](/Users/Zhuanz/Documents/work_fox/src/lib/ws-bridge.ts)：
  - 初次连接仅发 `ws:connected`
  - 只有真实重连时才发 `ws:reconnected`
  - 避免 workflow store 在首次 connect 时重复执行 recovery / loadData
- 验证：
  - `pnpm exec tsc -p tsconfig.web.json --noEmit` 仍失败，但失败项仍为仓库既有错误
  - 本轮未新增 `workflow store` / `ws-bridge` 相关类型错误

### Next Recommended Step

- 若继续推进 `Phase 10`，优先把 `ExecutionBar.vue`、`CustomNodeWrapper.vue`、`workflow-renderer-tools.ts` 对“同步返回 executionLog”的旧假设清掉，并决定是否彻底移除 backend 模式下的本地执行 fallback。

### Session 18

- 直接清理已迁移后的旧 IPC / 旧本地执行死代码。
- 修改 [src/lib/backend-api/workflow-domain.ts](/Users/Zhuanz/Documents/work_fox/src/lib/backend-api/workflow-domain.ts) 与 [src/lib/backend-api/plugin-domain.ts](/Users/Zhuanz/Documents/work_fox/src/lib/backend-api/plugin-domain.ts)：
  - 移除 `useWorkflowBackend` feature flag 分支
  - 已迁移 domain 统一改为只走 backend adapter
- 修改 [src/stores/workflow.ts](/Users/Zhuanz/Documents/work_fox/src/stores/workflow.ts)：
  - 删除 execution control 的本地 `localEngine` fallback
  - `start/pause/resume/stop` 统一只走 backend
  - 增加 `clearOperationHistory()`
- 修改 [src/lib/workflow/engine.ts](/Users/Zhuanz/Documents/work_fox/src/lib/workflow/engine.ts)：
  - 单节点调试加载插件配置改走 backend adapter
  - 避免继续依赖已删除的 preload workflow/plugin 配置 IPC
- 修改 [preload/index.ts](/Users/Zhuanz/Documents/work_fox/preload/index.ts)：
  - 删除 workflow/workflowFolder/workflowVersion/executionLog/operationHistory 与 plugin 查询/配置类旧 IPC 暴露
- 修改 Electron Main / IPC：
  - [electron/main.ts](/Users/Zhuanz/Documents/work_fox/electron/main.ts) 不再注册 workflowVersion/executionLog/operationHistory 旧 IPC
  - [electron/ipc/workflow.ts](/Users/Zhuanz/Documents/work_fox/electron/ipc/workflow.ts) 仅保留 import/export
  - [electron/ipc/plugin.ts](/Users/Zhuanz/Documents/work_fox/electron/ipc/plugin.ts) 删除已迁移 plugin domain 查询/配置旧 IPC
- 删除死代码文件：
  - [electron/ipc/workflow-version.ts](/Users/Zhuanz/Documents/work_fox/electron/ipc/workflow-version.ts)
  - [electron/ipc/execution-log.ts](/Users/Zhuanz/Documents/work_fox/electron/ipc/execution-log.ts)
  - [electron/ipc/operation-history.ts](/Users/Zhuanz/Documents/work_fox/electron/ipc/operation-history.ts)
  - [electron/services/workflow-version.ts](/Users/Zhuanz/Documents/work_fox/electron/services/workflow-version.ts)
  - [electron/services/execution-log.ts](/Users/Zhuanz/Documents/work_fox/electron/services/execution-log.ts)
  - [electron/services/operation-history.ts](/Users/Zhuanz/Documents/work_fox/electron/services/operation-history.ts)
- 验证：
  - `pnpm build:backend` 通过
  - `pnpm exec tsc -p tsconfig.web.json --noEmit` 通过
  - `pnpm build` 通过

### Next Recommended Step

- 若继续收尾，可同步更新架构文档与设计稿里关于 backend feature flag、旧 preload IPC 面的过时说明，避免后续继续按已删除路径开发。

### Session 19

- 继续清理第二层残留文档，优先修正仍会误导当前开发的说明，而不重写历史计划稿。
- 修改 [src/CLAUDE.md](/Users/Zhuanz/Documents/work_fox/src/CLAUDE.md)：
  - 将 `WorkflowEngine` 描述从“local fallback + 单节点调试”修正为“仅保留单节点调试与少量本地辅助逻辑”
- 修改 [docs/superpowers/plans/2026-04-21-workfox-backend-migration-architecture.md](/Users/Zhuanz/Documents/work_fox/docs/superpowers/plans/2026-04-21-workfox-backend-migration-architecture.md)：
  - 显式标注其中的 IPC/WS 双栈与 feature flag 回退属于迁移期设计记录
  - 将兼容策略改为当前真实状态：backend/WS 单主路径，Electron IPC 仅保留 import/export 与桌面本地能力
- 修改 [findings.md](/Users/Zhuanz/Documents/work_fox/findings.md)：
  - 把 Phase 5/6 中关于 backend feature flag 的表述更新为“迁移期曾存在，当前已移除”
