# Claude Agent SDK 全量替换迁移计划

**Goal:** 用 Claude Agent SDK 替换当前基于 Anthropic Messages API 的自建 agent/chat 执行内核，使 WorkFox 拥有真实的执行型 agent runtime，支持工作区目录与 `CLAUDE.md` 规则加载，兼容现有 tools/plugin tools，并移除旧 skills 模块。

**Architecture:** 主进程新增 `ClaudeAgentRuntime` 统一承接 agent session 生命周期、事件流、工具适配与 workflow 执行。渲染进程继续复用现有流式 UI 协议，先不重写聊天渲染。现有内置工具、workflow tools、插件 tools 通过兼容适配层暴露给 Claude Agent SDK。workflow 侧不再规划 `agent_chat`，改为可执行 `agent_run` 节点。旧 skills UI 和旧自建 API 代理链路逐步移除。

**Tech Stack:** Electron, electron-vite, Vue 3, Pinia, TypeScript, Claude Agent SDK, IPC

---

## 1. 替换边界

### 保留的部分

- 保留现有 chat message 持久化模型和流式 UI 渲染逻辑
- 保留现有 `workflowNodeRegistry` 作为插件 nodes / plugin tools 聚合层
- 保留现有 workflow 编辑器、插件系统、工作流数据存储与执行日志体系
- 保留现有 IPC 频道名一层时间，只替换其后端实现

### 替换的部分

- 删除 `src/lib/agent/agent.ts -> chat:completions -> electron/services/ai-proxy.ts` 这条自建 Messages API 链路
- 删除或退役自建 SSE 解析、tool loop、Anthropic 请求组装与重试实现
- 废弃 workflow 中未实现的 `agent_chat` 语义，改为执行型 agent runtime 节点
- 移除旧 skills UI、旧 system prompt 中的 skill 分类和任何残留 skill IPC

### 兼容壳策略

- 渲染层继续监听 `chat:chunk`、`chat:tool-call`、`chat:tool-result`、`chat:thinking`、`chat:done`、`chat:error`
- 主进程新的 Claude runtime 把 Claude SDK 事件转换成上述事件协议
- 这样可以一次替换内核，同时避免同步重写前端消息组件和持久化格式

---

## 2. 当前架构现状

### 现有执行链路

- `src/stores/chat.ts`
  - 负责创建会话、落库消息、启动 `runAgentStream()`
- `src/lib/agent/agent.ts`
  - 负责构造工具列表、system prompt，并通过 preload 调用 `chat:completions`
- `electron/ipc/chat.ts`
  - 提供 `chat:completions`、`chat:abort`、`agent:execTool`
- `electron/services/ai-proxy.ts`
  - 直接请求 Anthropic `/v1/messages`
  - 手动解析 SSE
  - 手动循环执行 `tool_use`
  - 在 browser / workflow / plugin tools 三种工具执行路径间做路由

### 现有 workflow / tools 现状

- `src/lib/workflow/engine.ts`
  - `agent_chat` 尚未实现
- `src/lib/agent/workflow-tools.ts`
  - 定义 workflow 编辑型工具
- `electron/services/workflow-tool-dispatcher.ts`
  - 将 workflow 工具在主进程和渲染进程之间分派
- `electron/services/workflow-node-registry.ts`
  - 已支持 plugin workflow nodes
  - 已支持 plugin API
  - 已支持 plugin agent tools schema 与 handler

### 现有 skills 现状

- `src/components/chat/ChatInput.vue`
  - 仍然暴露 skill 列表、复制、编辑、删除 UI
- `src/lib/agent/system-prompt.ts`
  - 仍然把 `skill` 作为内置分类写入浏览器助手系统提示
- 本轮扫描未发现 skill 主进程入口，实施时需做一次完整清理扫描

---

## 3. 目标架构

### 3.1 新的主进程运行时

新增文件：
- `electron/services/claude-agent-runtime.ts`

职责：
- 接收 renderer 发来的 agent 运行请求
- 根据 session / workflow 配置创建 Claude Agent SDK session
- 管理 `cwd`、`additionalDirectories`、`permissionMode`、`allowedTools`
- 组装规则来源：`CLAUDE.md`、兼容 `rule.md`、动态 extra instructions
- 将 Claude SDK 的文本、thinking、tool start、tool args、tool result、usage、done、error 事件映射为现有前端事件
- 维护 requestId -> abort controller / runtime handle 映射

