<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Toaster } from '@/components/ui/sonner'
import CommandPaletteDialog from '@/components/command-palette/CommandPaletteDialog.vue'
import { useTabStore } from '@/stores/tab'
import { usePluginStore } from '@/stores/plugin'
import { useAIProviderStore } from '@/stores/ai-provider'

const tabStore = useTabStore()
const pluginStore = usePluginStore()
const providerStore = useAIProviderStore()

const commandPaletteOpen = ref(false)

function debugLog(message: string, payload?: Record<string, unknown>) {
  console.log('[workflow-debug][app]', message, payload ?? {})
}

onMounted(async () => {
  debugLog('mounted:start')
  await pluginStore.init()
  await providerStore.init()
  await tabStore.restoreTabs()
  debugLog('mounted:tabs-restored', {
    activeTabId: tabStore.activeTabId,
    tabs: tabStore.tabs,
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
  </div>
</template>
