# Findings & Decisions

## Requirements
- 执行 `.claude/plans/elegant-mapping-toast.md` 中的 Electron agent 能力迁移计划。
- 移除 Electron 主进程中的 agent 运行时能力。
- 确保当前 Electron 下 agent 功能完美覆盖 server 下 agent 功能。
- 确保迁移后 Electron 中 agent 的运行效果与原本 Electron agent 能力一致，包括流式输出、工具调用、工作流编辑、abort、usage、多标签页等。

## Research Findings
- `backend/chat/chat-runtime.ts` 目前还是初始版本，只支持纯文本流式、thinking、usage、done/error、abort，没有工具支持，也没有完整的 stream event bridge。
- `backend/ws/chat-channels.ts` 当前只注册了 `chat:completions` 和 `chat:abort` 两个 WS 通道，尚未覆盖 client 节点/工具注册等迁移计划中的通道。
- `shared/ws-protocol.ts` 的 `InteractionType` 当前没有 `chat_tool`，说明 renderer-only 工具和 client 插件工具还没有统一桥接路径。
- 工作区当前存在未提交变更：`public/workfox-backend-endpoint.json`；另外 `.claude/plans/` 是未跟踪目录，当前任务不应误改用户既有文件。
- `electron/services/claude-agent-runtime.ts` 是当前 Electron agent 行为基线，已包含：
  - rule.md / 自定义规则加载
  - 内置工具权限模式与目录解析
  - MCP tool adapter 注入
  - `chat:chunk` / `chat:tool-call` / `chat:tool-call-args` / `chat:tool-result` / `chat:thinking` / `chat:usage` / `chat:retry` / `chat:done` / `chat:error` 事件桥接
  - abort 时清理运行中 query 和 pending renderer tools
- `electron/services/claude-tool-adapter.ts` 当前把 agent 工具分为三类：
  - `workfox_workflow`: 工作流编辑工具
  - `workfox_browser`: 浏览器工具发现与少量运行时工具
  - `workfox_plugin`: 插件提供的 agent tools
- `electron/services/workflow-tool-executor.ts` 当前已承担工作流编辑核心能力，包含节点类型聚合、搜索、变更持久化、自动布局，以及 `workflow:updated` 通知 renderer。
- `src/lib/agent/agent.ts` 与 `src/lib/agent/stream.ts` 当前仍明确绑定 `window.api.chat` 和 IPC 事件源，还没有统一走 WS bridge。

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| 以 Electron 现有 `claude-agent-runtime` / `claude-tool-adapter` / `workflow-tool-executor` 为功能基准迁移到 backend | 用户要求 Electron 效果保持一致，最可靠的方式是按现有 Electron 行为逐项对齐 |
| 后续验证以“事件语义一致 + 工具覆盖一致 + Electron 路由切换后行为一致”为标准 | 仅能跑通不足以证明能力覆盖，需要对齐事件与工具行为 |
| backend 迁移不能只实现 `chat:completions` 成功返回，还必须完整复刻 Electron 的细粒度流式事件 | renderer 现有 chat UI 已依赖这些事件更新 token、tool call、thinking 和 usage 状态 |

## Issues Encountered
| Issue | Resolution |
|-------|------------|
| backend chat 实现明显落后于 Electron agent runtime | 先完整梳理 Electron 基线能力，再落 backend parity 实现 |

## Resources
- 迁移计划: `/Users/Zhuanz/Documents/work_fox/.claude/plans/elegant-mapping-toast.md`
- backend chat runtime: `/Users/Zhuanz/Documents/work_fox/backend/chat/chat-runtime.ts`
- backend chat WS channels: `/Users/Zhuanz/Documents/work_fox/backend/ws/chat-channels.ts`
- shared WS protocol: `/Users/Zhuanz/Documents/work_fox/shared/ws-protocol.ts`

## Visual/Browser Findings
- 无
