# 插件注册工作流节点 - 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将硬编码的工作流节点改为插件系统提供，插件通过 workflow.js 注册节点，工作流可选择性启用插件。

**Architecture:** 主进程新增 WorkflowNodeRegistry 管理插件节点注册/查询。PluginContext 扩展 api 命名空间暴露 BrowserWindow 能力。前端 NodeSidebar 根据 Workflow.enabledPlugins 过滤展示插件节点。窗口管理节点迁移为独立插件。

**Tech Stack:** Electron (main/renderer), Vue 3, TypeScript, Pinia, IPC

---

## Batch 1: 类型定义 + 主进程节点注册表

### Task 1: 扩展类型定义

**Files:**
- Modify: `electron/services/plugin-types.ts`
- Modify: `src/types/plugin.ts`
- Modify: `src/lib/workflow/types.ts`

- [ ] **Step 1: 在 `electron/services/plugin-types.ts` 新增工作流节点相关类型**

在 `PluginInfo` 接口中新增 `hasWorkflow?: boolean` 字段。

新增插件节点定义类型和 handler 类型：

```ts
/** 插件工作流节点定义（workflow.js 导出） */
export interface PluginWorkflowNode {
  type: string
  label: string
  category: string
  icon?: string
  description: string
  properties?: Array<{
    key: string
    label: string
    type: 'text' | 'textarea' | 'number' | 'select' | 'checkbox' | 'code'
    required?: boolean
    default?: any
    options?: Array<{ label: string; value: string }>
    tooltip?: string
  }>
  handles?: {
    source?: boolean
    target?: boolean
    dynamicSource?: { dataKey: string; extraCount?: number }
  }
  /** 节点执行 handler，ctx.api 包含主进程暴露的能力 */
  handler?: (ctx: PluginNodeContext, args: Record<string, any>) => Promise<PluginToolResult>
}

/** 插件节点执行上下文 */
export interface PluginNodeContext {
  api: PluginApi
  nodeId: string
  nodeLabel: string
  /** 上游节点输出，key 为 node ID */
  upstream: Record<string, any>
}

/** 插件 handler 返回结果 */
export interface PluginToolResult {
  success: boolean
  message?: string
  data?: any
}

/** 插件 API 能力（暴露给插件 handler 的主进程能力） */
export interface PluginApi {
  createWindow(opts: {
    url: string
    title?: string
    width?: number
    height?: number
  }): Promise<{ id: number; webContentsId: number }>
  closeWindow(windowId: number): Promise<void>
  navigateWindow(windowId: number, url: string): Promise<void>
  focusWindow(windowId: number): Promise<void>
  screenshotWindow(windowId: number): Promise<string>
  getWindowDetail(windowId: number): Promise<Record<string, any>>
  listWindows(): Promise<Array<Record<string, any>>>
}

/** 插件工作流模块（workflow.js 导出） */
export interface PluginWorkflowModule {
  nodes: PluginWorkflowNode[]
}
```

在 `PluginContext` 接口中新增可选 `api` 字段：

```ts
export interface PluginContext {
  // ... 现有字段不变
  api?: PluginApi
}
```

- [ ] **Step 2: 同步 `src/types/plugin.ts`**

将相同的 `PluginWorkflowNode`、`PluginNodeContext`、`PluginToolResult`、`PluginApi` 类型添加到渲染进程类型文件。同时在 `PluginInfo` 中新增 `hasWorkflow?: boolean`。

注意：渲染进程不需要 `PluginNodeContext`（那是主进程执行时用的），但需要 `PluginWorkflowNode`（UI 展示用）。

- [ ] **Step 3: 在 `src/lib/workflow/types.ts` 的 Workflow 接口新增 enabledPlugins**

```ts
export interface Workflow {
  // ... 现有字段
  enabledPlugins?: string[]  // 已启用的插件 ID 列表，默认 []
}
```

使用 `enabledPlugins?` 可选字段，兼容已有工作流数据。

- [ ] **Step 4: 验证编译**

Run: `cd /Users/Zhuanz/Documents/work_fox && npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: 无新增类型错误（可能有未使用的 import 警告，可忽略）

- [ ] **Step 5: Commit**

```bash
git add electron/services/plugin-types.ts src/types/plugin.ts src/lib/workflow/types.ts
git commit -m "feat: add plugin workflow node types and Workflow.enabledPlugins field"
```

---

### Task 2: 新建 WorkflowNodeRegistry（主进程）

**Files:**
- Create: `electron/services/workflow-node-registry.ts`

- [ ] **Step 1: 创建 workflow-node-registry.ts**

```ts
// electron/services/workflow-node-registry.ts
import type { PluginWorkflowNode, PluginToolResult, PluginNodeContext } from './plugin-types'

