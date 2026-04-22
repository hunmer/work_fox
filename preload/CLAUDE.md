[根目录](../CLAUDE.md) > **preload**

# Electron Preload 桥接层

> 通过 `contextBridge.exposeInMainWorld` 将安全的 IPC API 暴露给渲染进程，是 Electron 模式下前后端通信的唯一桥梁。Web 模式下由 `BrowserAPIAdapter` 实现相同接口。

## 模块职责

1. **IPC 通道映射**：将所有渲染进程需要的后端能力封装为类型安全的 Promise API
2. **双向通信**：支持 `invoke`（请求-响应）和 `on/send`（事件监听/推送）
3. **类型导出**：通过 `export type IpcAPI` 供渲染进程和 `BrowserAPIAdapter` 进行类型推断
4. **ChatCompletionParams**：定义 AI 对话请求的完整参数类型（含 Claude Agent SDK runtime 选项）

## 入口与启动

- **入口文件**：`index.ts`
- 由 Electron 在 `BrowserWindow` 创建时通过 `webPreferences.preload` 加载
- 路径配置在 `electron/main.ts`：`preload: join(__dirname, '../preload/index.js')`
- Web 模式下不使用此文件，由 `src/web/browser-api-adapter.ts` 实现相同 `IpcAPI` 接口

## 对外接口

### API 命名空间

| 命名空间 | 方法 | IPC 频道 |
|---|---|---|
| `api.chat` | `completions`, `abort` | `chat:completions`, `chat:abort` |
| `api.chatHistory` | `listSessions`, `createSession`, `updateSession`, `deleteSession`, `listMessages`, `addMessage`, `updateMessage`, `deleteMessage`, `deleteMessages`, `clearMessages` | `chatHistory:*` |
| `api.workflowTool` | `respond` | `workflow-tool:respond` |
| `api.agent` | `execTool` | `agent:execTool` |
| `api.aiProvider` | `list`, `create`, `update`, `delete`, `test` | `aiProvider:*` |
| `api.workflow` | `importOpenFile`, `exportSaveFile` | `workflow:importOpenFile`, `workflow:exportSaveFile` |
| `api.shortcut` | `list`, `update`, `toggle`, `clear`, `reset` | `shortcut:*` |
| `api.plugin` | `list`, `enable`, `disable`, `getView`, `getIcon`, `importZip`, `openFolder`, `install`, `uninstall` | `plugin:*` |
| `api.agentSettings` | `get`, `set` | `agentSettings:*` |
| `api.window` | `minimize`, `maximize`, `close`, `isMaximized` | `window:*` |
| `api.tabs` | `load`, `save` | `tabs:*` |
| `api.backend` | `getEndpoint`, `getStatus` | `backend:get-endpoint`, `backend:get-status` |
| `api.fs` | `listDir`, `delete`, `createFile`, `createDir`, `openInExplorer`, `rename` | `fs:*` |
| `api` | `openExternal`, `getAppVersion` | `shell:openExternal`, `app:getVersion` |
| `api.on` | 通用事件监听 | 动态频道（返回取消函数） |

### 事件监听模式

`api.on(channel, callback)` 返回一个 `() => void` 取消函数，用于移除监听器。

## 关键类型

### ChatCompletionParams

```typescript
interface ChatCompletionParams {
  providerId: string; modelId: string; system?: string;
  messages: Array<{ role: string; content: string | Array<Record<string, unknown>> }>;
  tools?: Array<Record<string, unknown>>; stream: boolean; maxTokens?: number;
  thinking?: { type: 'enabled'; budgetTokens: number };
  targetTabId?: string; enabledToolNames?: string[];
  _requestId: string;  // 用于流式请求标识
  _mode?: 'workflow'; _workflowId?: string;
  runtime?: {
    cwd?: string;
    additionalDirectories?: string[];
    permissionMode?: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | 'dontAsk' | 'auto';
    allowedTools?: string[];
    extraInstructions?: string;
    loadProjectClaudeMd?: boolean;
    loadRuleMd?: boolean;
    ruleFileNames?: string[];
    enabledPlugins?: string[];
  };
}
```

### WorkflowToolExecuteRequest

```typescript
interface WorkflowToolExecuteRequest {
  requestId: string;
  toolUseId: string;
  name: string;
  args: Record<string, unknown>;
  workflowId: string;
}
```

## 常见问题 (FAQ)

**Q: 如何新增 IPC 接口？**
A: 在 `api` 对象中添加新方法，使用 `ipcRenderer.invoke` 或 `ipcRenderer.on` 映射到对应频道，然后在 `electron/ipc/` 中注册 handler。如果是 backend 通道，还需更新 `shared/channel-contracts.ts` 和 `src/web/browser-api-adapter.ts`。

**Q: 渲染进程如何获取 API 类型？**
A: `export type IpcAPI = typeof api` 导出完整类型，渲染进程可通过 `window.api` 的类型声明使用。Web 模式的 `BrowserAPIAdapter` 也实现了 `IpcAPI` 接口。

**Q: preload 和 backend WS 通道如何分工？**
A: 已迁移到 backend 的 domain（workflow CRUD、execution 等）直接通过 `wsBridge` 调用 backend WS 通道。保留在 Electron IPC 的主要是：Chat 流式对话（桌面模式）、窗口控制、插件 UI 加载、Backend endpoint 发现等桌面本地能力。

## 相关文件清单

```
preload/
  index.ts                             Preload 入口，contextBridge API 定义，IpcAPI 类型导出
```

## 变更记录 (Changelog)

| 日期 | 操作 | 说明 |
|---|---|---|
| 2026-04-22 | 增量更新 | 补充 backend/fs API、ChatCompletionParams runtime 字段、Web 模式说明 |
| 2026-04-20 | 初始化 | 首次生成模块文档 |
