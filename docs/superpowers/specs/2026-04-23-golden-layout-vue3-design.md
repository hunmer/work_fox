# Golden Layout Vue3 组件设计

> 日期：2026-04-23
> 状态：草案

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

## 目录结构

```
src/components/ui/golden-layout/
  GoldenLayout.vue          # 通用容器组件
  GoldenLayoutTab.vue       # tab 标签渲染（自定义样式覆盖用）
  index.ts                  # 导出
  golden-layout.css         # 主题覆盖（Tailwind CSS 变量映射）
  types.ts                  # 类型定义

src/composables/workflow/
  useEditorLayout.ts        # 工作流编辑器布局管理（默认配置、持久化、重置）
```

## 组件 API

```vue
<GoldenLayout
  :config="layoutConfig"          <!-- Golden Layout 布局 JSON 配置 -->
  :registry="componentMap"        <!-- componentName -> Vue 组件映射 -->
  :provides="parentProvides"      <!-- 父组件 provide 传递给子面板 -->
  @layout-change="onLayoutChange" <!-- 布局变化回调，输出序列化 JSON -->
/>
```

### 类型定义

```typescript
import type { Component } from 'vue'
import type { LayoutConfig } from 'golden-layout'

export type ComponentRegistry = Record<string, Component>

export interface LayoutPersistData {
  version: number
  layout: LayoutConfig
}
```

### WorkflowEditor.vue 中的使用

```vue
<GoldenLayout
  v-if="store.currentWorkflow"
  :config="editorLayout"
  :registry="{
    'node-sidebar': NodeSidebar,
    'flow-canvas': FlowCanvas,
    'right-panel': RightPanel,
    'exec-bar': ExecutionBar,
  }"
  :provides="parentProvides"
  @layout-change="onLayoutChange"
/>
```

## 核心实现

### 生命周期

```
onMounted
  ├── new GoldenLayout(containerEl, { popoutUrl: undefined })
  ├── 遍历 registry -> layout.registerComponent()
  │   └── 创建 div -> createApp(Component).mount(div)
  │       └── container.on('destroy', () => app.unmount())
  ├── layout.loadLayout(config)
  ├── layout.on('stateChanged') -> 300ms 节流 -> emit('layoutChange')
  └── ResizeObserver -> layout.updateSize()

onBeforeUnmount
  ├── layout.destroy()
  └── 清理所有 mountedApps
```

### 组件挂载策略

```typescript
layout.registerComponent(componentName, (container) => {
  const mountEl = document.createElement('div')
  mountEl.style.height = '100%'
  container.element.appendChild(mountEl)

  const component = registry[componentName]
  const app = createApp(component)
  app.use(pinia)
  Object.entries(provides).forEach(([key, value]) => {
    app.provide(key, value)
  })
  app.mount(mountEl)
  mountedApps.push({ app, el: mountEl })

  container.on('destroy', () => {
    app.unmount()
    mountEl.remove()
  })
})
```

### Popout 禁用

```typescript
const layout = new GoldenLayout(containerEl, {
  popoutUrl: undefined
})
```

不配置任何 popout 相关选项。Electron 多窗口状态同步复杂度过高，不在本期范围。

### 布局变化节流

`stateChanged` 在拖拽过程中高频触发，300ms 节流后 emit：

```typescript
const debouncedEmit = debounce((layoutConfig) => {
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
onMounted(() => resizeObserver.observe(containerEl))
onBeforeUnmount(() => resizeObserver.disconnect())
```

### Config 响应式更新

```typescript
watch(() => props.config, (newConfig) => {
  if (!layout) return
  layout.loadLayout(newConfig)
}, { deep: false })
```

浅比较 — 完整 config 对象替换时才重新加载，避免拖拽中循环触发。

## 主题样式覆盖

引入 golden-layout 默认 CSS 后全量覆盖，跟随 WorkFox light/dark 主题。