type NodeHandler = (ctx: PluginNodeContext, args: Record<string, any>) => Promise<PluginToolResult>

/** 插件注册的节点条目 */
interface PluginNodeEntry {
  pluginId: string
  nodes: PluginWorkflowNode[]
  handlers: Map<string, NodeHandler>
}

class WorkflowNodeRegistry {
  private entries: Map<string, PluginNodeEntry> = new Map()

  /** 注册插件的工作流节点 */
  register(pluginId: string, workflowModule: { nodes: PluginWorkflowNode[] }): void {
    const nodes: PluginWorkflowNode[] = []
    const handlers = new Map<string, NodeHandler>()

    for (const node of workflowModule.nodes) {
      if (node.handler) {
        handlers.set(node.type, node.handler)
      }
      // handler 不序列化，只保留定义数据
      nodes.push({ ...node, handler: undefined })
    }

    this.entries.set(pluginId, { pluginId, nodes, handlers })
    console.log(`[WorkflowNodeRegistry] 插件 ${pluginId} 注册了 ${nodes.length} 个节点`)
  }

  /** 卸载插件的工作流节点 */
  unregister(pluginId: string): void {
    this.entries.delete(pluginId)
  }

  /** 获取指定插件的节点定义（序列化安全，不含 handler） */
  getPluginNodes(pluginId: string): PluginWorkflowNode[] {
    return this.entries.get(pluginId)?.nodes || []
  }

  /** 获取所有已注册插件的节点定义 */
  getAllPluginNodes(): Array<{ pluginId: string; nodes: PluginWorkflowNode[] }> {
    return Array.from(this.entries.values()).map((e) => ({
      pluginId: e.pluginId,
      nodes: e.nodes,
    }))
  }

  /** 查找节点 handler */
  getHandler(nodeType: string): NodeHandler | undefined {
    for (const entry of this.entries.values()) {
      const handler = entry.handlers.get(nodeType)
      if (handler) return handler
    }
    return undefined
  }

  /** 获取所有注册的节点类型列表（含插件 ID） */
  getRegisteredTypes(): Array<{ pluginId: string; type: string }> {
    const result: Array<{ pluginId: string; type: string }> = []
    for (const entry of this.entries.values()) {
      for (const node of entry.nodes) {
        result.push({ pluginId: entry.pluginId, type: node.type })
      }
    }
    return result
  }
}

export const workflowNodeRegistry = new WorkflowNodeRegistry()
```

- [ ] **Step 2: 验证编译**

Run: `cd /Users/Zhuanz/Documents/work_fox && npx tsc --noEmit --pretty 2>&1 | head -30`

- [ ] **Step 3: Commit**

```bash
git add electron/services/workflow-node-registry.ts
git commit -m "feat: add WorkflowNodeRegistry for plugin node management"
```

---

## Batch 2: PluginContext API 扩展

### Task 3: 新建窗口管理服务

**Files:**
- Create: `electron/services/window-manager.ts`

- [ ] **Step 1: 创建 window-manager.ts**

这是实际的窗口管理逻辑，之前不存在，需要新建。

```ts
// electron/services/window-manager.ts
import { BrowserWindow, screen } from 'electron'

interface ManagedWindow {
  id: number
  window: BrowserWindow
  title: string
  url: string
  createdAt: number
}

class WindowManager {
  private windows: Map<number, ManagedWindow> = new Map()

  async createWindow(opts: {
    url: string
    title?: string
    width?: number
    height?: number
  }): Promise<{ id: number; webContentsId: number }> {
    const { width = 1280, height = 800 } = opts
    const point = screen.getCursorScreenPoint()
    const display = screen.getDisplayNearestPoint(point)
    const x = Math.round(display.bounds.x + (display.bounds.width - width) / 2)
    const y = Math.round(display.bounds.y + (display.bounds.height - height) / 2)

    const win = new BrowserWindow({
      width,
      height,
      x,
      y,
      title: opts.title || 'WorkFox Window',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    })

    const id = win.id
    const managed: ManagedWindow = {
      id,
      window: win,
      title: opts.title || 'WorkFox Window',
      url: opts.url,
      createdAt: Date.now(),
    }

    this.windows.set(id, managed)

    win.on('closed', () => {
      this.windows.delete(id)
    })

    await win.loadURL(opts.url)
    return { id, webContentsId: win.webContents.id }
  }

