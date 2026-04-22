# Web 基础设施实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 创建 Web 模式的构建配置、入口文件和 BrowserAPIAdapter，使 `pnpm dev:web` 能启动浏览器版 WorkFox。

**Architecture:** 新增 `vite.web.config.ts` 使用标准 Vite 构建渲染进程代码；新增 `src/web/` 目录包含 BrowserAPIAdapter（实现 IpcAPI 接口）、web-entry（替代 Electron preload 注入 window.api）、stubs（Electron 独有能力降级）。渲染进程代码零改动。

**Tech Stack:** Vite 6.x, TypeScript 5.7.x, Vue 3.5.x

**Spec:** `docs/superpowers/specs/2026-04-22-web-mode-design.md`

**Depends on:** 无（本计划是其他两个计划的前置条件）

---

## 文件变更清单

| 操作 | 文件 | 职责 |
|------|------|------|
| Create | `vite.web.config.ts` | Web 模式 Vite 构建配置 |
| Create | `index-web.html` | Web 模式 HTML 入口 |
| Create | `src/web/stubs.ts` | Electron 独有能力 stub |
| Create | `src/web/browser-api-adapter.ts` | IpcAPI 的 WS 适配实现 |
| Create | `src/web/web-entry.ts` | Web 模式启动入口 |
| Modify | `package.json:8-18` | 添加 dev:web / build:web / preview:web 脚本 |
| Modify | `tsconfig.web.json` | 确保 preload 类型可达 |

---

### Task 1: 创建 vite.web.config.ts

**Files:**
- Create: `vite.web.config.ts`

- [ ] **Step 1: 创建 Web Vite 配置**

```typescript
// vite.web.config.ts
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
      // 确保 browser-api-adapter.ts 可以 import type from '../../preload/index'
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

- [ ] **Step 2: Commit**

```bash
git add vite.web.config.ts
git commit -m "feat(web): add vite config for web mode build"
```

---

### Task 2: 创建 index-web.html

**Files:**
- Create: `index-web.html`

- [ ] **Step 1: 创建 Web HTML 入口**

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

- [ ] **Step 2: Commit**

```bash
git add index-web.html
git commit -m "feat(web): add web mode HTML entry"
```

---

### Task 3: 更新 package.json 和 tsconfig

**Files:**
- Modify: `package.json:8-18`
- Modify: `tsconfig.web.json`

- [ ] **Step 1: 在 package.json scripts 中添加 Web 命令**

在 `"scripts"` 对象中，`"build"` 行之前添加：

```json
"dev:web": "vite --config vite.web.config.ts",
"build:web": "vite build --config vite.web.config.ts",
"preview:web": "vite preview --config vite.web.config.ts",
```

- [ ] **Step 2: 更新 tsconfig.web.json 确保 preload 类型可达**

读取当前 `tsconfig.web.json`，在 `include` 数组中添加 `"preload/index.ts"`，确保 `src/web/browser-api-adapter.ts` 可以引用 `IpcAPI` 类型。

- [ ] **Step 3: 验证构建配置**

```bash
cd G:/programming/nodejs/work_fox && pnpm dev:web -- --version
```

Expected: Vite 版本号输出，无错误。

- [ ] **Step 4: Commit**

```bash
git add package.json tsconfig.web.json
git commit -m "feat(web): add dev:web/build:web scripts and tsconfig paths"
```

---

### Task 4: 创建 stubs.ts

**Files:**
- Create: `src/web/stubs.ts`

- [ ] **Step 1: 创建 Electron 独有能力 stub**

```typescript
// src/web/stubs.ts

/** 同步 no-op（匹配 ipcRenderer.send 语义） */
export const syncNoop = (): void => {}

/** 异步 no-op，返回指定值 */
export const asyncNoop = <T>(value: T): (() => Promise<T>) => {
  return () => Promise.resolve(value)
}

