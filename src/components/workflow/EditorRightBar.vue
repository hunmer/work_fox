<script setup lang="ts">
import { ref } from 'vue'
import { Activity, Layers, BarChart3 } from 'lucide-vue-next'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import DashboardPage from '@/views/DashboardPage.vue'

const emit = defineEmits<{
  'toggle-group-panel': []
}>()

const dashboardOpen = ref(false)

function toggleWsMonitor() {
  window.dispatchEvent(new CustomEvent('toggle-ws-monitor'))
}
</script>

<template>
  <div class="w-[50px] border-l border-border bg-muted/30 flex flex-col items-center pt-2 gap-1">
    <button
      class="inline-flex items-center justify-center w-8 h-8 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
      title="WS Monitor"
      @click="toggleWsMonitor"
    >
      <Activity class="w-4 h-4" />
    </button>
    <button
      class="inline-flex items-center justify-center w-8 h-8 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
      title="分组管理"
      @click="emit('toggle-group-panel')"
    >
      <Layers class="w-4 h-4" />
    </button>
    <button
      class="inline-flex items-center justify-center w-8 h-8 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
      title="统计面板"
      @click="dashboardOpen = true"
    >
      <BarChart3 class="w-4 h-4" />
    </button>
  </div>

  <Dialog :open="dashboardOpen" @update:open="dashboardOpen = $event">
    <DialogContent class="!max-w-[80vw] w-[80vw] h-[80vh] flex flex-col p-0 gap-0 overflow-hidden">
      <DialogHeader class="px-4 py-3 border-b shrink-0">
        <DialogTitle>统计面板</DialogTitle>
      </DialogHeader>
      <div class="flex-1 min-h-0 overflow-auto">
        <DashboardPage />
      </div>
    </DialogContent>
  </Dialog>
</template>