  async closeWindow(windowId: number): Promise<void> {
    const managed = this.windows.get(windowId)
    if (!managed) throw new Error(`窗口 ${windowId} 不存在`)
    managed.window.close()
    this.windows.delete(windowId)
  }

  async navigateWindow(windowId: number, url: string): Promise<void> {
    const managed = this.windows.get(windowId)
    if (!managed) throw new Error(`窗口 ${windowId} 不存在`)
    managed.url = url
    await managed.window.loadURL(url)
  }

  async focusWindow(windowId: number): Promise<void> {
    const managed = this.windows.get(windowId)
    if (!managed) throw new Error(`窗口 ${windowId} 不存在`)
    if (managed.window.isMinimized()) managed.window.restore()
    managed.window.focus()
  }

  async screenshotWindow(windowId: number): Promise<string> {
    const managed = this.windows.get(windowId)
    if (!managed) throw new Error(`窗口 ${windowId} 不存在`)
    const image = await managed.window.webContents.capturePage()
    return image.toDataURL()
  }

  async getWindowDetail(windowId: number): Promise<Record<string, any>> {
    const managed = this.windows.get(windowId)
    if (!managed) throw new Error(`窗口 ${windowId} 不存在`)
    const bounds = managed.window.getBounds()
    return {
      id: managed.id,
      title: managed.window.getTitle(),
      url: managed.window.webContents.getURL(),
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
      isMinimized: managed.window.isMinimized(),
      isMaximized: managed.window.isMaximized(),
      webContentsId: managed.window.webContents.id,
      createdAt: managed.createdAt,
    }
  }

  async listWindows(): Promise<Array<Record<string, any>>> {
    const result: Array<Record<string, any>> = []
    for (const [id, managed] of this.windows) {
      const bounds = managed.window.getBounds()
      result.push({
        id,
        title: managed.window.getTitle(),
        url: managed.window.webContents.getURL(),
        width: bounds.width,
        height: bounds.height,
        webContentsId: managed.window.webContents.id,
      })
    }
    return result
  }

  /** 清理所有窗口（应用退出时） */
  closeAll(): void {
    for (const [id, managed] of this.windows) {
      if (!managed.window.isDestroyed()) {
        managed.window.close()
      }
    }
    this.windows.clear()
  }
}

export const windowManager = new WindowManager()
```

- [ ] **Step 2: 验证编译**

Run: `cd /Users/Zhuanz/Documents/work_fox && npx tsc --noEmit --pretty 2>&1 | head -30`

- [ ] **Step 3: Commit**

```bash
git add electron/services/window-manager.ts
git commit -m "feat: add WindowManager service for plugin browser window operations"
```

---

### Task 4: 扩展 PluginContext 注入 api

**Files:**
- Modify: `electron/services/plugin-context.ts`
- Modify: `electron/services/plugin-types.ts`（如需调整）

- [ ] **Step 1: 修改 plugin-context.ts，新增 api 注入**

在 `createPluginContext` 函数签名中增加可选参数 `hasWorkflow`，当为 true 时注入 `api`：

```ts
import { pluginEventBus } from './plugin-event-bus'
import { PluginStorage } from './plugin-storage'
import { windowManager } from './window-manager'
import type { PluginContext, PluginInfo, PluginApi, PluginNodeContext } from './plugin-types'