建议对外接口：

```ts
interface StartAgentRunParams {
  requestId: string
  providerId: string
  modelId: string
  history: Array<{ role: string; content: string }>
  input: string
  mode?: 'browser' | 'workflow'
  workflowId?: string
  targetTabId?: string | null
  enabledToolNames?: string[]
  runtime?: {
    cwd?: string
    additionalDirectories?: string[]
    permissionMode?: 'default' | 'acceptEdits' | 'bypassPermissions'
    allowedTools?: string[]
    extraInstructions?: string
    loadProjectClaudeMd?: boolean
    loadRuleMd?: boolean
  }
}
```

### 3.2 新的 IPC 边界

保留并改造：
- `chat:completions` -> 改为“启动 Claude agent session”
- `chat:abort` -> 改为“停止 Claude agent session”

新增建议：
- `agent:run`
- `agent:abort`

两种做法选一：

方案 A：
- 保留旧 `chat:*` 名字，内部实现全部替换
- 优点：前端改动最小
- 缺点：命名与语义继续混杂

方案 B：
- 新增 `agent:run` / `agent:abort`
- 前端 store 迁移到新接口
- `chat:*` 只保留短期兼容或删除

建议选 B，再用一层短期兼容桥接。

### 3.3 渲染层兼容

保留文件：
- `src/lib/agent/stream.ts`
- `src/stores/chat.ts`

调整方向：
- `runAgentStream()` 改名或重写为 `runAgentSession()`，不再自己构造 Anthropic tools payload
- `listenToChatStream()` 继续沿用现有事件名
- `buildWorkflowOptions()` 改为构造运行时配置，而不是 Anthropic Messages API 选项

---

## 4. Tools 兼容策略

## 4.1 工具分层

迁移后仍保留三类工具来源：

1. 内置浏览器工具
2. workflow 编辑/执行工具
3. 插件提供的 agent tools

### 4.2 兼容层总设计

新增文件：
- `electron/services/claude-tool-adapter.ts`

职责：
- 统一把现有工具定义转成 Claude Agent SDK 可消费的工具描述
- 在工具实际执行时回调到现有 handler
- 为每类工具分配稳定命名空间，避免重名

建议命名策略：
- 内置浏览器工具：`browser.<toolName>`
- workflow 编辑工具：`workflow.<toolName>`
- 插件工具：`plugin.<pluginId>.<toolName>`

理由：
- Claude runtime 中的工具名必须全局唯一
- 当前 plugin tools 可能和内置工具同名

### 4.3 内置浏览器工具

当前执行入口：
- `agent:execTool` -> `workflowNodeRegistry.getHandler(toolType)`

问题：
- 这个入口实际上更偏向 workflow/plugin node 执行，不是完整浏览器工具中心
- 现有 `src/lib/agent/tools.ts` 中浏览器业务工具数量非常少，且仍是“发现式工具”设计

迁移建议：
- 不保留“分类 -> 工具列表 -> 工具详情 -> execute_tool”的旧发现式 prompt 机制
- 改为直接向 Claude runtime 注册真实可执行工具
- 若某些工具风险较高，通过 `allowedTools` / `permissionMode` 约束，而不是让模型先做工具发现

这意味着：
- `src/lib/agent/tools.ts` 需要拆成：
  - `tool-catalog.ts`：真实工具定义
  - `tool-discovery.ts`：如仍需展示给用户，可作为辅助 UI，不再作为模型主协议

### 4.4 workflow tools

当前：
- `WORKFLOW_TOOL_DEFINITIONS` + `dispatchWorkflowTool()`

迁移建议：
- 继续保留 `dispatchWorkflowTool()` 作为实际执行路由
- 由 `claude-tool-adapter.ts` 将 workflow 工具包装为 Claude runtime 可见工具
- 工具名统一加 `workflow.` 前缀

### 4.5 plugin tools

当前：
- `workflowNodeRegistry.getAgentTools(pluginIds)`
- `workflowNodeRegistry.getAgentToolHandler(toolName)`

