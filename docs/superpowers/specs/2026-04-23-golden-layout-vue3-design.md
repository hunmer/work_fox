# Golden Layout Vue3 组件设计

> 日期：2026-04-23
> 状态：草案（v2，已修正审查问题）

## 目标

用 golden-layout 替换 WorkflowEditor.vue 中的 ResizablePanelGroup，实现：
1. 面板拖拽 tab 堆叠 / 嵌套 / 重排
2. 灵活的布局持久化（全局默认 + 工作流级覆盖）
3. 动态面板管理（添加 / 删除 / 重排）

## 方案选择

**选定方案：直接封装 golden-layout npm 包。**

| 方案 | 结论 | 理由 |
|------|------|------|
| A. 封装 golden-layout | **选定** | 成熟稳定、API 完整、拖拽/tab/嵌套开箱即用 |
| B. 基于 reka-ui 自实现 | 否 | 工作量大，本质是造轮子 |
| C. vue-golden-layout 等封装库 | 否 | 第三方封装维护状态堪忧 |

### 前置条件：技术 Spike

正式实施前需完成一个技术 spike，验证：
1. golden-layout v2.x 与 Vue 3 `createApp` 的集成可行性
2. v2.x 实际生成的 DOM 结构和 CSS 类名（v1 的 `lm_` 前缀可能已变化）
3. `bindComponentEvent` / `unbindComponentEvent` 事件模式的具体用法
4. CSS import 路径在 Vite 打包中的可用性

Spike 产出：一个最小可运行的 golden-layout + Vue 3 demo，确认上述 API 正确后，再按本规格实施。

## 目录结构

```
src/components/ui/golden-layout/
  GoldenLayout.vue          # 通用容器组件
  index.ts                  # 导出
  golden-layout.css         # 主题覆盖（Tailwind CSS 变量映射，需 spike 验证类名）
  types.ts                  # 类型定义

src/composables/workflow/
  useEditorLayout.ts        # 工作流编辑器布局管理（默认配置、持久化、重置）
```

## 组件 API

```vue
<GoldenLayout
  :config="layoutConfig"          <!-- Golden Layout 布局 JSON 配置 -->
  :registry="componentMap"        <!-- componentType -> Vue 组件映射 -->
  :provides="parentProvides"      <!-- 父组件 provide 传递给子面板 -->
  @layout-change="onLayoutChange" <!-- 布局变化回调，输出序列化 JSON -->
/>
```

### 类型定义

```typescript
import type { Component, InjectionKey } from 'vue'
import type { LayoutConfig } from 'golden-layout'

// 组件注册表：面板名 -> Vue 组件
// key 必须与布局 JSON 中的 componentType 一致
export type ComponentRegistry = Record<string, Component>

// provide 传递映射（key 为 InjectionKey 或 string）
export type ProvideMap = Array<{ key: InjectionKey<unknown> | string, value: unknown }>

// 布局持久化数据
export interface LayoutPersistData {
  version: number          // schema 版本，方便后续迁移
  layout: LayoutConfig     // golden-layout 原始配置
}

// 面板组件名联合类型（用于类型安全）
export type EditorPanelType = 'node-sidebar' | 'flow-canvas' | 'right-panel' | 'exec-bar'
```

### WorkflowEditor.vue 中的使用

```vue
<GoldenLayout
  v-if="store.currentWorkflow"
  :config="editorLayout"
  :registry="componentRegistry"
  :provides="parentProvides"
  @layout-change="onLayoutChange"
/>
```

## 核心实现

> **注意**：以下基于 golden-layout v2.x API。具体 API 需经 spike 验证，实施时以 spike 结论为准。

### 生命周期

```
onMounted
  ├── new GoldenLayout(containerEl)
  ├── 设置 layout.bindComponentEvent   ← v2 注册组件方式
  ├── 设置 layout.unbindComponentEvent ← v2 销毁组件方式
  ├── layout.loadLayout(mergedConfig)  ← config 含 header.popout: false
  ├── layout.on('stateChanged') -> 300ms 节流 -> emit('layoutChange')
  └── ResizeObserver -> layout.updateSize()

onBeforeUnmount
  ├── layout.destroy()
  └── 清理所有 mountedApps
```