export function createPluginContext(
  pluginInfo: PluginInfo,
  storage: PluginStorage,
  eventBus: typeof pluginEventBus,
  getMainWindow: () => import('electron').BrowserWindow | null,
  hasWorkflow = false,
): { context: PluginContext; cleanupEvents: () => void } {
```

在 context 对象中新增 `api`：

```ts
  // 在 context 对象内，sendToRenderer 之后新增：
  ...(hasWorkflow
    ? {
        api: {
          createWindow: (opts) => windowManager.createWindow(opts),
          closeWindow: (windowId) => windowManager.closeWindow(windowId),
          navigateWindow: (windowId, url) => windowManager.navigateWindow(windowId, url),
          focusWindow: (windowId) => windowManager.focusWindow(windowId),
          screenshotWindow: (windowId) => windowManager.screenshotWindow(windowId),
          getWindowDetail: (windowId) => windowManager.getWindowDetail(windowId),
          listWindows: () => windowManager.listWindows(),
        } satisfies PluginApi,
      }
    : {}),
```

- [ ] **Step 2: 验证编译**

Run: `cd /Users/Zhuanz/Documents/work_fox && npx tsc --noEmit --pretty 2>&1 | head -30`

- [ ] **Step 3: Commit**

```bash
git add electron/services/plugin-context.ts
git commit -m "feat: inject PluginApi into PluginContext for workflow plugins"
```

---

## Batch 3: PluginManager 集成 workflow.js 加载

### Task 5: PluginManager 加载 workflow.js

**Files:**
- Modify: `electron/services/plugin-manager.ts`

- [ ] **Step 1: 在 PluginManager.load 中增加 workflow.js 加载逻辑**

在 `load` 方法中，`this.plugins.set(info.id, instance)` 之前，增加：

```ts
    // 加载 workflow.js（如果有）
    let workflowModule: any = null
    const workflowPath = join(pluginDir, 'workflow.js')
    if (info.hasWorkflow && existsSync(workflowPath)) {
      try {
        workflowModule = require(workflowPath)
        if (workflowModule?.nodes) {
          const { workflowNodeRegistry } = require('./workflow-node-registry')
          workflowNodeRegistry.register(info.id, workflowModule)
        }
      } catch (err) {
        console.error(`[PluginManager] 插件 ${info.name} 的 workflow.js 加载失败:`, err)
      }
    }
```

- [ ] **Step 2: 在 unload 方法中增加节点注销**

在 `instance.cleanupEvents()` 之前新增：

```ts
    // 注销工作流节点
    if (instance.info.hasWorkflow) {
      const { workflowNodeRegistry } = require('./workflow-node-registry')
      workflowNodeRegistry.unregister(pluginId)
    }
```

- [ ] **Step 3: 修改 createPluginContext 调用，传入 hasWorkflow 参数**

将 `load` 方法中的：

```ts
const { context, cleanupEvents } = createPluginContext(info, storage, pluginEventBus, () => this.mainWindow)
```

改为：

```ts
const { context, cleanupEvents } = createPluginContext(info, storage, pluginEventBus, () => this.mainWindow, !!info.hasWorkflow)
```

- [ ] **Step 4: 验证编译**

Run: `cd /Users/Zhuanz/Documents/work_fox && npx tsc --noEmit --pretty 2>&1 | head -30`

- [ ] **Step 5: Commit**

```bash
git add electron/services/plugin-manager.ts
git commit -m "feat: PluginManager loads workflow.js and registers plugin nodes"
```

---

## Batch 4: IPC 通道 + 工作流执行集成

### Task 6: 新增 IPC 通道

**Files:**
- Modify: `electron/ipc/plugin.ts`

- [ ] **Step 1: 新增两个 IPC handler**

在 `registerPluginIpcHandlers` 函数末尾新增：

```ts
  ipcMain.handle('plugin:get-workflow-nodes', (_e, pluginId: string) => {
    const { workflowNodeRegistry } = require('../services/workflow-node-registry')
    return workflowNodeRegistry.getPluginNodes(pluginId)
  })

  ipcMain.handle('plugin:list-workflow-plugins', () => {
    const { workflowNodeRegistry } = require('../services/workflow-node-registry')
    const allPluginMeta = pluginManager.list()
    const workflowPlugins = allPluginMeta.filter((p) => {
      // 从已加载的插件实例中检查 hasWorkflow
      // 或者直接从 registry 判断
      return workflowNodeRegistry.getPluginNodes(p.id).length > 0
    })
    return workflowPlugins.map((p) => ({
      ...p,
      nodeCount: workflowNodeRegistry.getPluginNodes(p.id).length,
    }))
  })
```

- [ ] **Step 2: 验证编译**

Run: `cd /Users/Zhuanz/Documents/work_fox && npx tsc --noEmit --pretty 2>&1 | head -30`

- [ ] **Step 3: Commit**

```bash
git add electron/ipc/plugin.ts
git commit -m "feat: add IPC channels for plugin workflow nodes"
```

---

### Task 7: 工作流执行集成插件 handler

**Files:**
- Modify: `src/lib/workflow/engine.ts`
- Modify: `electron/ipc/chat.ts`（实现 agent:execTool）

- [ ] **Step 1: 实现 agent:execTool 空壳，支持插件节点分发**

修改 `electron/ipc/chat.ts` 中的 `agent:execTool` handler：

```ts
import { workflowNodeRegistry } from '../services/workflow-node-registry'

ipcMain.handle('agent:execTool', async (_event, toolType: string, params: Record<string, any>) => {
  const handler = workflowNodeRegistry.getHandler(toolType)
  if (!handler) {
    return { error: `Tool not available: ${toolType}` }
  }
  try {
    const result = await handler(
      {
        api: {
          createWindow: (opts) => require('../services/window-manager').windowManager.createWindow(opts),
          closeWindow: (wid) => require('../services/window-manager').windowManager.closeWindow(wid),
          navigateWindow: (wid, url) => require('../services/window-manager').windowManager.navigateWindow(wid, url),
          focusWindow: (wid) => require('../services/window-manager').windowManager.focusWindow(wid),
          screenshotWindow: (wid) => require('../services/window-manager').windowManager.screenshotWindow(wid),
          getWindowDetail: (wid) => require('../services/window-manager').windowManager.getWindowDetail(wid),
          listWindows: () => require('../services/window-manager').windowManager.listWindows(),
        },
        nodeId: params.nodeId || '',
        nodeLabel: params.nodeLabel || '',
        upstream: params.upstream || {},
      },
      params,
    )
    return result
  } catch (err: any) {
    return { success: false, message: err.message }
  }
})
```

- [ ] **Step 2: 验证编译**

Run: `cd /Users/Zhuanz/Documents/work_fox && npx tsc --noEmit --pretty 2>&1 | head -30`

- [ ] **Step 3: Commit**

```bash
git add electron/ipc/chat.ts
git commit -m "feat: implement agent:execTool to dispatch plugin node handlers"
```

---

## Batch 5: 前端 - Plugin Store 扩展 + NodeSidebar + PluginPickerDialog

### Task 8: 扩展 Plugin Store

**Files:**
- Modify: `src/stores/plugin.ts`
- Modify: `preload/index.ts`（新增 IPC 桥接方法）

- [ ] **Step 1: 在 preload 中添加新的 IPC 桥接**

先读取 `preload/index.ts` 找到 plugin 相关的桥接定义位置，然后添加：

```ts
// 在 plugin 命名空间中新增
getWorkflowNodes: (pluginId: string) => ipcRenderer.invoke('plugin:get-workflow-nodes', pluginId),
listWorkflowPlugins: () => ipcRenderer.invoke('plugin:list-workflow-plugins'),
```

- [ ] **Step 2: 在 plugin store 中新增工作流插件相关方法**

```ts
  async function getWorkflowNodes(pluginId: string): Promise<any[]> {
    return window.api.plugin.getWorkflowNodes(pluginId)
  }

  async function listWorkflowPlugins(): Promise<Array<PluginMeta & { nodeCount: number }>> {
    return window.api.plugin.listWorkflowPlugins()
  }
```

在 return 中导出这两个方法。

- [ ] **Step 3: 验证编译**

Run: `cd /Users/Zhuanz/Documents/work_fox && npx tsc --noEmit --pretty 2>&1 | head -30`

- [ ] **Step 4: Commit**

```bash
git add src/stores/plugin.ts preload/index.ts
git commit -m "feat: add workflow plugin methods to plugin store and preload"
```

---

### Task 9: 修改 NodeSidebar 展示插件节点

**Files:**
- Modify: `src/components/workflow/NodeSidebar.vue`

- [ ] **Step 1: 修改 NodeSidebar 支持插件节点 + 加号按钮**

需要传入当前工作流的 `enabledPlugins`，从 plugin store 获取插件节点定义，合并到 categories 中。

新增 props：

```ts
const props = defineProps<{
  enabledPlugins?: string[]
}>()
```

新增插件节点加载逻辑：

```ts
import { usePluginStore } from '@/stores/plugin'

const pluginStore = usePluginStore()
const pluginNodes = ref<NodeTypeDefinition[]>([])

async function loadPluginNodes() {
  if (!props.enabledPlugins?.length) {
    pluginNodes.value = []
    return
  }
  const allNodes: NodeTypeDefinition[] = []
  for (const pluginId of props.enabledPlugins) {
    const nodes = await pluginStore.getWorkflowNodes(pluginId)
    allNodes.push(...nodes)
  }
  pluginNodes.value = allNodes
}

watch(() => props.enabledPlugins, loadPluginNodes, { immediate: true, deep: true })
```

修改 categories computed，合并内置 + 插件节点：

```ts
const categories = computed(() => {
  const base = searchQuery.value.trim()
    ? searchNodeDefinitions(searchQuery.value)
    : allNodeDefinitions
  const merged = [...base, ...pluginNodes.value]
  const grouped: Record<string, typeof merged> = {}
  for (const def of merged) {
    if (!grouped[def.category]) grouped[def.category] = []
    grouped[def.category].push(def)
  }
  return grouped
})
```

在搜索框 div 后面加加号按钮：

```html
<div class="p-2 border-b border-border">
  <div class="relative flex items-center gap-1">
    <div class="relative flex-1">
      <Search class="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
      <Input v-model="searchQuery" placeholder="搜索节点..." class="pl-7 h-7 text-xs" />
    </div>
    <Button variant="ghost" size="icon" class="h-7 w-7 shrink-0" @click="$emit('openPluginPicker')">
      <Plus class="h-3.5 w-3.5" />
    </Button>
  </div>
</div>
```

新增 import：

```ts
import { Plus } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import type { NodeTypeDefinition } from '@/lib/workflow/types'
```

定义 emit：

```ts
const emit = defineEmits<{
  (e: 'openPluginPicker'): void
}>()
```

- [ ] **Step 2: 验证编译**

Run: `cd /Users/Zhuanz/Documents/work_fox && npx tsc --noEmit --pretty 2>&1 | head -30`

- [ ] **Step 3: Commit**

```bash
git add src/components/workflow/NodeSidebar.vue
git commit -m "feat: NodeSidebar shows plugin nodes and plugin picker button"
```

---

### Task 10: 新建 PluginPickerDialog

**Files:**
- Create: `src/components/workflow/PluginPickerDialog.vue`

- [ ] **Step 1: 创建 PluginPickerDialog.vue**

```vue
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { usePluginStore } from '@/stores/plugin'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Checkbox } from '@/components/ui/checkbox'