迁移建议：
- 不改插件作者的 `tools.js` 导出结构
- 由 adapter 负责在 runtime 启动时读取已启用 plugin tools
- 为每个 plugin tool 注入全局唯一工具名
- 执行时再映射回原始 `toolName + pluginId + api`

### 4.6 是否引入 MCP

不建议第一阶段就把现有工具全部改成 MCP server。

理由：
- 当前主进程已掌握所有执行能力与 plugin registry，直接做 adapter 成本更低
- MCP 更适合作为第二阶段统一外部工具生态时引入
- 第一阶段目标是“替换 runtime”，不是“重构全部工具协议”

结论：
- MVP 用本地 adapter
- 后续如要开放外部 agent/tool 生态，再抽为 MCP

---

## 5. Workflow Agent 设计

### 5.1 节点语义替换

弃用：
- `agent_chat`

新增：
- `agent_run`

节点职责：
- 运行一个真实的 Claude agent session
- 允许绑定工作区目录、附加目录、规则文件加载、允许工具集合、权限模式
- 输出结构化执行结果到 workflow context

### 5.2 节点字段建议

在 `src/lib/workflow/nodeRegistry.ts` 与 `src/lib/workflow/types.ts` 中新增/调整：

```ts
interface AgentRunNodeData {
  prompt: string
  cwd?: string
  additionalDirectories?: string[]
  loadClaudeMd?: boolean
  loadRuleMd?: boolean
  ruleFileNames?: string[]
  permissionMode?: 'default' | 'acceptEdits' | 'bypassPermissions'
  allowedTools?: string[]
  enabledPlugins?: string[]
  extraInstructions?: string
  timeoutMs?: number
}
```

建议默认值：
- `loadClaudeMd = true`
- `loadRuleMd = true`
- `ruleFileNames = ["rule.md"]`
- `permissionMode = "default"`

### 5.3 执行结果模型

workflow 节点输出建议：

```ts
interface AgentRunResult {
  success: boolean
  finalText: string
  toolCalls: Array<{
    name: string
    args: Record<string, unknown>
    result?: unknown
    status: 'completed' | 'error'
  }>
  usage?: {
    inputTokens: number
    outputTokens: number
  }
  cwd?: string
  error?: string
}
```

这样 workflow 后续节点可以直接读取 agent 执行产物，而不需要再从聊天消息里反解。

### 5.4 Workflow engine 集成

改造文件：
- `src/lib/workflow/engine.ts`

改造方向：
- 删除 `executeAgentChat()`
- 新增 `executeAgentRun(nodeData)`
- 调用新的 preload `agent.run()` 或 renderer 暴露的统一 runtime API
- 将结果写入 `context.__data__[node.id]`

---

## 6. 规则与工作区目录策略

### 6.1 目录字段映射

Claude Agent SDK 配置映射：
- `cwd` -> 节点的主工作区目录
- `additionalDirectories` -> 节点配置的附加目录列表

### 6.2 规则源优先级

建议优先级从高到低：

1. 节点 `extraInstructions`
2. 节点兼容读取的 `rule.md` 内容
3. 项目目录中的 `CLAUDE.md`
4. 全局系统级固定安全提示

解释：
- `CLAUDE.md` 交给 Claude Agent SDK 原生加载
- `rule.md` 由应用层读取内容并附加到 `systemPrompt.append`
- 如同一目录同时存在多份规则文件，先固定 `CLAUDE.md` 原生，再按 `ruleFileNames` 顺序拼接其他兼容规则

### 6.3 `rule.md` 兼容策略

不建议长期维持任意规则文件名自动扫描。

MVP：
- 只支持用户显式配置的文件名数组，默认 `["rule.md"]`

后续：
- 提供“迁移为 `CLAUDE.md`”按钮或自动迁移命令

### 6.4 目录安全

风险：
- 用户可能把不存在目录或越权目录传给 workflow agent

策略：
- 运行前在主进程校验目录存在性
- 在错误中明确指出哪一个目录不可用
- 记录到 workflow 执行日志

---

## 7. Skills 模块退场计划

### 7.1 要删除的用户面

文件：
- `src/components/chat/ChatInput.vue`

删除内容：
- skill 列表 dropdown
- skill 编辑 dialog
- skill 删除 dialog
- skill 复制/刷新逻辑

### 7.2 要删除或修改的提示词

文件：
- `src/lib/agent/system-prompt.ts`