### 构造函数

golden-layout v2.x 构造函数签名为 `new GoldenLayout(container?: HTMLElement)` 或 `new GoldenLayout(config, container?)`。popout 通过布局配置控制，非构造函数参数。

```typescript
const layout = new GoldenLayout(containerEl.value!)
```

### Popout 禁用

通过 LayoutConfig 的 header settings 控制，不使用构造函数 options：

```typescript
const mergedConfig = {
  ...props.config,
  header: {
    ...props.config.header,
    popout: false,   // 隐藏 popout 按钮
  },
  // 其他 settings 也在此处控制
}
layout.loadLayout(mergedConfig)
```

### 组件挂载策略（v2 API）

golden-layout v2.x 使用 `bindComponentEvent` / `unbindComponentEvent` 事件替代 v1 的 `registerComponent` 回调：

```typescript
interface MountedApp {
  app: App
  el: HTMLElement
}

const mountedApps = new Map<ContentItem, MountedApp>()

layout.bindComponentEvent = (container, itemConfig) => {
  const { componentType } = itemConfig
  const component = registry[componentType as string]

  // 组件缺失 -> 渲染占位面板
  if (!component) {
    const placeholder = document.createElement('div')
    placeholder.className = 'flex items-center justify-center h-full text-muted-foreground text-sm'
    placeholder.textContent = `面板组件 "${componentType}" 不可用`
    container.element.appendChild(placeholder)
    return { component: placeholder, virtual: false }
  }

  const mountEl = document.createElement('div')
  mountEl.style.height = '100%'
  container.element.appendChild(mountEl)

  const app = createApp(component)
  app.use(pinia)
  provides.forEach(({ key, value }) => {
    app.provide(key, value)
  })
  app.mount(mountEl)

  mountedApps.set(container, { app, el: mountEl })

  return { component: mountEl, virtual: false }
}

layout.unbindComponentEvent = (container) => {
  const entry = mountedApps.get(container)
  if (entry) {
    entry.app.unmount()
    entry.el.remove()
    mountedApps.delete(container)
  }
}
```

### 布局变化节流

`stateChanged` 在拖拽过程中高频触发，300ms 节流后 emit：

```typescript
const debouncedEmit = debounce((layoutConfig: LayoutConfig) => {
  emit('layoutChange', layoutConfig)
}, 300)

layout.on('stateChanged', () => {
  debouncedEmit(layout.saveLayout())
})
```

### 容器尺寸响应

```typescript
const resizeObserver = new ResizeObserver(() => {
  layout?.updateSize()
})
onMounted(() => resizeObserver.observe(containerEl.value!))
onBeforeUnmount(() => resizeObserver.disconnect())
```

### Config 响应式更新

```typescript
watch(() => props.config, (newConfig) => {
  if (!layout) { initLayout(newConfig); return }
  // 仅完整对象替换时重新加载，避免拖拽中循环触发
  layout.loadLayout(newConfig)
}, { deep: false })
```

## 主题样式覆盖

> **注意**：CSS 类名基于 golden-layout v1 的 `lm_` 前缀。v2 的实际类名需 spike 验证后修正。

引入 golden-layout 默认 CSS 后全量覆盖，跟随 WorkFox light/dark 主题。

```css
/* golden-layout.css */
/* TODO: 实施时需验证 v2.x 实际 CSS 类名 */

/* 面板标题栏 */
.lm_header {
  background: var(--background);
  border-bottom: 1px solid var(--border);
  height: 32px;
}

/* Tab */
.lm_tab {
  background: var(--muted);
  color: var(--muted-foreground);
  font-size: 12px;
  border-radius: 4px 4px 0 0;
}
.lm_tab.lm_active {
  background: var(--background);
  color: var(--foreground);
  font-weight: 500;
}

/* 分割线 */
.lm_splitter {
  background: var(--border);
}
.lm_splitter.lm_vertical { width: 4px; }
.lm_splitter.lm_horizontal { height: 4px; }

/* 拖拽占位 */
.lm_dragProxy,
.lm_dropTargetIndicator {
  background: color-mix(in srgb, var(--accent) 20%, transparent);
  border: 1px dashed var(--accent);
}

/* 面板内容区 */
.lm_content {
  background: var(--background);
}
```

