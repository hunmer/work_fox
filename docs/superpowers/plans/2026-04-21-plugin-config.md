# Plugin Config 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为插件系统增加声明式配置能力，插件在 info.json 中定义 config schema，用户通过 Field 表单弹窗编辑配置值，插件代码通过 `context.config` 读取。

**Architecture:** 新增 `PluginConfigStorage` 类复用 plugin-storage.ts 的文件模式（但存储为 data.json）。通过 Proxy 实现 `context.config` 合并默认值与用户值。新增 IPC 通道桥接主进程配置读写，渲染端新建 `PluginConfigDialog.vue` 通用表单弹窗组件。

**Tech Stack:** TypeScript, Vue 3 Composition API, Field UI 组件族, Dialog/Select/Switch/Input/Textarea 组件

---

## 文件结构

| 操作 | 文件 | 职责 |
|---|---|---|
| 修改 | `electron/services/plugin-types.ts` | 新增 `PluginConfigField` 接口，`PluginInfo` 增加 `config?` 字段 |
| 修改 | `src/types/plugin.ts` | 同步 `PluginConfigField` 接口，`PluginMeta` 增加 `config?` 字段 |
| 修改 | `electron/services/plugin-storage.ts` | 新增 `PluginConfigStorage` 类 |
| 修改 | `electron/services/plugin-context.ts` | `createPluginContext` 新增 `configStorage` 参数，注入 `context.config` |
| 修改 | `electron/services/plugin-manager.ts` | 创建 configStorage，传入 context，list() 返回 config 字段 |
| 修改 | `electron/ipc/plugin.ts` | 注册 `plugin:get-config` / `plugin:save-config` handlers |
| 修改 | `preload/index.ts` | 暴露 `getConfig` / `saveConfig` API |
| 修改 | `src/stores/plugin.ts` | 新增 `getPluginConfig` / `savePluginConfig` 方法 |
| 创建 | `src/components/plugins/PluginConfigDialog.vue` | 通用插件配置表单弹窗 |
| 修改 | `src/components/plugins/PluginCard.vue` | 设置按钮关联配置弹窗 |
| 修改 | `src/components/workflow/NodeSidebar.vue` | 插件节点分组 header 增加设置图标 |

---

### Task 1: 类型定义（双端同步）

**Files:**
- Modify: `electron/services/plugin-types.ts`
- Modify: `src/types/plugin.ts`

- [ ] **Step 1: 在主进程类型中新增 `PluginConfigField` 并扩展 `PluginInfo` 和 `PluginMeta`**

在 `electron/services/plugin-types.ts` 中，在 `PluginInfo` 接口之前新增：

```typescript
/** 插件配置字段定义 */
export interface PluginConfigField {
  /** 配置键名，唯一标识 */
  key: string
  /** 表单标签 */
  label: string
  /** 描述/提示文本 */
  desc?: string
  /** 字段类型 */
  type: 'string' | 'number' | 'boolean' | 'select' | 'object'
  /** 默认值（统一为字符串存储） */
  value: string
  /** select 类型的选项列表 */
  options?: Array<{ label: string; value: string }>
  /** 输入占位文本 */
  placeholder?: string
  /** 是否必填 */
  required?: boolean
}
```

然后在 `PluginInfo` 中追加字段 `config?: PluginConfigField[]`（在 `hasWorkflow?: boolean` 之后）。

在 `PluginMeta` 中追加字段 `config?: PluginConfigField[]`（在 `iconPath: string` 之前）。

在 `PluginContext` 中追加字段 `config: Record<string, string>`（在 `api?: PluginApi` 之前）。

- [ ] **Step 2: 在渲染进程类型中同步新增**

在 `src/types/plugin.ts` 中，同样在 `PluginInfo` 之前新增 `PluginConfigField` 接口（与主进程完全一致）。

`PluginInfo` 追加 `config?: PluginConfigField[]`。

`PluginMeta` 追加 `config?: PluginConfigField[]`。

`PluginContext` 追加 `config: Record<string, string>`。

- [ ] **Step 3: 提交**

