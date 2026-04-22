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
  window.api.on('chat:chunk', cb)
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
                             └── on → wsBridge.on wrapper
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
                               chatHistory:* (新增)
                               plugin:* (新增/已有)
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

**类型引用方式**：`browser-api-adapter.ts` 通过 `import type { IpcAPI } from '../../preload/index'` 引用接口定义。在 web Vite 构建中，preload 目录的 TS 文件可被解析（仅消费类型，不执行 electron 依赖的运行时代码）。需要在 `vite.web.config.ts` 的 `resolve.alias` 或 `tsconfig.web.json` 中确保 preload 路径可达。

### 三类调用路由

| 类型 | 示例 | Web 路由 | 说明 |
|------|------|----------|------|
| 已有 WS 通道 | workflow CRUD, execution, plugin:list/enable/disable | `wsBridge.invoke(channel, data)` | backend 已有 handler |
| 新增 WS 通道 | chat:completions, aiProvider:*, chatHistory:*, agentSettings:*, shortcut:*, tabs:* | `wsBridge.invoke(channel, data)` | backend 需新增 channel handler |
| Electron 独有 | window.minimize/maximize/close, plugin.openFolder | stub（no-op 或返回空值） | Web 模式下优雅降级 |

### 事件订阅

`window.api.on(channel, callback)` 返回 `() => void`（取消监听函数）。`wsBridge.on()` 返回 `void`，需要调用 `wsBridge.off()` 取消。`BrowserAPIAdapter.on()` 封装这个差异：

```typescript
on(channel: string, callback: (...args: any[]) => void): () => void {
  wsBridge.on(channel, callback)
  return () => wsBridge.off(channel, callback)
}
```

### 完整 IPC 方法映射

以下是 `preload/index.ts` 中 `api` 对象所有方法的 Web 路由归类：

**WS channel（需新增 handler）**：

| 命名空间 | 方法 | 目标 Channel |
|---------|------|-------------|
| `chat` | completions, abort | `chat:completions`, `chat:abort` |
| `chatHistory` | listSessions, createSession, updateSession, deleteSession, listMessages, addMessage, updateMessage, deleteMessage, deleteMessages, clearMessages | `chatHistory:*` |
| `aiProvider` | list, create, update, delete, test | `aiProvider:*` |
| `agentSettings` | get, set | `agentSettings:*` |
| `shortcut` | list, update, toggle, clear, reset | `shortcut:*` |
| `tabs` | load, save | `tabs:*` |
| `agent` | execTool | `agent:execTool` |
| `workflowTool` | respond | `workflowTool:respond` |
| `fs` | listDir, delete, createFile, createDir, rename | `fs:*` |
| `backend` | getEndpoint, getStatus | 直接返回本地配置（见下方） |
| — | getAppVersion | `app:getVersion` |

**已有 WS channel（无需改动）**：

| 命名空间 | 方法 |
|---------|------|
| `plugin` | list, enable, disable, install, uninstall |

注意：`plugin.getWorkflowNodes`、`plugin.listWorkflowPlugins`、`plugin.getAgentTools` 不在 `preload/index.ts` 的 `api.plugin` 对象中，它们在渲染进程中直接通过 `wsBridge.invoke()` 调用，不经过 `window.api`，因此不需要 `BrowserAPIAdapter` 映射。

**Electron 独有 → stub**：

| 命名空间 | 方法 | 降级策略 |
|---------|------|---------|
| `window` | minimize, maximize, close | `() => {}`（同步 no-op，匹配 `ipcRenderer.send` 语义） |
| `window` | isMaximized | `() => Promise.resolve(false)` |
| `plugin` | importZip | 显示提示"请在桌面版中使用"或通过 HTTP 上传 |
| `plugin` | openFolder | 显示提示"请在桌面版中使用" |
| `plugin` | getView, getIcon | 通过 WS channel 返回资源 URL（P2） |
| `workflow` | importOpenFile | `<input type="file">` 读取 JSON（P2） |
| `workflow` | exportSaveFile | `<a download>` 触发下载（P2） |
| `fs` | openInExplorer | 显示提示"请在桌面版中使用" |
| — | openExternal | `window.open(url, '_blank')` |

**`backend` 命名空间特殊处理**：
- `getEndpoint()` → 返回 `localStorage` 中保存的配置（Web 模式下启动时已配置）
- `getStatus()` → 返回 `{ running: wsBridge 连接状态, url: 当前 endpoint }`

### WS 错误转换