引入方式（GoldenLayout.vue 中无 scoped style）：

```vue
<style>
@import 'golden-layout/dist/css/goldenlayout-base.css';
@import './golden-layout.css';
</style>
```

主题变量复用 `src/styles/globals.css` 中已有的 `--background`、`--border`、`--accent` 等，自动跟随 light/dark 切换。Web 模式下 Vite 会正常打包 CSS import，无需特殊处理。

## 布局持久化

### Workflow 类型扩展

需要在 Workflow 接口中新增 `layoutSnapshot` 字段。需同步更新的位置：

1. **`src/lib/workflow/types.ts`** — Workflow 接口新增 `layoutSnapshot?: LayoutConfig`
2. **`shared/workflow-types.ts`** — 如有共享类型定义也需同步
3. **backend storage 层** — 序列化/反序列化需处理新字段（旧数据无此字段，默认 undefined）
4. **backend workflow CRUD** — 新增字段需透传，不影响旧数据

```typescript
// workflow types 中新增
interface Workflow {
  // ... 现有字段 ...
  layoutSnapshot?: LayoutConfig  // 工作流级自定义布局（可选）
}
```

### 存储策略：全局默认 + 工作流级覆盖

```
localStorage
  └── workflow-editor-layout-default     <- 全局默认布局 JSON

Workflow 数据（backend 存储）
  └── currentWorkflow.layoutSnapshot     <- 工作流级自定义布局（可选字段）
```

### useEditorLayout composable

```typescript
// src/composables/workflow/useEditorLayout.ts
export function useEditorLayout(workflowStore: WorkflowStore) {

  const STORAGE_KEY = 'workflow-editor-layout-default'

  // 默认布局：3 个面板 tab 堆叠（VueFlow 在 golden-layout 外层，见下文）
  const DEFAULT_LAYOUT: LayoutConfig = {
    root: {
      type: 'stack',
      content: [
        { type: 'component', componentType: 'node-sidebar',  title: '节点' },
        { type: 'component', componentType: 'right-panel',   title: '属性' },
        { type: 'component', componentType: 'exec-bar',      title: '执行' },
      ]
    },
    activeItemIndex: 0,
  }

  function loadFromLocalStorage(): LayoutConfig | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      return raw ? JSON.parse(raw) : null
    } catch { return null }
  }

  function saveToLocalStorage(config: LayoutConfig) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
  }

  function clearLocalStorage() {
    localStorage.removeItem(STORAGE_KEY)
  }

  function loadLayout(): LayoutConfig {
    try {
      const snapshot = workflowStore.currentWorkflow?.layoutSnapshot
      if (snapshot) return snapshot
      const global = loadFromLocalStorage()
      if (global) return global
    } catch (e) {
      console.warn('[GoldenLayout] 布局加载失败，回退默认布局', e)
    }
    return DEFAULT_LAYOUT
  }

  function saveLayout(layoutConfig: LayoutConfig) {
    if (hasCustomLayout.value) {
      // 工作流级：写入 workflow 数据
      // 由于 WorkflowEditor 中有 deep watcher 监听 currentWorkflow，
      // 此赋值会触发 markDirty()，布局变更随 10 秒自动保存持久化
      workflowStore.currentWorkflow!.layoutSnapshot = layoutConfig
    } else {
      saveToLocalStorage(layoutConfig)
    }
  }

  function resetToDefault(): LayoutConfig {
    clearLocalStorage()
    if (workflowStore.currentWorkflow) {
      delete workflowStore.currentWorkflow.layoutSnapshot
      workflowStore.markDirty()
    }
    return DEFAULT_LAYOUT
  }

  const hasCustomLayout = computed(
    () => !!workflowStore.currentWorkflow?.layoutSnapshot
  )

  return { loadLayout, saveLayout, resetToDefault, hasCustomLayout, DEFAULT_LAYOUT }
}
```

### EditorToolbar 集成

新增"重置布局"图标按钮：
- 仅在有自定义布局时显示（`v-if="hasCustomLayout"`）
- 点击调用 `resetToDefault()`，返回默认布局配置

### 标签页切换

