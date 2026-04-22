[根目录](../CLAUDE.md) > **resources**

# 内置资源与插件

> WorkFox 打包时附带的内置资源文件，主要为内置插件。插件通过 `PluginContext` API 与宿主交互，可提供自定义工作流节点、AI Agent 工具和独立视图。

## 模块职责

- 提供开箱即用的内置插件
- 插件商店元数据（`plugins.json`）
- 每个插件可提供：工作流节点定义 + handler、AI Agent 工具、API 能力、独立视图

## 内置插件列表

| 插件 ID | 名称 | 功能 | 工作流节点 | 运行时类型 |
|---|---|---|---|---|
| `workfox.window-manager` | 窗口管理 | 创建/导航/关闭/截图独立浏览器窗口 | 有 | client（Electron 桥接） |
| `workfox.file-system` | 文件系统 | 文件读写操作 | 有 | both |
| `workfox.fetch` | 网络请求 | HTTP 请求工具 | 有 | both |
| `workfox.jimeng` | 即梦 | 即梦 AI 图片生成集成 | 有 | both |
| `workfox.fish-audio` | FishAudio 语音合成 | TTS 文字转语音、STT 语音转文字 | 有 | server（后端执行） |

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

- **`server`**：仅在 backend 中执行（如 fish-audio）。workflow handler 由 `BackendPluginRegistry` 加载和执行。
- **`client`**：需要在 Electron 主进程桥接执行（如 window-manager）。通过 `interaction_required` WS 消息回到 Electron。
- **`both`**：两端均可执行。Electron 端通过 `plugin-runtime-host` 加载，backend 端通过 `plugin-registry` 加载。

## 对外接口

插件通过 `PluginContext` API 与宿主交互：

- `context.events`：事件总线（on/once/off/emit）
- `context.storage`：键值存储（get/set/delete/clear/keys）
- `context.plugin`：插件元信息
- `context.logger`：日志（info/warn/error）

## 插件配置

- **全局配置**：通过 `info.json` 的 `config` 字段声明配置项，存储在 `plugin:get-config` / `plugin:save-config`
- **工作流级配置方案**：每个工作流可对插件使用不同的配置方案，通过 `workflow:*-plugin-scheme` 通道管理
- **配置项类型**：`string` / `number` / `boolean` / `select` / `object`

## 相关文件清单

```
resources/
  plugins/
    plugins.json                        插件商店元数据
    window-manager/                     窗口管理插件（info.json + main.js + workflow.js + api.js + tools.js + icon.png）
    file-system/                        文件系统插件（info.json + main.js + tools.js + workflow.js）
    fetch/                              网络请求插件（info.json + main.js + tools.js + workflow.js）
    jimeng/                             即梦 AI 插件（info.json + main.js + tools.js + workflow.js）
    fish-audio/                         FishAudio 语音插件（info.json + main.js + tools.js + workflow.js + shared.js）
```

## 变更记录 (Changelog)

| 日期 | 操作 | 说明 |
|---|---|---|
| 2026-04-22 | 增量更新 | 补充 fish-audio 插件、运行时类型说明、插件配置方案、info.json 结构 |
| 2026-04-20 | 初始化 | 首次生成模块文档 |
