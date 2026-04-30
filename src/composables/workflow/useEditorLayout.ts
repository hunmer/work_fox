// src/composables/workflow/useEditorLayout.ts
import { computed, ref } from 'vue'
import type { LayoutConfig } from 'golden-layout'
import type { WorkflowStore } from '@/stores/workflow'

const STORAGE_KEY = 'workflow-editor-layout-default'
const PRESETS_KEY = 'workflow-editor-layout-presets'

export interface LayoutPreset {
  id: string
  name: string
  layout: LayoutConfig
  createdAt: number
}

/**
 * 默认布局：匹配原始 ResizablePanelGroup 布局
 *
 * 结构：
 *   Column (垂直分割)
 *     Row (水平分割, ~75%)        ← 工作区
 *       node-sidebar (左, ~18%)
 *       flow-canvas   (中, ~52%)  ← VueFlow 画布面板
 *       right-panel   (右, ~30%)
 *     exec-bar      (底, ~7%)    ← 执行栏
 */
const DEFAULT_LAYOUT: LayoutConfig = {
  root: {
    type: 'column',
    content: [
      {
        type: 'row',
        content: [
          { type: 'component', componentType: 'node-sidebar', title: '节点', size: '18%' },
          { type: 'component', componentType: 'flow-canvas', title: '画布', size: '52%' },
          {
            type: 'stack',
            title: '属性',
            size: '30%',
            content: [
              { type: 'component', componentType: 'right-properties', title: '节点属性' },
              { type: 'component', componentType: 'right-version', title: '版本控制' },
              { type: 'component', componentType: 'right-operations', title: '操作历史' },
              { type: 'component', componentType: 'right-assistant', title: 'AI 助手' },
              { type: 'component', componentType: 'right-staging', title: '暂存箱' },
            ],
          },
        ],
      },
      {
        type: 'stack',
        size: '7%',
        content: [
          { type: 'component', componentType: 'exec-bar', title: '执行' },
        ],
      },
    ],
  },
}

function loadFromLocalStorage(): LayoutConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function saveToLocalStorage(config: LayoutConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
}

function clearLocalStorage() {
  localStorage.removeItem(STORAGE_KEY)
}

function hasComponent(config: LayoutConfig, componentType: string): boolean {
  function visit(item: any): boolean {
    if (!item) return false
    if (item.type === 'component' && item.componentType === componentType) return true
    return Array.isArray(item.content) && item.content.some(visit)
  }
  return visit(config.root)
}

function ensureCanvasPanel(config: LayoutConfig): LayoutConfig {
  return hasComponent(config, 'flow-canvas') ? config : DEFAULT_LAYOUT
}

export function useEditorLayout(workflowStore: WorkflowStore) {
  const hasCustomLayout = computed(
    () => !!workflowStore.currentWorkflow?.layoutSnapshot
  )

  function loadLayout(): LayoutConfig {
    try {
      // 优先级：工作流级 > 全局默认 > 内置默认
      const snapshot = workflowStore.currentWorkflow?.layoutSnapshot
      if (snapshot) return ensureCanvasPanel(snapshot as LayoutConfig)

      const global = loadFromLocalStorage()
      if (global) return ensureCanvasPanel(global)
    } catch (e) {
      console.warn('[GoldenLayout] 布局加载失败，回退默认布局', e)
    }
    return DEFAULT_LAYOUT
  }

  function saveLayout(layoutConfig: LayoutConfig) {
    if (hasCustomLayout.value) {
      // 工作流级：赋值到 currentWorkflow
      // WorkflowEditor 中有 deep watcher 监听 currentWorkflow
      // 赋值会触发 markDirty()，随 10 秒自动保存持久化
      if (workflowStore.currentWorkflow) {
        workflowStore.currentWorkflow.layoutSnapshot =
          layoutConfig as unknown as Record<string, unknown>
      }
    } else {
      // 全局级：写 localStorage
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

  // ── 预设管理 ──────────────────────────────

  const presets = ref<LayoutPreset[]>(loadPresets())

  function loadPresets(): LayoutPreset[] {
    try {
      const raw = localStorage.getItem(PRESETS_KEY)
      return raw ? JSON.parse(raw) : []
    } catch {
      return []
    }
  }

  function persistPresets() {
    localStorage.setItem(PRESETS_KEY, JSON.stringify(presets.value))
  }

  function addPreset(name: string, layout: LayoutConfig): LayoutPreset {
    const preset: LayoutPreset = {
      id: `preset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      layout,
      createdAt: Date.now(),
    }
    presets.value.push(preset)
    persistPresets()
    return preset
  }

  function deletePreset(id: string) {
    presets.value = presets.value.filter(p => p.id !== id)
    persistPresets()
  }

  function applyPreset(id: string): LayoutConfig | null {
    const preset = presets.value.find(p => p.id === id)
    if (!preset) return null
    return ensureCanvasPanel(preset.layout)
  }

  return {
    loadLayout,
    saveLayout,
    resetToDefault,
    hasCustomLayout,
    DEFAULT_LAYOUT,
    presets,
    addPreset,
    deletePreset,
    applyPreset,
  }
}
