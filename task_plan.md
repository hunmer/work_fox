# Task Plan: Remove Electron Agent Runtime

## Goal
在移除 Electron 主进程 agent 运行时的前提下，让当前 Electron 下的 agent 功能完全由 backend ChatRuntime 覆盖，并保证运行效果与 Electron 原本 agent 能力一致。

## Current Phase
Phase 1

## Phases
### Phase 1: Requirements & Discovery
- [x] 理解用户目标与约束
- [x] 审阅迁移计划与当前 backend chat/WS 协议现状
- [ ] 审阅 Electron agent runtime/tool 链路并记录能力差异
- **Status:** in_progress

### Phase 2: Backend Agent Capability Parity
- [ ] 为 backend ChatRuntime 补齐工具适配器与 workflow 工具执行器
- [ ] 扩展 interaction bridge 支持 chat_tool
- [ ] 覆盖工具流式事件、multi-turn、abort 与 usage
- **Status:** pending

### Phase 3: Renderer / Client Bridge Migration
- [ ] 切换 renderer agent 请求到 backend WS
- [ ] 注册 client 插件节点与 agent tool schema
- [ ] 通过 interaction bridge 执行 renderer-only 与 client 插件工具
- **Status:** pending

### Phase 4: Electron Cleanup
- [ ] 移除 Electron 主进程 agent runtime/tool 相关实现
- [ ] 收敛 IPC/preload 暴露面，保留必要 fallback
- [ ] 检查多标签页、流式事件、工作流同步不回退
- **Status:** pending

### Phase 5: Verification
- [ ] 运行类型检查与 backend 构建
- [ ] 回归验证 chat、tool call、workflow edit、abort、client plugin agent tool
- [ ] 记录残余风险或未覆盖项
- **Status:** pending

## Key Questions
1. Electron 当前 agent runtime 与 backend chat runtime 在事件、工具、权限和上下文拼装上有哪些实际差异？
2. 哪些工具必须留在 renderer/client 执行，哪些可以完全后端化？
3. 为了保证 Electron 运行效果一致，哪些 stream event 与 state 同步语义必须逐项对齐？

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| 采用分阶段迁移并先补齐 backend 能力再切换 Electron 路由 | 先做能力对齐，再做流量切换，风险更可控，也更容易验证“完美覆盖” |
| 使用项目根目录 planning files 跟踪迁移 | 任务跨度大、涉及多端与多阶段，需要持久化上下文 |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
|       | 1       |            |

## Notes
- 用户要求不是单纯“去掉 Electron”，而是确保 Electron 下现有 agent 体验和能力由 backend 100% 接管。
- `public/workfox-backend-endpoint.json` 已有未提交改动，当前任务中避免覆盖。