/** 不可用操作，返回 Promise.reject 并提示 */
export const notAvailable = (feature: string) => (): Promise<never> => {
  return Promise.reject(new Error(`"${feature}" 仅在桌面版中可用`))
}
```

- [ ] **Step 2: Commit**

```bash
git add src/web/stubs.ts
git commit -m "feat(web): add stubs for Electron-only capabilities"
```

---

### Task 5: 创建 browser-api-adapter.ts（第一部分：框架 + chat/backend/aiProvider）

**Files:**
- Create: `src/web/browser-api-adapter.ts`

此文件实现 `IpcAPI` 接口，较大。按功能分两步写入。

- [ ] **Step 1: 创建 adapter 框架 + 高优先级命名空间**

读取 `preload/index.ts` 确认 `IpcAPI` 类型导出。

创建 `src/web/browser-api-adapter.ts`，结构如下：

```typescript
// src/web/browser-api-adapter.ts
import type { IpcAPI } from '../../preload/index'
import type { WSBridge } from '../lib/ws-bridge'
import { syncNoop, asyncNoop, notAvailable } from './stubs'

interface EndpointConfig {
  url: string
  token: string
}

/**
 * 浏览器模式下 window.api 的替代实现。
 * 将所有 IPC 调用路由到 backend WebSocket 通道。
 */
export class BrowserAPIAdapter implements IpcAPI {
  private ws: WSBridge
  private endpoint: EndpointConfig

  constructor(ws: WSBridge, endpoint: EndpointConfig) {
    this.ws = ws
    this.endpoint = endpoint
  }

  // --- Chat ---
  chat = {
    completions: async (params: any): Promise<{ started: boolean }> => {
      const result = await this.ws.invoke('chat:completions' as any, params)
      return result as { started: boolean }
    },
    abort: async (requestId: string): Promise<{ aborted: boolean }> => {
      const result = await this.ws.invoke('chat:abort' as any, { requestId })
      return result as { aborted: boolean }
    },
  }

  // --- Chat History ---
  chatHistory = {
    listSessions: async (workflowId: string) =>
      this.ws.invoke('chatHistory:listSessions' as any, { workflowId }),
    createSession: async (workflowId: string, session: any) =>
      this.ws.invoke('chatHistory:createSession' as any, { workflowId, session }),
    updateSession: async (workflowId: string, sessionId: string, updates: any) =>
      this.ws.invoke('chatHistory:updateSession' as any, { workflowId, sessionId, updates }),
    deleteSession: async (workflowId: string, sessionId: string) =>
      this.ws.invoke('chatHistory:deleteSession' as any, { workflowId, sessionId }),
    listMessages: async (workflowId: string, sessionId: string) =>
      this.ws.invoke('chatHistory:listMessages' as any, { workflowId, sessionId }),
    addMessage: async (workflowId: string, sessionId: string, message: any) =>
      this.ws.invoke('chatHistory:addMessage' as any, { workflowId, sessionId, message }),
    updateMessage: async (workflowId: string, sessionId: string, messageId: string, updates: any) =>
      this.ws.invoke('chatHistory:updateMessage' as any, { workflowId, sessionId, messageId, updates }),
    deleteMessage: async (workflowId: string, sessionId: string, messageId: string) =>
      this.ws.invoke('chatHistory:deleteMessage' as any, { workflowId, sessionId, messageId }),
    deleteMessages: async (workflowId: string, sessionId: string, messageIds: string[]) =>
      this.ws.invoke('chatHistory:deleteMessages' as any, { workflowId, sessionId, messageIds }),
    clearMessages: async (workflowId: string, sessionId: string) =>
      this.ws.invoke('chatHistory:clearMessages' as any, { workflowId, sessionId }),
  }

  // --- AI Provider ---
  aiProvider = {
    list: async () => this.ws.invoke('aiProvider:list' as any, undefined),
    create: async (data: any) => this.ws.invoke('aiProvider:create' as any, { data }),
    update: async (data: { id: string; [key: string]: any }) =>
      this.ws.invoke('aiProvider:update' as any, { id: data.id, data }),
    delete: async (id: string) => this.ws.invoke('aiProvider:delete' as any, { id }),
    test: async (id: string) => this.ws.invoke('aiProvider:test' as any, { id }),
  }

  // --- Backend (直接返回本地配置) ---
  backend = {
    getEndpoint: async (): Promise<{ url: string; token: string }> => ({
      url: this.endpoint.url,
      token: this.endpoint.token,
    }),
    getStatus: async (): Promise<{ running: boolean; url?: string; pid?: number; error?: string }> => ({
      running: this.ws.isConnected(),
      url: this.endpoint.url,
    }),
  }