```bash
git add electron/services/plugin-types.ts src/types/plugin.ts
git commit -m "feat: add PluginConfigField type and extend PluginInfo/PluginMeta with config field"
```

---

### Task 2: 新增 PluginConfigStorage 类

**Files:**
- Modify: `electron/services/plugin-storage.ts`

- [ ] **Step 1: 在文件末尾新增 `PluginConfigStorage` 类**

复用 `PluginStorage` 的文件模式，但文件名为 `data.json`：

```typescript
export class PluginConfigStorage {
  private filePath: string
  private data: Record<string, string>

  constructor(pluginId: string, userDataPath: string) {
    const dir = join(userDataPath, 'plugin-data', pluginId)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    this.filePath = join(dir, 'data.json')
    try {
      this.data = existsSync(this.filePath) ? JSON.parse(readFileSync(this.filePath, 'utf-8')) : {}
    } catch {
      this.data = {}
    }
  }

  async get(key: string): Promise<string | undefined> {
    return this.data[key]
  }

  async getAll(): Promise<Record<string, string>> {
    return { ...this.data }
  }

  async set(key: string, value: string): Promise<void> {
    this.data[key] = value
    this.save()
  }

  async setAll(data: Record<string, string>): Promise<void> {
    this.data = { ...data }
    this.save()
  }

  async clear(): Promise<void> {
    this.data = {}
    this.save()
  }

  private save(): void {
    writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8')
  }
}
```

- [ ] **Step 2: 提交**

```bash
git add electron/services/plugin-storage.ts
git commit -m "feat: add PluginConfigStorage class for plugin config persistence"
```

---

### Task 3: 注入 context.config

**Files:**
- Modify: `electron/services/plugin-context.ts`
- Modify: `electron/services/plugin-manager.ts`

- [ ] **Step 1: 修改 `createPluginContext` 签名，接受 `configStorage` 参数**

在 `electron/services/plugin-context.ts` 中：

1. 导入新类型：
```typescript
import type { PluginContext, PluginInfo, PluginApi, PluginConfigField } from './plugin-types'
import { PluginConfigStorage } from './plugin-storage'
```

2. 修改函数签名，新增 `configStorage` 和 `configFields` 参数：
```typescript
export function createPluginContext(
  pluginInfo: PluginInfo,
  storage: PluginStorage,
  eventBus: typeof pluginEventBus,
  getMainWindow: () => BrowserWindow | null,
  hasWorkflow = false,
  configStorage?: PluginConfigStorage,
): { context: PluginContext; cleanupEvents: () => void } {
```

3. 在构建 `context` 对象时，在 `api?` 条件之前，注入 `config` Proxy：
```typescript
    config: new Proxy({} as Record<string, string>, {
      get(_, key: string) {
        if (typeof key === 'symbol') return undefined
        const userVal = configStorage ? (configStorage as any).data?.[key] : undefined
        if (userVal !== undefined) return userVal
        const field = pluginInfo.config?.find(f => f.key === key)
        return field?.value
      },
      ownKeys() {
        const keys = new Set<string>()
        if (pluginInfo.config) {
          for (const f of pluginInfo.config) keys.add(f.key)
        }
        if (configStorage) {
          for (const k of Object.keys((configStorage as any).data || {})) keys.add(k)
        }
        return [...keys]
      },
      has(_, key: string) {
        return !!(pluginInfo.config?.find(f => f.key === key)) ||
          !!(configStorage && (configStorage as any).data?.[key] !== undefined)
      }
    }),
```

- [ ] **Step 2: 修改 `plugin-manager.ts` 的 `load()` 方法**

在 `load()` 方法中：

1. 导入 `PluginConfigStorage`：
```typescript
import { PluginStorage, PluginConfigStorage } from './plugin-storage'
```

2. 在创建 `storage` 之后，创建 `configStorage`：
```typescript
    const storage = new PluginStorage(info.id, this.userDataPath)
    const configStorage = info.config?.length ? new PluginConfigStorage(info.id, this.userDataPath) : undefined
```

