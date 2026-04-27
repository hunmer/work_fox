import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { dashboardBackendApi } from '@/lib/backend-api/dashboard'
import { workflowBackendApi } from '@/lib/backend-api/workflow'
import { workflowFolderBackendApi } from '@/lib/backend-api/workflow-folder'
import type {
  DashboardStatsResponse,
  DashboardExecutionsResponse,
  DashboardWorkflowDetailResponse,
} from '@shared/channel-contracts'
import type { Workflow, WorkflowFolder } from '@shared/workflow-types'

export type DashboardExecutionsRange = 'today' | 'week' | 'all'
export type DashboardView = 'overview' | 'workflow-list'

export const useDashboardStore = defineStore('dashboard', () => {
  // ---- View ----
  const activeView = ref<DashboardView>('overview')

  function setView(view: DashboardView) {
    activeView.value = view
    if (view === 'overview') {
      selectedWorkflowId.value = null
      workflowDetail.value = null
    }
  }

  // ---- Stats ----
  const stats = ref<DashboardStatsResponse | null>(null)
  const statsLoading = ref(false)

  async function fetchStats() {
    statsLoading.value = true
    try {
      stats.value = await dashboardBackendApi.getStats()
    } catch (e) {
      console.error('[Dashboard] fetchStats failed:', e)
    } finally {
      statsLoading.value = false
    }
  }

  // ---- Executions ----
  const executions = ref<DashboardExecutionsResponse | null>(null)
  const executionsLoading = ref(false)
  const executionsRange = ref<DashboardExecutionsRange>('all')

  async function fetchExecutions(range?: DashboardExecutionsRange) {
    if (range) executionsRange.value = range
    executionsLoading.value = true
    try {
      executions.value = await dashboardBackendApi.getExecutions({
        range: executionsRange.value,
      })
    } catch (e) {
      console.error('[Dashboard] fetchExecutions failed:', e)
    } finally {
      executionsLoading.value = false
    }
  }

  // ---- Selected workflow ----
  const selectedWorkflowId = ref<string | null>(null)
  const workflowDetail = ref<DashboardWorkflowDetailResponse | null>(null)
  const workflowDetailLoading = ref(false)

  const isOverviewMode = computed(() => activeView.value === 'overview')

  async function selectWorkflow(workflowId: string | null) {
    selectedWorkflowId.value = workflowId
    if (workflowId) {
      workflowDetailLoading.value = true
      try {
        workflowDetail.value = await dashboardBackendApi.getWorkflowDetail(workflowId)
      } catch (e) {
        console.error('[Dashboard] fetchWorkflowDetail failed:', e)
        workflowDetail.value = null
      } finally {
        workflowDetailLoading.value = false
      }
    } else {
      workflowDetail.value = null
    }
  }

  // ---- Sidebar data ----
  const folders = ref<WorkflowFolder[]>([])
  const workflows = ref<Workflow[]>([])
  const sidebarLoading = ref(false)

  async function fetchSidebarData() {
    sidebarLoading.value = true
    try {
      const [folderList, workflowList] = await Promise.all([
        workflowFolderBackendApi.list(),
        workflowBackendApi.list(),
      ])
      folders.value = folderList
      workflows.value = workflowList
    } catch (e) {
      console.error('[Dashboard] fetchSidebarData failed:', e)
    } finally {
      sidebarLoading.value = false
    }
  }

  // ---- Init ----
  async function init() {
    await Promise.all([
      fetchStats(),
      fetchExecutions('all'),
      fetchSidebarData(),
    ])
  }

  async function refresh() {
    await Promise.all([
      fetchStats(),
      fetchExecutions(),
    ])
  }

  return {
    activeView, setView,
    stats, statsLoading, fetchStats,
    executions, executionsLoading, executionsRange, fetchExecutions,
    selectedWorkflowId, workflowDetail, workflowDetailLoading, isOverviewMode, selectWorkflow,
    folders, workflows, sidebarLoading, fetchSidebarData,
    init, refresh,
  }
})
