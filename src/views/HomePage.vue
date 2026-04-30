<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useTabStore } from '@/stores/tab'
import { workflowBackendApi } from '@/lib/backend-api/workflow'
import WelcomePage from '@/components/workflow/WelcomePage.vue'
import { BarChart3, Minus, Square, X, Maximize2 } from 'lucide-vue-next'
import type { Workflow } from '@/lib/workflow/types'

const router = useRouter()
const tabStore = useTabStore()
const isElectron = navigator.userAgent.includes('Electron')
const isMaximized = ref(false)

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

function refreshMaximized() {
  if (!isElectron) return
  window.api.window.isMaximized().then((maximized: boolean) => {
    isMaximized.value = maximized
  })
}

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

function handleMinimize() {
  window.api.window.minimize()
}

function handleMaximize() {
  window.api.window.maximize()
  setTimeout(refreshMaximized, 100)
}

function handleClose() {
  window.api.window.close()
}

refreshMaximized()
</script>

<template>
  <div class="flex-1 flex flex-col">
    <div v-if="isElectron" class="relative h-9 border-b border-border">
      <div class="absolute inset-0 app-drag" />
      <div class="relative flex items-center justify-end h-full no-drag">
        <button
          class="inline-flex items-center justify-center w-7 h-7 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          @click="handleMinimize"
        >
          <Minus class="w-3.5 h-3.5" />
        </button>
        <button
          class="inline-flex items-center justify-center w-7 h-7 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          @click="handleMaximize"
        >
          <Maximize2 v-if="isMaximized" class="w-3 h-3" />
          <Square v-else class="w-3 h-3" />
        </button>
        <button
          class="inline-flex items-center justify-center w-7 h-7 rounded hover:bg-destructive/90 hover:text-destructive-foreground text-muted-foreground transition-colors"
          @click="handleClose"
        >
          <X class="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
    <WelcomePage
      :recent-workflows="recentWorkflows"
      @open="handleOpen"
      @select="handleSelect"
      @import="handleImport"
    />
  </div>
</template>
