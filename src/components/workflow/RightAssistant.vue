<script setup lang="ts">
import { watch, onMounted } from 'vue'
import ChatPanel from '@/components/chat/ChatPanel.vue'
import { createChatStore } from '@/stores/chat'
import { useWorkflowStore } from '@/stores/workflow'

const workflowStore = useWorkflowStore()
const workflowChat = createChatStore('workflow')

onMounted(async () => {
  const workflowId = workflowStore.currentWorkflow?.id
  if (workflowId) {
    await workflowChat.switchToWorkflowSession(workflowId)
  }
})

watch(() => workflowStore.currentWorkflow?.id, async (workflowId) => {
  if (workflowId) {
    await workflowChat.switchToWorkflowSession(workflowId)
  }
})
</script>

<template>
  <ChatPanel
    :chat="workflowChat"
    :enabled-plugins="workflowStore.currentWorkflow?.enabledPlugins || []"
  />
</template>