删除内容：
- `skill` 分类
- “对 AI 说保存 skill” 相关暗示

### 7.3 要扫描并删除的潜在后端

实施前需补扫：
- `preload/index.ts`
- `electron/ipc/**/*`
- `electron/services/**/*`
- `src/lib/**/*`

目标：
- 确认是否存在 `window.api.skill.*`
- 若存在，全部删除或迁移

### 7.4 历史技能迁移

若后端仍有 skill 存储：
- 增加一次性迁移脚本，把 skill 文本内容导出到用户指定目录
- 推荐迁移目标：
  - `CLAUDE.md`
  - 或 Claude skills 目录结构

若不存在独立后端存储：
- 直接删除前端入口

---

## 8. Provider / Model 迁移

### 当前状态

- `src/stores/ai-provider.ts` 维护 provider 与 model 的可选列表
- 当前 provider 偏向 Anthropic-compatible `/v1/messages`

### 迁移要求

Claude Agent SDK 只适用于 Claude 生态，不是通用 OpenAI-compatible 抽象。

因此需要明确策略：

方案 A：仅在 Anthropic provider 下启用 Claude Agent Runtime
- 若当前 provider 不是 Anthropic，禁用执行型 agent 或提示不支持

方案 B：引入“Runtime 类型”概念
- `legacy_messages`
- `claude_agent_sdk`

建议选 B。

数据模型新增建议：
- `AIProvider.runtimeType?: 'legacy_messages' | 'claude_agent_sdk'`

这样可以：
- 给用户保留旧 provider 配置
- 明确哪些 provider 支持执行型 agent
- 为未来其他 agent runtime 预留扩展位

---

## 9. 打包与 Electron 主进程风险

### 风险点

- 当前主进程使用 `electron-vite` + `moduleResolution: bundler`
- Claude Agent SDK 可能包含 Node-only 依赖、动态导入或运行时资源
- 需要确认是否要 externalize 某些依赖，避免 main 进程打包后行为异常

### 规划动作

1. 在引入 SDK 前先做最小 PoC
2. 验证以下场景：
   - dev 模式 main 进程可正常 import
   - build 后产物可正常启动
   - macOS/Windows 打包后 SDK 能正常运行

### 配置关注点

文件：
- `electron.vite.config.ts`
- `tsconfig.node.json`
- `package.json`

可能动作：
- 为 Claude Agent SDK 及其依赖配置 external
- 补充 Node 运行时所需资源打包规则

---

## 10. 文件级改造清单

## 10.1 新增文件

- `electron/services/claude-agent-runtime.ts`
- `electron/services/claude-tool-adapter.ts`
- `electron/services/claude-rule-loader.ts`
- `electron/services/claude-event-bridge.ts`

可选新增：
- `electron/services/claude-agent-runtime-types.ts`
- `electron/services/claude-skill-migration.ts`

## 10.2 修改文件

- `package.json`
  - 引入 Claude Agent SDK 依赖
- `electron.vite.config.ts`
  - 处理 main 进程打包兼容
- `electron/ipc/chat.ts`
  - 替换为新的 runtime 入口或兼容桥
- `preload/index.ts`
  - 暴露新的 `agent.run` / `agent.abort`
- `src/lib/agent/agent.ts`
  - 重写为新 runtime 客户端
- `src/lib/agent/stream.ts`
  - 保持事件协议，必要时补充新事件
- `src/stores/chat.ts`
  - 从 `runAgentStream` 切到新 session 运行入口
- `src/lib/agent/system-prompt.ts`
  - 删除旧浏览器 skill 分类式 prompt
- `src/lib/agent/workflow-tools.ts`
  - 仅保留 workflow 工具定义，不再耦合旧 Anthropic schema 假设
- `src/lib/workflow/nodeRegistry.ts`
  - 增加 `agent_run` 节点定义
- `src/lib/workflow/types.ts`
  - 增加 `agent_run` 节点数据类型
- `src/lib/workflow/engine.ts`
  - 替换 `agent_chat` 为 `agent_run`
- `src/components/chat/ChatInput.vue`
  - 删除 skills UI

## 10.3 删除文件

强预期删除：
- `electron/services/ai-proxy.ts`

高概率删除或清空：
- 旧 skill 相关 IPC/服务文件（待完整扫描后确认）