3. 将 `configStorage` 传入 `createPluginContext`：
```typescript
    const { context, cleanupEvents } = createPluginContext(info, storage, pluginEventBus, () => this.mainWindow, !!info.hasWorkflow, configStorage)
```

4. 修改 `PluginInstance` 类型：在 `storage` 之后增加 `configStorage` 字段：
```typescript
    const instance: PluginInstance = {
      id: info.id,
      dir: pluginDir,
      info,
      enabled: !isDisabled,
      module: pluginModule,
      context,
      storage,
      configStorage,
      cleanupEvents
    }
```

5. 修改 `list()` 方法，返回 config 字段：
```typescript
  list(): PluginMeta[] {
    return Array.from(this.plugins.values()).map((instance) => ({
      id: instance.info.id,
      name: instance.info.name,
      version: instance.info.version,
      description: instance.info.description,
      author: instance.info.author,
      tags: instance.info.tags || [],
      hasView: instance.info.hasView || false,
      enabled: instance.enabled,
      config: instance.info.config,
      iconPath: this.getIconPath(instance)
    }))
  }
```

6. 新增 `getPlugin()` 公共方法（供 IPC handler 使用）：
```typescript
  getPlugin(pluginId: string): PluginInstance | undefined {
    return this.plugins.get(pluginId)
  }
```

- [ ] **Step 3: 在 `plugin-types.ts` 的 `PluginInstance` 中追加 `configStorage` 字段**

在 `PluginInstance` 接口的 `storage` 字段之后追加：
```typescript
  configStorage?: import('./plugin-storage').PluginConfigStorage
```

- [ ] **Step 4: 提交**

```bash
git add electron/services/plugin-context.ts electron/services/plugin-manager.ts electron/services/plugin-types.ts
git commit -m "feat: inject context.config proxy merging defaults and user values"
```

---

### Task 4: IPC 通道 + Preload API

**Files:**
- Modify: `electron/ipc/plugin.ts`
- Modify: `preload/index.ts`

- [ ] **Step 1: 在 `electron/ipc/plugin.ts` 新增两个 IPC handlers**

在 `registerPluginIpcHandlers()` 末尾追加。注意 `plugin:get-config` 必须返回**合并后**的值（info.json 默认值 + data.json 用户值），以匹配设计规格的 IPC 契约：

```typescript
  ipcMain.handle('plugin:get-config', async (_e, pluginId: string) => {
    const instance = pluginManager.getPlugin(pluginId)
    if (!instance) return {}
    const configFields = instance.info.config || []
    const userValues = instance.configStorage ? await instance.configStorage.getAll() : {}
    // 合并：用户值优先，否则使用 info.json 默认值
    const merged: Record<string, string> = {}
    for (const field of configFields) {
      merged[field.key] = userValues[field.key] ?? field.value
    }
    return merged
  })

  ipcMain.handle('plugin:save-config', async (_e, pluginId: string, data: Record<string, string>) => {
    const instance = pluginManager.getPlugin(pluginId)
    if (!instance) return { success: false, error: '插件未找到' }
    if (!instance.configStorage) return { success: false, error: '插件无配置定义' }
    await instance.configStorage.setAll(data)
    return { success: true }
  })
```

- [ ] **Step 2: 在 `preload/index.ts` 的 `plugin` 命名空间中追加**

```typescript
    getConfig: (pluginId: string): Promise<Record<string, string>> =>
      ipcRenderer.invoke('plugin:get-config', pluginId),
    saveConfig: (pluginId: string, data: Record<string, string>): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('plugin:save-config', pluginId, data),
```

- [ ] **Step 3: 提交**

```bash
git add electron/ipc/plugin.ts preload/index.ts
git commit -m "feat: add plugin:get-config and plugin:save-config IPC channels"
```

---

### Task 5: 渲染进程 Store 方法

**Files:**
- Modify: `src/stores/plugin.ts`

- [ ] **Step 1: 新增 `getPluginConfig` 和 `savePluginConfig` 方法**

在 `src/stores/plugin.ts` 的 return 对象之前追加：

