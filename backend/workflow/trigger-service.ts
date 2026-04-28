import crypto from 'node:crypto'
import nodeCron, { type ScheduledTask } from 'node-cron'
import CronExpressionParser from 'cron-parser'
import type { BackendWorkflowStore } from '../storage/workflow-store'
import type { BackendWorkflowExecutionManager } from './execution-manager'
import type { BackendConfig } from '../app/config'
import type { Logger } from '../app/logger'
import type { Workflow, WorkflowTrigger } from '../../shared/workflow-types'

const SCHEDULER_CLIENT_ID = '__scheduler__'

interface HookBinding {
  workflowId: string
  triggerId: string
}

export class WorkflowTriggerService {
  private cronJobs = new Map<string, ScheduledTask>()
  private hookIndex = new Map<string, Set<HookBinding>>()

  constructor(
    private workflowStore: BackendWorkflowStore,
    private executionManager: BackendWorkflowExecutionManager,
    private config: BackendConfig,
    private logger: Logger
  ) {}

  async start(): Promise<void> {
    const workflows = this.workflowStore.listWorkflows()
    for (const wf of workflows) {
      this.registerTriggers(wf)
    }
    this.logger.info(`[TriggerService] Started. ${this.cronJobs.size} cron jobs, ${this.hookIndex.size} hooks registered`)
  }

  reloadWorkflow(workflowId: string): void {
    this.clearTriggersForWorkflow(workflowId)
    const wf = this.workflowStore.getWorkflow(workflowId)
    if (wf) this.registerTriggers(wf)
  }

  removeWorkflow(workflowId: string): void {
    this.clearTriggersForWorkflow(workflowId)
  }

  getHookBindings(hookName: string): HookBinding[] {
    return Array.from(this.hookIndex.get(hookName) ?? [])
  }

  getHookConflicts(hookName: string, excludeWorkflowId?: string): { conflictWorkflowIds: string[] } {
    const bindings = this.hookIndex.get(hookName) ?? new Set()
    const ids = Array.from(bindings)
      .map(b => b.workflowId)
      .filter(id => id !== excludeWorkflowId)
    return { conflictWorkflowIds: [...new Set(ids)] }
  }

  getHookUrl(hookName: string): string {
    return `http://${this.config.host}:${this.config.port}/hook/${hookName}`
  }

  async executeForHook(
    workflowId: string,
    input: Record<string, unknown>,
    eventSink: (channel: string, payload: unknown) => void
  ): Promise<{ executionId: string; status: string }> {
    const result = await this.executionManager.execute(
      { workflowId, input },
      `__hook_${crypto.randomUUID()}__`,
      eventSink
    )
    return result
  }

  validateCron(cronExpr: string): { valid: boolean; nextRuns: string[]; error?: string } {
    if (!nodeCron.validate(cronExpr)) {
      return { valid: false, nextRuns: [], error: 'Invalid cron expression' }
    }
    try {
      const interval = CronExpressionParser.parse(cronExpr)
      const nextRuns: string[] = []
      for (let i = 0; i < 5; i++) {
        const iso = interval.next().toISOString()
        if (iso) nextRuns.push(iso)
      }
      return { valid: true, nextRuns }
    } catch (err: any) {
      return { valid: false, nextRuns: [], error: err.message }
    }
  }

  private registerTriggers(wf: Workflow): void {
    if (!wf.triggers) return
    for (const trigger of wf.triggers) {
      if (!trigger.enabled) continue
      if (trigger.type === 'cron') {
        this.registerCronJob(wf.id, trigger)
      } else if (trigger.type === 'hook') {
        this.registerHookBinding(wf.id, trigger)
      }
    }
  }

  private registerCronJob(workflowId: string, trigger: WorkflowTrigger & { type: 'cron' }): void {
    const key = `${workflowId}:${trigger.id}`
    try {
      const task = nodeCron.schedule(
        trigger.cron,
        () => {
          this.logger.info(`[TriggerService] Cron fired for workflow ${workflowId}`)
          this.executionManager.execute(
            { workflowId, input: {} },
            SCHEDULER_CLIENT_ID
          )
        },
        {
          timezone: trigger.timezone,
        }
      )
      this.cronJobs.set(key, task)
    } catch (err: any) {
      this.logger.error(`[TriggerService] Invalid cron "${trigger.cron}" for workflow ${workflowId}: ${err.message}`)
    }
  }

  private registerHookBinding(workflowId: string, trigger: WorkflowTrigger & { type: 'hook' }): void {
    let bindings = this.hookIndex.get(trigger.hookName)
    if (!bindings) {
      bindings = new Set()
      this.hookIndex.set(trigger.hookName, bindings)
    }
    bindings.add({ workflowId, triggerId: trigger.id })
  }

  private clearTriggersForWorkflow(workflowId: string): void {
    for (const [key, task] of this.cronJobs) {
      if (key.startsWith(`${workflowId}:`)) {
        task.stop()
        this.cronJobs.delete(key)
      }
    }
    for (const [hookName, bindings] of this.hookIndex) {
      for (const binding of bindings) {
        if (binding.workflowId === workflowId) {
          bindings.delete(binding)
        }
      }
      if (bindings.size === 0) {
        this.hookIndex.delete(hookName)
      }
    }
  }
}