const props = defineProps<{
  enabledPlugins: string[]
}>()

const emit = defineEmits<{
  (e: 'update:enabledPlugins', value: string[]): void
}>()

const pluginStore = usePluginStore()
const workflowPlugins = ref<Array<{ id: string; name: string; description: string; nodeCount: number; enabled: boolean }>>([])

onMounted(async () => {
  const list = await pluginStore.listWorkflowPlugins()
  const enabledSet = new Set(props.enabledPlugins)
  workflowPlugins.value = list.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    nodeCount: p.nodeCount,
    enabled: enabledSet.has(p.id),
  }))
})

function togglePlugin(pluginId: string) {
  const updated = workflowPlugins.value.map((p) =>
    p.id === pluginId ? { ...p, enabled: !p.enabled } : p,
  )
  workflowPlugins.value = updated
  emit('update:enabledPlugins', updated.filter((p) => p.enabled).map((p) => p.id))
}
</script>

<template>
  <Dialog>
    <DialogContent class="sm:max-w-[400px]">
      <DialogHeader>
        <DialogTitle>工作流插件</DialogTitle>
      </DialogHeader>
      <ScrollArea class="max-h-[400px]">
        <div class="space-y-2 p-2">
          <div
            v-for="plugin in workflowPlugins"
            :key="plugin.id"
            class="flex items-start gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/50"
            @click="togglePlugin(plugin.id)"
          >
            <Checkbox
              :model-value="plugin.enabled"
              class="mt-0.5"
              @update:model-value="togglePlugin(plugin.id)"
              @click.stop
            />
            <div class="flex-1 min-w-0">
              <div class="font-medium text-sm">{{ plugin.name }}</div>
              <div class="text-xs text-muted-foreground mt-0.5">{{ plugin.description }}</div>
              <div class="text-xs text-muted-foreground mt-1">{{ plugin.nodeCount }} 个节点</div>
            </div>
          </div>
          <div
            v-if="workflowPlugins.length === 0"
            class="text-center text-sm text-muted-foreground py-8"
          >
            没有可用的工作流插件
          </div>
        </div>
      </ScrollArea>
    </DialogContent>
  </Dialog>
