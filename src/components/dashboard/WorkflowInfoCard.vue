<script setup lang="ts">
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import type { DashboardWorkflowDetailResponse } from '@shared/channel-contracts'

defineProps<{
  detail: DashboardWorkflowDetailResponse | null
  loading: boolean
}>()

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString()
}
</script>

<template>
  <Card v-if="loading">
    <CardHeader><Skeleton class="h-6 w-48" /></CardHeader>
    <CardContent class="space-y-2">
      <Skeleton class="h-4 w-32" />
      <Skeleton class="h-4 w-24" />
      <Skeleton class="h-4 w-40" />
    </CardContent>
  </Card>
  <Card v-else-if="detail">
    <CardHeader>
      <CardTitle>{{ detail.workflow.name }}</CardTitle>
    </CardHeader>
    <CardContent class="space-y-1 text-sm">
      <div class="flex justify-between">
        <span class="text-muted-foreground">节点数</span>
        <span>{{ detail.workflow.nodeCount }}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-muted-foreground">连线数</span>
        <span>{{ detail.workflow.edgeCount }}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-muted-foreground">创建时间</span>
        <span>{{ formatTime(detail.workflow.createdAt) }}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-muted-foreground">更新时间</span>
        <span>{{ formatTime(detail.workflow.updatedAt) }}</span>
      </div>
    </CardContent>
  </Card>
</template>
