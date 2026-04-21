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