</template>
```

- [ ] **Step 2: 在使用 NodeSidebar 的父组件中集成 PluginPickerDialog**

找到引用 NodeSidebar 的父组件（工作流编辑器页面），添加：

```vue
import PluginPickerDialog from './PluginPickerDialog.vue'

const showPluginPicker = ref(false)
const enabledPlugins = ref<string[]>(currentWorkflow.value?.enabledPlugins || [])

// 同步 enabledPlugins 到工作流数据
watch(enabledPlugins, (val) => {
  if (currentWorkflow.value) {
    currentWorkflow.value.enabledPlugins = val
    // 持久化（调用 workflow update API）
  }
})
```

```html
<NodeSidebar
  :enabled-plugins="enabledPlugins"
  @open-plugin-picker="showPluginPicker = true"
/>
<PluginPickerDialog
  v-model:enabled-plugins="enabledPlugins"
/>
```

注意：具体文件路径需要在实施时查找引用 NodeSidebar 的父组件。

- [ ] **Step 3: 验证编译**

Run: `cd /Users/Zhuanz/Documents/work_fox && npx tsc --noEmit --pretty 2>&1 | head -30`

- [ ] **Step 4: Commit**

```bash
git add src/components/workflow/PluginPickerDialog.vue
git commit -m "feat: add PluginPickerDialog for enabling workflow plugins"
```

---

## Batch 6: 窗口管理插件

### Task 11: 创建 window-manager 插件

**Files:**
- Create: `plugins/window-manager/info.json`
- Create: `plugins/window-manager/main.js`
- Create: `plugins/window-manager/workflow.js`
- Create: `plugins/window-manager/icon.png`（从现有 test-plugin 复制或用占位图）

- [ ] **Step 1: 创建 info.json**

```json
{
  "id": "workfox.window-manager",
  "name": "窗口管理",
  "version": "1.0.0",
  "description": "提供独立浏览器窗口的创建、导航、关闭、截图等操作节点",
  "author": { "name": "workfox" },
  "tags": ["窗口", "浏览器", "管理"],
  "hasWorkflow": true,
  "hasView": false
}
```

- [ ] **Step 2: 创建 main.js**

```js
exports.activate = (context) => {
  context.logger.info('窗口管理插件已激活')
}

