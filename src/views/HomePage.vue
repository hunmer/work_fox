<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useTabStore } from '@/stores/tab'
import { workflowBackendApi } from '@/lib/backend-api/workflow'
import WelcomePage from '@/components/workflow/WelcomePage.vue'
import { BarChart3 } from 'lucide-vue-next'
import type { Workflow } from '@/lib/workflow/types'

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

function handleOpen(workflowId: string) {
  tabStore.addTab(workflowId)
  router.push('/editor')
}

function handleSelect(workflow: Workflow) {
  tabStore.addTab(workflow.id, workflow.name)
  router.push('/editor')
}

function handleImport() {
  router.push('/editor')
}
</script>

<template>
  <div class="flex-1 flex flex-col">
    <WelcomePage
      :recent-workflows="recentWorkflows"
      @open="handleOpen"
      @select="handleSelect"
      @import="handleImport"
    />
  </div>
</template>
