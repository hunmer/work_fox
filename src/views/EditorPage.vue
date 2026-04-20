<script setup lang="ts">
import { useTabStore } from '@/stores/tab'
import WorkflowEditor from '@/components/workflow/WorkflowEditor.vue'

const tabStore = useTabStore()
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
