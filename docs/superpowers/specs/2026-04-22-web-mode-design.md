# WorkFox Web 模式设计

> 日期：2026-04-22
> 状态：Draft
> 作者：Claude + hunmer

## 目标

让 WorkFox 在浏览器中运行，通过 WebSocket 连接本地 backend 服务，实现与 Electron 版本接近的完整功能。渲染进程代码零改动。

## 设计决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 架构方案 | Browser Adapter 模式 | 渲染进程零改动，类型安全，维护成本低 |
| 部署模式 | 本地 localhost | backend 已是 Node.js 子进程，可独立启动 |
| Backend 扩展 | 在现有 backend 上新增 WS 通道 | 复用已有架构，避免引入新服务 |
| 构建策略 | 单仓库 + 条件编译 | 一套源码，通过不同 Vite 配置区分 Electron/Web |

## 整体架构

```
Renderer (Vue 3) — 共享代码，零改动
  window.api.chat.completions(...)
  window.api.aiProvider.list()
  window.api.on('chat:stream:*', cb)
  wsBridge.invoke(...) / wsBridge.on(...)
         │                         │
Electron 模式              Web 模式
         ▼                         ▼
preload/index.ts           src/web/
  ipcRenderer.invoke         browser-api-adapter.ts
  ipcRenderer.on             ├── chat → WS channel
  contextBridge              ├── aiProvider → WS
                             ├── agentSettings → WS
                             ├── plugin → WS
                             ├── window → no-op / stub
                             └── on → WS events
                             web-entry.ts
                             ├── 注入 window.api
                             └── 启动 Vue app
         │                         │
         ▼                         ▼
Electron Main              Backend (Node.js)
  ipcMain.handle(...)        WS channels:
  claude-agent-runtime         chat:* (新增)
  workflow-store               aiProvider:* (新增)
  plugin-manager               agentSettings:* (新增)
                               plugin:* (新增)
                               chatHistory:* (新增)
                               shortcut:* (新增)
                               tabs:* (新增)
                               + 已有 workflow/*
```

## BrowserAPIAdapter

### 文件结构

```
src/web/
  ├── browser-api-adapter.ts    # 实现 IpcAPI 接口
  ├── web-entry.ts              # Web 模式入口（替代 Electron preload）
  ├── web-event-bus.ts          # 基于 WS 的事件订阅（替代 ipcRenderer.on）
  └── stubs.ts                  # 不可用能力的优雅降级
```

### 核心实现

`BrowserAPIAdapter` 严格实现 `IpcAPI` 接口（定义在 `preload/index.ts`），TypeScript 编译器会在编译时检查方法签名一致性。

### 三类调用路由

| 类型 | 示例 | Web 路由 | 说明 |
|------|------|----------|------|
| 已有 WS 通道 | workflow CRUD, execution | `wsBridge.invoke(channel, data)` | 无需改动 backend |
| 新增 WS 通道 | chat:completions, aiProvider:*, chatHistory:*, plugin:*, agentSettings:*, shortcut:*, tabs:* | `wsBridge.invoke(channel, data)` | backend 需新增 channel handler |
| Electron 独有 | window.minimize/maximize/close, fs.openInExplorer | stub（no-op 或返回空值） | Web 模式下优雅降级 |

### 事件订阅

`window.api.on(channel, callback)` 在 Web 模式下复用 `wsBridge.on(channel, callback)`。chat 流式推送通过 WS event 转发，事件名保持与 Electron IPC channel 一致（如 `chat:stream:text-delta`）。

### Backend 连接

Web 模式下 `BrowserAPIAdapter` 在启动时连接 backend：

