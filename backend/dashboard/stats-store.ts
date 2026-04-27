import { existsSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import type {
  DashboardStatsResponse,
  DashboardExecutionsRequest,
  DashboardExecutionsResponse,
  DashboardWorkflowDetailResponse,
} from '../../shared/channel-contracts'
import type { Workflow, ExecutionLog } from '../../shared/workflow-types'
import type { StoragePaths } from '../storage/paths'

interface CacheEntry<T> {
  data: T
  expiry: number
}

export class DashboardStatsStore {
  private statsCache: CacheEntry<DashboardStatsResponse> | null = null
  private readonly CACHE_TTL = 60_000

  constructor(
    private paths: StoragePaths,
    private listWorkflows: () => Workflow[],
    private getWorkflow: (id: string) => Workflow | undefined,
    private runningSessionCount: () => number,
    private pluginCount: () => number,
  ) {}

  getStats(): DashboardStatsResponse {
    const cached = this.getValidCache(this.statsCache)
    if (cached) return cached

    const workflows = this.listWorkflows()
    const allLogs = this.collectAllLogs(workflows)
    const now = Date.now()
    const todayStart = new Date(now).setHours(0, 0, 0, 0)
    const weekStart = todayStart - 6 * 24 * 60 * 60 * 1000

    let todayExecutions = 0
    let weekExecutions = 0
    const trendMap = new Map<string, { count: number; success: number; error: number }>()

    for (let i = 29; i >= 0; i--) {
      const d = new Date(now - i * 24 * 60 * 60 * 1000)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      trendMap.set(key, { count: 0, success: 0, error: 0 })
    }

    for (const log of allLogs) {
      if (!log.startedAt) continue
      if (log.startedAt >= todayStart) todayExecutions++
      if (log.startedAt >= weekStart) weekExecutions++

      const d = new Date(log.startedAt)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const entry = trendMap.get(key)
      if (entry) {
        entry.count++
        if (log.status === 'completed') entry.success++
        if (log.status === 'error') entry.error++
      }
    }

    const result: DashboardStatsResponse = {
      workflowCount: workflows.length,
      runningCount: this.runningSessionCount(),
      pluginCount: this.pluginCount(),
      todayExecutions,
      weekExecutions,
      totalExecutions: allLogs.length,
      dailyTrend: Array.from(trendMap.entries()).map(([date, v]) => ({ date, ...v })),
    }

    this.statsCache = { data: result, expiry: Date.now() + this.CACHE_TTL }
    return result
  }

  getExecutions(req: DashboardExecutionsRequest): DashboardExecutionsResponse {
    const range = req.range ?? 'all'
    const page = req.page ?? 1
    const pageSize = req.pageSize ?? 20
    const now = Date.now()
    const todayStart = new Date(now).setHours(0, 0, 0, 0)
    const weekStart = todayStart - 6 * 24 * 60 * 60 * 1000

    const workflows = this.listWorkflows()
    const allLogs = this.collectAllLogs(workflows)
    const items: DashboardExecutionsResponse['items'] = []

    for (const log of allLogs) {
      if (!log.startedAt) continue
      if (range === 'today' && log.startedAt < todayStart) continue
      if (range === 'week' && log.startedAt < weekStart) continue
      if (req.status && log.status !== req.status) continue

      const wf = this.getWorkflow(log.workflowId)
      items.push({
        id: log.id,
        workflowId: log.workflowId,
        workflowName: wf?.name ?? 'Unknown',
        status: log.status ?? 'completed',
        startedAt: log.startedAt,
        finishedAt: log.finishedAt ?? null,
        duration: log.finishedAt && log.startedAt ? log.finishedAt - log.startedAt : null,
        stepCount: log.steps?.length ?? 0,
      })
    }

    items.sort((a, b) => b.startedAt - a.startedAt)

    const total = items.length
    const start = (page - 1) * pageSize
    const paged = items.slice(start, start + pageSize)

    return { items: paged, total, page, pageSize }
  }

  getWorkflowDetail(workflowId: string): DashboardWorkflowDetailResponse | null {
    const wf = this.getWorkflow(workflowId)
    if (!wf) return null

    const logs = this.readLogsForWorkflow(workflowId)
    const versions = this.readVersionsForWorkflow(workflowId)

    return {
      workflow: {
        id: wf.id,
        name: wf.name,
        folderId: wf.folderId ?? null,
        nodeCount: wf.nodes?.length ?? 0,
        edgeCount: wf.edges?.length ?? 0,
        createdAt: wf.createdAt,
        updatedAt: wf.updatedAt,
      },
      versions,
      executions: {
        items: logs.map(log => ({
          id: log.id,
          status: log.status ?? 'completed',
          startedAt: log.startedAt,
          finishedAt: log.finishedAt ?? null,
          duration: log.finishedAt && log.startedAt ? log.finishedAt - log.startedAt : null,
          stepCount: log.steps?.length ?? 0,
        })),
        total: logs.length,
      },
    }
  }

  invalidateCache(): void {
    this.statsCache = null
  }

  private getValidCache<T>(cache: CacheEntry<T> | null): T | null {
    if (!cache) return null
    if (Date.now() > cache.expiry) {
      this.statsCache = null
      return null
    }
    return cache.data
  }

  private collectAllLogs(workflows: Workflow[]): ExecutionLog[] {
    const allLogs: ExecutionLog[] = []
    for (const wf of workflows) {
      allLogs.push(...this.readLogsForWorkflow(wf.id))
    }
    return allLogs
  }

  private readLogsForWorkflow(workflowId: string): ExecutionLog[] {
    const dir = this.paths.executionHistoryDir(workflowId)
    if (!existsSync(dir)) return []
    try {
      return readdirSync(dir)
        .filter(f => f.endsWith('.json'))
        .map(f => {
          try {
            return JSON.parse(readFileSync(join(dir, f), 'utf-8')) as ExecutionLog
          } catch {
            return null
          }
        })
        .filter((log): log is ExecutionLog => log !== null)
        .sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0))
    } catch {
      return []
    }
  }

  private readVersionsForWorkflow(workflowId: string): DashboardWorkflowDetailResponse['versions'] {
    const versionsDir = this.paths.versionsDir(workflowId)
    if (!versionsDir || !existsSync(versionsDir)) return []
    try {
      return readdirSync(versionsDir)
        .filter(f => f.endsWith('.json'))
        .map((f, i) => {
          try {
            const content = JSON.parse(readFileSync(join(versionsDir, f), 'utf-8'))
            return {
              id: f.replace('.json', ''),
              version: i + 1,
              createdAt: content.createdAt ?? 0,
              nodeCount: content.nodes?.length ?? 0,
              description: content.description,
            }
          } catch {
            return null
          }
        })
        .filter((v): v is NonNullable<typeof v> => v !== null)
    } catch {
      return []
    }
  }
}
