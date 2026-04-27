<script setup lang="ts">
import { computed } from 'vue'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Workflow,
  Play,
  Plug,
  CalendarDays,
  CalendarRange,
  BarChart3,
} from 'lucide-vue-next'
import type { DashboardStatsResponse } from '@shared/channel-contracts'

const props = defineProps<{
  stats: DashboardStatsResponse | null
  loading: boolean
}>()

const cards = computed(() => {
  if (!props.stats) return []
  return [
    { title: '工作流总数', value: props.stats.workflowCount, icon: Workflow },
    { title: '正在运行', value: props.stats.runningCount, icon: Play },
    { title: '插件数量', value: props.stats.pluginCount, icon: Plug },
    { title: '今日调用', value: props.stats.todayExecutions, icon: CalendarDays },
    { title: '本周调用', value: props.stats.weekExecutions, icon: CalendarRange },
    { title: '总调用次数', value: props.stats.totalExecutions, icon: BarChart3 },
  ]
})
</script>

<template>
  <div class="grid grid-cols-1 gap-4 px-4 sm:grid-cols-2 md:grid-cols-3 lg:px-6">
    <template v-if="loading">
      <Card v-for="i in 6" :key="i">
        <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
          <Skeleton class="h-4 w-24" />
          <Skeleton class="h-4 w-4" />
        </CardHeader>
        <CardContent>
          <Skeleton class="h-8 w-16" />
        </CardContent>
      </Card>
    </template>
    <template v-else>
      <Card v-for="card in cards" :key="card.title">
        <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle class="text-sm font-medium text-muted-foreground">
            {{ card.title }}
          </CardTitle>
          <component :is="card.icon" class="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div class="text-2xl font-bold">{{ card.value }}</div>
        </CardContent>
      </Card>
    </template>
  </div>
</template>
