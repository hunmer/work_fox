# Plugin Config 设计文档

> 日期: 2026-04-21

## 目标

为插件系统增加声明式配置能力，插件通过 `info.json` 定义配置表单 schema，用户在 UI 中填写配置值，插件代码通过 `context.config` 读取。

## 数据模型

### PluginConfigField 接口

```typescript
interface PluginConfigField {
  key: string        // 配置键名，唯一标识
  label: string      // 表单标签
  desc?: string      // 描述/提示文本
  type: 'string' | 'number' | 'boolean' | 'select' | 'object'
  value: string      // 默认值（统一为字符串存储）
  options?: Array<{ label: string; value: string }>  // select 类型的选项
  placeholder?: string
  required?: boolean
}
```

### info.json 新增 config 字段

```json
{
  "id": "workfox.fetch",
  "name": "Network Requests",
  "config": [
    {
      "key": "apiEndpoint",
      "label": "API 端点",
      "desc": "请求的基础 URL",
      "type": "string",
      "value": "https://api.example.com"
    },
    {
      "key": "timeout",
      "label": "超时时间(ms)",
      "type": "number",
      "value": "5000"
    },
    {
      "key": "headers",
      "label": "自定义请求头",
      "desc": "JSON 格式的请求头",
      "type": "object",
      "value": "{}"
    },
    {
      "key": "method",
      "label": "默认请求方法",
      "type": "select",
      "value": "GET",
      "options": [
        { "label": "GET", "value": "GET" },
        { "label": "POST", "value": "POST" }
      ]
    }
  ]
}
```

### data.json 持久化格式

路径: `{userDataPath}/plugin-data/{pluginId}/data.json`

```json
{
  "apiEndpoint": "https://my-server.com",
  "timeout": "10000"
}
```

仅保存用户修改过的值。读取时与 info.json 默认值合并。

## 架构变更

### 类型定义

| 文件 | 变更 |
|---|---|
| `electron/services/plugin-types.ts` | 新增 `PluginConfigField`；`PluginInfo` 增加 `config?: PluginConfigField[]` |
| `src/types/plugin.ts` | 同步新增 `PluginConfigField`；`PluginMeta` 增加 `config?: PluginConfigField[]` |

### 存储层

**新增 `PluginConfigStorage` 类** (位于 `electron/services/plugin-storage.ts`)：

- 复用 `PluginStorage` 的文件读写模式
- 文件名: `data.json`（而非 `storage.json`）
- 方法: `get(key)`, `set(key, value)`, `getAll()`, `setAll(data)`, `clear()`

### 主进程

**`plugin-manager.ts` 变更：**

- `load()` 中创建 `configStorage` 实例
- 构建 `context.config` Proxy 对象（合并 info.json 默认值 + data.json 用户值）
- `PluginContext` 接口新增 `config` 属性

**context.config 实现：**

```typescript
const configProxy = new Proxy({} as Record<string, string>, {
  get(_, key: string) {
    const userVal = configStorage.data[key]
    if (userVal !== undefined) return userVal
    const field = info.config?.find(f => f.key === key)
    return field?.value
  },
  ownKeys() {
    return [...new Set([
      ...Object.keys(configStorage.data),
      ...(info.config?.map(f => f.key) || [])
    ])]
  }
})
```

### IPC 通道

| 通道 | 方向 | 说明 |
|---|---|---|
| `plugin:get-config` | invoke | 获取指定插件的合并后配置（默认值 + 用户值） |
| `plugin:save-config` | invoke | 保存用户配置值到 data.json |

**preload/index.ts** 新增:

```typescript
getConfig: (pluginId: string) => ipcRenderer.invoke('plugin:get-config', pluginId),
saveConfig: (pluginId: string, data: Record<string, string>) => ipcRenderer.invoke('plugin:save-config', pluginId, data),
```

### Renderer Store

**`stores/plugin.ts` 新增：**

```typescript
async getPluginConfig(pluginId: string): Promise<Record<string, string>>
async savePluginConfig(pluginId: string, data: Record<string, string>): Promise<void>
```

### UI 组件

#### 新组件: `src/components/plugins/PluginConfigDialog.vue`

- Props: `{ pluginId: string; config: PluginConfigField[] }`
- 通用配置表单弹窗，基于 Field 组件族
- 根据 config schema 动态渲染表单字段
- 支持的 type 到 UI 映射:
  - `string` → `<Input type="text">`
  - `number` → `<Input type="number">`
  - `boolean` → `<Switch>`
  - `select` → `<Select>`
  - `object` → `<Textarea>`（JSON 编辑）
- 保存时写入 `plugin:save-config`
- 打开时从 `plugin:get-config` 加载用户值

#### `PluginCard.vue` 变更

- 已有的设置齿轮按钮（`storeMode === false` 时显示）
- 点击时判断 plugin 是否有 config 定义
- 有 config → 打开 `PluginConfigDialog`
- 无 config → 保持现有行为（emit `open-settings`）

#### `NodeSidebar.vue` 变更

- 插件节点分组 header 右侧增加设置图标（`Settings` icon）
- 点击打开对应插件的 `PluginConfigDialog`
- 仅当插件有 config 定义时显示图标

## 数据流

```
插件安装 → info.json 包含 config 定义
           ↓
用户点击设置 → PluginConfigDialog 加载
           ↓
加载: plugin:get-config → 主进程合并 info.json 默认值 + data.json 用户值
           ↓
用户编辑 → 表单渲染（Field/Input/Select/Switch/Textarea）
           ↓
保存: plugin:save-config → 主进程写入 data.json
           ↓
插件运行时 → context.config[key] → Proxy 返回合并后的值
```

## 错误处理

- data.json 损坏或不存在时，回退到 info.json 默认值
- object 类型值 JSON 解析失败时，在表单中显示错误提示
- 插件无 config 字段时，不显示设置入口

## 文件变更清单

1. `electron/services/plugin-types.ts` - 新增接口
2. `src/types/plugin.ts` - 同步接口
3. `electron/services/plugin-storage.ts` - 新增 `PluginConfigStorage` 类
4. `electron/services/plugin-manager.ts` - 创建 configStorage + context.config
5. `electron/ipc/plugin.ts` - 注册新 IPC handlers
6. `preload/index.ts` - 暴露新 API
7. `src/stores/plugin.ts` - 新增 config 相关方法
8. `src/components/plugins/PluginConfigDialog.vue` - 新组件
9. `src/components/plugins/PluginCard.vue` - 关联设置按钮
10. `src/components/workflow/NodeSidebar.vue` - 增加设置图标
