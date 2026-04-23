# Phase 2: 核心组件实现

> 前置：Phase 1 完成（Spike 结论已知）
> 产出：GoldenLayout.vue 通用组件可独立使用

---

### Task 4: 实现 GoldenLayout.vue

**目标：** 创建通用 golden-layout Vue 3 容器组件。

**Files:**
- Create: `src/components/ui/golden-layout/GoldenLayout.vue`

- [ ] **Step 1: 编写 GoldenLayout.vue**

> **注意：** 以下代码基于 golden-layout v2.x 预期 API。实施时需根据 Task 1 Spike 结论调整 `bindComponentEvent` 的参数类型和回调签名。

```vue
<script setup lang="ts">
import {
  ref,
  watch,
  onMounted,
  onBeforeUnmount,
  createApp,
  toRef,
  type App,
} from 'vue'
import { getCurrentInstance } from 'vue'
import { GoldenLayout } from 'golden-layout'
import type { LayoutConfig } from 'golden-layout'
import type { ComponentRegistry, ProvideMap } from './types'

// ── Props & Emits ──────────────────────────────────

const props = defineProps<{
  config: LayoutConfig
  registry: ComponentRegistry
  provides?: ProvideMap
}>()

const emit = defineEmits<{
  'layout-change': [config: LayoutConfig]
}>()

// ── State ──────────────────────────────────────────

const containerEl = ref<HTMLElement>()
let layout: GoldenLayout | null = null
const mountedApps = new Map<unknown, { app: App; el: HTMLElement }>()
let resizeObserver: ResizeObserver | null = null

// 获取当前应用的 Pinia 实例
const pinia = getCurrentInstance()?.appContext.app.config.globalProperties.$pinia

// ── 初始化 ─────────────────────────────────────────

function initLayout(config: LayoutConfig) {
  if (!containerEl.value) return

  // 空容器保护
  const rect = containerEl.value.getBoundingClientRect()
  if (!rect || rect.width === 0 || rect.height === 0) {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        observer.disconnect()
        initLayout(config)
      }
    })
    observer.observe(containerEl.value)
    return
  }

  layout = new GoldenLayout(containerEl.value)

  // 注册组件绑定事件
  layout.bindComponentEvent = (container: any, itemConfig: any) => {
    const { componentType } = itemConfig
    const component = props.registry[componentType as string]

    // 组件缺失 -> 占位面板
    if (!component) {
      const placeholder = document.createElement('div')
      placeholder.className = 'flex items-center justify-center h-full text-sm opacity-50'
      placeholder.textContent = `面板组件 "${componentType}" 不可用`
      container.element.appendChild(placeholder)
      return { component: placeholder, virtual: false }
    }

    const mountEl = document.createElement('div')
    mountEl.style.height = '100%'
    container.element.appendChild(mountEl)

    const app = createApp(component)

    // 注入 Pinia
    if (pinia) {
      app.use(pinia)
    }

    // 注入父组件的 provides
    props.provides?.forEach(({ key, value }) => {
      app.provide(key, value)
    })

    app.mount(mountEl)
    mountedApps.set(container, { app, el: mountEl })

    return { component: mountEl, virtual: false }
  }

  layout.unbindComponentEvent = (container: any) => {
    const entry = mountedApps.get(container)
    if (entry) {
      entry.app.unmount()
      entry.el.remove()
      mountedApps.delete(container)
    }
  }

  // 合并配置：禁用 popout
  const mergedConfig: LayoutConfig = {
    ...config,
    header: {
      ...(config as any).header,
      popout: false,
    },
  }

  layout.loadLayout(mergedConfig)

  // 监听布局变化（300ms 节流）
  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  layout.on('stateChanged', () => {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      if (layout) {
        try {
          emit('layout-change', layout.saveLayout())
        } catch {
          // saveLayout 可能在布局未完全初始化时失败
        }
      }
    }, 300)
  })

  // 尺寸响应
  resizeObserver = new ResizeObserver(() => {
    layout?.updateSize()
  })
  resizeObserver.observe(containerEl.value)
}

// ── Config 响应式 ──────────────────────────────────

watch(
  () => props.config,
  (newConfig) => {
    if (!layout) {
      initLayout(newConfig)
      return
    }
    // 仅完整对象替换时重新加载
    layout.loadLayout(newConfig)
  },
  { deep: false }
)

// ── 生命周期 ────────────────────────────────────────

onMounted(() => {
  initLayout(props.config)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
  layout?.destroy()
  layout = null
  mountedApps.clear()
})

// ── 公开方法（供父组件调用） ───────────────────────

function focusPanel(_componentType: string) {
  // golden-layout v2 中查找并激活特定面板
  // 具体实现需根据 Spike 结论补充
  // 可能使用: layout.root.getItemsByType('component') 查找
}

defineExpose({ focusPanel })
</script>

<template>
  <div ref="containerEl" class="h-full w-full" data-slot="golden-layout" />
</template>
```

- [ ] **Step 2: 验证编译**

```bash
pnpm exec tsc -p tsconfig.web.json --noEmit
```

预期：无错误。如有 golden-layout 类型不匹配，根据 Spike 结论调整。

- [ ] **Step 3: 提交**

```bash
git add src/components/ui/golden-layout/GoldenLayout.vue
git commit -m "feat(golden-layout): implement core GoldenLayout.vue component"
```

---

### Task 5: 创建模块导出

**目标：** 创建 golden-layout 模块的统一导出入口。

**Files:**
- Create: `src/components/ui/golden-layout/index.ts`

- [ ] **Step 1: 编写导出文件**

```typescript
// src/components/ui/golden-layout/index.ts
export { default as GoldenLayout } from './GoldenLayout.vue'
export type { ComponentRegistry, ProvideMap, LayoutPersistData, EditorPanelType } from './types'
```

- [ ] **Step 2: 验证编译**

```bash
pnpm exec tsc -p tsconfig.web.json --noEmit
```

- [ ] **Step 3: 提交**

```bash
git add src/components/ui/golden-layout/index.ts
git commit -m "feat(golden-layout): add module exports"
```

---

## Phase 2 完成标准

- [x] `GoldenLayout.vue` 实现完整的生命周期管理（创建/销毁/ResizeObserver）
- [x] `bindComponentEvent` / `unbindComponentEvent` 正确挂载/卸载 Vue 组件
- [x] 组件缺失时渲染占位面板
- [x] `stateChanged` 事件通过 300ms 节流 emit `layout-change`
- [x] Config prop 变化时重新加载布局
- [x] 空容器延迟初始化
- [x] Popout 已禁用
- [x] `tsc --noEmit` 无错误
