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
- `pnpm build` 当前失败在 renderer 依赖解析：Rollup 无法解析 `@tiptap/vue-3`，失败点为 `src/components/chat/tiptap/ChatInputEditor.vue`。这不是本次 shared 类型新增导致的失败。
- `pnpm exec tsc -p tsconfig.web.json --noEmit` 和 `pnpm exec tsc -p tsconfig.node.json --noEmit` 暴露多处仓库既有类型问题，包括 notification options、workflow engine status、nullable workflowStore、missing `src/types/split`、node project include 等。