```typescript
watch(() => props.tab.id, () => {
  const layoutConfig = loadLayout()
  editorLayout.value = layoutConfig   // 触发 GoldenLayout config watch -> loadLayout
})
```

## WorkflowEditor.vue 集成改造

### VueFlow 在 golden-layout 外层

VueFlow（画布）是核心交互组件，面板重排时重建会导致缩放/平移/选中状态丢失。这是功能体验问题而非性能问题。

**设计决策：VueFlow 不进入 golden-layout，保持在外层通过绝对定位覆盖全区域。**

```vue
<template>
  <div class="relative flex-1 min-h-0">
    <!-- VueFlow 画布：绝对定位，始终存在，不受 golden-layout 影响 -->
    <VueFlow
      v-if="store.currentWorkflow"
      :id="FLOW_ID"
      class="absolute inset-0 z-0"
      ...
    />

    <!-- Golden Layout：覆盖在 VueFlow 之上 -->
    <!-- 所有面板默认不透明，当用户把所有 tab 分离后，画布自然露出 -->
    <GoldenLayout
      v-if="store.currentWorkflow"
      :config="editorLayout"
      :registry="componentRegistry"
      :provides="parentProvides"
      class="absolute inset-0 z-10"
      @layout-change="onLayoutChange"
    />
  </div>
</template>
```

这样：
- VueFlow 永远不被销毁/重建
- 当 golden-layout 面板覆盖全区域时，画布被遮挡
- 用户可以把面板缩小或分离，露出底层画布
- 面板内容区通过 CSS `background: var(--background)` 确保不透明

**默认布局调整**：由于 VueFlow 在外层，golden-layout 内只管理 3 个面板（node-sidebar / right-panel / exec-bar）。用户可以把画布作为 golden-layout 面板之一纳入管理，但默认不纳入。

### 移除

- `ResizablePanelGroup` / `ResizablePanel` / `ResizableHandle` 导入和模板使用
- `usePanelSizes` composable（被 `useEditorLayout` 替代）
- `useExecutionPanel` 中的面板尺寸管理部分

### 保留不变

- VueFlow 画布组件（移到外层绝对定位）
- 所有面板内容组件（NodeSidebar / RightPanel / ExecutionBar）
- 所有业务逻辑 composable（useFlowCanvas / useClipboard / useConnectionDrop 等）
- EditorToolbar / CanvasToolbar
- 所有 Dialog 组件

### 面板上下文传递

通过 `:provides` prop 将父组件的 provide 传递到子面板。由于 `createApp` 创建的子应用不继承父应用的 provide 链，需要**显式列出所有子面板可能 inject 的依赖**：

```typescript
import { WORKFLOW_STORE_KEY } from '@/stores/workflow'
import { useAgentSettingsStore } from '@/stores/agent-settings'
// 其他子面板可能需要的 key ...

// WorkflowEditor.vue
// 注意：需确保 WORKFLOW_STORE_KEY 从 stores/workflow 中 export
// 当前该 symbol 未被导出，实施时需新增导出
const parentProvides: ProvideMap = [
  { key: WORKFLOW_STORE_KEY, value: props.store },
  // 如有其他需要 inject 的 key，在此补充
]
```

GoldenLayout.vue 中注入：

```typescript
provides.forEach(({ key, value }) => {
  app.provide(key, value)
})
```

> **实施时注意**：需逐个检查 NodeSidebar / RightPanel / ExecutionBar 组件中使用的 `inject()` 调用，确保所有依赖都被列入 provides 列表。如果子组件中使用了 Pinia store（如 `useAgentSettingsStore()`），由于 `app.use(pinia)` 已注入 Pinia 实例，直接在子组件中 `useXxxStore()` 即可，无需额外 provide。

### ExecutionBar 适配

ExecutionBar 内部使用了 `ResizablePanelGroup`（分割执行日志和步骤详情），golden-layout 不干涉面板内部布局，因此：

- ExecutionBar 内部的 ResizablePanelGroup **保留不变**
- ExecutionBar 作为 golden-layout 的一个面板，内部自行管理子面板
- `executionBarExpanded` 改为控制"是否激活执行 tab"
- ExecutionBar 内部嵌套的 ResizablePanelGroup 与 golden-layout 的 resize 不冲突，因为 golden-layout 只管理面板边界，面板内部自行处理

