# Task Plan: Claude Agent SDK 全量替换执行内核规划

## Goal
用 Claude Agent SDK 替换当前基于 Anthropic Messages API 的自建 agent/chat 执行链路，使 workflow 下的 agent 拥有真实执行能力、支持工作区目录与 `CLAUDE.md` 规则加载、兼容现有 tools/plugin tools 调用，并移除旧的应用内 skills 模块。

## Current Phase
Phase 10

## Phases

### Phase 1: Requirements & Discovery
- [x] 明确用户目标不是保留 `agent_chat`，而是改为可执行 agent runtime
- [x] 确认当前仓库中的 agent/chat/workflow/tools/skills 耦合点
- [x] 确认 Claude Agent SDK 对 `cwd`、`additionalDirectories`、`settingSources`、`CLAUDE.md`、skills 的支持边界
- [x] 将关键发现写入 `findings.md`
- **Status:** complete

### Phase 2: Replacement Architecture Planning
- [x] 定义“全量替换”的边界：替换执行内核，不强制重写现有 UI 和 workflow 编辑器
- [x] 设计新的主进程 agent runtime 服务与渲染层事件桥接
- [x] 设计现有 tools/plugin tools 到 Claude Agent SDK 的兼容适配层
- [x] 设计 workflow agent 节点/配置的数据模型
- [x] 设计 `CLAUDE.md` 与 `rule.md` 的加载优先级和兼容策略
- [x] 设计旧 skills 模块的移除与迁移策略
- **Status:** complete

### Phase 3: Execution Plan Breakdown
- [x] 将替换工作拆成主进程 runtime、IPC、renderer store/UI、workflow schema、migration 五个子域
- [x] 为每个子域列出涉及文件、改动原则、回归风险和验证方式
- [x] 明确哪些旧文件删除，哪些保留为兼容壳
- **Status:** complete

### Phase 4: Validation Strategy
- [x] 定义运行时验证场景：普通对话、workflow 执行、插件工具调用、目录规则加载、停止执行
- [x] 定义 skills 移除后的回归检查项
- [x] 定义最小可发布版本（MVP）和后续增强项边界
- **Status:** complete

### Phase 5: Delivery
- [x] 输出详细规划文件
- [x] 确保规划内容可直接转化为实施任务
- [x] 向用户说明规划产物位置和建议下一步
- **Status:** complete

### Phase 6: Runtime PoC Implementation
- [x] 将根目录 planning 文件从“规划完成”扩展为“实施开始”
- [x] 引入 Claude Agent SDK 依赖并核对实际 TypeScript 导出与事件类型
- [x] 新增主进程 Claude runtime PoC，复用现有 `chat:*` 流式事件协议
- [x] 将 renderer 入口切换到 Claude runtime，保持当前 Chat UI 不重写
- [x] 运行类型检查或构建验证主链路可编译
- **Status:** complete

### Phase 7: Tool Adapter Integration
- [x] 设计并实现内置工具、workflow tools、plugin tools 的 Claude 兼容适配层
- [x] 解决工具命名空间与 handler 路由映射
- [x] 验证工具调用事件与结果回流
- **Status:** complete

### Phase 8: Workflow Agent Migration
- [x] 用 `agent_run` 替换 `agent_chat`
- [x] 扩展 workflow node schema 支持 `cwd`、规则加载与权限配置
- [x] 让 workflow engine 通过新 agent runtime 执行
- **Status:** complete

### Phase 9: Skills Removal
- [x] 删除 renderer skills UI、相关 prompt 文案与残留 API
- [x] 扫描并移除 skill IPC / 服务 / 数据存储残留
- [x] 评估是否需要历史 skill 导出或迁移
- **Status:** complete

### Phase 10: Final Cleanup & Validation
- [x] 退役旧 `ai-proxy` 链路与多余兼容代码
- [x] 完成构建、回归验证和迁移说明
- [x] 向用户交付实施结果与剩余风险
- **Status:** complete

