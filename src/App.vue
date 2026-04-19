<script setup lang="ts">
import { onMounted } from 'vue'
import { Toaster } from '@/components/ui/sonner'
import WorkflowEditor from '@/components/workflow/WorkflowEditor.vue'
import { useWorkflowStore } from '@/stores/workflow'

const store = useWorkflowStore()

onMounted(async () => {
  await store.loadWorkflows()
  await store.loadWorkflowFolders()
})
</script>

<template>
  <div class="h-screen w-screen flex flex-col bg-background text-foreground" :class="{ 'light': true }">
    <WorkflowEditor />
    <Toaster />
  </div>
</template>