exports.deactivate = (context) => {
  context.logger.info('窗口管理插件已停用')
}
```

- [ ] **Step 3: 创建 workflow.js**

```js
module.exports = {
  nodes: [
    {
      type: 'create_window',
      label: '创建窗口',
      category: '窗口管理',
      icon: 'AppWindow',
      description: '创建独立浏览器窗口',
      properties: [
        { key: 'url', label: 'URL', type: 'text', required: true, tooltip: '要打开的 URL' },
        { key: 'title', label: '窗口标题', type: 'text', tooltip: '窗口标题' },
        { key: 'width', label: '宽度', type: 'number', default: 1280, tooltip: '窗口宽度' },
        { key: 'height', label: '高度', type: 'number', default: 800, tooltip: '窗口高度' },
      ],
      handler: async (ctx, args) => {
        const result = await ctx.api.createWindow(args)
        return { success: true, message: `窗口已创建: ${result.id}`, data: result }
      },
    },
    {
      type: 'navigate_window',
      label: '导航窗口',
      category: '窗口管理',
      icon: 'Navigation',
      description: '导航独立窗口到指定 URL',
      properties: [
        { key: 'windowId', label: '窗口 ID', type: 'number', required: true, tooltip: '目标窗口 ID' },
        { key: 'url', label: 'URL', type: 'text', required: true, tooltip: '目标 URL' },
      ],
      handler: async (ctx, args) => {
        await ctx.api.navigateWindow(args.windowId, args.url)
        return { success: true, message: `窗口 ${args.windowId} 已导航到 ${args.url}` }
      },
    },
    {
      type: 'close_window',
      label: '关闭窗口',
      category: '窗口管理',
      icon: 'X',
      description: '关闭指定的独立浏览器窗口',
      properties: [
        { key: 'windowId', label: '窗口 ID', type: 'number', required: true, tooltip: '要关闭的窗口 ID' },
      ],
      handler: async (ctx, args) => {
        await ctx.api.closeWindow(args.windowId)
        return { success: true, message: `窗口 ${args.windowId} 已关闭` }
      },
    },
    {
      type: 'list_windows',
      label: '列出窗口',
      category: '窗口管理',
      icon: 'LayoutList',
      description: '列出所有打开的浏览器窗口',
      properties: [],
      handler: async (ctx) => {
        const windows = await ctx.api.listWindows()
        return { success: true, message: `共 ${windows.length} 个窗口`, data: { windows } }
      },
    },
    {
      type: 'focus_window',
      label: '聚焦窗口',
      category: '窗口管理',
      icon: 'Maximize',
      description: '将指定窗口聚焦到前台',
      properties: [
        { key: 'windowId', label: '窗口 ID', type: 'number', required: true, tooltip: '目标窗口 ID' },
      ],
      handler: async (ctx, args) => {
        await ctx.api.focusWindow(args.windowId)
        return { success: true, message: `窗口 ${args.windowId} 已聚焦` }
      },
    },
    {
      type: 'screenshot_window',
      label: '窗口截图',
      category: '窗口管理',
      icon: 'Camera',
      description: '截取独立窗口的页面截图',
      properties: [
        { key: 'windowId', label: '窗口 ID', type: 'number', required: true, tooltip: '目标窗口 ID' },
      ],
      handler: async (ctx, args) => {
        const dataUrl = await ctx.api.screenshotWindow(args.windowId)
        return { success: true, message: '截图完成', data: { screenshot: dataUrl } }
      },
    },
    {
      type: 'get_window_detail',
      label: '窗口详情',
      category: '窗口管理',
      icon: 'Info',
      description: '获取窗口详细信息',
      properties: [
        { key: 'windowId', label: '窗口 ID', type: 'number', required: true, tooltip: '目标窗口 ID' },
      ],
      handler: async (ctx, args) => {
        const detail = await ctx.api.getWindowDetail(args.windowId)
        return { success: true, message: '窗口详情已获取', data: detail }
      },
    },
  ],
}
```

- [ ] **Step 4: 复制图标**

Run: `cp /Users/Zhuanz/Documents/work_fox/plugins/test-plugin/icon.png /Users/Zhuanz/Documents/work_fox/plugins/window-manager/icon.png`

- [ ] **Step 5: Commit**

```bash
git add plugins/window-manager/
git commit -m "feat: add window-manager plugin with 7 workflow nodes"
```

---

## Batch 7: 清理硬编码的窗口节点

### Task 12: 从内置代码中移除窗口管理节点

**Files:**
- Modify: `electron/services/workflow-tool-executor.ts`
- Modify: `src/lib/agent/tools.ts`
- Modify: `src/lib/workflow/nodeRegistry.ts`

- [ ] **Step 1: 从 workflow-tool-executor.ts 的 NODE_TYPE_DEFINITIONS 中移除窗口管理条目**

删除第 28-35 行（窗口管理分类下的 7 个节点定义）。

- [ ] **Step 2: 从 tools.ts 中移除 createWindowTools 函数及其调用**

删除 `createWindowTools()` 函数（第 270-281 行），以及任何调用它的地方。

先查找 `createWindowTools` 在哪里被调用：

Run: `cd /Users/Zhuanz/Documents/work_fox && grep -n "createWindowTools\|WindowTools" src/lib/agent/tools.ts`

根据结果移除调用和函数定义。

- [ ] **Step 3: 从 nodeRegistry.ts 中移除窗口管理相关的 toolSchemas 和 iconMap 条目**

删除 `toolSchemas` 中的 `create_window`、`navigate_window`、`close_window`、`list_windows`、`focus_window`、`screenshot_window`、`get_window_detail` 条目（第 84-118 行区域）。

删除 `iconMap` 中的对应条目（第 135-141 行区域）。

- [ ] **Step 4: 验证编译**

Run: `cd /Users/Zhuanz/Documents/work_fox && npx tsc --noEmit --pretty 2>&1 | head -40`

- [ ] **Step 5: Commit**

```bash
git add electron/services/workflow-tool-executor.ts src/lib/agent/tools.ts src/lib/workflow/nodeRegistry.ts
git commit -m "refactor: remove hardcoded window management nodes, now provided by plugin"
```

---

## Batch 8: 更新 plugins.json + 集成验证

### Task 13: 更新 plugins.json

**Files:**
- Modify: `plugins/plugins.json`

- [ ] **Step 1: 在 plugins.json 中添加 window-manager 插件条目**

```json
[
  {
    "id": "workfox.test-plugin",
    "name": "Test Plugin",
    "version": "1.0.0",
    "description": "workfox 插件系统测试插件",
    "author": { "name": "workfox" },
    "tags": ["测试", "开发"],
    "hasView": true,
    "downloadUrl": "test-plugin.zip",
    "iconUrl": "test-plugin/icon.png"
  },
  {
    "id": "workfox.window-manager",
    "name": "窗口管理",
    "version": "1.0.0",
    "description": "提供独立浏览器窗口的创建、导航、关闭、截图等操作节点",
    "author": { "name": "workfox" },
    "tags": ["窗口", "浏览器"],
    "hasWorkflow": true,
    "hasView": false,
    "downloadUrl": "window-manager.zip",
    "iconUrl": "window-manager/icon.png"
  }
]
```

- [ ] **Step 2: Commit**

```bash
git add plugins/plugins.json
git commit -m "feat: register window-manager plugin in plugins.json"
```

---

### Task 14: 端到端验证

- [ ] **Step 1: 启动应用验证**

Run: `cd /Users/Zhuanz/Documents/work_fox && npm run dev`

验证清单：
1. 应用正常启动，无控制台错误
2. 插件管理页面显示 "窗口管理" 插件
3. 打开工作流编辑器，NodeSidebar 右上角有加号按钮
4. 点击加号按钮弹出插件选择对话框
5. 勾选 "窗口管理" 插件后，NodeSidebar 出现 "窗口管理" 分类下的 7 个节点
6. 将 "创建窗口" 节点拖拽到画布，属性面板正确展示 URL/宽度/高度字段
7. 运行包含 "创建窗口" 节点的工作流，验证窗口确实被创建

- [ ] **Step 2: 最终 Commit（如有修复）**

```bash
git add -A
git commit -m "fix: integration fixes after plugin workflow nodes implementation"
```
