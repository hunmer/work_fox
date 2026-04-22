<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { Toaster } from '@/components/ui/sonner'
import CommandPaletteDialog from '@/components/command-palette/CommandPaletteDialog.vue'
import WsMessageMonitor from '@/components/utils/WsMessageMonitor.vue'
import { useTabStore } from '@/stores/tab'
import { usePluginStore } from '@/stores/plugin'
import { useAIProviderStore } from '@/stores/ai-provider'

const tabStore = useTabStore()
const pluginStore = usePluginStore()
const providerStore = useAIProviderStore()

const commandPaletteOpen = ref(false)

const wsMonitorVisible = ref(false)
const wsMonitor = reactive({ x: 50, y: 50, width: 820, height: 460, zIndex: 1 })

onMounted(async () => {
  await pluginStore.init()
  await providerStore.init()
  await tabStore.restoreTabs()

  window.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.ctrlKey && e.shiftKey && e.key === 'M') {
      wsMonitorVisible.value = !wsMonitorVisible.value
    }
  })
})
</script>

<template>
  <div class="h-screen w-screen flex flex-col bg-background text-foreground" :class="{ 'light': true }">
    <RouterView />
    <Toaster />
    <CommandPaletteDialog
      :open="commandPaletteOpen"
      @update:open="commandPaletteOpen = $event"
    />
    <WsMessageMonitor
      :visible="wsMonitorVisible"
      :x="wsMonitor.x"
      :y="wsMonitor.y"
      :width="wsMonitor.width"
      :height="wsMonitor.height"
      :z-index="wsMonitor.zIndex"
      @update:visible="wsMonitorVisible = $event"
      @update:x="wsMonitor.x = $event"
      @update:y="wsMonitor.y = $event"
      @update:width="wsMonitor.width = $event"
      @update:height="wsMonitor.height = $event"
      @update:z-index="wsMonitor.zIndex = $event"
    />
  </div>
</template>
