# WorkFox 最新插件系统说明

> 更新时间：2026-04  
> 适用范围：当前仓库实现（Electron + Web + Backend）

## 目标

当前插件系统不是“单一运行时插件系统”，而是一个按运行位置拆分的多运行时系统：

- `server` 插件：运行在 backend
- `client` 插件：运行在 Electron 主进程，或在 Web 中通过 CDN manifest 加载
- `both` 插件：元数据上允许两端都提供能力，但当前实现里更推荐显式拆成 `server` / `client`

核心原则：

1. `server` 插件应当同时被 Electron 和 Web 看见
2. `client` 插件不应该要求 backend 能执行
3. Web 不能扫描本地 Electron 插件目录
4. Web 的 client 插件只能通过在线 manifest + CDN 方式安装和加载

## 目录与来源

当前插件来源分成三类：

### 1. Backend server 插件

- 目录：`backend/data/plugins`
- 兼容扫描：`resources/plugins`
- 加载器：`backend/plugins/plugin-registry.ts`

backend 会忽略 `type: "client"` 的插件，只加载可在服务端运行的插件。

### 2. Electron 本地 client 插件

- 目录：开发态 `resources/plugins`，打包后 `process.resourcesPath/plugins`
- 加载器：`electron/services/plugin-catalog.ts`
- 运行时：`electron/services/plugin-runtime-host.ts`

Electron 本地 catalog 会忽略 `type: "server"` 的插件，只接管 client 侧插件。

### 3. Web CDN client 插件

- 安装记录：浏览器 `localStorage`
- 运行时：`src/lib/plugins/web-client-runtime.ts`
- 入口：插件商店里的 `manifestUrl`

Web 不会把 client 插件解压到本地目录，而是记录 manifest 地址，并按 manifest 动态拉取：

- `entries.client`
- `entries.view`

## `info.json` 与类型语义

共享类型定义见：

- `shared/plugin-types.ts`
- `src/types/plugin.ts`

关键字段：

```json
{
  "id": "workfox.example",
  "name": "Example Plugin",
  "version": "1.0.0",
  "description": "Example",
  "author": { "name": "workfox" },
  "type": "server",
  "hasWorkflow": true,
  "hasView": false,
  "entries": {
    "server": "main.js",
    "client": "main.js",
    "workflow": "workflow.js",
    "tools": "tools.js",
    "api": "api.js",
    "view": "view.js"
  }
}
```

类型含义：

- `server`
  - 由 backend 加载
  - 可提供 `workflow.js` / `tools.js`
  - Electron / Web 都能在插件列表里看到
- `client`
  - 由 Electron 或 Web client runtime 加载
  - 不应要求 backend 执行
  - Web 只能通过 CDN manifest 安装
- `both`
  - 元数据允许双端
  - 但如果行为明显依赖 Electron 或 backend，建议不要继续使用 `both`

## 插件列表如何合并

前端插件 store 在 `src/stores/plugin.ts`。

实际列表不是来自单一接口，而是聚合结果：

- backend `plugin:list` 提供 server 侧插件
- Electron `plugin:list-local` 提供本地 client 插件
- Web `web-client-runtime.loadInstalledPlugins()` 提供已安装 CDN client 插件

聚合后会生成这些附加语义：

- `runtimeSource`
  - `server`
  - `client`
  - `hybrid`
- `runtimeTransport`
  - `local`
  - `cdn`

所以插件列表 UI 展示的是“能力视图”，不是某个单目录的原始扫描结果。

## 插件安装行为

### Electron

- 本地导入 ZIP：走 `plugin:import-zip`
- 在线安装：走 Electron `plugin:install`
- 卸载：走 Electron `plugin:uninstall`

### Web

- 安装 `server` 插件：走 backend `plugin:install`，下载 ZIP 到 `backend/data/plugins`
- 安装 `client` 插件：走 `web-client-runtime.install()`，记录 `manifestUrl`
- 卸载 `client` CDN 插件：仅删除本地安装记录并停用 runtime