```typescript
  async function getPluginConfig(pluginId: string): Promise<Record<string, string>> {
    return window.api.plugin.getConfig(pluginId)
  }

  async function savePluginConfig(pluginId: string, data: Record<string, string>): Promise<{ success: boolean; error?: string }> {
    return window.api.plugin.saveConfig(pluginId, data)
  }
```

在 return 对象中追加导出：
```typescript
    getPluginConfig,
    savePluginConfig,
```

- [ ] **Step 2: 提交**

```bash
git add src/stores/plugin.ts
git commit -m "feat: add getPluginConfig/savePluginConfig to plugin store"
```

---

### Task 6: PluginConfigDialog 组件

**Files:**
- Create: `src/components/plugins/PluginConfigDialog.vue`

- [ ] **Step 1: 创建通用配置表单弹窗组件**

```vue
<script setup lang="ts">
import { ref, watch } from 'vue'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSet,
} from '@/components/ui/field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { usePluginStore } from '@/stores/plugin'
import type { PluginConfigField } from '@/types/plugin'

const props = defineProps<{
  open: boolean
  pluginId: string
  pluginName: string
  config: PluginConfigField[]
}>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
}>()

const pluginStore = usePluginStore()
const formValues = ref<Record<string, string>>({})
const saving = ref(false)
const errorMessage = ref('')

watch(() => props.open, async (isOpen) => {
  if (!isOpen || !props.pluginId) return
  errorMessage.value = ''
  const userValues = await pluginStore.getPluginConfig(props.pluginId)
  const merged: Record<string, string> = {}
  for (const field of props.config) {
    merged[field.key] = userValues[field.key] ?? field.value
  }
  formValues.value = merged
})

/** 验证 object 类型字段是否为合法 JSON */
function validateForm(): string | null {
  for (const field of props.config) {
    if (field.type === 'object') {
      const val = formValues.value[field.key]?.trim()
      if (val) {
        try {
          JSON.parse(val)
        } catch {
          return `"${field.label}" 不是合法的 JSON 格式`
        }
      }
    }
  }
  return null
}

async function handleSave() {
  const validationError = validateForm()
  if (validationError) {
    errorMessage.value = validationError
    return
  }
  saving.value = true
  errorMessage.value = ''
  try {
    const result = await pluginStore.savePluginConfig(props.pluginId, { ...formValues.value })
    if (!result.success) {
      errorMessage.value = result.error || '保存失败'
      return
    }
    emit('update:open', false)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{{ pluginName }} - 设置</DialogTitle>
        <DialogDescription>配置插件的参数</DialogDescription>
      </DialogHeader>

      <div v-if="errorMessage" class="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded">
        {{ errorMessage }}
      </div>

      <FieldSet>
        <FieldGroup>
          <Field v-for="field in config" :key="field.key">
            <FieldLabel :for="`config-${field.key}`">
              {{ field.label }}
              <span v-if="field.required" class="text-destructive">*</span>
            </FieldLabel>

            <!-- string / number -->
            <Input
              v-if="field.type === 'string' || field.type === 'number'"
              :id="`config-${field.key}`"
              :type="field.type === 'number' ? 'number' : 'text'"
              :placeholder="field.placeholder"
              v-model="formValues[field.key]"
            />

            <!-- boolean -->
            <div v-else-if="field.type === 'boolean'" class="flex items-center gap-2">
              <Switch
                :id="`config-${field.key}`"
                :checked="formValues[field.key] === 'true'"
                @update:checked="formValues[field.key] = $event ? 'true' : 'false'"
              />
              <span class="text-sm">{{ formValues[field.key] === 'true' ? '开启' : '关闭' }}</span>
            </div>

            <!-- select (shadcn-vue Select 需要通过 model-value/update:model-value 绑定) -->
            <Select
              v-else-if="field.type === 'select'"
              :model-value="formValues[field.key]"
              @update:model-value="formValues[field.key] = $event"
            >
              <SelectTrigger :id="`config-${field.key}`">
                <SelectValue placeholder="请选择..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  v-for="opt in field.options"
                  :key="opt.value"
                  :value="opt.value"
                >
                  {{ opt.label }}
                </SelectItem>
              </SelectContent>
            </Select>

            <!-- object (JSON 编辑) -->
            <Textarea
              v-else-if="field.type === 'object'"
              :id="`config-${field.key}`"
              :placeholder="field.placeholder || '{}'"
              v-model="formValues[field.key]"
              rows="4"
              class="font-mono text-xs"
            />

            <FieldDescription v-if="field.desc">
              {{ field.desc }}
            </FieldDescription>
          </Field>
        </FieldGroup>
      </FieldSet>

      <DialogFooter>
        <Button variant="outline" @click="emit('update:open', false)">
          取消
        </Button>
        <Button :disabled="saving" @click="handleSave">
          {{ saving ? '保存中...' : '保存' }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
```

