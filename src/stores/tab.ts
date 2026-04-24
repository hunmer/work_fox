import { defineStore } from 'pinia'
import { ref, computed, watch, type Ref } from 'vue'
import { createWorkflowStore, type WorkflowStore } from './workflow'
import { wsBridge } from '@/lib/ws-bridge'

export interface Tab {
  id: string
  workflowId: string | null
  name: string
}

export const useTabStore = defineStore('tabs', () => {
  const tabs = ref<Tab[]>([])
  const activeTabId = ref<string | null>(null)
  const storeMap = new Map<string, WorkflowStore>()
  let lastPersistedSnapshot = ''

  const activeTab = computed(() => tabs.value.find(t => t.id === activeTabId.value) || null)
  const activeStore = computed(() => activeTabId.value ? storeMap.get(activeTabId.value) ?? null : null)

  function getStore(tabId: string): WorkflowStore | undefined {
    return storeMap.get(tabId)
  }

  function getReusableEmptyActiveTab() {
    const tab = activeTab.value
    const store = activeStore.value
    if (!tab || !store) return null
    const canReuse = !tab.workflowId && !tab.name && !store.currentWorkflow
    if (!canReuse) return null
    return { tab, store }
  }

  function isTransientEmptyTab(tab: Tab) {
    const store = storeMap.get(tab.id)
    return !!store && !tab.workflowId && !tab.name && !store.currentWorkflow
  }

  async function restoreTabs() {
    // 热加载时防止重复
    if (tabs.value.length > 0) return
    const data = await wsBridge.invoke('tabs:load', undefined) as { tabs: Tab[]; activeTabId: string | null }
    if (!data.tabs || data.tabs.length === 0) return
    for (const tab of data.tabs) {
      const store = createWorkflowStore(tab.id)
      storeMap.set(tab.id, store)
      if (tab.workflowId) {
        await store.loadData()
        const wf = store.workflows.find(w => w.id === tab.workflowId)
        if (!wf) {
          // 工作流文件已删除，跳过此标签页
          storeMap.delete(tab.id)
          continue
        }
        store.currentWorkflow = JSON.parse(JSON.stringify(wf))
      } else {
        await store.loadData()
      }
      tabs.value.push(tab)
    }
    const validTabs = tabs.value
    activeTabId.value = validTabs.some(t => t.id === data.activeTabId)
      ? data.activeTabId
      : validTabs[0]?.id || null
    lastPersistedSnapshot = JSON.stringify({
      tabs: validTabs.map(t => ({ id: t.id, workflowId: t.workflowId, name: t.name })),
      activeTabId: activeTabId.value,
    })
  }

  function addTab(workflowId: string | null = null, name: string = ''): string {
    if (workflowId) {
      const existing = tabs.value.find(t => t.workflowId === workflowId)
      if (existing) {
        switchTab(existing.id)
        return existing.id
      }
    }

    const reusable = workflowId ? getReusableEmptyActiveTab() : null
    if (reusable) {
      const existingStore = reusable.store
      void existingStore.loadData().then(() => {
        const wf = existingStore.workflows.find(w => w.id === workflowId)
        if (!wf) return
        existingStore.currentWorkflow = JSON.parse(JSON.stringify(wf))
        updateTabWorkflow(reusable.tab.id, wf.id, wf.name)
      })
      return reusable.tab.id
    }

    const id = crypto.randomUUID()
    const store = createWorkflowStore(id)
    storeMap.set(id, store)
    const existingStore = activeStore.value

    if (workflowId) {
      void store.loadData().then(() => {
        const loaded = store.workflows.find(w => w.id === workflowId)
        const fallback = existingStore?.workflows.find(w => w.id === workflowId)
        const wf = loaded || fallback
        if (!wf) return
        store.currentWorkflow = JSON.parse(JSON.stringify(wf))
        updateTabWorkflow(id, wf.id, wf.name)
      })
      const fallback = existingStore?.workflows.find(w => w.id === workflowId)
      if (fallback) {
        name = fallback.name
      }
    } else {
      void store.loadData()
      name = ''
    }

    tabs.value.push({ id, workflowId, name })
    activeTabId.value = id
    persistTabs()
    return id
  }

  function closeTab(tabId: string) {
    const idx = tabs.value.findIndex(t => t.id === tabId)
    if (idx === -1) return
    tabs.value.splice(idx, 1)
    storeMap.delete(tabId)

    if (tabs.value.length === 0) {
      activeTabId.value = null
      persistTabs()
      return
    }

    if (activeTabId.value === tabId) {
      const newIdx = Math.min(idx, tabs.value.length - 1)
      activeTabId.value = tabs.value[newIdx].id
    }
    persistTabs()
  }

  function switchTab(tabId: string) {
    if (tabId === activeTabId.value) return
    activeTabId.value = tabId
    persistTabs()
  }

  function persistTabs() {
    const persistedTabs = tabs.value.filter(tab => !isTransientEmptyTab(tab))
    const persistedActiveTabId = persistedTabs.some(tab => tab.id === activeTabId.value) ? activeTabId.value : null
    const nextSnapshot = JSON.stringify({
      tabs: persistedTabs.map(t => ({ id: t.id, workflowId: t.workflowId, name: t.name })),
      activeTabId: persistedActiveTabId,
    })

    if (nextSnapshot === lastPersistedSnapshot) return

    lastPersistedSnapshot = nextSnapshot
    wsBridge.invoke('tabs:save', JSON.parse(nextSnapshot)).catch(() => {})
  }

  function updateTabWorkflow(tabId: string, workflowId: string | null, name: string) {
    const tab = tabs.value.find(t => t.id === tabId)
    if (tab) {
      tab.workflowId = workflowId
      tab.name = name
      persistTabs()
    }
  }

  return {
    tabs, activeTabId, activeTab, activeStore,
    getStore, restoreTabs, addTab, closeTab, switchTab, updateTabWorkflow, persistTabs,
  }
})
