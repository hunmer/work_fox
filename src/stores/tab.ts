import { defineStore } from 'pinia'
import { ref, computed, watch, type Ref } from 'vue'
import { createWorkflowStore, type WorkflowStore } from './workflow'

export interface Tab {
  id: string
  workflowId: string | null
  name: string
}

function debugLog(message: string, payload?: Record<string, unknown>) {
  console.log('[workflow-debug][tab-store]', message, payload ?? {})
}

export const useTabStore = defineStore('tabs', () => {
  const tabs = ref<Tab[]>([])
  const activeTabId = ref<string | null>(null)
  const storeMap = new Map<string, WorkflowStore>()

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
    const data = await (window as any).api.tabs.load() as { tabs: Tab[]; activeTabId: string | null }
    debugLog('restoreTabs:loaded', {
      tabCount: data.tabs?.length ?? 0,
      activeTabId: data.activeTabId,
      tabs: data.tabs,
    })
    if (!data.tabs || data.tabs.length === 0) {
      debugLog('restoreTabs:empty, no tabs restored')
      return
    }
    for (const tab of data.tabs) {
      debugLog('restoreTabs:restoring tab', tab)
      const store = createWorkflowStore(tab.id)
      storeMap.set(tab.id, store)
      if (tab.workflowId) {
        await store.loadData()
        const wf = store.workflows.find(w => w.id === tab.workflowId)
        if (wf) {
          store.currentWorkflow = JSON.parse(JSON.stringify(wf))
          debugLog('restoreTabs:restored workflow into tab', { tabId: tab.id, workflowId: wf.id, workflowName: wf.name })
        } else {
          const restored = store.restoreDraft()
          debugLog('restoreTabs:workflow missing, restoreDraft fallback', { tabId: tab.id, restored })
        }
      } else {
        await store.loadData()
        const restored = store.restoreDraft()
        debugLog('restoreTabs:tab has no workflowId', { tabId: tab.id, restoredDraft: restored })
      }
      tabs.value.push(tab)
    }
    activeTabId.value = data.activeTabId || data.tabs[0]?.id || null
    debugLog('restoreTabs:completed', { activeTabId: activeTabId.value, tabs: tabs.value })
  }

  function addTab(workflowId: string | null = null, name: string = ''): string {
    const reusable = workflowId ? getReusableEmptyActiveTab() : null
    if (reusable) {
      debugLog('addTab:reusing-empty-active-tab', {
        tabId: reusable.tab.id,
        requestedWorkflowId: workflowId,
      })
      const existingStore = reusable.store
      void existingStore.loadData().then(() => {
        const wf = existingStore.workflows.find(w => w.id === workflowId)
        debugLog('addTab:reused-tab workflow lookup finished', {
          tabId: reusable.tab.id,
          requestedWorkflowId: workflowId,
          found: !!wf,
        })
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
    debugLog('addTab:begin', {
      id,
      requestedWorkflowId: workflowId,
      requestedName: name,
      activeTabId: activeTabId.value,
      activeWorkflowId: existingStore?.currentWorkflow?.id ?? null,
    })

    if (workflowId) {
      void store.loadData().then(() => {
        const loaded = store.workflows.find(w => w.id === workflowId)
        const fallback = existingStore?.workflows.find(w => w.id === workflowId)
        const wf = loaded || fallback
        debugLog('addTab:loaded workflow lookup finished', {
          tabId: id,
          requestedWorkflowId: workflowId,
          loadedFound: !!loaded,
          fallbackFound: !!fallback,
        })
        if (!wf) {
          debugLog('addTab:workflow not found', { tabId: id, requestedWorkflowId: workflowId })
          return
        }
        store.currentWorkflow = JSON.parse(JSON.stringify(wf))
        updateTabWorkflow(id, wf.id, wf.name)
      })
      const fallback = existingStore?.workflows.find(w => w.id === workflowId)
      if (fallback) {
        name = fallback.name
      }
    } else {
      void store.loadData().then(() => {
        debugLog('addTab:empty tab data loaded', {
          tabId: id,
          workflowCount: store.workflows.length,
          folderCount: store.workflowFolders.length,
        })
      })
      name = ''
    }

    tabs.value.push({ id, workflowId, name })
    activeTabId.value = id
    debugLog('addTab:created', { id, workflowId, name, tabs: tabs.value })
    persistTabs()
    return id
  }

  function closeTab(tabId: string) {
    const idx = tabs.value.findIndex(t => t.id === tabId)
    if (idx === -1) return
    tabs.value.splice(idx, 1)
    storeMap.delete(tabId)
    debugLog('closeTab:removed', { tabId, remainingTabs: tabs.value })

    if (tabs.value.length === 0) {
      activeTabId.value = null
      debugLog('closeTab:last tab closed')
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
    debugLog('switchTab', { tabId, tabs: tabs.value })
    persistTabs()
  }

  function persistTabs() {
    const persistedTabs = tabs.value.filter(tab => !isTransientEmptyTab(tab))
    const persistedActiveTabId = persistedTabs.some(tab => tab.id === activeTabId.value) ? activeTabId.value : null
    debugLog('persistTabs', {
      activeTabId: activeTabId.value,
      persistedActiveTabId,
      tabs: tabs.value,
      persistedTabs,
    })
    ;(window as any).api.tabs.save({
      tabs: persistedTabs.map(t => ({ id: t.id, workflowId: t.workflowId, name: t.name })),
      activeTabId: persistedActiveTabId,
    })
  }

  function updateTabWorkflow(tabId: string, workflowId: string | null, name: string) {
    const tab = tabs.value.find(t => t.id === tabId)
    if (tab) {
      debugLog('updateTabWorkflow:before', { tabId, previous: { workflowId: tab.workflowId, name: tab.name }, next: { workflowId, name } })
      tab.workflowId = workflowId
      tab.name = name
      debugLog('updateTabWorkflow:after', { tabId, tab })
      persistTabs()
    }
  }

  return {
    tabs, activeTabId, activeTab, activeStore,
    getStore, restoreTabs, addTab, closeTab, switchTab, updateTabWorkflow, persistTabs,
  }
})
