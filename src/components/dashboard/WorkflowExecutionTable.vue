<script setup lang="ts">
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import type { DashboardWorkflowDetailResponse } from '@shared/channel-contracts'

defineProps<{
  detail: DashboardWorkflowDetailResponse | null
}>()

const statusVariant: Record<string, string> = {
  completed: 'default',
  running: 'secondary',
  paused: 'outline',
  error: 'destructive',
}
const statusLabel: Record<string, string> = {
  completed: '已完成',
  running: '运行中',
  paused: '已暂停',
  error: '失败',
}

function formatDuration(ms: number | null): string {
  if (ms == null) return '-'
  if (ms < 1000) return `${ms}ms`
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  return `${minutes}m ${seconds % 60}s`
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString()
}
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle class="text-base">执行记录</CardTitle>
    </CardHeader>
    <CardContent>
      <div v-if="!detail?.executions?.items?.length" class="flex items-center justify-center py-6 text-muted-foreground">
        暂无执行记录
      </div>
      <Table v-else>
        <TableHeader>
          <TableRow>
            <TableHead>状态</TableHead>
            <TableHead>开始时间</TableHead>
            <TableHead>耗时</TableHead>
            <TableHead>步骤数</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-for="item in detail.executions.items" :key="item.id">
            <TableCell>
              <Badge :variant="statusVariant[item.status] as any">
                {{ statusLabel[item.status] ?? item.status }}
              </Badge>
            </TableCell>
            <TableCell class="text-muted-foreground">{{ formatTime(item.startedAt) }}</TableCell>
            <TableCell>{{ formatDuration(item.duration) }}</TableCell>
            <TableCell>{{ item.stepCount }}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </CardContent>
  </Card>
</template>
