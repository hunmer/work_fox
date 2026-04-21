# WorkFox Backend Migration Architecture Plan

> Phase 2 产物：目标架构、目录布局、启动链路、进程边界与运行时配置。

## 1. 目标

本阶段目标不是实现后端业务，而是先建立清晰的后端边界，避免后续把 Electron Main 里的服务直接复制到 Node.js 后端，造成 Electron API、BrowserWindow、dialog、shell、app 等桌面依赖污染工作流后端。

后端迁移后的核心原则：

- Backend 是工作流域服务，不是 Electron Main 的重命名版本。
- Electron Main 继续负责桌面壳、本地 Agent SDK、窗口、系统对话框、快捷键等桌面能力。
- Renderer 继续负责 Vue UI、DAG 编辑器、前端插件视图和本地交互展示。
- Backend 负责工作流持久化、执行调度、节点注册、server 插件、执行日志和 WebSocket 协议。

## 2. 目录布局

建议新增 `backend/` 作为独立 Node.js 后端源码根目录。原因：

- 与 `electron/` 分离，能从目录层面阻止误用 Electron API。
- 与 `src/` 分离，避免 renderer-only 依赖进入后端。
- 后续可独立编译、测试和打包。

推荐结构：

```text
backend/
  main.ts
  app/
    create-server.ts
    lifecycle.ts
    config.ts
    logger.ts
  ws/
    ws-server.ts
    connection-manager.ts
    router.ts
    channels.ts
    errors.ts
    interaction-manager.ts
  storage/
    paths.ts
    json-store.ts
    workflow-store.ts
    workflow-folder-store.ts
    workflow-version-store.ts
    execution-log-store.ts
    operation-history-store.ts
    plugin-config-scheme-store.ts
  workflow/
    execution-session.ts
    execution-runner.ts
    execution-planner.ts
    context-resolver.ts
    node-dispatcher.ts
    log-builder.ts
    builtin-handlers/
      start.ts
      end.ts
      switch.ts
      run-code.ts
      toast.ts
      interaction.ts
  plugins/
    plugin-manager.ts
    plugin-manifest.ts
    plugin-registry.ts
    plugin-config-store.ts
    server-plugin-context.ts
    sandbox-fs.ts
    fetch-api.ts
    agent-tools-registry.ts
  shared/
    ws-protocol.ts
    workflow-types.ts
    plugin-types.ts
    execution-events.ts
    errors.ts
```

配套新增共享源码目录：

```text
shared/
  ws-protocol.ts
  workflow.ts
  plugin.ts
  execution.ts
  errors.ts
```

说明：

- `backend/shared/` 可作为后端内部共享；如果前端也要引用同一套类型，优先使用 repo 根目录 `shared/`。
- Phase 3 时应最终收敛为单一共享类型来源，避免 `src/lib/workflow/types.ts`、`electron/services/store.ts`、`backend/*` 三套类型长期并存。

## 3. 模块职责

### 3.1 `backend/main.ts`

职责：

- 加载运行时配置
- 创建 HTTP/WS 服务
- 注册 WS channel handlers
- 初始化 storage、workflow engine、plugin manager
- 处理进程级错误和退出清理

禁止：

- 引入 `electron`
- 访问 `BrowserWindow`
- 直接打开系统文件选择器
- 直接调用 Claude Agent SDK

### 3.2 `backend/app`

职责：

- Express app 创建
- `/health`、`/version` 等 HTTP endpoint
- 后端生命周期管理
- 运行时配置解析
- 统一 logger

关键配置：

- `WORKFOX_BACKEND_PORT`
- `WORKFOX_BACKEND_HOST`
- `WORKFOX_USER_DATA_DIR`
- `WORKFOX_PLUGIN_DIR`
- `WORKFOX_LOG_LEVEL`
- `WORKFOX_DEV`

### 3.3 `backend/ws`

职责：

- 管理 WebSocket 连接
- 处理 request/response/event/error 基础协议
- 按 channel 路由请求
- 管理 pending request、timeout、heartbeat
- 管理 interaction request/response

不负责：

- 业务存储细节
- 节点执行细节
- 插件加载细节

### 3.4 `backend/storage`

职责：

- 持久化工作流、文件夹、版本、执行日志、操作历史、插件配置方案
- 隐藏文件路径和 JSON 读写细节
- 保持旧数据结构兼容

迁移来源：

- `electron/services/workflow-store.ts`
- `electron/services/workflow-version.ts`
- `electron/services/execution-log.ts`
- `electron/services/operation-history.ts`
- `electron/utils/json-store.ts`

必须改造：