  // --- App Version ---
  getAppVersion = async (): Promise<string> => {
    const result = await this.ws.invoke('app:getVersion' as any, undefined)
    return (result as any).version ?? '0.0.0'
  }
```

注意：这里引用了 `this.ws.isConnected()`，需要确认 `WSBridge` 是否有此方法。如果没有，后续需添加。

- [ ] **Step 2: Commit**

```bash
git add src/web/browser-api-adapter.ts
git commit -m "feat(web): add BrowserAPIAdapter with chat/provider/backend namespaces"
```

---

### Task 6: 补全 browser-api-adapter.ts（第二部分：其余命名空间）

**Files:**
- Modify: `src/web/browser-api-adapter.ts`

- [ ] **Step 1: 在 class 内追加剩余命名空间**

在 `getAppVersion` 属性之后，继续在 `BrowserAPIAdapter` class 内添加：

```typescript
  // --- Agent Settings ---
  agentSettings = {
    get: async () => this.ws.invoke('agentSettings:get' as any, undefined),
    set: async (settings: any) => this.ws.invoke('agentSettings:set' as any, { settings }),
  }

  // --- Shortcut ---
  shortcut = {
    list: async () => this.ws.invoke('shortcut:list' as any, undefined),
    update: async (id: string, accelerator: string, isGlobal: boolean, enabled?: boolean) =>
      this.ws.invoke('shortcut:update' as any, { id, accelerator, isGlobal, enabled }),
    toggle: async (id: string, enabled: boolean) =>
      this.ws.invoke('shortcut:toggle' as any, { id, enabled }),
    clear: async (id: string) => this.ws.invoke('shortcut:clear' as any, { id }),
    reset: async () => this.ws.invoke('shortcut:reset' as any, undefined),
  }

  // --- Tabs ---
  tabs = {
    load: async () => this.ws.invoke('tabs:load' as any, undefined),
    save: async (data: { tabs: any[]; activeTabId: string | null }) =>
      this.ws.invoke('tabs:save' as any, data),
  }

  // --- Agent Tool ---
  agent = {
    execTool: async (toolType: string, params: Record<string, any>, targetTabId?: string) =>
      this.ws.invoke('agent:execTool' as any, { toolType, params, targetTabId }),
  }

  // --- Workflow Tool ---
  workflowTool = {
    respond: async (requestId: string, result: unknown): Promise<{ resolved: boolean }> => {
      const res = await this.ws.invoke('workflowTool:respond' as any, { requestId, result })
      return res as { resolved: boolean }
    },
  }

  // --- Plugin (已有 WS channel) ---
  plugin = {
    list: () => this.ws.invoke('plugin:list' as any, undefined),
    enable: (id: string) => this.ws.invoke('plugin:enable' as any, { id }),
    disable: (id: string) => this.ws.invoke('plugin:disable' as any, { id }),
    getView: async (id: string) => this.ws.invoke('plugin:get-view' as any, { id }),
    getIcon: async (id: string) => this.ws.invoke('plugin:get-icon' as any, { id }),
    importZip: notAvailable('plugin.importZip'),
    openFolder: notAvailable('plugin.openFolder'),
    install: (url: string) => this.ws.invoke('plugin:install' as any, { url }),
    uninstall: (id: string) => this.ws.invoke('plugin:uninstall' as any, { id }),
  }

  // --- Workflow (部分走已有 WS，部分降级) ---
  workflow = {
    importOpenFile: notAvailable('workflow.importOpenFile'),
    exportSaveFile: notAvailable('workflow.exportSaveFile'),
  }

  // --- File System ---
  fs = {
    listDir: async (dirPath: string) =>
      this.ws.invoke('fs:listDir' as any, { dirPath }),
    delete: async (targetPath: string) =>
      this.ws.invoke('fs:delete' as any, { targetPath }),
    createFile: async (filePath: string) =>
      this.ws.invoke('fs:createFile' as any, { filePath }),
    createDir: async (dirPath: string) =>
      this.ws.invoke('fs:createDir' as any, { dirPath }),
    openInExplorer: notAvailable('fs.openInExplorer'),
    rename: async (oldPath: string, newName: string) =>
      this.ws.invoke('fs:rename' as any, { oldPath, newName }),
  }

