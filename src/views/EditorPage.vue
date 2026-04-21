<script setup lang="ts">
import { onMounted } from 'vue'
import { useTabStore } from '@/stores/tab'
import WorkflowEditor from '@/components/workflow/WorkflowEditor.vue'

const tabStore = useTabStore()

onMounted(() => {
  if (tabStore.tabs.length === 0) {
    tabStore.addTab()
  }
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