- 去掉 `app.getPath('userData')`
- 通过 `WORKFOX_USER_DATA_DIR` 或 Electron 启动参数注入数据目录
- 所有路径由 `storage/paths.ts` 集中生成

### 3.5 `backend/workflow`

职责：

- 管理 execution session
- 执行拓扑排序、分支过滤、变量解析
- 按节点类型分派执行
- 通过 WS event 输出执行状态
- 在交互节点处挂起并等待 renderer/electron response

迁移来源：

- `src/lib/workflow/engine.ts`
- `src/lib/workflow/nodes/*`
- `src/lib/workflow/nodeRegistry.ts`

必须改造：

- 去掉 Vue 依赖
- 去掉 `window.api`
- 去掉 Pinia store 引用
- 去掉 renderer-only Agent/Provider 依赖

### 3.6 `backend/plugins`

职责：

- 加载 server 插件
- 注册 workflow nodes
- 注册 agent tools metadata
- 管理插件配置
- 提供 server plugin context

迁移来源：

- `electron/services/plugin-manager.ts`
- `electron/services/workflow-node-registry.ts`
- `electron/services/plugin-storage.ts`
- `electron/services/plugin-fetch-api.ts`
- `electron/services/plugin-fs-api.ts`

必须拆分：

- `plugin:get-view`
- `plugin:get-icon`
- `plugin:import-zip`
- `plugin:open-folder`
- 这些仍属于 Electron/client 插件管理能力，不应进入纯 backend plugin manager。

## 4. 进程边界

### 4.1 Electron Main

保留职责：

- 创建窗口和管理窗口状态
- 注册本地 IPC
- 管理快捷键
- 管理本地 Agent SDK
- 管理 AI Provider 与秘钥
- 管理 Chat 历史和 Chat 流式事件
- 提供文件选择、保存对话框、打开外部链接等桌面能力
- 启动和停止 backend 子进程
- 向 renderer 暴露 backend WS 地址

迁出职责：

- workflow CRUD
- workflow folder CRUD
- workflow version
- execution log
- operation history
- workflow engine
- server plugin workflow nodes
- server plugin tools registry

### 4.2 Renderer

保留职责：

- Vue SPA
- Pinia UI 状态
- Vue Flow DAG 编辑
- 节点属性面板
- 执行状态展示
- 前端插件视图与节点渲染
- Interaction UI，例如确认框、表单、文件选择结果确认

迁出职责：

- 工作流 runtime
- 直接执行节点
- 本地维护插件节点注册表作为执行真相源

### 4.3 Backend

新增职责：

- 提供 WS API
- 管理 workflow 数据域
- 管理执行会话
- 执行 server 节点和插件 handler
- 生成执行日志
- 管理 workflow node registry
- 管理 server plugin lifecycle

禁止职责：

- 直接访问 Electron API
- 直接使用 renderer UI
- 直接管理 API key UI
- 直接运行 Claude Agent SDK

## 5. 启动链路

### 5.1 开发模式

推荐链路：

1. `pnpm dev` 启动 `electron-vite dev`
2. Electron Main 在 `app.whenReady()` 后启动 backend 子进程
3. Electron Main 传入：
   - `WORKFOX_USER_DATA_DIR`
   - `WORKFOX_PLUGIN_DIR`
   - `WORKFOX_BACKEND_PORT=0` 或固定开发端口
   - `WORKFOX_DEV=1`
4. Backend 启动后输出实际监听地址
5. Electron Main 保存 backend endpoint
6. Preload 暴露 `backend.getEndpoint()`
7. Renderer 初始化 `wsBridge.connect(endpoint)`

### 5.2 生产模式

推荐链路：

1. backend 编译为独立 Node bundle 或 JS 输出目录
2. 打包时将 backend 产物放入应用 resources
3. Electron Main 以子进程启动 backend
4. 使用 `127.0.0.1` 监听本机端口
5. 端口优先使用 `0` 让系统分配，避免冲突
6. backend ready 后再创建或激活 renderer 的后端连接

### 5.3 退出链路

1. Electron app 退出时发送 shutdown 信号给 backend
2. backend 拒绝新请求
3. backend 等待短时间内的执行会话结束或标记 interrupted
4. 持久化执行日志
5. 关闭 WS 和 HTTP server
6. 子进程退出

## 6. 运行时配置

建议 `backend/app/config.ts` 输出统一配置对象：

```typescript
export interface BackendConfig {
  host: string
  port: number
  userDataDir: string
  pluginDir: string
  logLevel: 'debug' | 'info' | 'warn' | 'error'
  dev: boolean
  requestTimeoutMs: number
  interactionTimeoutMs: number
  heartbeatIntervalMs: number
}
```

默认值：

