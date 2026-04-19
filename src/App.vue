<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Toaster } from '@/components/ui/sonner'
import WorkflowEditor from '@/components/workflow/WorkflowEditor.vue'
import CommandPaletteDialog from '@/components/command-palette/CommandPaletteDialog.vue'
import { useWorkflowStore } from '@/stores/workflow'
import { usePluginStore } from '@/stores/plugin'

const store = useWorkflowStore()
const pluginStore = usePluginStore()

const commandPaletteOpen = ref(false)

onMounted(async () => {
  await store.loadWorkflows()
  await store.loadWorkflowFolders()
  await pluginStore.init()
})
</script>

<template>
  <div class="h-screen w-screen flex flex-col bg-background text-foreground" :class="{ 'light': true }">
    <WorkflowEditor />
    <Toaster />
    <CommandPaletteDialog
      :open="commandPaletteOpen"
      @update:open="commandPaletteOpen = $event"
    />
  </div>
</template>