```typescript
const savedEndpoint = localStorage.getItem('workfox.backendEndpoint')
const url = savedEndpoint ? JSON.parse(savedEndpoint).url : `ws://${location.hostname}:3001`
await wsBridge.connect(url, token)
```

`window.api.backend.getEndpoint()` 直接返回保存的配置，不经过 IPC。

## Backend WS 通道扩展

### 新增 Channel 清单

| Channel | 原有 IPC | 复杂度 |
|---------|---------|--------|
| `chat:completions` / `chat:abort` | claude-agent-runtime | 高 |
| `chatHistory:*` (10个方法) | chat-history-store | 中 |
| `aiProvider:*` (5个方法) | electron-store | 低 |
| `agentSettings:*` (2个方法) | electron-store | 低 |
| `plugin:list/enable/disable/get-view/get-icon` | plugin-manager | 中 |
| `agent:execTool` | ipcMain.handle | 中 |
| `shortcut:*` (5个方法) | electron-store | 低 |
| `tabs:*` (2个方法) | electron-store | 低 |
| `workflowTool:respond` | ipcMain.handle | 低 |
| `app:getVersion` | ipcMain.handle | 低 |

### Chat 流式推送

Backend 在 `chat:completions` handler 中：
1. 接收请求参数（providerId, modelId, messages, tools, ...）
2. 从服务端配置读取 API key（对应 providerId）
3. 调用 Claude API（流式 SSE）
4. 将每个 SSE 事件转为 WS event 推送到客户端
5. 支持 abort（通过 requestId 取消）

事件名保持一致：`chat:stream:text-delta`、`chat:stream:tool-use`、`chat:stream:thinking` 等。

### 分阶段实现

**P0 — 能跑起来**：
- `aiProvider:*`
- `chat:completions` / `chat:abort`
- `chatHistory:*`
- `app:getVersion`

**P1 — 基本可用**：
- `agentSettings:*`
- `shortcut:*`
- `tabs:*`
- `plugin:list/enable/disable`

**P2 — 完整体验**：
- `plugin:get-view/get-icon`
- `agent:execTool`
- `workflowTool:respond`
- `fs:*`（server-side 代理）

## 构建配置

### package.json 变更

新增 3 个脚本：

```json
"dev:web": "vite --config vite.web.config.ts",
"build:web": "vite build --config vite.web.config.ts",
"preview:web": "vite preview --config vite.web.config.ts"
```

### vite.web.config.ts

使用标准 Vite（不走 electron-vite），复用 renderer 的 alias 和插件配置。关键差异：

- `define: { 'import.meta.env.WEB_MODE': true }`
- `input` 指向 `index-web.html`
- `outDir` 为 `dist-web/`
- 开发时 `server.proxy` 代理 backend WS 和 HTTP

### 入口分离

| 关注点 | Electron | Web |
|--------|---------|-----|
| HTML | `index.html` → `src/main.ts` | `index-web.html` → `src/web/web-entry.ts` |
| `window.api` | preload contextBridge 注入 | `BrowserAPIAdapter` 在 web-entry.ts 注入 |
| 构建 | `electron-vite` | `vite` |
| 输出 | `out/` | `dist-web/` |

## 降级策略

| 能力 | Web 降级方案 |
|------|-------------|
| 窗口控制 | no-op stub，浏览器自有标题栏 |
| 文件系统 | 后端代理，操作服务端文件 |
| `openExternal` | `window.open(url, '_blank')` |
| 插件视图 | 后端返回 HTML 内容或 HTTP URL |
| 插件安装 | `<input type="file">` + HTTP 上传 |
| `workflow:importOpenFile` | `<input type="file">` 读取 JSON |
| `workflow:exportSaveFile` | `<a download>` 触发下载 |
| 全局快捷键 | 仅页面内 keydown 监听 |
| 系统托盘 | 不可用 |

### 后端断连

- 复用 wsBridge 现有重连机制（指数退避，最大 5s）
- 启动时 backend 未就绪：显示连接配置页
- 运行中断连：chat 进行中的请求标记为中断

## 安全

| 风险 | 缓解 |
|------|------|
| backend 无认证 | 仅 localhost；后续可加 token |
| API Key 暴露 | backend 持有 key，前端不接触 |
| WS 无加密 | localhost 无需；远程部署升级 wss:// |