- `host`: `127.0.0.1`
- `port`: `0`
- `requestTimeoutMs`: `30000`
- `interactionTimeoutMs`: `300000`
- `heartbeatIntervalMs`: `15000`
- `logLevel`: dev 为 `debug`，production 为 `info`

## 7. Electron Main 适配计划

新增 `electron/services/backend-process.ts`：

职责：

- 查找 backend 入口文件
- spawn backend 子进程
- 注入环境变量
- 读取 ready 输出或健康检查 backend
- 暴露 endpoint
- app 退出时 stop
- backend 崩溃时记录日志并通知 renderer

preload 新增：

```typescript
backend: {
  getEndpoint: (): Promise<{ url: string }>
  getStatus: (): Promise<{ running: boolean; url?: string; error?: string }>
}
```

短期兼容：

- 本节为迁移期设计记录；当前仓库状态已不再按这里的“IPC/WS 双栈 + feature flag 回退”运行
- 已迁移 workflow/plugin domain 默认走 WS/backend 主路径
- 原 workflow CRUD/version/executionLog/operationHistory 与 plugin 查询/配置类旧 IPC 已删除

## 8. 构建计划

当前 `electron.vite.config.ts` 只构建：

- `electron/main.ts`
- `preload/index.ts`
- renderer `index.html`

需要新增 backend 构建方案。建议分两步：

### Step 1: 开发期最小构建

- 使用 TypeScript/Vite 独立配置构建 backend
- 新增 `tsconfig.backend.json`
- 新增 `backend.vite.config.ts` 或在脚本中使用 `vite build --config backend.vite.config.ts`
- 输出到 `out/backend`

### Step 2: 打包集成

- 更新 `scripts/build-production.js`
- 更新 `electron-builder*.json`
- 将 `out/backend` 复制到 resources
- Electron Main 根据开发/生产模式解析 backend 入口路径

## 9. 数据目录映射

现有 Electron 服务依赖 `app.getPath('userData')`。

迁移后：

- Electron Main 仍负责获取 `app.getPath('userData')`
- 通过环境变量传给 backend
- Backend 不知道 Electron 的存在，只知道 `userDataDir`

建议路径：

```text
{userDataDir}/agent-workflows/{workflowId}/workflow.json
{userDataDir}/agent-workflows/{workflowId}/plugin_configs/{pluginId}/{scheme}.json
{userDataDir}/workflow-folders.json
{userDataDir}/workflow-versions/{workflowId}.json
{userDataDir}/execution-logs/{workflowId}.json
{userDataDir}/operation-history/{workflowId}.json
{userDataDir}/plugin-data/disabled.json
{userDataDir}/plugin-data/{pluginId}/...
```

兼容要求：

- 不迁移或重命名现有文件，优先沿用当前结构
- 如果发现旧路径和文档描述不一致，以当前代码实现为准
- 新 storage 层必须有读取损坏 JSON 的容错策略

## 10. 安全边界

后端第一阶段不引入多用户鉴权，但仍需要本地安全边界：

- WS 只监听 `127.0.0.1`
- 启动时生成 session token，renderer 连接时通过 handshake 携带
- backend 拒绝无 token 请求
- 文件系统 API 必须限制在允许目录或插件 sandbox 目录内
- 插件 server context 不暴露任意 Node 全局能力

说明：

- 设计文档写的是单用户、无认证；这里的 token 不是用户认证，而是本机进程间防误连/防网页探测的保护。

## 11. Phase 2 决策

| Decision | Result |
|----------|--------|
| 后端目录 | 使用 `backend/`，独立于 `electron/` 和 `src/` |
| 后端运行形态 | 独立 Node 子进程，由 Electron Main 拉起 |
| 通信入口 | Renderer 通过 WebSocket 连接 backend |
| Endpoint 获取 | Preload 暴露 backend endpoint/status |
| 数据目录 | Electron 获取 `userData` 后通过环境变量传给 backend |
| 插件目录 | Electron 根据 dev/packaged 解析后传给 backend |
| 兼容策略 | 当前以 backend/WS 为默认单主路径；仅 import/export 与桌面本地能力保留 Electron IPC |
| Electron API | 禁止在 `backend/` 引入 |
| Agent SDK | 保留 Electron Main，本地交互通过 interaction 协议桥接 |

## 12. 下一阶段输入

Phase 3 可以基于本文件开始：

- 创建 `shared/ws-protocol.ts`
- 创建 `shared/execution.ts`
- 创建 `shared/errors.ts`
- 定义 IPC 到 WS 的 channel contract
- 为 `system:ping`、`system:echo`、`workflow:list` 等通道先建立类型模板
