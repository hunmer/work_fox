# 迁移进度记录

## 2026-04-24

- 创建迁移计划：前端本地执行器统一迁移到后端执行器。
- 明确当前问题根因：正式执行和单节点调试使用不同执行器。
- 拆分 5 个阶段：协议、后端 debug、前端切换、引用清理、一致性验证。
- 记录关键风险：调试上下文、本地工具 interaction、loop 调试、提前删除引用。

## 下一步

从 Phase 1 开始实现 `workflow:debug-node` 协议与后端 handler。

## 2026-04-24 实施记录

- 完成 Phase 1：新增 `WorkflowDebugNodeRequest` / `WorkflowDebugNodeResponse`，注册 `workflow:debug-node` channel 与 metadata。
- 完成 Phase 2：`BackendWorkflowExecutionManager.debugNode()` 使用临时 session 复用 `executeNode()`、变量解析、`run_code`、插件和本地 interaction 执行路径。
- 完成 Phase 3：`src/lib/backend-api/workflow.ts` 新增 `debugNode()`；`src/stores/workflow.ts` 的单节点调试切换为后端调用，UI 状态结构保持兼容。
- 完成 Phase 4：`EngineStatus` 类型迁移到 shared；删除 `src/lib/workflow/engine.ts`；`rg "WorkflowEngine|workflow/engine" "src" "backend" "shared"` 仅剩文档历史说明。
- 验证：`pnpm exec tsc -p "tsconfig.backend.json" --noEmit` 通过；`pnpm exec tsc -p "tsconfig.json" --noEmit` 通过。
- 注意：`pnpm exec vue-tsc -p "tsconfig.json" --noEmit` 无法执行，项目未安装 `vue-tsc`。

## 下一步

请在 UI 手动验证 Phase 5 测试矩阵：`run_code`、`end`、`switch`、`variable_aggregate`、`loop`、本地/插件节点与 `agent_run`。
