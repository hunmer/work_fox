// src/composables/workflow/useEditorLayout.ts
import { computed } from 'vue'
import type { LayoutConfig } from 'golden-layout'
import type { WorkflowStore } from '@/stores/workflow'

const STORAGE_KEY = 'workflow-editor-layout-default'

/**
 * 默认布局：3 个面板 tab 堆叠
 * VueFlow 在 golden-layout 外层绝对定位，不在 golden-layout 内管理
 */
const DEFAULT_LAYOUT: LayoutConfig = {
  root: {
    type: 'stack',
    content: [
      { type: 'component', componentType: 'node-sidebar', title: '节点' },
      { type: 'component', componentType: 'right-panel', title: '属性' },
      { type: 'component', componentType: 'exec-bar', title: '执行' },
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

export function useEditorLayout(workflowStore: WorkflowStore) {
  const hasCustomLayout = computed(
    () => !!workflowStore.currentWorkflow?.layoutSnapshot
  )

  function loadLayout(): LayoutConfig {
    try {
      // 优先级：工作流级 > 全局默认 > 内置默认
      const snapshot = workflowStore.currentWorkflow?.layoutSnapshot
      if (snapshot) return snapshot as LayoutConfig

      const global = loadFromLocalStorage()
      if (global) return global
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

  return {
    loadLayout,
    saveLayout,
    resetToDefault,
    hasCustomLayout,
    DEFAULT_LAYOUT,
  }
}
