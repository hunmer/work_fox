<script setup lang="ts">
import { computed } from 'vue'
import { VisArea, VisAxis, VisXYContainer } from '@unovis/vue'
import { ChartContainer, ChartCrosshair, ChartTooltip, type ChartConfig } from '@/components/ui/chart'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import type { DashboardStatsResponse } from '@shared/channel-contracts'

const props = defineProps<{
  stats: DashboardStatsResponse | null
  loading: boolean
}>()

type TrendItem = DashboardStatsResponse['dailyTrend'][number]
const chartData = computed(() => props.stats?.dailyTrend ?? [])

const chartConfig = {
  success: { label: '成功', color: 'hsl(var(--primary))' },
  error: { label: '失败', color: 'hsl(var(--destructive))' },
} satisfies ChartConfig
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle class="text-base">执行趋势（近 30 天）</CardTitle>
    </CardHeader>
    <CardContent>
      <Skeleton v-if="loading" class="h-[300px] w-full" />
      <ChartContainer v-else-if="chartData.length" :config="chartConfig" class="h-[300px] w-full">
        <VisXYContainer :data="chartData" :padding="{ top: 10, bottom: 20, left: 10, right: 10 }">
          <ChartCrosshair />
          <ChartTooltip />
          <VisArea
            :x="(_d: TrendItem, i: number) => i"
            :y="[(d: TrendItem) => d.success, (d: TrendItem) => d.error]"
            :color="[chartConfig.success.color, chartConfig.error.color]"
            :opacity="0.3"
            :curve-type="'monotoneX'"
          />
          <VisAxis
            type="x"
            :tick-format="(i: number) => chartData[i]?.date?.slice(5) ?? ''"
            :num-ticks="6"
            :grid-line="false"
          />
          <VisAxis
            type="y"
            :num-ticks="4"
            :grid-line="true"
            :domain-line="false"
          />
        </VisXYContainer>
      </ChartContainer>
      <div v-else class="flex h-[300px] items-center justify-center text-muted-foreground">
        暂无趋势数据
      </div>
    </CardContent>
  </Card>
</template>
