<script setup lang="ts">
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { DashboardWorkflowDetailResponse } from '@shared/channel-contracts'

defineProps<{
  detail: DashboardWorkflowDetailResponse | null
}>()

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString()
}
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle class="text-base">历史版本</CardTitle>
    </CardHeader>
    <CardContent>
      <div v-if="!detail?.versions?.length" class="flex items-center justify-center py-6 text-muted-foreground">
        暂无版本记录
      </div>
      <div v-else class="space-y-3">
        <div
          v-for="version in detail.versions"
          :key="version.id"
          class="flex items-center justify-between rounded-lg border p-3"
        >
          <div class="flex items-center gap-3">
            <Badge variant="outline">v{{ version.version }}</Badge>
            <span class="text-sm text-muted-foreground">
              {{ version.nodeCount }} 个节点
            </span>
          </div>
          <span class="text-xs text-muted-foreground">
            {{ formatTime(version.createdAt) }}
          </span>
        </div>
      </div>
    </CardContent>
  </Card>
</template>
