<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Toaster } from '@/components/ui/sonner'
import WorkflowEditor from '@/components/workflow/WorkflowEditor.vue'
import CommandPaletteDialog from '@/components/command-palette/CommandPaletteDialog.vue'
import { useTabStore } from '@/stores/tab'
import { usePluginStore } from '@/stores/plugin'
import { useAIProviderStore } from '@/stores/ai-provider'

const tabStore = useTabStore()
const pluginStore = usePluginStore()
const providerStore = useAIProviderStore()

const commandPaletteOpen = ref(false)

onMounted(async () => {
  await pluginStore.init()
  await providerStore.init()
  await tabStore.restoreTabs()
})
</script>

<template>
  <div class="h-screen w-screen flex flex-col bg-background text-foreground" :class="{ 'light': true }">
    <WorkflowEditor
      v-for="tab in tabStore.tabs"
      :key="tab.id"
      v-show="tab.id === tabStore.activeTabId"
      :tab="tab"
      :store="tabStore.getStore(tab.id)!"
    />
    <Toaster />
    <CommandPaletteDialog
      :open="commandPaletteOpen"
      @update:open="commandPaletteOpen = $event"
    />
  </div>
</template>
