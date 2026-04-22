[根目录](../CLAUDE.md) > **resources**

# 内置资源与插件

> WorkFox 打包时附带的内置资源文件，主要为内置插件、插件商店元数据，以及 Web client 插件 manifest 示例。

## 模块职责

- 提供开箱即用的内置插件
- 提供插件商店元数据（`plugins.json`）
- 提供 Web client 插件 manifest / runtime / view 示例
- 每个插件可提供：工作流节点定义 + handler、AI Agent 工具、API 能力、独立视图

## 内置插件列表

| 插件 ID | 名称 | 功能 | 工作流节点 | 运行时类型 |
|---|---|---|---|---|
| `workfox.window-manager` | 窗口管理 | 创建/导航/关闭/截图独立浏览器窗口 | 有 | client（Electron only） |
| `workfox.file-system` | 文件系统 | 文件读写操作 | 有 | server |
| `workfox.fetch` | 网络请求 | HTTP 请求工具 | 有 | server |
| `workfox.jimeng` | 即梦 | 即梦 AI 图片生成集成 | 有 | server |
| `workfox.fish-audio` | FishAudio 语音合成 | TTS 文字转语音、STT 语音转文字 | 有 | server（后端执行） |
| `workfox.test-plugin` | Test Plugin | Web client 插件 manifest / runtime / view 示例 | 视图示例 | client（CDN manifest 示例） |

## 插件文件结构

```
  plugins/
    plugins.json                         插件商店元数据
    window-manager/
    info.json                          插件元信息（id/name/version/description/author/tags/type/config）
    main.js                            插件入口（Node.js 模块）
    workflow.js                        工作流节点定义与 handler
    tools.js                           AI Agent 工具定义
    api.js                             插件 API 能力
    icon.png                           插件图标
  file-system/
    info.json / main.js / tools.js / workflow.js
  fetch/
    info.json / main.js / tools.js / workflow.js
  jimeng/
    info.json / main.js / tools.js / workflow.js
    fish-audio/
      info.json / main.js / tools.js / workflow.js / shared.js
    test-plugin/
      web-plugin.json                    Web client manifest 示例
      web-client.js                      CDN client runtime 示例
      view.js                            CDN view 示例
```

### info.json 结构

```typescript
interface PluginInfo {
  id: string; name: string; version: string;
  description: string; author: PluginAuthor;
  tags?: string[]; minAppVersion?: string;
  hasView?: boolean; hasWorkflow?: boolean;
  type?: 'server' | 'client' | 'both';
  config?: PluginConfigField[];
  entries?: {
    main?: string; server?: string; client?: string;
    workflow?: string; tools?: string; api?: string; view?: string;
  };
}
```

### 运行时类型说明

- **`server`**：在 backend 中执行。Electron 和 Web 都通过 backend 插件列表看到它。
- **`client`**：在客户端运行。Electron 走本地插件目录；Web 走 CDN manifest runtime。
- **`both`**：类型仍被支持，但当前实现更推荐显式拆分为 `server` / `client`。

### 当前加载边界

- `resources/plugins/*/info.json`
  - 作为内置插件元数据来源
- backend
  - 会忽略 `type: 'client'`
- Electron local catalog
  - 会忽略 `type: 'server'`
- Web
  - 不扫描 `resources/plugins` 本地目录
  - 仅通过 `plugins.json` 中的 `manifestUrl` 安装 CDN client 插件

## 对外接口

插件通过 `PluginContext` API 与宿主交互。不同运行时可用能力不同：

- `context.events`：事件总线（on/once/off/emit）
- `context.storage`：键值存储（get/set/delete/clear/keys）
- `context.plugin`：插件元信息
- `context.logger`：日志（info/warn/error）

Web CDN client runtime 当前提供的是较轻量上下文：

- `plugin`
- `storage`
- `events`
- `logger`
- `config`

## 插件配置

- **全局配置**：通过 `info.json` 的 `config` 字段声明配置项，存储在 `plugin:get-config` / `plugin:save-config`
- **工作流级配置方案**：每个工作流可对插件使用不同的配置方案，通过 `workflow:*-plugin-scheme` 通道管理
- **配置项类型**：`string` / `number` / `boolean` / `select` / `object`

## 相关文件清单

```
resources/
  plugins/
    plugins.json                        插件商店元数据
    window-manager/                     窗口管理插件（Electron client）
    file-system/                        文件系统插件（server）
    fetch/                              网络请求插件（server）
    jimeng/                             即梦 AI 插件（server）
    fish-audio/                         FishAudio 语音插件（server）
    test-plugin/                        Web client manifest / runtime / view 示例
```

## 变更记录 (Changelog)

| 日期 | 操作 | 说明 |
|---|---|---|
| 2026-04-23 | 增量更新 | 同步最新插件系统：server/client 分流、Web CDN manifest、window-manager Electron only |
| 2026-04-22 | 增量更新 | 补充 fish-audio 插件、运行时类型说明、插件配置方案、info.json 结构 |
| 2026-04-20 | 初始化 | 首次生成模块文档 |
