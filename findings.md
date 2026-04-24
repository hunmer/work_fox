# 迁移调研记录

## 已知事实

- 前端本地执行器文件：`src/lib/workflow/engine.ts`。
- 后端正式执行器文件：`backend/workflow/execution-manager.ts`。
- 正式执行入口：`src/stores/workflow.ts` 中 `workflow.execute(currentWorkflow.value.id)`。
- 单节点调试入口：`src/stores/workflow.ts` 中 `createDebugActions()` 创建 `new WorkflowEngine(...)`。
- 后端已有 WebSocket 执行 channel：`backend/ws/execution-channels.ts`。
- 后端已有执行请求类型：`WorkflowExecuteRequest`，支持 `workflowId`、`input`、`snapshot`。
- 后端已有 interaction 机制处理 renderer 参与的能力：`node_execution`、`agent_chat` 等。

## 问题背景

`run_code` 节点新增 `main({ params })` 后，前端测试节点输出正常，但正式执行 history 没有输出。根因是前端和后端各有一套执行器，第一次只改了前端执行器，正式执行仍走后端旧逻辑。

## 架构判断

前端执行器目前主要用于单节点调试。继续保留会造成执行语义分叉。推荐迁移为：后端负责调度、解析、执行状态和日志；前端负责 UI 与本地能力 interaction 响应。

## 关键约束

- 不能破坏现有正式执行。
- 不能丢失单节点调试功能。
- 本地 Electron 能力不能简单移到后端，需要继续通过 interaction 回调 renderer。
- 调试节点必须支持当前画布 snapshot，避免未保存节点无法测试。

## 2026-04-24 实施发现

- `BackendWorkflowExecutionManager.execute()` 和 `debugNode()` 已复用 `createSession()`，避免正式执行和调试执行初始化逻辑重复。
- `debugNode()` 不把临时 session 放入 `sessions`，因此不会进入暂停/恢复/持久化正式执行历史路径。
- 单节点调试通过 `executeNode()` 复用正式执行的 `resolveContextVariables()`、`dispatchNode()`、`buildOutputObject()`、`executeCode()`，修复前后端执行语义分叉。
- 嵌入节点调试可能不在主画布 snapshot 中，后端已兼容：存在则覆盖，不存在则临时追加 embedded node。
- 前端取消调试当前只清理 UI 状态，未真正中断后端耗时 debug 请求。