- [ ] **Step 2: 提交**

```bash
git add src/components/plugins/PluginConfigDialog.vue
git commit -m "feat: create PluginConfigDialog component with Field-based form"
```

---

### Task 7: PluginCard 集成配置弹窗

**Files:**
- Modify: `src/components/plugins/PluginCard.vue`

- [ ] **Step 1: 修改 PluginCard 关联配置弹窗**

1. 导入 `PluginConfigDialog`：
```typescript
import PluginConfigDialog from './PluginConfigDialog.vue'
import type { PluginMeta, RemotePlugin } from '@/types/plugin'
```

2. 新增 ref 控制弹窗开关：
```typescript
const configDialogOpen = ref(false)
```

3. 修改模板中设置按钮部分。处理 `hasView` + `config` 共存的情况：当插件同时有 view 和 config 时，保留原有的 `open-settings` 按钮（用于打开 view），同时新增一个 config 设置按钮。当插件只有 config 时，点击打开配置弹窗：

将设置按钮区域替换为：
```html
<!-- 打开插件自定义视图（原有行为） -->
<Button
  v-if="plugin.hasView"
  variant="ghost"
  size="icon"
  class="h-7 w-7"
  title="视图"
  @click="emit('open-settings', plugin.id)"
>
  <Settings class="w-4 h-4" />
</Button>
<!-- 打开插件配置弹窗（新增） -->
<Button
  v-if="(plugin as PluginMeta).config?.length"
  variant="ghost"
  size="icon"
  class="h-7 w-7"
  title="配置"
  @click="configDialogOpen = true"
>
  <Settings class="w-4 h-4" />
</Button>
```

4. 在模板末尾追加弹窗组件：
```html
<PluginConfigDialog
  v-if="!storeMode && (plugin as PluginMeta).config?.length"
  v-model:open="configDialogOpen"
  :plugin-id="plugin.id"
  :plugin-name="plugin.name"
  :config="(plugin as PluginMeta).config!"
/>
```

- [ ] **Step 2: 提交**

```bash
git add src/components/plugins/PluginCard.vue
git commit -m "feat: integrate PluginConfigDialog into PluginCard settings button"
```

---

### Task 8: NodeSidebar 增加设置图标

**Files:**
- Modify: `src/components/workflow/NodeSidebar.vue`

- [ ] **Step 1: 在插件节点分组的 header 右侧增加设置图标**

1. 导入依赖：
```typescript
import { Settings } from 'lucide-vue-next'
import PluginConfigDialog from '@/components/plugins/PluginConfigDialog.vue'
```

2. 新增状态：
```typescript
const configPluginId = ref<string | null>(null)
const configPluginName = ref('')
const configFields = ref<any[]>([])
const configDialogOpen = ref(false)

// 获取已安装插件的配置信息（从 pluginStore.plugins 中查找）
function openPluginConfig(pluginId: string) {
  const plugin = pluginStore.plugins.find(p => p.id === pluginId)
  if (!plugin?.config?.length) return
  configPluginId.value = plugin.id
  configPluginName.value = plugin.name
  configFields.value = plugin.config
  configDialogOpen.value = true
}
```

