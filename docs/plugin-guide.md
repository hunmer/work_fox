# WorkFox 插件开发指南

> 本文档介绍如何为 WorkFox 开发自定义插件，包括目录结构、文件规范、内置 API、完整示例。

---

## 目录

- [概览](#概览)
- [快速开始](#快速开始)
- [目录结构](#目录结构)
- [info.json — 插件元信息](#infojson--插件元信息)
- [main.js — 生命周期](#mainjs--生命周期)
- [tools.js — AI Agent 工具](#toolsjs--ai-agent-工具)
- [workflow.js — 工作流节点](#workflowjs--工作流节点)
- [api.js — 自定义 API](#apijs--自定义-api)
- [config — 插件配置系统](#config--插件配置系统)
- [内置 API 参考](#内置-api-参考)
- [插件加载机制](#插件加载机制)
- [完整示例](#完整示例)
- [最佳实践](#最佳实践)

---

## 概览

WorkFox 插件运行在 **Electron 主进程** 中，拥有完整的 Node.js 能力。每个插件是一个独立目录，包含元信息、生命周期入口和功能模块。

插件可以提供三种能力：

| 能力 | 文件 | 说明 |
|------|------|------|
| AI Agent 工具 | `tools.js` | 可被 AI Agent 调用的函数（如 HTTP 请求、文件操作） |
| 工作流节点 | `workflow.js` | 可视化拖拽编辑器中的节点 |
| 自定义 API | `api.js` | 扩展插件 handler 可用的主进程能力 |
| 独立视图 | `view.js` | 在应用中显示的自定义 UI 面板 |

---

## 快速开始

最小化插件只需要 **两个文件**：

```
my-plugin/
  info.json    ← 插件元信息（必需）
  main.js      ← 生命周期入口（必需）
```

1. 在 `resources/plugins/` 下创建插件目录
2. 编写 `info.json` 和 `main.js`
3. 重启 WorkFox，插件自动加载

---

## 目录结构

```
my-plugin/
├── info.json          必需 — 插件元信息、配置声明
├── main.js            必需 — activate / deactivate 生命周期
├── workflow.js        可选 — 工作流节点定义（需 info.json 中 hasWorkflow: true）
├── tools.js           可选 — AI Agent 工具定义（需 hasWorkflow: true）
├── api.js             可选 — 自定义 API（覆盖默认的 fetch + fs）
├── view.js            可选 — 自定义视图 HTML（需 hasView: true）
├── icon.png           可选 — 插件图标
└── shared.js          可选 — 插件内部共享模块（不被宿主加载）
```

### 文件加载规则

宿主根据 `info.json` 的标志位决定加载哪些文件：

| 条件 | 加载行为 |
|------|---------|
| 始终 | `info.json`、`main.js` |
| `hasWorkflow: true` | `workflow.js` → `api.js`（可选）→ `tools.js` |
| `hasView: true` | `view.js` 的内容通过 IPC 传给渲染进程 |

---

## info.json — 插件元信息

`info.json` 是插件的身份证，**所有字段都会被校验**。

### 完整字段

```jsonc
{
  // === 必需字段 ===
  "id": "workfox.my-plugin",        // 反域名格式，全局唯一标识
  "name": "我的插件",                 // 显示名称
  "version": "1.0.0",               // 语义化版本号
  "description": "插件功能描述",       // 一句话说明
  "author": {
    "name": "your-name"             // 作者名（必需）
    // "email": "a@b.com",          // 可选
    // "url": "https://..."         // 可选
  },

  // === 可选字段 ===
  "tags": ["AI", "工具"],            // 分类标签，用于搜索
  "minAppVersion": "0.1.0",         // 最低应用版本要求
  "hasWorkflow": true,              // 是否提供工作流节点和 Agent 工具
  "hasView": false,                 // 是否提供独立视图

  // === 插件配置 ===
  "config": [
    {
      "key": "apiKey",              // 配置键名，唯一标识
      "label": "API Key",           // 表单标签
      "desc": "在 xxx 获取",        // 描述文本
      "type": "string",             // 类型：string | number | boolean | select | object
      "value": "",                  // 默认值（统一为字符串存储）
      "placeholder": "输入 Key",    // 输入框占位文本
      "required": true              // 是否必填
    },
    {
      "key": "model",
      "label": "模型",
      "type": "select",
      "value": "gpt-4",
      "options": [
        { "label": "GPT-4（推荐）", "value": "gpt-4" },
        { "label": "GPT-3.5", "value": "gpt-3.5" }
      ]
    }
  ]
}
```

### 字段校验规则

插件加载时 `PluginManager` 会检查：

- `id`、`name`、`version`、`description`、`author.name` **必须存在**，否则抛出错误
- `id` 重复的插件会被跳过
- `minAppVersion` 不满足时插件不会被加载

### config 类型与表单控件映射

| config.type | 渲染控件 | 值格式 |
|-------------|---------|--------|
| `string` | Input 文本框 | 任意字符串 |
| `number` | Input 数字框 | 数字字符串（如 `"30000"`） |
| `boolean` | Switch 开关 | `"true"` / `"false"` |
| `select` | Select 下拉 | options 中的 value |
| `object` | Textarea（JSON） | JSON 字符串 |

---

## main.js — 生命周期

```javascript
exports.activate = (context) => {
  context.logger.info('插件已激活')

  // 注册事件监听
  context.events.on('some-event', (data) => {
    context.logger.info('收到事件:', data)
  })
}

exports.deactivate = (context) => {
  context.logger.info('插件已停用')
}
```

### activate(context)

插件启用时调用。接收 `context` 对象，包含所有内置 API。适合做初始化工作。

### deactivate(context)

插件停用或应用退出时调用。适合做资源清理。注意：事件监听器会被宿主自动清理，无需手动移除。

---

## tools.js — AI Agent 工具

`tools.js` 定义可被 AI Agent 调用的工具。格式遵循 Anthropic function-calling 规范。

### 文件结构

```javascript
module.exports = {
  tools: [
    {
      name: 'my_tool_name',                    // 工具名，全局唯一
      description: '工具描述，Agent 根据此描述决定是否调用',  // 清晰描述功能
      input_schema: {                          // JSON Schema 格式
        type: 'object',
        properties: {
          param1: { type: 'string', description: '参数说明' },
          param2: { type: 'number', description: '数值参数' },
          param3: { type: 'array', items: { type: 'string' }, description: '数组参数' },
        },
        required: ['param1'],                  // 必填参数
      },
    },
    // ... 更多工具
  ],

  handler: async (name, args, api) => {
    // name  — 工具名（匹配 tools[].name）
    // args  — Agent 传入的参数对象
    // api   — 插件 API（来自 api.js 或默认的 fetch + fs）

    switch (name) {
      case 'my_tool_name': {
        const result = await api.postJson('https://api.example.com/endpoint', {
          headers: { 'Authorization': `Bearer ${args.token}` },
          body: { query: args.param1 },
          timeout: 60000,
        })
        return {
          success: true,
          message: '操作完成',
          data: result,
        }
      }
      default:
        return { success: false, message: `未知工具: ${name}` }
    }
  },
}
```

### handler 参数

| 参数 | 类型 | 说明 |
|------|------|------|
| `name` | `string` | 被调用的工具名 |
| `args` | `object` | Agent 传入的参数，结构匹配 `input_schema` |
| `api` | `PluginApi` | 插件 API 能力（见 [内置 API 参考](#内置-api-参考)） |

### 返回值

必须返回 `PluginToolResult` 格式：

```javascript
{
  success: true,       // boolean，是否成功
  message: '描述',     // string，结果说明
  data: { ... },       // any，可选的结果数据
}
```

---

## workflow.js — 工作流节点

`workflow.js` 定义可视化工作流编辑器中的节点。每个节点与 `tools.js` 中的一个工具对应。

### 文件结构

```javascript
module.exports = {
  nodes: [
    {
      type: 'my_node_type',          // 节点类型标识，全局唯一
      label: '节点名称',              // 编辑器中显示的标题
      category: '分类名',            // 节点面板中的分组
      icon: 'Image',                 // Lucide 图标名
      description: '节点功能说明',

      // 输入属性定义（编辑器右侧属性面板）
      properties: [
        {
          key: 'token',               // 参数名
          label: 'Token',             // 显示标签
          type: 'text',               // 控件类型（见下表）
          required: true,             // 是否必填
          tooltip: '认证令牌',        // 鼠标悬停提示
          default: '',                // 默认值
        },
        {
          key: 'model',
          label: '模型',
          type: 'select',
          default: 'gpt-4',
          options: [
            { label: 'GPT-4', value: 'gpt-4' },
            { label: 'GPT-3.5', value: 'gpt-3.5' },
          ],
        },
      ],

      // 输出端口定义（连接到下游节点）
      outputs: [
        { key: 'success', type: 'boolean' },
        { key: 'message', type: 'string' },
        { key: 'data', type: 'object', children: [
          { key: 'items', type: 'object', children: [] },
          { key: 'count', type: 'number' },
        ] },
      ],

      // 执行函数
      handler: async (ctx, args) => {
        // ctx.api    — 插件 API
        // ctx.logger — 日志工具 { info, warning, error }
        // ctx.nodeId — 节点实例 ID
        // ctx.upstream — 上游节点输出

        ctx.logger.info(`开始执行: ${args.prompt}`)

        const result = await ctx.api.postJson('https://api.example.com', {
          headers: { 'Authorization': `Bearer ${args.token}` },
          body: { model: args.model, prompt: args.prompt },
          timeout: 60000,
        })

        ctx.logger.info(`执行完成`)
        return {
          success: true,
          message: '操作完成',
          data: { items: result.data, count: result.data.length },
        }
      },
    },
  ],
}
```

### property.type 控件类型

| type | 渲染控件 | 适合场景 |
|------|---------|---------|
| `text` | 单行文本框 | 短文本、URL、Token |
| `textarea` | 多行文本框 | 长文本、JSON 数组 |
| `number` | 数字输入框 | 数值参数 |
| `select` | 下拉选择 | 枚举值（需配合 `options`） |
| `checkbox` | 复选框 | 布尔开关 |
| `code` | 代码编辑器 | 代码片段 |
| `array` | 动态列表 | 可增删的列表项 |
| `conditions` | 条件列表 | 条件分支配置 |

### output.type 输出类型

| type | 说明 | children |
|------|------|----------|
| `boolean` | 布尔值 | 无 |
| `string` | 字符串 | 无 |
| `number` | 数字 | 无 |
| `object` | 对象 | 定义子字段结构 |

### handler 参数

| 参数 | 类型 | 说明 |
|------|------|------|
| `ctx` | `PluginNodeContext` | `ctx.api`（插件API）、`ctx.logger`、`ctx.nodeId`、`ctx.upstream` |
| `args` | `Record<string, any>` | 属性面板中用户填写的值 |

---

## api.js — 自定义 API

默认情况下，插件 handler 中的 `api` 参数提供 `fetch`（网络请求）和 `fs`（文件系统）能力。如果需要其他主进程能力（如窗口管理），可以通过 `api.js` 自定义。

### 文件结构

```javascript
module.exports = {
  createApi: ({ windowManager }) => ({
    // 自定义方法，将在 handler 中作为 ctx.api.xxx 调用
    doSomething: (params) => {
      // 可以使用 windowManager 等注入的主进程服务
      return windowManager.createWindow(params)
    },
  }),
}
```

### createApi 接收的注入参数

| 参数 | 类型 | 说明 |
|------|------|------|
| `windowManager` | `WindowManager` | 窗口管理服务 |

> 当前仅注入 `windowManager`。未来可能扩展更多主进程服务。

### 何时需要 api.js

- 需要操作 Electron `BrowserWindow`（如窗口管理插件）
- 需要访问其他主进程单例服务
- 不需要时，省略此文件即可使用默认的 `fetch + fs` API

---

## config — 插件配置系统

插件可以声明用户可配置的参数，在设置面板中自动生成表单。

### 声明配置

在 `info.json` 的 `config` 数组中定义：

```json
{
  "config": [
    {
      "key": "apiKey",
      "label": "API Key",
      "desc": "在 fish.audio 控制台获取",
      "type": "string",
      "value": "",
      "placeholder": "输入你的 API Key",
      "required": true
    }
  ]
}
```

### 读取配置

在 `main.js` 中通过 `context.config` 读取：

```javascript
exports.activate = (context) => {
  const apiKey = context.config.apiKey        // 用户设置的值，或 info.json 中的默认值
  const model = context.config.model || 'gpt-4'
  context.logger.info(`使用模型: ${model}`)
}
```

在 `tools.js` 或 `workflow.js` 中，通过 `args` 传入或直接在 handler 中使用参数：

```javascript
// tools.js handler 可以从 args 中获取用户填写的值
handler: async (name, args, api) => {
  const apiKey = args.apiKey
  // ...
}
```

### 配置优先级

```
用户设置值 > info.json 中的 value 默认值
```

`context.config` 是一个 Proxy，读取时自动按优先级查找。

### 数据存储位置

```
{userDataPath}/plugin-data/{pluginId}/data.json
```

---

## 内置 API 参考

### FetchApi — 网络请求

所有方法都使用 Node.js 原生 `http`/`https` 模块，无需额外依赖。

#### api.fetchText(url, options?)

获取文本内容。

```javascript
const html = await api.fetchText('https://example.com', {
  headers: { 'Accept': 'text/html' },
  timeout: 30000,       // 默认 30 秒
})
```

#### api.fetchJson(url, options?)

获取并解析 JSON。

```javascript
const data = await api.fetchJson('https://api.example.com/data')
```

#### api.fetchBuffer(url, options?)

下载二进制数据。

```javascript
const { buffer, size, mimeType } = await api.fetchBuffer('https://example.com/file.zip')
// buffer: Buffer, size: number, mimeType: string
```

#### api.fetchBuffers(urls, options?)

批量下载，单个失败不影响其他。

```javascript
const results = await api.fetchBuffers(['url1', 'url2', 'url3'])
// results: Array<{ url, buffer?, size?, mimeType?, success, error? }>
```

#### api.postJson(url, options?)

发送 JSON POST 请求，返回解析后的 JSON。

```javascript
const result = await api.postJson('https://api.example.com/endpoint', {
  headers: {
    'Authorization': 'Bearer token123',
  },
  body: {
    query: 'hello',
    limit: 10,
  },
  timeout: 60000,      // 默认 60 秒
})
```

#### FetchOptions

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `headers` | `Record<string, string>` | `{}` | 请求头 |
| `timeout` | `number` | `30000` | 超时毫秒数 |
| `userAgent` | `string` | `'WorkFox/1.0'` | User-Agent |
| `encoding` | `string` | `'utf-8'` | 文本编码 |

#### PostOptions（继承 FetchOptions）

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `body` | `any` | `undefined` | 自动 JSON.stringify 的请求体 |

### FsApi — 文件系统

#### api.writeFile(filePath, content, encoding?)

```javascript
await api.writeFile('/path/to/file.txt', 'Hello World')
await api.writeFile('/path/to/file.json', JSON.stringify(data))
```

#### api.readFile(filePath, encoding?)

```javascript
const content = await api.readFile('/path/to/file.txt')
```

#### api.editFile(filePath, oldContent, newContent)

字符串替换。如果 `oldContent` 不存在会抛错。

```javascript
const { replaced } = await api.editFile('/path/to/config.json', '"old"', '"new"')
```

#### api.deleteFile(filePath)

#### api.listFiles(dirPath, options?)

```javascript
const items = await api.listFiles('/path/to/dir', {
  recursive: true,       // 递归遍历子目录
  pattern: '*.js',       // 通配符过滤（支持 * 和 ?）
})
// items: Array<{ name, path, type: 'file' | 'directory' }>
```

#### api.createDir(dirPath, options?)

```javascript
await api.createDir('/path/to/new/dir', { recursive: true })
```

#### api.removeDir(dirPath, options?)

```javascript
await api.removeDir('/path/to/dir', { recursive: true, force: true })
```

#### api.stat(filePath)

```javascript
const info = await api.stat('/path/to/file')
// { isFile, isDirectory, size, createdAt, modifiedAt }
```

#### api.exists(filePath)

```javascript
const exists = await api.exists('/path/to/file')
```

#### api.rename(oldPath, newPath)

#### api.copyFile(src, dest)

### Storage — 键值存储

每个插件有独立的键值存储空间。

```javascript
// 写入
await context.storage.set('lastRun', Date.now())

// 读取
const lastRun = await context.storage.get('lastRun')

// 删除
await context.storage.delete('lastRun')

// 所有键
const keys = await context.storage.keys()

// 清空
await context.storage.clear()
```

存储文件位置：`{userDataPath}/plugin-data/{pluginId}/storage.json`

### Events — 事件总线

```javascript
// 监听（自动清理，无需手动 off）
context.events.on('data-ready', (data) => { ... })
context.events.once('init', () => { ... })

// 发射（自动添加 plugin:{id}: 前缀）
context.events.emit('data-ready', { count: 42 })

// 向渲染进程发送
context.sendToRenderer('my-plugin:update', { progress: 50 })
```

> 事件总线使用 EventEmitter2，支持通配符和命名空间。

### Logger — 日志

```javascript
context.logger.info('正常信息')
context.logger.warn('警告信息')
context.logger.error('错误信息')
```

输出格式：`[Plugin:插件名] 消息内容`

---

## 插件加载机制

```
┌─────────────────────────────────────────────────────────────┐
│                    PluginManager.load()                       │
│                                                               │
│  1. 读取 info.json → 校验必需字段                              │
│  2. 检查 minAppVersion                                        │
│  3. 创建 PluginStorage + PluginConfigStorage（如有 config）     │
│  4. 创建 PluginContext（注入 events/storage/logger/fetch/fs）   │
│  5. require() main.js                                         │
│  └── hasWorkflow? ──┐                                        │
│       │              │                                        │
│       ▼              ▼                                        │
│  6a. require() workflow.js → 注册节点到 registry               │
│  6b. require() api.js → 注册自定义 API（或用默认 fetch+fs）     │
│  6c. require() tools.js → 注册 Agent 工具到 registry           │
│       │                                                       │
│       ▼                                                       │
│  7. 存入 plugins Map                                          │
│  8. 未禁用？→ 调用 module.activate(context)                    │
└─────────────────────────────────────────────────────────────┘
```

### 卸载流程

```
PluginManager.unload(id)
  → module.deactivate(context)   // 通知插件清理
  → workflowNodeRegistry.unregister(id)  // 注销节点
  → cleanupEvents()              // 移除所有事件监听
  → plugins.delete(id)           // 从 Map 中删除
```

---

## 完整示例

### 示例 1：最小化插件（仅生命周期）

```
resources/plugins/hello/
├── info.json
└── main.js
```

**info.json**

```json
{
  "id": "workfox.hello",
  "name": "Hello 插件",
  "version": "1.0.0",
  "description": "示例插件，展示最小化结构",
  "author": { "name": "workfox" },
  "tags": ["示例"],
  "hasWorkflow": false,
  "hasView": false
}
```

**main.js**

```javascript
exports.activate = (context) => {
  context.logger.info('Hello 插件已激活！')
}

exports.deactivate = (context) => {
  context.logger.info('Hello 插件已停用')
}
```

### 示例 2：带 Agent 工具的 API 服务插件

```
resources/plugins/weather/
├── info.json
├── main.js
├── tools.js
└── workflow.js
```

**info.json**

```json
{
  "id": "workfox.weather",
  "name": "天气查询",
  "version": "1.0.0",
  "description": "查询全球城市天气信息",
  "author": { "name": "workfox" },
  "tags": ["天气", "API"],
  "hasWorkflow": true,
  "hasView": false,
  "config": [
    {
      "key": "apiKey",
      "label": "API Key",
      "desc": "OpenWeatherMap API Key",
      "type": "string",
      "value": "",
      "required": true
    }
  ]
}
```

**main.js**

```javascript
exports.activate = (context) => {
  context.logger.info('天气查询插件已激活')
}

exports.deactivate = (context) => {
  context.logger.info('天气查询插件已停用')
}
```

**tools.js**

```javascript
module.exports = {
  tools: [
    {
      name: 'weather_query',
      description: '查询指定城市的当前天气，返回温度、湿度、天气状况等',
      input_schema: {
        type: 'object',
        properties: {
          city: { type: 'string', description: '城市名，如 Beijing、London' },
          apiKey: { type: 'string', description: 'OpenWeatherMap API Key' },
          units: { type: 'string', description: '单位：metric(摄氏)/imperial(华氏)' },
        },
        required: ['city', 'apiKey'],
      },
    },
  ],

  handler: async (name, args, api) => {
    switch (name) {
      case 'weather_query': {
        const units = args.units || 'metric'
        const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(args.city)}&appid=${args.apiKey}&units=${units}`

        const result = await api.fetchJson(url)
        return {
          success: true,
          message: `${result.name} 当前天气: ${result.weather[0].description}`,
          data: {
            city: result.name,
            temp: result.main.temp,
            humidity: result.main.humidity,
            description: result.weather[0].description,
          },
        }
      }
      default:
        return { success: false, message: `未知工具: ${name}` }
    }
  },
}
```

**workflow.js**

```javascript
module.exports = {
  nodes: [
    {
      type: 'weather_query',
      label: '天气查询',
      category: '天气',
      icon: 'CloudSun',
      description: '查询城市天气信息',
      properties: [
        { key: 'apiKey', label: 'API Key', type: 'text', required: true, tooltip: 'OpenWeatherMap API Key' },
        { key: 'city', label: '城市', type: 'text', required: true, tooltip: '城市英文名' },
        { key: 'units', label: '温度单位', type: 'select', default: 'metric', options: [
          { label: '摄氏度', value: 'metric' },
          { label: '华氏度', value: 'imperial' },
        ] },
      ],
      outputs: [
        { key: 'success', type: 'boolean' },
        { key: 'message', type: 'string' },
        { key: 'data', type: 'object', children: [
          { key: 'city', type: 'string' },
          { key: 'temp', type: 'number' },
          { key: 'humidity', type: 'number' },
          { key: 'description', type: 'string' },
        ] },
      ],
      handler: async (ctx, args) => {
        const units = args.units || 'metric'
        const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(args.city)}&appid=${args.apiKey}&units=${units}`

        ctx.logger.info(`查询天气: ${args.city}`)
        const result = await ctx.api.fetchJson(url)

        ctx.logger.info(`${result.name}: ${result.weather[0].description}, ${result.main.temp}°`)
        return {
          success: true,
          message: `${result.name} 当前天气: ${result.weather[0].description}`,
          data: {
            city: result.name,
            temp: result.main.temp,
            humidity: result.main.humidity,
            description: result.weather[0].description,
          },
        }
      },
    },
  ],
}
```

### 示例 3：使用共享模块消除重复（FishAudio 模式）

当 `tools.js` 和 `workflow.js` 有共用逻辑时，提取到 `shared.js`：

```
resources/plugins/fish-audio/
├── info.json
├── main.js
├── shared.js       ← 共享网络工具和常量
├── tools.js        ← require('./shared')
└── workflow.js     ← require('./shared')
```

**shared.js** 集中放置 HTTP 请求函数、常量、格式转换等：

```javascript
const https = require('https')
const FISH_BASE_URL = 'https://api.fish.audio'

function postForBuffer(url, options) { /* ... */ }
function buildAuthHeader(apiKey) { /* ... */ }
function resolveBaseUrl(args) { return args.baseUrl || FISH_BASE_URL }

module.exports = { postForBuffer, buildAuthHeader, resolveBaseUrl }
```

**tools.js** 和 **workflow.js** 都通过 `require('./shared')` 引用，避免代码重复。

---

## 最佳实践

### 命名规范

| 项目 | 规范 | 示例 |
|------|------|------|
| 插件 ID | `workfox.{name}`，小写 + 连字符 | `workfox.fish-audio` |
| 工具名 | `{插件名}_{动作}`，snake_case | `fish_audio_tts` |
| 节点 type | 与工具名一致 | `fish_audio_tts` |
| 分类名 | 中文，简短 | `"FishAudio"` / `"文件操作"` |

### 错误处理

```javascript
// 好的做法：明确的错误信息
handler: async (ctx, args) => {
  if (!args.apiKey) throw new Error('缺少 apiKey（请在插件配置中设置）')

  try {
    const result = await ctx.api.postJson(url, { body })
    return { success: true, message: '完成', data: result }
  } catch (err) {
    return { success: false, message: `请求失败: ${err.message}` }
  }
}
```

### 超时设置

根据操作类型选择合理的超时：

| 操作类型 | 建议超时 |
|---------|---------|
| 普通文本 API | 30-60 秒 |
| 图片/视频生成 | 5-10 分钟（600000ms） |
| 语音合成/识别 | 1-2 分钟（120000ms） |
| 文件下载 | 60 秒 |

### 日志使用

在 `workflow.js` 的 handler 中记录关键步骤，方便调试：

```javascript
handler: async (ctx, args) => {
  ctx.logger.info(`开始处理: ${args.prompt}`)
  ctx.logger.info(`请求地址: ${url}`)
  // ... 执行操作 ...
  ctx.logger.info(`完成: 生成 ${count} 条结果`)
  return { success: true, message: '完成', data: { count } }
}
```

### 避免重复代码

如果 `tools.js` 和 `workflow.js` 有共享逻辑（HTTP 工具、常量、格式转换），提取到 `shared.js`：

```javascript
// shared.js — 不被宿主加载，仅供 tools.js / workflow.js 引用
module.exports = {
  buildHeaders(args) { /* ... */ },
  formatResult(data) { /* ... */ },
}
```

### 超出内置 API 的需求

当内置 `FetchApi` 不够用（如需要二进制响应、multipart 上传、流式处理）时：

1. 直接在 handler 中使用 Node.js 原生模块（`require('https')`）
2. 插件运行在主进程，拥有完整 Node.js 能力
3. 示例：FishAudio 插件的 `postForBuffer` 和 `postFormData`

### 敏感信息

- API Key 等敏感信息应放在 `config` 中，由用户通过设置面板填写
- 不要在 `info.json` 的默认值中硬编码真实密钥
- handler 中优先从 `args` 读取用户填写的值

### 数组参数处理

工作流节点中数组参数可能以字符串形式传入，需要兼容处理：

```javascript
const images = Array.isArray(args.images)
  ? args.images
  : JSON.parse(args.images)
```

---

## 附录

### 插件目录位置

| 环境 | 路径 |
|------|------|
| 开发模式 | `{appPath}/resources/plugins/` |
| 打包后 | `process.resourcesPath/plugins/` |

### 数据存储路径

| 数据 | 路径 |
|------|------|
| 插件存储 | `{userDataPath}/plugin-data/{pluginId}/storage.json` |
| 插件配置 | `{userDataPath}/plugin-data/{pluginId}/data.json` |
| 禁用列表 | `{userDataPath}/plugin-data/disabled.json` |

### Lucide 图标参考

`workflow.js` 中的 `icon` 字段使用 [Lucide](https://lucide.dev/icons/) 图标名。常用图标：

| 图标名 | 适合场景 |
|--------|---------|
| `Image` | 图片相关 |
| `Video` | 视频相关 |
| `FileText` | 文件相关 |
| `Globe` | 网络相关 |
| `AudioWaveform` | 音频相关 |
| `Mic` | 录音/语音识别 |
| `CloudSun` | 天气 |
| `Wand2` | AI/魔法 |
| `Database` | 数据存储 |
| `Send` | 发送/提交 |
| `Download` | 下载 |
| `Upload` | 上传 |
