[根目录](../CLAUDE.md) > **resources**

# 内置资源与插件

> WorkFox 打包时附带的内置资源文件，主要为内置插件。

## 模块职责

- 提供开箱即用的内置插件
- 插件商店元数据（`plugins.json`）

## 内置插件列表

| 插件 ID | 名称 | 功能 | 工作流节点 |
|---|---|---|---|
| `workfox.window-manager` | 窗口管理 | 创建/导航/关闭/截图独立浏览器窗口 | 有 |
| `workfox.file-system` | 文件系统 | 文件读写操作 | 有 |
| `workfox.fetch` | 网络请求 | HTTP 请求工具 | 有 |
| `workfox.jimeng` | 即梦 | 即梦 AI 图片生成集成 | 有 |

## 插件文件结构

```
plugins/
  plugins.json                         插件商店元数据
  window-manager/
    info.json                          插件元信息（id/name/version/description/author/tags）
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
```

## 对外接口

插件通过 `PluginContext` API 与宿主交互：

- `context.events`：事件总线（on/once/off/emit）
- `context.storage`：键值存储（get/set/delete/clear/keys）
- `context.plugin`：插件元信息
- `context.logger`：日志（info/warn/error）

## 相关文件清单

```
resources/
  plugins/
    plugins.json
    window-manager/  (info.json, main.js, workflow.js, api.js, tools.js, icon.png)
    file-system/     (info.json, main.js, tools.js, workflow.js)
    fetch/           (info.json, main.js, tools.js, workflow.js)
    jimeng/          (info.json, main.js, tools.js, workflow.js)
```

## 变更记录 (Changelog)

| 日期 | 操作 | 说明 |
|---|---|---|
| 2026-04-20 | 初始化 | 首次生成模块文档 |