## 错误处理

### 组件注册缺失

布局 JSON 中引用了不存在的 componentType 时渲染占位面板：

```typescript
if (!component) {
  const placeholder = document.createElement('div')
  placeholder.className = 'flex items-center justify-center h-full text-muted-foreground text-sm'
  placeholder.textContent = `面板组件 "${componentType}" 不可用`
  container.element.appendChild(placeholder)
  return { component: placeholder, virtual: false }
}
```

### 布局加载失败兜底

```typescript
function loadLayout(): LayoutConfig {
  try {
    const snapshot = workflowStore.currentWorkflow?.layoutSnapshot
    if (snapshot) return snapshot
    const global = loadFromLocalStorage()
    if (global) return global
  } catch (e) {
    console.warn('[GoldenLayout] 布局加载失败，回退默认布局', e)
  }
  return DEFAULT_LAYOUT
}
```

### 空容器保护

容器尺寸为零时延迟初始化：

```typescript
function initLayout(config?: LayoutConfig) {
  const rect = containerEl.value?.getBoundingClientRect()
  if (!rect || rect.width === 0 || rect.height === 0) {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        observer.disconnect()
        initLayout(config)
      }
    })
    observer.observe(containerEl.value!)
    return
  }
  // 正常初始化...
}
```

### 标签页快速切换

标签页切换通过 `config` prop 变化驱动（同一个 GoldenLayout 组件实例），不涉及组件销毁/重建：

```typescript
watch(() => props.config, (newConfig) => {
  if (!layout.value) { initLayout(newConfig); return }
  layout.value.loadLayout(newConfig)
})
```

`onBeforeUnmount` 正常销毁，无需防抖（组件卸载时确实应该立即清理）：

```typescript
onBeforeUnmount(() => {
  resizeObserver.disconnect()
  layout.value?.destroy()
  layout.value = null
  mountedApps.clear()
})
```

## 测试/验证策略

手动验证项（项目当前无自动化测试框架）：

1. **基本渲染**：4 个面板 tab 堆叠显示，默认激活"节点"tab
2. **拖拽重排**：拖拽 tab 分离为独立面板、拖拽分割线调整大小
3. **布局持久化**：修改布局后刷新页面，恢复上次布局
4. **标签页切换**：在两个工作流标签页间切换，各自恢复布局
5. **重置布局**：点击工具栏"重置布局"按钮，恢复默认 tab 堆叠
6. **VueFlow 不受影响**：拖拽面板不影响画布缩放/平移/选中状态
7. **ExecutionBar 内部**：执行面板内部的 ResizablePanelGroup 正常工作
8. **主题切换**：light/dark 切换后面板样式跟随变化
9. **组件缺失**：模拟 registry 缺少某个组件时显示占位提示

最小回归验证命令：

```bash
pnpm exec tsc -p tsconfig.web.json --noEmit
pnpm build
pnpm dev  # 手动验证上述场景
```

## 默认布局

VueFlow 在外层绝对定位，golden-layout 管理 3 个面板 tab 堆叠：

```
┌─────────────────────────────────────────────┐
│ VueFlow 画布（z-0，底层）                      │
│ ┌─────────────────────────────────────────┐ │
│ │ [节点] [属性] [执行]                      │ │ <- golden-layout tab 栏
│ ├─────────────────────────────────────────┤ │
│ │                                         │ │
│ │    （当前激活面板内容区，不透明）            │ │
│ │                                         │ │
│ │                                         │ │
│ └─────────────────────────────────────────┘ │
│                                             │
└─────────────────────────────────────────────┘
```

用户拖拽分离面板后，面板间空隙露出底层画布：

```
┌─────────────────────────────────────────────┐
│ VueFlow 画布（底层，可见区域露出）              │
│ ┌──────────────┐                            │
│ │  [节点]       │                            │
│ │              │                            │
│ ├──────────────┤                            │
│ │  [属性]       │                            │
│ │              │        ┌──────────────────┐│
│ └──────────────┘        │  [执行]           ││
│                         │                  ││
│                         └──────────────────┘│
└─────────────────────────────────────────────┘
```
