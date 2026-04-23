<script setup lang="ts">
import {
  ref,
  watch,
  onMounted,
  onBeforeUnmount,
  createApp,
  getCurrentInstance,
  type App,
} from 'vue'
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

// ── 公开方法 ────────────────────────────────────────

defineExpose({
  getLayout: () => layout,
})
</script>

<template>
  <div ref="containerEl" class="h-full w-full" data-slot="golden-layout" />
</template>

<style>
@import 'golden-layout/dist/css/goldenlayout-base.css';
@import './golden-layout.css';
</style>