  // --- Window (Electron 独有 → stub) ---
  window = {
    minimize: syncNoop,
    maximize: syncNoop,
    close: syncNoop,
    isMaximized: asyncNoop(false),
  }

  // --- Shell ---
  openExternal = async (url: string): Promise<void> => {
    window.open(url, '_blank')
  }

  // --- 事件订阅（封装 wsBridge.on/off 为返回 unsubscribe） ---
  on(channel: string, callback: (...args: any[]) => void): () => void {
    const handler = (data: unknown) => callback(data)
    this.ws.on(channel, handler)
    return () => this.ws.off(channel, handler)
  }
}
```

- [ ] **Step 2: 验证类型**

```bash
cd G:/programming/nodejs/work_fox && pnpm exec tsc -p tsconfig.web.json --noEmit 2>&1 | head -30
```

Expected: 无与 `browser-api-adapter.ts` 相关的类型错误。如果有 `IpcAPI` 接口不匹配的错误，按错误提示修正方法签名。

- [ ] **Step 3: Commit**

```bash
git add src/web/browser-api-adapter.ts
git commit -m "feat(web): complete BrowserAPIAdapter with all IpcAPI namespaces"
```

---

### Task 7: 为 WSBridge 添加 isConnected 辅助方法

**Files:**
- Modify: `src/lib/ws-bridge.ts`

- [ ] **Step 1: 在 WSBridge 类中添加 isConnected getter**

在 `src/lib/ws-bridge.ts` 的 `WSBridge` 类中，`disconnect()` 方法之后添加：

```typescript
  /** 当前 WS 连接是否活跃 */
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN
  }
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/ws-bridge.ts
git commit -m "feat(ws-bridge): add isConnected helper for web mode"
```

---

### Task 8: 创建 web-entry.ts

**Files:**
- Create: `src/web/web-entry.ts`

- [ ] **Step 1: 创建 Web 模式启动入口**

```typescript
// src/web/web-entry.ts
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from '../App.vue'
import router from '../router'
import { wsBridge } from '../lib/ws-bridge'
import { BrowserAPIAdapter } from './browser-api-adapter'

import '../styles/globals.css'
import { useThemeStore } from '../stores/theme'

function loadSavedEndpoint() {
  try {
    const saved = localStorage.getItem('workfox.backendEndpoint')
    if (saved) return JSON.parse(saved) as { url: string; token: string }
  } catch { /* ignore */ }
  return {
    url: `ws://${location.hostname}:3001`,
    token: '',
  }
}

function mountApp() {
  const pinia = createPinia()
  const app = createApp(App).use(pinia).use(router)
  useThemeStore()
  app.mount('#app')
}

async function bootstrap() {
  // 1. 注入 window.api（替代 Electron preload 的 contextBridge）
  const endpoint = loadSavedEndpoint()
  const adapter = new BrowserAPIAdapter(wsBridge, endpoint)
  ;(window as any).api = adapter

  // 2. 连接 backend（必须显式传参，避免循环依赖）
  await wsBridge.connect(endpoint.url, endpoint.token)

  // 3. 启动 Vue app
  mountApp()
}

bootstrap().catch((error) => {
  console.error('Web bootstrap failed:', error)
  // 连接失败仍挂载 app，让 UI 显示连接状态
  const endpoint = loadSavedEndpoint()
  ;(window as any).api = new BrowserAPIAdapter(wsBridge, endpoint)
  mountApp()
})
```

- [ ] **Step 2: 验证 dev:web 能启动**

```bash
cd G:/programming/nodejs/work_fox && timeout 15 pnpm dev:web 2>&1 || true
```

Expected: Vite 启动日志，显示 `localhost:5173`。浏览器打开后应看到 Vue app 挂载（但连接 backend 会失败，因为还没有 channel handler — 这是预期的）。

- [ ] **Step 3: Commit**

```bash
git add src/web/web-entry.ts
git commit -m "feat(web): add web entry point with BrowserAPIAdapter bootstrap"
```

---

## 验收标准

- [ ] `pnpm dev:web` 能启动 Vite dev server
- [ ] 浏览器访问 `localhost:5173` 能看到 Vue app 渲染
- [ ] `pnpm exec tsc -p tsconfig.web.json --noEmit` 编译通过
- [ ] `pnpm build:web` 构建成功，产物在 `dist-web/`
