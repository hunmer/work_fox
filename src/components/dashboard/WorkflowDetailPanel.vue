<script setup lang="ts">
import WorkflowInfoCard from './WorkflowInfoCard.vue'
import WorkflowVersionList from './WorkflowVersionList.vue'
import WorkflowExecutionTable from './WorkflowExecutionTable.vue'
import type { DashboardWorkflowDetailResponse } from '@shared/channel-contracts'

defineProps<{
  detail: DashboardWorkflowDetailResponse | null
  loading: boolean
}>()
</script>

<template>
  <div class="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
    <WorkflowInfoCard :detail="detail" :loading="loading" />
    <WorkflowVersionList :detail="detail" />
    <WorkflowExecutionTable :detail="detail" />
  </div>
</template>