---

## 11. 分批实施顺序

### Batch 1: Runtime PoC

- [ ] 安装 Claude Agent SDK
- [ ] 在 main 进程创建最小运行示例
- [ ] 打通文本输出、abort、基础错误处理
- [ ] 验证 dev/build 能运行

验收：
- 不接任何现有工具，仅能从 renderer 发起一次 agent session 并收到 token 流

### Batch 2: Event Bridge + UI 兼容

- [ ] 新 runtime 将事件映射为现有 `chat:*` 事件
- [ ] `src/stores/chat.ts` 切换到新入口
- [ ] 保持现有消息展示组件无大改

验收：
- 普通聊天面板可工作，stop / retry 不回归

### Batch 3: Tool Adapter

- [ ] 接入 workflow tools
- [ ] 接入 plugin tools
- [ ] 接入内置浏览器工具
- [ ] 完成工具命名空间和冲突解决

验收：
- agent 可调用现有工具并正确回传 tool call / result

### Batch 4: Workflow Agent 节点

- [ ] 新增 `agent_run` 节点
- [ ] 支持 `cwd`、`additionalDirectories`、规则加载、权限模式
- [ ] 将结果写入 workflow context

验收：
- workflow 中可执行一个真实 agent 任务并产出结构化结果

### Batch 5: Skills 退场

- [ ] 删除 skills UI
- [ ] 删除旧 system prompt 中 skill 分类
- [ ] 扫描并删除 skill IPC / service
- [ ] 如存在历史数据，增加迁移脚本

验收：
- UI 中不再暴露旧 skill 概念，运行链路中无残留调用

### Batch 6: Cleanup

- [ ] 删除 `ai-proxy.ts`
- [ ] 删除旧 Anthropic request 适配代码
- [ ] 清理遗留类型和无用 prompt 逻辑
- [ ] 统一文档与注释

验收：
- 代码库中不再存在旧的双轨执行内核

---

## 12. 验证矩阵

| 场景 | 输入 | 预期 |
|------|------|------|
| 普通 agent 会话 | 文本消息 | 正常输出 token、thinking、usage、done |
| agent stop | 启动后立即停止 | 主进程 runtime 正常 abort，前端状态复位 |
| workflow tools | 在 workflow 上下文运行编辑任务 | 能调用 `workflow.*` 工具并得到正确结果 |
| plugin tools | 启用插件后运行任务 | 能调用 `plugin.<id>.*` 工具并执行插件 handler |
| cwd 挂载 | 指定存在目录 | Claude runtime 以该目录为主工作区运行 |
| additionalDirectories | 指定多个附加目录 | 目录均可见且不影响主 cwd |
| `CLAUDE.md` | 工作区有项目规则 | 规则被 Claude 原生加载 |
| `rule.md` | 工作区有兼容规则文件 | 内容被拼入附加指令 |
| workflow `agent_run` | 节点执行任务 | 输出结构化结果进入 workflow context |
| skills 移除 | 打开聊天输入区 | 不再出现技能管理 UI |

---

## 13. 关键风险

| Risk | Impact | Mitigation |
|------|--------|------------|
| Claude SDK 与 electron-vite main 打包不兼容 | 主进程无法构建或运行 | 先做 PoC，必要时 externalize 依赖 |
| 工具名冲突 | 错误调用 handler | 引入工具命名空间 |
| 旧 UI 协议与新 runtime 事件不完全匹配 | 前端流式状态错乱 | 保留事件桥，逐项映射验证 |
| 删除 skills 后用户历史内容丢失 | 功能回归 | 若存在后端存储，先导出/迁移 |
| workflow 中 agent 执行时间过长 | UI 和日志状态异常 | 加超时与显式 cancel，写入 execution log |

---

## 14. 建议结论

这次迁移应被定义为“执行内核全量替换”，不是“全仓重构”。

最佳落地顺序是：
- 先在主进程打通 Claude Agent SDK runtime 和事件桥
- 再把现有 tools 通过 adapter 接入
- 再落 workflow `agent_run`
- 最后清理 skills 和旧 Anthropic 自建代理链路

这样既满足“一次性替换执行能力”的目标，也能避免在第一步就把 UI、workflow 编辑器、插件系统全部重写。
