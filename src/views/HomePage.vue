<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useTabStore } from '@/stores/tab'
import WelcomePage from '@/components/workflow/WelcomePage.vue'

const router = useRouter()
const tabStore = useTabStore()

function debugLog(message: string, payload?: Record<string, unknown>) {
  console.log('[workflow-debug][home-page]', message, payload ?? {})
}

const recentWorkflows = computed(() => {
  const store = tabStore.activeStore
  if (!store) return []
  return [...store.workflows]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 10)
    .map(wf => ({ id: wf.id, name: wf.name, updatedAt: wf.updatedAt }))
})

function handleNew() {
  const tabId = tabStore.addTab()
  debugLog('handleNew', { tabId })
  router.push({ path: '/editor', query: { create: '1' } })
}

function handleOpen(workflowId?: string) {
  if (workflowId) {
    const tabId = tabStore.addTab(workflowId)
    debugLog('handleOpen:recent', { tabId, workflowId })
    router.push('/editor')
  } else {
    const tabId = tabStore.addTab()
    debugLog('handleOpen:list', { tabId })
    router.push({ path: '/editor', query: { open: '1' } })
  }
}

function handleImport() {
  debugLog('handleImport')
  router.push('/editor')
}
</script>

<template>
  <WelcomePage
    :recent-workflows="recentWorkflows"
    @new="handleNew"
    @open="handleOpen"
    @import="handleImport"
  />
</template>