```css
/* golden-layout.css */

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

主题变量复用 `src/styles/globals.css` 中已有的 `--background`、`--border`、`--accent` 等，自动跟随 light/dark 切换。

## 布局持久化

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

  // 默认布局：4 个面板 tab 堆叠
  const DEFAULT_LAYOUT: LayoutConfig = {
    root: {
      type: 'stack',
      content: [
        { type: 'component', componentName: 'flow-canvas',   title: '画布' },
        { type: 'component', componentName: 'node-sidebar',  title: '节点' },
        { type: 'component', componentName: 'right-panel',   title: '属性' },
        { type: 'component', componentName: 'exec-bar',      title: '执行' },
      ]
    },
    activeItemIndex: 0,
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
      workflowStore.currentWorkflow.layoutSnapshot = layoutConfig
      workflowStore.markDirty()
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
  editorLayout.value = layoutConfig
})
```

## WorkflowEditor.vue 集成改造

### 移除

- `ResizablePanelGroup` / `ResizablePanel` / `ResizableHandle` 导入和模板使用
- `usePanelSizes` composable（被 `useEditorLayout` 替代）
- `useExecutionPanel` 中的面板尺寸管理部分

### 保留不变

- 所有面板内容组件（NodeSidebar / VueFlow / RightPanel / ExecutionBar）
- 所有业务逻辑 composable（useFlowCanvas / useClipboard / useConnectionDrop 等）
- EditorToolbar / CanvasToolbar
- 所有 Dialog 组件

### 面板上下文传递

通过 `:provides` prop 将父组件的 provide/inject 传递到子面板：

```typescript
// WorkflowEditor.vue
const parentProvides = {
  [WorkflowStoreKey]: props.store,
}
```

GoldenLayout.vue 注册组件时注入：

```typescript
Object.entries(provides).forEach(([key, value]) => {
  app.provide(key, value)
})
```

### ExecutionBar 折叠适配

ExecutionBar 不再独立占空间，而是作为 tab 堆叠中的一个面板：

- `executionBarExpanded` 改为控制"是否激活执行 tab"
- 用户点击"执行"tab 时切换到执行面板视图

```typescript
watch(executionBarExpanded, (expanded) => {
  if (expanded) {
    goldenLayoutRef.value?.focusPanel('exec-bar')
  }
})
```

## 错误处理

### 组件注册缺失

布局 JSON 中引用了不存在的 componentName 时渲染占位面板：

```typescript
if (!component) {
  container.element.innerHTML = `
    <div class="flex items-center justify-center h-full text-muted-foreground text-sm">
      面板组件 "${componentName}" 不可用
    </div>
  `
  return
}
```

### 空容器保护

容器尺寸为零时延迟初始化：

```typescript
const rect = containerEl.value?.getBoundingClientRect()
if (!rect || rect.width === 0 || rect.height === 0) {
  const observer = new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting) {
      observer.disconnect()
      initLayout()
    }
  })
  observer.observe(containerEl.value!)
  return
}
initLayout()
```

### 标签页快速切换防抖

```typescript
let destroyTimer: ReturnType<typeof setTimeout> | null = null

watch(() => props.config, (newConfig) => {
  if (destroyTimer) {
    clearTimeout(destroyTimer)
    destroyTimer = null
  }
  if (!layout) { initLayout(newConfig); return }
  layout.loadLayout(newConfig)
})

onBeforeUnmount(() => {
  destroyTimer = setTimeout(() => {
    layout?.destroy()
  }, 100)
})
```

### VueFlow 共存

- VueFlow 实例通过 `:id="FLOW_ID"` 绑定，ID 含 tab.id 保持唯一
- 面板重排时 VueFlow 重新初始化，nodes/edges 数据在 store 中不受影响
- 若后续发现频繁重初始化影响性能，可将 VueFlow 提升到 GoldenLayout 外层（优化阶段）

## 默认布局

4 个面板 tab 堆叠，画布默认激活：

```
┌─────────────────────────────────────────────┐
│ [画布] [节点] [属性] [执行]                    │ <- tab 栏
├─────────────────────────────────────────────┤
│                                             │
│         （当前激活面板内容区）                    │
│                                             │
│                                             │
└─────────────────────────────────────────────┘
```

用户可拖拽 tab 分离为独立面板、嵌套、重排，形成如：

```
┌──────────────┬──────────────────────────────┐
│  [节点]       │  [画布]                       │
│              │                              │
│              │                              │
├──────────────┤                              │
│  [属性]       │                              │
│              ├──────────────────────────────┤
│              │  [执行]                       │
└──────────────┴──────────────────────────────┘
```