Electron `ipcRenderer.invoke` 在 handler 抛出异常时会 reject Promise。WS 错误返回 `WSError` 格式（`{ type: 'error', error: { code, message } }`）。`BrowserAPIAdapter` 需要将 WS 错误转为标准 Error reject：

```typescript
// 在 wsBridge.invoke 基础上封装错误转换
async invoke(channel: string, ...args: any[]): Promise<any> {
  try {
    return await wsBridge.invoke(channel, constructRequest(channel, args))
  } catch (error) {
    // WS 错误已经是 Error 实例（wsBridge 内部 reject(new Error(...))）
    throw error
  }
}
```

### Backend 连接

Web 模式下 `BrowserAPIAdapter` 在启动时连接 backend：

```typescript
const savedEndpoint = localStorage.getItem('workfox.backendEndpoint')
const url = savedEndpoint ? JSON.parse(savedEndpoint).url : `ws://${location.hostname}:3001`
const token = savedEndpoint ? JSON.parse(savedEndpoint).token : ''
await wsBridge.connect(url, token)
```

**重要约束**：Web 模式下 `wsBridge.connect()` **必须**显式传入 `url` 和 `token` 参数，不能依赖 `window.api.backend.getEndpoint()` 的回退逻辑（`ws-bridge.ts` 第50-51行），否则会产生循环依赖。`web-entry.ts` 在调用 `connect()` 前从 `localStorage` 读取配置，避免了这个问题。

## Backend WS 通道扩展

### 新增 Channel 清单

需要在 `shared/channel-contracts.ts` 的 `BackendChannelMap` 中新增以下 channel 类型契约：

| Channel | 原有 IPC | 复杂度 |
|---------|---------|--------|
| `chat:completions` / `chat:abort` | claude-agent-runtime | 高 |
| `chatHistory:listSessions` 等 (10个) | chat-history-store | 中 |
| `aiProvider:list/create/update/delete/test` | electron-store | 低 |
| `agentSettings:get/set` | electron-store | 低 |
| `shortcut:list/update/toggle/clear/reset` | electron-store | 低 |
| `tabs:load/save` | electron-store | 低 |
| `agent:execTool` | ipcMain.handle | 中 |
| `workflowTool:respond` | ipcMain.handle | 低 |
| `app:getVersion` | ipcMain.handle | 低 |
| `fs:listDir/delete/createFile/createDir/rename` | Node.js fs | 低 |

已在 `BackendChannelMap` 中存在、可直接复用的 channel：

- `plugin:list`, `plugin:enable`, `plugin:disable`, `plugin:install`, `plugin:uninstall`
- `plugin:get-workflow-nodes`, `plugin:list-workflow-plugins`, `plugin:get-agent-tools`
- 所有 `workflow:*`, `workflowFolder:*`, `workflowVersion:*`, `executionLog:*`, `operationHistory:*`

### Chat 流式推送

#### 实际事件名（来自 `claude-agent-runtime.ts` 和 `src/lib/agent/stream.ts`）

| 事件名 | 数据 | 方向 |
|--------|------|------|
| `chat:chunk` | `{ requestId, token }` | 流式文本 |
| `chat:tool-call` | `{ requestId, toolCall }` | 工具调用开始 |
| `chat:tool-call-args` | `{ requestId, toolUseId, args }` | 工具调用参数 |
| `chat:tool-result` | `{ requestId, toolUseId, name, result }` | 工具执行结果 |
| `chat:thinking` | `{ requestId, content, index }` | Thinking block |
| `chat:usage` | `{ requestId, inputTokens, outputTokens }` | Token 使用量 |
| `chat:done` | `{ requestId, usage? }` | 完成 |
| `chat:error` | `{ requestId, error }` | 错误 |
| `chat:retry` | `{ requestId, attempt, maxRetries, delayMs, status, error }` | 重试 |

#### Backend Chat 实现路径

Chat 功能的核心挑战是 `claude-agent-runtime.ts` 使用了 `@anthropic-ai/claude-agent-sdk`（含平台特定二进制包 `@anthropic-ai/claude-agent-sdk-{platform}-{arch}`）和 `BrowserWindow`。

**实现策略：将 `claude-agent-runtime` 的核心逻辑迁移到 backend**：

1. `@anthropic-ai/claude-agent-sdk` 是纯 Node.js 包，可以直接在 backend 中使用
2. 将 `claude-agent-runtime.ts` 的流式处理逻辑提取为独立的 `backend-chat-runtime.ts`，移除 `BrowserWindow` 依赖
3. 流式事件通过 `ConnectionManager.sendToClient(clientId, event)` 定向推送（而非 `emit` 广播）
4. `claude-tool-adapter.ts` 和 `workflow-tool-dispatcher.ts` 的职责由 backend 的 interaction bridge 承接（已有 `interaction_required` / `interaction_response` 机制）

**具体流程**：
1. 客户端发送 `chat:completions` WS request，携带 `requestId`
2. Backend handler 从服务端存储读取 provider 的 API key（通过 `aiProvider:list` 共享同一份配置）
3. Backend 调用 `claude-agent-sdk` 的 `query()` 流式 API
4. 每个 SSE 事件转为 `WSEvent`，通过 `sendToClient(clientId, { channel: 'chat:chunk', type: 'event', data })` 推送
5. 客户端 `wsBridge.on('chat:chunk', callback)` 接收
6. Abort 通过客户端发送 `chat:abort` channel 实现，backend 端调用 `AbortController.abort()`

#### WS Event 的 requestId 关联

每个 chat 流式 event 的 `data` 中都包含 `requestId`，客户端在 `listenToChatStream` 中按 `requestId` 过滤（已在 `src/lib/agent/stream.ts` 中实现）。Backend 需确保每个推送的 event data 中携带对应的 `requestId`。

#### API Key 管理

`aiProvider:*` channel handler 在 backend 中存储 provider 配置（包含 API key）。Chat handler 通过 providerId 查询对应的 API key 和 base URL。Electron 模式和 Web 模式共享同一份 provider 数据（存储在 backend 的数据目录中）。

### 分阶段实现

**P0 — 能跑起来**：
- `aiProvider:*`（Chat 的前置依赖）
- `chat:completions` / `chat:abort` + 流式推送
- `chatHistory:*`
- `app:getVersion`
- 验证：`pnpm dev:web` 能启动，能发送 Chat 消息并收到流式回复

**P1 — 基本可用**：
- `agentSettings:*`
- `shortcut:*`
- `tabs:*`
- `plugin:list/enable/disable/install/uninstall`
- `fs:*`

**P2 — 完整体验**：
- `plugin:get-view/get-icon`
- `agent:execTool`
- `workflowTool:respond`
- `workflow:importOpenFile/exportSaveFile`（Web 适配）

## 构建配置

### package.json 变更

在 `scripts` 中新增 3 个脚本：

```json
"dev:web": "vite --config vite.web.config.ts",
"build:web": "vite build --config vite.web.config.ts",
"preview:web": "vite preview --config vite.web.config.ts"
```

### vite.web.config.ts

使用标准 Vite（不走 electron-vite），复用 renderer 的 alias 和插件配置。关键差异：

```typescript
import { resolve } from 'path'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  root: '.',
  define: {
    __WEB_MODE__: JSON.stringify(true),
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@shared': resolve(__dirname, 'shared'),
      'vue': 'vue/dist/vue.esm-bundler.js',
      // preload 类型引用需要路径可达
      '../../preload/index': resolve(__dirname, 'preload/index.ts'),
    },
  },
  plugins: [vue(), tailwindcss()],
  build: {
    outDir: 'dist-web',
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index-web.html'),
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
```

### index-web.html

```html
<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>WorkFox</title>
  </head>
  <body>
    <div id="stream-markdown-overlay"></div>
    <div id="app"></div>
    <script type="module" src="/src/web/web-entry.ts"></script>
  </body>
</html>
```

### web-entry.ts 实现策略

`web-entry.ts` **不导入** `src/main.ts`（因为 `main.ts` 中可能间接引用 Electron 类型）。它复制 `main.ts` 的初始化流程，但在启动 Vue app 之前注入 `BrowserAPIAdapter`：

```typescript
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from '../App.vue'
import router from '../router'
import { wsBridge } from '../lib/ws-bridge'
import { BrowserAPIAdapter } from './browser-api-adapter'

import '../styles/globals.css'
import { useThemeStore } from '../stores/theme'

async function bootstrap() {
  // 1. 注入 window.api（替代 Electron preload 的 contextBridge）
  const endpoint = loadSavedEndpoint()
  const adapter = new BrowserAPIAdapter(wsBridge, endpoint)
  ;(window as any).api = adapter

  // 2. 连接 backend
  await wsBridge.connect(endpoint.url, endpoint.token)

  // 3. 启动 Vue app（与 Electron 模式共享初始化逻辑）
  const pinia = createPinia()
  const app = createApp(App).use(pinia).use(router)
  useThemeStore()
  app.mount('#app')
}

function loadSavedEndpoint() {
  try {
    const saved = localStorage.getItem('workfox.backendEndpoint')
    if (saved) return JSON.parse(saved)
  } catch {}
  return {
    url: `ws://${location.hostname}:3001`,
    token: '',
  }
}

bootstrap().catch((error) => {
  console.error('Web bootstrap failed:', error)
  // 连接失败时仍挂载 Vue app，显示连接配置页
  // App.vue 的 PluginStore/AIProviderStore init 会优雅处理 api 不可用的情况
  const pinia = createPinia()
  const app = createApp(App).use(pinia).use(router)
  useThemeStore()
  app.mount('#app')
})
```

### TypeScript 配置

Web 构建使用 `tsconfig.web.json`（已有）。需确保：
- `preload/index.ts` 的类型导出可以被 `src/web/` 引用（通过路径别名或 `references`）
- `electron/` 目录不被包含在 web 构建的 TypeScript 编译中

可通过在 `tsconfig.web.json` 中添加 paths 映射解决：

```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"],
      "@shared/*": ["./shared/*"]
    }
  },
  "include": ["src/**/*.ts", "src/**/*.vue", "preload/index.ts", "shared/**/*.ts"]
}
```

### 入口分离

| 关注点 | Electron | Web |
|--------|---------|-----|
| HTML | `index.html` → `src/main.ts` | `index-web.html` → `src/web/web-entry.ts` |
| `window.api` | preload contextBridge 注入 | `BrowserAPIAdapter` 在 web-entry.ts 注入 |
| 构建 | `electron-vite` (main+preload+renderer) | `vite` (仅 renderer) |
| 输出 | `out/` | `dist-web/` |

## 降级策略

| 能力 | Web 降级方案 |
|------|-------------|
| 窗口控制 (minimize/maximize/close) | 同步 no-op `() => {}`（匹配 `ipcRenderer.send` 语义） |
| 窗口控制 (isMaximized) | `Promise.resolve(false)` |
| 文件系统 | 后端代理，操作服务端文件 |
| `openExternal` | `window.open(url, '_blank')` |
| 插件视图 | 后端返回 HTML 内容或 HTTP URL（P2） |
| 插件安装/卸载 | `plugin:install` / `plugin:uninstall` WS channel（已有） |
| `plugin.importZip` | 显示提示"请在桌面版使用"，或 P2 通过 HTTP 上传 |
| `plugin.openFolder` | 显示提示"请在桌面版使用" |
| `workflow:importOpenFile` | `<input type="file">` 读取 JSON（P2） |
| `workflow:exportSaveFile` | `<a download>` 触发下载（P2） |
| `fs.openInExplorer` | 显示提示"请在桌面版使用" |
| 全局快捷键 | 仅页面内 keydown 监听 |
| 系统托盘 | 不可用 |

### 后端断连

- 复用 wsBridge 现有重连机制（指数退避，最大 5s）
- 启动时 backend 未就绪：显示连接配置页，让用户输入 backend 地址和 token
- 运行中断连：chat 进行中的请求标记为中断

## 安全

| 风险 | 缓解 |
|------|------|
| backend 认证 | Backend 已有 `sessionToken` 验证机制（`ConnectionManager` 校验 `token` query param）。Web 模式复用此机制 |
| API Key 暴露 | backend 持有 provider API key，前端不接触。Chat 请求只传 `providerId` |
| WS 无加密 | localhost 场景无需 TLS；远程部署时升级 `wss://` |
| CORS | Backend HTTP 端需配置 CORS 允许 localhost:5173（开发模式） |

## 验证策略

### 编译时类型检查

`BrowserAPIAdapter implements IpcAPI` — TS 编译器会检查每个方法签名一致性。漏实现任何方法会直接编译报错。

```bash
# 验证类型安全
pnpm exec tsc -p tsconfig.web.json --noEmit
```

### 阶段验收

**P0 验证**：
```bash
# 1. 编译通过
pnpm exec tsc -p tsconfig.web.json --noEmit

# 2. Web 构建成功
pnpm build:web

# 3. 启动 backend + web 前端
pnpm dev:backend  # 终端 1
pnpm dev:web      # 终端 2

# 4. 浏览器访问 localhost:5173，验证：
#    - 能配置 backend 连接
#    - 能创建/选择 AI Provider
#    - 能发送 Chat 消息并收到流式回复
#    - Chat 历史可以持久化和加载
```

**P1/P2 验证**：逐个功能对比 Electron 版本，确认 Web 版行为一致。
