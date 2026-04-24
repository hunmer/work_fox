# Chat 数据迁移：前端 IndexedDB → Backend 单一数据源

## Context

当前 chat 数据存储采用双写模式：workflow scope 同时写 IndexedDB 和 backend，agent scope 只写 IndexedDB。刷新页面后 agent scope 的聊天记录可能不是最新的（因为 IndexedDB 是异步缓存）。目标是让 backend 成为唯一数据源，前端不再使用 IndexedDB 存储 chat 数据。

## 核心思路

将 backend 存储键从 `workflowId` 泛化为 `scopeKey`：
- workflow scope → `workflow-{workflowId}` → 文件 `workflow-{workflowId}.json`
- agent scope → `agent-global` → 文件 `agent-global.json`

前端 `chat-db.ts` 从 Dexie/IndexedDB 改为纯 WS 调用 backend。

## 实施步骤

### Step 1: Backend — 泛化 `BackendChatHistoryStore`

**文件**: `backend/storage/chat-history-store.ts`

- 所有方法的 `workflowId` 参数改名为 `scopeKey`
- `filePath()` 返回 `{userDataDir}/chat-history/{scopeKey}.json`
- cache Map 的 key 从 `workflowId` 改为 `scopeKey`
- `addMessage()` 中增加 MAX_MESSAGES_PER_SESSION=5000 的裁剪逻辑（从 chat-db.ts 搬过来）
- `addMessage()`/`deleteMessage()`/`clearMessages()` 自动更新对应 session 的 `messageCount` 和 `updatedAt`
- 新增 `importData(scopeKey, data)` 用于数据迁移
- 新增 `listAllScopeKeys()` 扫描 chat-history 目录
- 构造函数中增加一次性文件重命名：扫描不带 `workflow-` 前缀的旧文件（纯 UUID 名），重命名为 `workflow-{original}.json`

### Step 2: Shared — 更新 Channel 契约

**文件**: `shared/channel-contracts.ts`

所有 `chatHistory:*` 契约的请求参数从 `{ workflowId }` 改为 `{ scopeKey }`：

```
'chatHistory:listSessions'     → { scopeKey }
'chatHistory:createSession'    → { scopeKey, session }
'chatHistory:updateSession'    → { scopeKey, sessionId, updates }
'chatHistory:deleteSession'    → { scopeKey, sessionId }
'chatHistory:listMessages'     → { scopeKey, sessionId }
'chatHistory:addMessage'       → { scopeKey, sessionId, message }
'chatHistory:updateMessage'    → { scopeKey, sessionId, messageId, updates }
'chatHistory:deleteMessage'    → { scopeKey, sessionId, messageId }
'chatHistory:deleteMessages'   → { scopeKey, sessionId, messageIds }
'chatHistory:clearMessages'    → { scopeKey, sessionId }
```

新增迁移通道：
```
'chatHistory:importData'       → { scopeKey, data: { sessions, messages } }
'chatHistory:listAllScopeKeys' → → string[]
```

**文件**: `shared/channel-metadata.ts` — 添加新通道元数据

### Step 3: Backend — 更新 WS Channel Handlers

**文件**: `backend/ws/app-channels.ts`

- 所有 handler 从 `{ workflowId }` 改为解构 `{ scopeKey }`，传给 store 方法
- 注册两个新通道 `chatHistory:importData` 和 `chatHistory:listAllScopeKeys`

### Step 4: Frontend — 重写 `chat-db.ts`

**文件**: `src/lib/chat-db.ts`

删除：
- 整个 `ChatDB` 类和 `chatDb` 实例（Dexie 全部移除）
- `getWorkflowId()` 辅助函数
- 所有 `chatDb.sessions.*` / `chatDb.messages.*` 调用

新增：
```typescript
export function resolveScopeKey(scope: string, workflowId?: string | null): string {
  if (scope === 'workflow' && workflowId) return `workflow-${workflowId}`
  return 'agent-global'
}
```

每个导出函数改为 `wsBridge.invoke('chatHistory:*', { scopeKey, ... })` 调用。函数签名增加 `scopeKey` 参数（由 chat store 传入）。

新增 `migrateFromIndexedDB()` 函数，用于一次性数据迁移。

### Step 5: Frontend — 更新 `chat.ts` Store

**文件**: `src/stores/chat.ts`

- 在 `createChatStore(scope)` 内部计算 `scopeKey`：
  ```typescript
  const scopeKey = computed(() => {
    if (scope === 'workflow') {
      const wid = workflowStore?.currentWorkflow?.id
      return wid ? `workflow-${wid}` : null
    }
    return 'agent-global'
  })
  ```
- 所有 `db*` 函数调用增加 `scopeKey.value` 参数
- `loadSessions()` 统一走 WS，删除 `if (scope === 'workflow')` 分支
- `switchToWorkflowSession()` 改用 `dbListSessionsByScope('workflow', workflowId)`
- `switchSession()` 传 `scopeKey.value` 给 `dbListMessages`

### Step 6: 数据迁移

**时机**: App.vue `onMounted` 或 store 初始化前

1. 检查 `localStorage.getItem('workfox_chat_migration_done')`
2. 读取 IndexedDB 中所有 sessions 和 messages
3. 按 scopeKey 分组
4. 对每组调用 `chatHistory:importData`
5. backend 端 merge（按 ID 去重，已有则跳过）
6. 设置迁移完成标记
7. 删除 `workfox-chat` IndexedDB 数据库

## 关键文件清单

| 文件 | 改动类型 |
|------|----------|
| `backend/storage/chat-history-store.ts` | 重构：workflowId→scopeKey，新增方法 |
| `shared/channel-contracts.ts` | 更新：所有 chatHistory 契约参数 |
| `shared/channel-metadata.ts` | 更新：新增通道元数据 |
| `backend/ws/app-channels.ts` | 更新：handler 参数改为 scopeKey |
| `src/lib/chat-db.ts` | 重写：Dexie→WS |
| `src/stores/chat.ts` | 更新：传 scopeKey，统一加载路径 |

## 验证

```bash
pnpm exec tsc -p tsconfig.web.json --noEmit
pnpm build:backend
pnpm build
```

功能验证：
1. agent scope 创建对话、发送消息、刷新页面后消息仍在
2. workflow scope 创建对话、发送消息、刷新后消息仍在
3. 切换会话后消息正确加载
4. 删除会话/消息后 backend 文件同步更新
5. 旧 IndexedDB 数据自动迁移到 backend