## 工作流节点执行分流

当前工作流节点执行要区分三类：

### 1. Backend 可执行节点

例如：

- `jimeng_text_to_image`
- `jimeng_image_to_image`
- `jimeng_text_to_video`
- `fetch`
- `file-system`

这些节点应走 backend 插件执行：

- backend 执行入口：`BackendPluginRegistry.executeWorkflowNode()`
- 前端单节点调试入口：`agent:execTool` WS channel

### 2. Electron 本地桥接节点

例如：

- `delay`
- 以及未来显式声明为本地桥接的节点

这些节点走：

- `window.api.agent.execTool(...)`

### 3. Electron 专属 client 插件节点

例如：

- `workfox.window-manager`

这类节点不应该在 Web 中被当成 backend 节点执行。

## `agent:execTool` 的当前语义

这个名字历史上容易误导。当前仓库里它有两种实现：

### Electron IPC

- 文件：`electron/ipc/chat.ts`
- 用于执行本地桥接节点或 Electron 侧已注册的 handler

### Backend WS

- 文件：`backend/ws/app-channels.ts`
- 当前用于执行 backend 可运行的插件节点

因此它现在更像“统一工具执行入口”，而不是只属于 Agent。

## Web client manifest 规范

Web client 插件不是直接读本地 `info.json`，而是通过单独 manifest 描述。

当前示例：

- `resources/plugins/test-plugin/web-plugin.json`

支持字段：

```json
{
  "id": "workfox.test-plugin",
  "name": "Test Plugin",
  "version": "1.0.0",
  "description": "Web client plugin",
  "author": { "name": "workfox" },
  "type": "client",
  "runtimeTargets": ["web", "electron"],
  "iconUrl": "https://.../icon.png",
  "entries": {
    "client": {
      "url": "https://.../web-client.js",
      "format": "esm"
    },
    "view": {
      "url": "https://.../view.js",
      "format": "cjs"
    }
  }
}
```

说明：

- `entries.client.url`
  - Web runtime 会 `import()` 这个地址
- `entries.view.url`
  - 当前设置面板通过 `fetch + new Function` 加载 CJS 风格 view 代码

## 当前内置插件状态

按当前实现理解：

- `workfox.window-manager`
  - `type: "client"`
  - 只应在 Electron 端加载
- `workfox.file-system`
  - `type: "server"`
- `workfox.fetch`
  - `type: "server"`
- `workfox.jimeng`
  - `type: "server"`
- `workfox.fish-audio`
  - `type: "server"`

其中 `window-manager` 已从“看起来能双端”调整为 Electron-only。

## 推荐约束

为了避免后续继续混乱，建议遵守下面这些规则：

1. 只要插件依赖 Electron API、窗口、标签页、主进程对象，就定义成 `client`
2. 只要插件本质是 HTTP / 文件 / AI 服务调用，就优先定义成 `server`
3. 非必要不要新增 `both`
4. Web client 插件必须显式提供 `manifestUrl`
5. 插件商店元数据必须写清：
   - `type`
   - `runtimeTargets`
   - `manifestUrl`（如果是 Web client）

## 相关实现文件

- backend
  - `backend/plugins/plugin-registry.ts`
  - `backend/ws/plugin-channels.ts`
  - `backend/ws/app-channels.ts`
- electron
  - `electron/services/plugin-catalog.ts`
  - `electron/services/plugin-runtime-host.ts`
  - `electron/services/plugin-manager.ts`
- renderer
  - `src/stores/plugin.ts`
  - `src/components/plugins/PluginsDialog.vue`
  - `src/components/plugins/PluginCard.vue`
  - `src/components/plugins/PluginSettings.vue`
- web runtime
  - `src/lib/plugins/web-client-runtime.ts`
- shared types
  - `shared/plugin-types.ts`
  - `shared/plugin-entry.ts`
