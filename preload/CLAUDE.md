[根目录](../CLAUDE.md) > **preload**

# Electron Preload 桥接层

> 通过 `contextBridge.exposeInMainWorld` 将安全的 IPC API 暴露给渲染进程，是前后端通信的唯一桥梁。

## 模块职责

1. **IPC 通道映射**：将所有渲染进程需要的后端能力封装为类型安全的 Promise API
2. **双向通信**：支持 `invoke`（请求-响应）和 `on/send`（事件监听/推送）
3. **类型导出**：通过 `export type IpcAPI` 供渲染进程进行类型推断

## 入口与启动

- **入口文件**：`index.ts`
- 由 Electron 在 `BrowserWindow` 创建时通过 `webPreferences.preload` 加载
- 路径配置在 `electron/main.ts`：`preload: join(__dirname, '../preload/index.js')`

## 对外接口

### API 命名空间

| 命名空间 | 方法 | IPC 频道 |
|---|---|---|
| `api.chat` | `completions`, `abort` | `chat:completions`, `chat:abort` |
| `api.chatHistory` | `listSessions`, `createSession`, `updateSession`, `deleteSession`, `listMessages`, `addMessage`, `updateMessage`, `deleteMessage`, `deleteMessages`, `clearMessages` | `chatHistory:*` |
| `api.workflowTool` | `respond` | `workflow-tool:respond` |
| `api.agent` | `execTool` | `agent:execTool` |
| `api.aiProvider` | `list`, `create`, `update`, `delete`, `test` | `aiProvider:*` |
| `api.workflow` | `list`, `get`, `create`, `update`, `delete`, `importOpenFile`, `exportSaveFile` | `workflow:*` |
| `api.workflowFolder` | `list`, `create`, `update`, `delete` | `workflowFolder:*` |
| `api.workflowVersion` | `list`, `add`, `get`, `delete`, `clear`, `nextName` | `workflowVersion:*` |
| `api.executionLog` | `list`, `save`, `delete`, `clear` | `executionLog:*` |
| `api.shortcut` | `list`, `update`, `toggle`, `clear`, `reset` | `shortcut:*` |
| `api.plugin` | `list`, `enable`, `disable`, `getView`, `getIcon`, `importZip`, `openFolder`, `install`, `uninstall`, `getWorkflowNodes`, `listWorkflowPlugins`, `getAgentTools` | `plugin:*` |
| `api.agentSettings` | `get`, `set` | `agentSettings:*` |
| `api.window` | `minimize`, `maximize`, `close`, `isMaximized` | `window:*` |
| `api.tabs` | `load`, `save` | `tabs:*` |
| `api` | `openExternal`, `getAppVersion` | `shell:openExternal`, `app:getVersion` |
| `api.on` | 通用事件监听 | 动态频道 |

## 关键类型

### ChatCompletionParams

```typescript
interface ChatCompletionParams {
  providerId: string; modelId: string; system?: string;
  messages: Array<{ role: string; content: string | Array<Record<string, unknown>> }>;
  tools?: Array<Record<string, unknown>>; stream: boolean; maxTokens?: number;
  thinking?: { type: 'enabled'; budgetTokens: number };
  targetTabId?: string; enabledToolNames?: string[];
  _mode?: 'workflow'; _workflowId?: string;
  runtime?: { cwd, additionalDirectories, permissionMode, allowedTools, ... };
}
```

## 常见问题 (FAQ)

**Q: 如何新增 IPC 接口？**
A: 在 `api` 对象中添加新方法，使用 `ipcRenderer.invoke` 或 `ipcRenderer.on` 映射到对应频道，然后在 `electron/ipc/` 中注册 handler。

**Q: 渲染进程如何获取 API 类型？**
A: `export type IpcAPI = typeof api` 导出完整类型，渲染进程可通过 `window.api` 的类型声明使用。

## 相关文件清单

```
preload/
  index.ts                             Preload 入口，contextBridge API 定义
```

## 变更记录 (Changelog)

| 日期 | 操作 | 说明 |
|---|---|---|
| 2026-04-20 | 初始化 | 首次生成模块文档 |