## Key Questions
1. Claude Agent SDK 替换后，前端是否继续保留当前 `chat` 流式渲染协议，还是同步改 UI 协议？
2. 现有内置工具和插件 tools 应通过 Claude SDK 原生 tool adapter 接入，还是优先做本地 MCP server？
3. `rule.md` 是保留兼容层，还是统一迁移到 `CLAUDE.md`？
4. skills 模块是立即删除，还是先做数据迁移脚本再删除 UI/IPC？
5. workflow 侧是否保留聊天入口，还是统一为 `agent_run`/`agent_exec` 语义？

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| 规划范围限定为“替换 agent 执行内核”，不同时重写 workflow 编辑器 | 用户目标是获得更强执行能力，先替换 runtime 才是关键路径 |
| 保留现有前端流式事件形态作为兼容壳 | 一次替换执行内核时，保留 UI 协议可以显著降低改动半径 |
| 将 `CLAUDE.md` 视为原生规则源，`rule.md` 视为兼容输入 | Claude Agent SDK 原生支持项目级 `CLAUDE.md`，`rule.md` 需要应用层拼接 |
| 旧 skills 模块可移除，但必须在规划中显式处理迁移和 UI 退场 | 用户希望删除 skills 模块，但当前前端仍有技能列表/编辑入口 |
| 插件 tools 兼容必须通过适配层实现，不能假设 Claude SDK 零适配兼容现有协议 | 当前工具体系是自定义 schema + IPC + registry，不是 Claude SDK 原生工具定义 |
| 第一阶段不引入 MCP，而是先做本地工具适配层 | 当前目标是替换 runtime，直接复用现有主进程执行能力成本最低 |
| 引入 `agent_run` 替代 `agent_chat` | 用户需要可执行 agent，而不是聊天节点 |
| Provider 层建议新增 `runtimeType` 而不是强行复用旧 messages 抽象 | Claude Agent SDK 不属于通用 OpenAI-compatible provider 抽象 |
| 实施第一批先替换 chat 主执行链路，暂不同时重写 workflow 和 skills | 先打通最短可验证路径，降低一次性改动半径 |
| Claude runtime 先继续复用现有 `chat:*` 事件协议 | 这样可避免同步重写 `ChatStore` 和消息渲染器 |
| Claude runtime 默认使用 `systemPrompt: { type: "preset", preset: "claude_code" }` + `settingSources: ["project"]` | 这是加载项目级 `CLAUDE.md` 的官方要求 |
| Claude runtime 需要开启 `includePartialMessages` 以映射现有增量 UI 协议 | 否则无法在主进程稳定转发实时文本/工具流事件 |
| Claude SDK 自定义工具先不在 Batch 1 落地 | 官方 Node SDK 走 in-process MCP 暴露更合适，首批先聚焦 runtime 切换与打包验证 |
| Batch 1 的聊天历史先折叠成 transcript prompt，而不是直接迁移为 Claude session persistence | 这样可以最小改动打通主链路，后续再升级到 resume/session 模式 |
| Batch 1 先使用内置 Claude Code 工具的只读/最小权限模式，不接入现有 workflow/plugin tools | 当前目标是验证 runtime 和打包集成，工具兼容层放到 Phase 7 |
| Phase 7 通过本地 in-process MCP server 暴露 browser/workflow/plugin tools | 这是 Claude Agent SDK 最自然的自定义工具接入方式，也最利于复用现有主进程工具实现 |
| 自定义 MCP 工具名统一还原为 WorkFox 原始工具名再进入现有 UI 事件流 | 否则前端会暴露 `mcp__server__tool`，影响显示、重试和兼容性 |
| `agent_run` 节点直接复用 `chat:completions` IPC 和 Claude runtime，而不是再做独立 workflow main 服务 | 这样可直接复用规则加载、权限模式、工具适配和 abort 逻辑 |
| skills 直接退场，不保留空壳 UI | 当前仓库未发现完整的 skill main 进程实现，继续保留只会制造误导 |
| `aiProvider:test` 单独拆成 `ai-provider-test.ts` 后删除旧 `ai-proxy.ts` | 避免仓库内同时保留两套 chat 执行链路造成维护歧义 |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| 未在当前扫描范围内发现 skill 主进程 handler | 1 | 以已确认的前端耦合点和系统 prompt 为基础规划，后续实施时再做全量删除扫描 |

## Notes
- 规划文件放在项目根目录，遵循 `.claude/skills/planning-with-files` 约定
- 详细实施建议将围绕主进程 runtime 替换、tools 兼容、workflow agent 配置、skills 移除四条主线展开
- 后续如果用户要求继续实施，需要先读取本文件与 `findings.md`、`progress.md`
- 详细迁移设计文档已写入 `docs/superpowers/plans/2026-04-20-claude-agent-sdk-migration.md`
- 2026-04-20 已确认 Claude Agent SDK 关键约束：`settingSources` 默认不会加载文件系统配置；要启用项目级 `CLAUDE.md` 需配合 `systemPrompt preset=claude_code`；实时流式 UI 需依赖 `includePartialMessages`
- 2026-04-20 已完成 Batch 1 PoC：`chat:completions` 已切到 Claude Agent SDK，`pnpm build` 通过；下一阶段重点是把 workflow tools / plugin tools 经 adapter 接回 Claude runtime
- 2026-04-20 已完成 Phase 7-10 主实现：Claude runtime 已接入 browser/workflow/plugin tools adapter，workflow `agent_run` 已替换旧 `agent_chat`，skills UI 与旧 `ai-proxy` 已移除，`pnpm build` 再次通过
