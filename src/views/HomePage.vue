<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useTabStore } from '@/stores/tab'
import { workflowBackendApi } from '@/lib/backend-api/workflow'
import WelcomePage from '@/components/workflow/WelcomePage.vue'

const router = useRouter()
const tabStore = useTabStore()

interface RecentWorkflow {
  id: string
  name: string
  updatedAt: number
}

const recentWorkflows = ref<RecentWorkflow[]>([])

onMounted(async () => {
  try {
    const workflows = await workflowBackendApi.list()
    recentWorkflows.value = [...workflows]
      .sort((a: any, b: any) => b.updatedAt - a.updatedAt)
      .slice(0, 10)
      .map((wf: any) => ({ id: wf.id, name: wf.name, updatedAt: wf.updatedAt }))
  } catch {
    recentWorkflows.value = []
  }
})

function handleNew() {
  const tabId = tabStore.addTab()
  router.push({ path: '/editor', query: { create: '1' } })
}

function handleOpen(workflowId?: string) {
  if (workflowId) {
    const tabId = tabStore.addTab(workflowId)
    router.push('/editor')
  } else {
    const tabId = tabStore.addTab()
    router.push({ path: '/editor', query: { open: '1' } })
  }
}

function handleImport() {
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
