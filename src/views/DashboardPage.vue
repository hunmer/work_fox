<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import DashboardSidebar from '@/components/dashboard/DashboardSidebar.vue'
import StatsCards from '@/components/dashboard/StatsCards.vue'
import ExecutionChart from '@/components/dashboard/ExecutionChart.vue'
import ExecutionHistoryTable from '@/components/dashboard/ExecutionHistoryTable.vue'
import WorkflowDetailPanel from '@/components/dashboard/WorkflowDetailPanel.vue'
import { useDashboardStore } from '@/stores/dashboard'
import { wsBridge } from '@/lib/ws-bridge'

const store = useDashboardStore()
const wsConnected = ref(wsBridge.isConnected())

const handleWsConnected = () => { wsConnected.value = true }
const handleWsDisconnected = () => { wsConnected.value = false }

onMounted(() => {
  wsBridge.on('ws:connected', handleWsConnected)
  wsBridge.on('ws:disconnected', handleWsDisconnected)
  store.init()
})

onUnmounted(() => {
  wsBridge.off('ws:connected', handleWsConnected)
  wsBridge.off('ws:disconnected', handleWsDisconnected)
})

function handleSelectWorkflow(workflowId: string | null) {
  store.selectWorkflow(workflowId)
  if (workflowId === null) {
    store.refresh()
  }
}

function handleRangeChange(range: 'today' | 'week' | 'all') {
  store.fetchExecutions(range)
}
</script>

<template>
  <SidebarProvider
    :style="{
      '--sidebar-width': '280px',
      '--header-height': '48px',
    }"
  >
    <DashboardSidebar
      :folders="store.folders"
      :workflows="store.workflows"
      :selected-workflow-id="store.selectedWorkflowId"
      @select="handleSelectWorkflow"
    />
    <SidebarInset>
      <div v-if="!wsConnected" class="border-b bg-destructive/10 px-4 py-2 text-center text-sm text-destructive">
        后端服务未连接，统计数据无法加载
      </div>
      <header class="flex h-12 items-center border-b px-4">
        <h1 class="text-lg font-semibold">
          {{ store.isOverviewMode ? '统计概览' : store.workflowDetail?.workflow.name ?? '工作流详情' }}
        </h1>
        <button
          v-if="!store.isOverviewMode"
          class="ml-4 text-sm text-muted-foreground hover:text-foreground"
          @click="handleSelectWorkflow(null)"
        >
          &larr; 返回概览
        </button>
      </header>

      <div class="flex flex-1 flex-col">
        <div class="flex flex-1 flex-col gap-2">
          <template v-if="store.isOverviewMode">
            <div class="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
              <StatsCards :stats="store.stats" :loading="store.statsLoading" />
              <div class="px-4 lg:px-6">
                <ExecutionChart :stats="store.stats" :loading="store.statsLoading" />
              </div>
              <div class="px-4 lg:px-6">
                <ExecutionHistoryTable
                  :data="store.executions"
                  :loading="store.executionsLoading"
                  :range="store.executionsRange"
                  @update:range="handleRangeChange"
                />
              </div>
            </div>
          </template>

          <template v-else>
            <div class="px-4 lg:px-6">
              <WorkflowDetailPanel
                :detail="store.workflowDetail"
                :loading="store.workflowDetailLoading"
              />
            </div>
          </template>
        </div>
      </div>
    </SidebarInset>
  </SidebarProvider>
</template>