3. 建立插件节点类别到 pluginId 的映射。由于 `pluginNodes` 中节点本身不携带 pluginId，需要在 `loadPluginNodes` 中额外维护一个映射：

新增 ref：
```typescript
const categoryPluginMap = ref<Record<string, string>>({})
```

修改 `loadPluginNodes`，在加载节点时构建映射：
```typescript
async function loadPluginNodes() {
  const seq = ++pluginLoadSeq
  if (!props.enabledPlugins?.length) {
    pluginNodes.value = []
    categoryPluginMap.value = {}
    registerPluginNodeDefinitions([])
    return
  }
  try {
    const allNodes: any[] = []
    const catMap: Record<string, string> = {}
    for (const pluginId of props.enabledPlugins) {
      const nodes = await pluginStore.getWorkflowNodes(pluginId)
      if (seq !== pluginLoadSeq) return
      allNodes.push(...nodes)
      // 记录每个节点 category 对应的 pluginId
      for (const node of nodes) {
        if (node.category) catMap[node.category] = pluginId
      }
    }
    pluginNodes.value = allNodes
    categoryPluginMap.value = catMap
    registerPluginNodeDefinitions(allNodes)
  } catch (e) {
    console.error('[NodeSidebar] 加载插件节点失败:', e)
  }
}
```

4. 修改 CollapsibleTrigger 模板，在节点数量旁边增加设置图标：

```html
<CollapsibleTrigger class="flex items-center w-full px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground rounded hover:bg-muted/50">
  <span>{{ category }}</span>
  <span class="ml-auto flex items-center gap-1">
    <Button
      v-if="categoryPluginMap[category]"
      variant="ghost"
      size="icon"
      class="h-4 w-4"
      @click.stop="openPluginConfig(categoryPluginMap[category])"
    >
      <Settings class="h-3 w-3" />
    </Button>
    <span class="text-[10px]">{{ nodes.length }}</span>
  </span>
</CollapsibleTrigger>
```

5. 在模板末尾追加弹窗组件：
```html
<PluginConfigDialog
  v-if="configPluginId"
  v-model:open="configDialogOpen"
  :plugin-id="configPluginId"
  :plugin-name="configPluginName"
  :config="configFields"
/>
```

- [ ] **Step 2: 提交**

```bash
git add src/components/workflow/NodeSidebar.vue
git commit -m "feat: add plugin config settings icon in NodeSidebar category headers"
```

---

### Task 9: 验证 + 端到端测试

**Files:**
- Modify: `resources/plugins/fetch/info.json` (添加示例 config)

- [ ] **Step 1: 为一个内置插件添加 config 示例，验证完整流程**

在 `resources/plugins/fetch/info.json` 中追加 `config` 字段：

```json
{
  "config": [
    {
      "key": "defaultTimeout",
      "label": "默认超时(ms)",
      "desc": "请求的默认超时时间",
      "type": "number",
      "value": "30000"
    },
    {
      "key": "userAgent",
      "label": "User-Agent",
      "desc": "默认请求头 User-Agent",
      "type": "string",
      "value": "WorkFox/1.0"
    }
  ]
}
```

- [ ] **Step 2: 启动开发服务器验证**

运行: `pnpm dev`

验证项：
1. 打开插件列表，fetch 插件卡片应显示设置按钮
2. 点击设置按钮，应弹出配置表单弹窗
3. 表单应显示 "默认超时" 和 "User-Agent" 两个字段
4. 修改值后保存，关闭弹窗
5. 重新打开，应显示之前保存的值
6. 检查 `{userDataPath}/plugin-data/workfox.fetch/data.json` 是否正确写入

- [ ] **Step 3: 验证 NodeSidebar 设置图标**

1. 打开工作流编辑器
2. 确保启用了有 config 定义的插件
3. 该插件的节点分组 header 右侧应显示设置图标
4. 点击图标应打开配置弹窗

- [ ] **Step 4: 最终提交**

```bash
git add resources/plugins/fetch/info.json
git commit -m "feat: add config example to fetch plugin"
```
