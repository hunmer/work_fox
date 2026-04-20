# Findings & Decisions

## Requirements
- 用 Claude Agent SDK 替换当前自建的 agent/chat 执行内核
- 不再需要 `agent_chat` 这种“只聊天”的模型调用，目标是有真实执行能力的 agent
- 最好一次性替换执行内核，而不是保留旧链路并行运行
- 需要兼容当前已有的 tools 调用，包括内置工具和插件提供的 agent tools
- workflow 下的 agent 需要支持工作区目录挂载，并从目录中加载 `CLAUDE.md` / `rule.md` 一类规则文件
- 旧的 skills 模块希望移除，改用 Claude 原生 skill 加载能力
- 当前请求是基于 `.claude/skills/planning-with-files` 生成详细规划文件，而不是立刻编码实施

## Research Findings
- 当前仓库的核心 agent 执行链路是 `src/lib/agent/agent.ts -> preload chat:completions -> electron/services/ai-proxy.ts`，属于自建 Anthropic Messages API 代理与 tool loop。
- `src/lib/workflow/engine.ts` 中的 `agent_chat` 仍然未实现，说明 workflow 侧尚未拥有真正的 agent runtime，只是保留了未来接入口。
- 现有插件系统已经能为 workflow 注册节点、API 和 agent tools；`electron/services/workflow-node-registry.ts` 已保存插件 tools schema 和 handler。
- 前端 `src/components/chat/ChatInput.vue` 仍然内置了 skills 列表、读取、编辑、删除 UI，说明 skills 模块至少在 renderer 仍有显式产品形态。
- Claude Agent SDK 的 TypeScript 文档提供 `cwd`、`additionalDirectories`、`permissionMode`、`allowedTools`、`settingSources` 等运行时配置。
- Claude Agent SDK 原生支持项目级 `CLAUDE.md`，但要通过 `systemPrompt: { type: "preset", preset: "claude_code" }` 和 `settingSources: ["project"]` 开启。
- `rule.md` 不是 Claude Agent SDK 的原生规则文件约定，因此只能通过应用层读取后拼接到附加系统提示，或迁移到 `CLAUDE.md`。
- Claude 原生支持 skill/规则加载不等于自动兼容当前应用内 skill CRUD UI；删除 skills 模块需要拆成“删除产品入口”和“迁移/兼容用户已有 skill 内容”两部分处理。

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| 使用“内核替换 + 兼容壳”作为总体策略 | 一次替换执行能力的同时保留当前渲染层流式事件和工具入口，可降低迁移风险 |
| 保留现有 `workflowNodeRegistry` 作为插件工具聚合层 | 该注册表已经持有 plugin workflow nodes、plugin API、plugin agent tools，是最自然的 Claude 兼容桥接点 |
| workflow 侧不再围绕 `agent_chat` 规划，而是围绕通用 `agent_run`/`agent_exec` 节点能力规划 | 用户目标是执行型 agent，不是聊天型 agent |
| `CLAUDE.md` 作为第一规则源，`rule.md` 作为兼容补充 | 这样既能用 Claude 原生项目规则，又能兼容用户现有目录约定 |
| skills 模块的退场分为三步：停止宣传、移除 UI/IPC、可选迁移历史 skill 内容 | 直接硬删容易造成功能断裂和用户历史数据丢失 |

## Issues Encountered
| Issue | Resolution |
|-------|------------|
| 当前仓库未在本轮扫描中直接找到 skill 主进程 IPC/存储实现 | 规划中明确将“全量删除扫描”和“迁移前核对 skill 数据源”列为实施前置任务 |
| 当前 workflow 侧并无已落地的 agent runtime 可供替换 | 将“替换范围”定义为统一替换现有 chat/agent 内核，并为 workflow 新建执行型节点接入点 |

## Resources
- Claude Agent SDK TypeScript 文档: https://platform.claude.com/docs/en/agent-sdk/typescript
- Claude Agent SDK 仓库: https://github.com/anthropics/claude-agent-sdk-typescript
- 当前主进程代理实现: `/Users/Zhuanz/Documents/work_fox/electron/services/ai-proxy.ts`
- 当前 agent 入口: `/Users/Zhuanz/Documents/work_fox/src/lib/agent/agent.ts`
- 当前 workflow engine: `/Users/Zhuanz/Documents/work_fox/src/lib/workflow/engine.ts`
- 当前插件节点/工具注册表: `/Users/Zhuanz/Documents/work_fox/electron/services/workflow-node-registry.ts`
- 当前 skills UI: `/Users/Zhuanz/Documents/work_fox/src/components/chat/ChatInput.vue`
- planning-with-files 技能说明: `/Users/Zhuanz/Documents/work_fox/.claude/skills/planning-with-files/SKILL.md`

## Visual/Browser Findings
- 无额外图像或 PDF 结果需要转录；本轮关键信息来自本地代码扫描和官方文档搜索。

---
*Update this file after every 2 view/browser/search operations*
*This prevents visual information from being lost*
