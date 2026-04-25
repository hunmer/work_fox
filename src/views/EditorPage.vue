<script setup lang="ts">
import { onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useTabStore } from '@/stores/tab'
import WorkflowEditor from '@/components/workflow/WorkflowEditor.vue'

const props = defineProps<{ workflowId?: string }>()
const router = useRouter()
const tabStore = useTabStore()

function syncHashWithActiveTab(tab: { workflowId: string | null } | null) {
  const targetQuery = tab?.workflowId
    ? { workflow_id: tab.workflowId }
    : undefined

  router.replace({ path: '/editor', query: targetQuery })
}

onMounted(() => {
  if (props.workflowId) {
    tabStore.addTab(props.workflowId)
  } else if (tabStore.tabs.length === 0) {
    tabStore.addTab()
  }
})

watch(() => tabStore.activeTab, (tab) => {
  syncHashWithActiveTab(tab)
})
</script>

<template>
  <WorkflowEditor
    v-for="tab in tabStore.tabs"
    :key="tab.id"
    v-show="tab.id === tabStore.activeTabId"
    :tab="tab"
    :store="tabStore.getStore(tab.id)!"
  />
</template>
