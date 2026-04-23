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
import { GoldenLayout, LayoutConfig as GLLayoutConfig } from 'golden-layout'
import type { LayoutConfig, ResolvedLayoutConfig } from 'golden-layout'
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

// ── 工具函数 ────────────────────────────────────────

/**
 * 确保配置是 LayoutConfig 格式（size 为 string），
 * 而非 ResolvedLayoutConfig 格式（size 为 number）。
 * 如果检测到 size 为 number，尝试用 LayoutConfig.fromResolved() 转换。
 */
function ensureLayoutConfig(config: LayoutConfig): LayoutConfig {
  try {
    // 粗略检测：检查 root 子项是否有 size 且为 number
    const root = config.root as any
    if (root?.content?.[0]?.size !== undefined && typeof root.content[0].size === 'number') {
      return GLLayoutConfig.fromResolved(config as unknown as ResolvedLayoutConfig)
    }
  } catch {
    // 转换失败，原样返回
  }
  return config
}

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
    mountEl.style.width = '100%'
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
          // saveLayout() 返回 ResolvedLayoutConfig（size 是 number），
          // loadLayout() 需要 LayoutConfig（size 是 string）。
          // 用 LayoutConfig.fromResolved() 做类型转换。
          const resolved = layout.saveLayout()
          const serializable = GLLayoutConfig.fromResolved(resolved)
          emit('layout-change', serializable)
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
    // 防护：如果传入的是 ResolvedLayoutConfig（size 为 number），先转换
    const safeConfig = ensureLayoutConfig(newConfig)
    layout.loadLayout(safeConfig)
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
