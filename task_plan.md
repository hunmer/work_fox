# 前端执行器迁移到后端执行器计划

## 目标

移除前端本地工作流执行器作为业务执行入口，统一由后端 `BackendWorkflowExecutionManager` 承担工作流执行、单节点调试、上下文解析、节点输出写入和执行历史生成，降低前后端执行语义分叉带来的维护成本。

## 范围

### 包含

- 将单节点调试从前端 `WorkflowEngine.debugSingleNode()` 迁移到后端接口。
- 统一 `run_code`、变量解析、输入字段、输出字段、循环、分支等执行语义。
- 保留 renderer 仅作为 UI、交互响应和 Electron 本地能力执行端。
- 删除或废弃 `src/lib/workflow/engine.ts` 的执行职责。
- 更新前端 store、backend API、WebSocket channel、共享协议类型。

### 不包含

- 不重构节点编辑器 UI。
- 不重写工作流存储模型。
- 不改变现有正式执行入口 `workflow:execute` 的用户行为。
- 不引入新的插件体系。

## 当前状态

- 正式工作流执行走后端：`backend/workflow/execution-manager.ts`。
- 单节点调试已切换到后端：`workflow:debug-node` -> `BackendWorkflowExecutionManager.debugNode()`。
- 前端执行器文件 `src/lib/workflow/engine.ts` 已删除，业务入口不再依赖本地执行器。
- 后端执行器已有完整执行历史、暂停、恢复、停止、交互回调能力。
- 后端本地能力依赖 `node_execution` interaction 回调 renderer 执行。

## 风险

| 风险 | 影响 | 缓解 |
|---|---|---|
| 单节点调试语义变化 | 用户测试节点结果变化 | 后端新增专用 debug-node 接口，并复用正式执行解析逻辑 |
| 调试上下文缺失 | 节点无法读取上游测试数据 | API 支持传入 `context`、`input` 或 `snapshot` |
| 本地工具节点依赖 renderer | 后端无法直接执行 Electron 本地能力 | 保留 `node_execution` interaction，不把所有逻辑强行后端化 |
| 嵌入式/循环节点调试复杂 | loop/sub workflow 调试失败 | 第一阶段兼容现有前端行为：普通节点单节点执行，loop 使用完整 snapshot |
| 删除过早 | 隐藏引用导致运行时报错 | 先替换引用，再用 `rg` 确认无引用后删除 |

## 迁移阶段

### Phase 1：补齐后端单节点调试协议

状态：complete

任务：

- 在 `shared/execution-events.ts` 或相关 shared contract 中增加 `WorkflowDebugNodeRequest` / `WorkflowDebugNodeResponse`。
- 在 `shared/channel-contracts.ts` 注册 `workflow:debug-node`。
- 在 `shared/channel-metadata.ts` 补充 channel 元数据。
- 在 `backend/ws/execution-channels.ts` 注册 `workflow:debug-node` handler。
- 请求参数至少包含：
  - `workflowId`
  - `nodeId`
  - `snapshot?: { nodes, edges }`
  - `context?: Record<string, unknown>`
  - `embeddedNode?: WorkflowNode` 或等价节点覆盖字段

验收：

- 前端可以通过 WebSocket 调用 `workflow:debug-node`。
- 类型层面能区分正式执行和单节点调试。

### Phase 2：后端实现 debug node 执行

状态：complete

任务：

- 在 `BackendWorkflowExecutionManager` 新增 `debugNode()` 方法。
- 复用现有 `resolveContextVariables()`、`dispatchNode()`、`buildOutputObject()`、`executeCode()` 等逻辑。
- 构造临时 `ExecutionSession`，但不持久化正式执行历史，除非后续明确需要。
- 输出结构对齐前端当前 `debugNodeResult`：
  - `status: 'completed' | 'error'`
  - `output?: unknown`
  - `error?: string`
  - `duration: number`
- 对普通节点只执行目标节点。
- 对 loop 节点可先沿用完整 snapshot 执行策略。
- 保证 `params`、`context`、`__inputs__`、`__data__` 的构造规则与正式执行一致。

验收：

- `run_code` 单节点调试与正式执行输出一致。
- 错误节点返回 error，不影响正式执行 session。
- 不产生误导性的正式 execution history。

### Phase 3：前端 API 与 store 切换

状态：complete

任务：

- 在 `src/lib/backend-api/workflow.ts` 增加 `debugNode()` 方法。
- 修改 `src/stores/workflow.ts` 的 `createDebugActions()`：
  - 删除 `new WorkflowEngine(...)`。
  - 调用后端 `workflow.debugNode()`。
  - 保留 `debugNodeStatus`、`debugNodeResult`、`debugNodeId` 对 UI 的兼容输出。
- `cancelDebug()` 改成取消当前 debug 请求：
  - 简化版：只清理 UI 状态。
  - 完整版：后端 debug 也返回 execution/debug id，并支持 stop。
- 移除 `WorkflowEngine` 和 `EngineStatus` 的前端执行器 import；`EngineStatus` 改从 shared 类型导入。

验收：

- UI 单节点调试按钮行为不变。
- 调试结果展示不需要改组件。
- `src/stores/workflow.ts` 不再实例化 `WorkflowEngine`。

### Phase 4：前端执行器引用清理

状态：complete

任务：

- 使用 `rg` 检查所有 `WorkflowEngine`、`workflow/engine`、`EngineStatus` 引用。
- 将仅类型引用迁移到 shared 类型。
- 删除或废弃 `src/lib/workflow/engine.ts`。
- 如果存在 renderer 专属节点执行辅助逻辑，迁移到更明确的位置，例如：
  - `src/lib/backend-api/interaction.ts`
  - `src/lib/agent/workflow-renderer-tools.ts`

验收：

- `rg 'WorkflowEngine|workflow/engine' src backend shared` 无业务引用。
- 前端构建不再依赖本地执行器。

### Phase 5：一致性验证

状态：partial

测试矩阵：

- `run_code`：
  - 输入字段 `params.name = 'steve'`
  - `main({ params })` 返回 `{ name: 'hello steve' }`
  - 单节点调试和正式执行输出一致
- `end`：
  - 引用当前 run_code 节点 ID 的 `__data__` 输出
  - 正式执行 history 中 end 输出正确
- `switch`：
  - 条件命中分支和默认分支
- `variable_aggregate`：
  - 空值跳过和首个非空值
- `loop`：
  - count loop
  - array loop
  - loop body 输出聚合
- 插件/本地节点：
  - 能通过 `node_execution` interaction 回调 renderer
- `agent_run`：
  - 仍能走 interaction manager 或既有执行路径

验收：

- `tsc -p tsconfig.backend.json --noEmit` 通过。
- `tsc -p tsconfig.json --noEmit` 通过。
- 前端类型检查通过。
- 用户按 UI 手动测试关键节点通过。

## 决策记录

- 统一后端执行器，不再维护两套工作流编排逻辑。
- renderer 仍保留 Electron 本地能力执行端职责，但不负责工作流调度与上下文解析。
- 单节点调试应复用后端正式执行的核心逻辑，而不是复制一套简化逻辑。

## 待确认问题

- 单节点调试不写入正式 execution history：当前实现采用临时 session，不加入 `sessions`，不持久化。
- debug cancel 第一版只清 UI：当前未实现后端中断，符合计划中的简化版。
- loop 节点调试当前执行目标 loop 节点，并传入完整 snapshot；需要用户在 UI 中手动验证循环体输出。
