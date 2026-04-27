import { ref, type Ref } from 'vue'
import type { Workflow, ExecutionLog } from '@/lib/workflow/types'
import type { EngineStatus } from '@shared/workflow-types'
import type { ExecutionEventChannel, ExecutionEventMap, ExecutionRecoveryState } from '@shared/execution-events'
import { createWorkflowDomainApi } from '@/lib/backend-api/workflow-domain'
import { ensureWorkflowInteractionHandler } from '@/lib/backend-api/interaction'
import { wsBridge } from '@/lib/ws-bridge'
import { buildPartialWorkflowSnapshot } from './utils'
import type { createExecutionLogManager } from './execution-log'

export function createExecutionActions(
  currentWorkflow: Ref<Workflow | null>,
  executionStatus: Ref<EngineStatus>,
  executionLog: Ref<ExecutionLog | null>,
  executionContext: Ref<Record<string, any>>,
  execLogMgr: ReturnType<typeof createExecutionLogManager>,
  loadData: () => Promise<void>,
  saveWorkflow: (workflow: Workflow) => Promise<void>,
) {
  let currentExecutionId: string | null = null
  let startingExecution = false
  const partialExecutionStartNodeId = ref<string | null>(null)
  const pausedNodeId = ref<string | null>(null)
  const pausedReason = ref<'manual' | 'breakpoint-start' | 'breakpoint-end' | null>(null)
  const backendConnectionState = ref<'idle' | 'connected' | 'reconnecting' | 'error'>('idle')
  const backendReconnectAttempt = ref(0)
  const backendLastError = ref<string | null>(null)

  async function recoverExecutionState(): Promise<void> {
    const workflowId = currentWorkflow.value?.id
    if (!workflowId) return
    if (!currentExecutionId && executionStatus.value === 'idle') return

    try {
      const response = await createWorkflowDomainApi().workflow.getExecutionRecovery(workflowId, currentExecutionId)
      if (!response.found || !response.execution) {
        if (executionStatus.value === 'running' || executionStatus.value === 'paused') {
          executionStatus.value = 'error'
          backendLastError.value = '执行恢复失败：后端未找到对应 execution snapshot'
        }
        return
      }

      applyRecoveredExecution(response.execution)
    } catch (error) {
      backendLastError.value = error instanceof Error ? error.message : String(error)
    }
  }

  function applyRecoveredExecution(recovery: ExecutionRecoveryState): void {
    currentExecutionId = recovery.executionId
    executionStatus.value = recovery.status
    executionLog.value = recovery.log
    executionContext.value = recovery.context as Record<string, any>
    pausedNodeId.value = recovery.status === 'paused' ? recovery.currentNodeId || null : null
    pausedReason.value = recovery.status === 'paused' ? recovery.pauseReason || 'manual' : null

    if (!recovery.active && (recovery.status === 'completed' || recovery.status === 'error')) {
      if (execLogMgr.selectedExecutionLogId.value !== recovery.log.id) {
        execLogMgr.selectedExecutionLogId.value = recovery.log.id
      }
      void execLogMgr.loadExecutionLogs().catch(() => {})
    }
  }

  function handleExecutionEvent(channel: ExecutionEventChannel, payload: ExecutionEventMap[ExecutionEventChannel]) {
    const workflowId = currentWorkflow.value?.id
    if (workflowId && payload.workflowId && payload.workflowId !== workflowId) return

    switch (channel) {
      case 'workflow:started':
        currentExecutionId = payload.executionId
        executionStatus.value = 'running'
        executionLog.value = null
        executionContext.value = {}
        pausedNodeId.value = null
        pausedReason.value = null
        execLogMgr.selectedExecutionLogId.value = null
        break
      case 'workflow:paused':
        executionStatus.value = 'paused'
        pausedNodeId.value = (payload as ExecutionEventMap['workflow:paused']).currentNodeId || null
        pausedReason.value = (payload as ExecutionEventMap['workflow:paused']).reason || 'manual'
        break
      case 'workflow:resumed':
        executionStatus.value = 'running'
        pausedNodeId.value = null
        pausedReason.value = null
        break
      case 'execution:log':
        executionLog.value = (payload as ExecutionEventMap['execution:log']).log
        break
      case 'execution:context':
        executionContext.value = (payload as ExecutionEventMap['execution:context']).context as Record<string, any>
        break
      case 'workflow:completed':
        currentExecutionId = payload.executionId
        executionStatus.value = 'completed'
        partialExecutionStartNodeId.value = null
        pausedNodeId.value = null
        pausedReason.value = null
        executionLog.value = (payload as ExecutionEventMap['workflow:completed']).log
        executionContext.value = (payload as ExecutionEventMap['workflow:completed']).context as Record<string, any>
        if (currentWorkflow.value) {
          const { nodes, edges } = currentWorkflow.value
          execLogMgr.appendCompletedLog((payload as ExecutionEventMap['workflow:completed']).log, currentWorkflow.value.id, { nodes, edges })
        }
        break
      case 'workflow:error':
        currentExecutionId = payload.executionId
        executionStatus.value = 'error'
        partialExecutionStartNodeId.value = null
        pausedNodeId.value = null
        pausedReason.value = null
        if ((payload as ExecutionEventMap['workflow:error']).log) {
          executionLog.value = (payload as ExecutionEventMap['workflow:error']).log || null
          if (currentWorkflow.value) {
            const { nodes, edges } = currentWorkflow.value
            execLogMgr.appendCompletedLog((payload as ExecutionEventMap['workflow:error']).log!, currentWorkflow.value.id, { nodes, edges })
          }
        }
        break
      default:
        break
    }
  }

  const executionChannels: ExecutionEventChannel[] = [
    'workflow:started',
    'workflow:paused',
    'workflow:resumed',
    'workflow:completed',
    'workflow:error',
    'node:start',
    'node:progress',
    'node:complete',
    'node:error',
    'execution:log',
    'execution:context',
  ]

  ensureWorkflowInteractionHandler()
  for (const channel of executionChannels) {
    wsBridge.on(channel, (data) => handleExecutionEvent(channel, data as ExecutionEventMap[typeof channel]))
  }
  wsBridge.on('ws:connected', () => {
    backendConnectionState.value = 'connected'
    backendReconnectAttempt.value = 0
    backendLastError.value = null
    void loadData().catch((error) => {
      backendLastError.value = error instanceof Error ? error.message : String(error)
    })
    void recoverExecutionState()
  })
  wsBridge.on('ws:reconnected', () => {
    backendConnectionState.value = 'connected'
    backendLastError.value = null
    void loadData().catch((error) => {
      backendLastError.value = error instanceof Error ? error.message : String(error)
    })
    void recoverExecutionState()
  })
  wsBridge.on('ws:reconnecting', (payload) => {
    const state = payload as { attempt?: number }
    backendConnectionState.value = 'reconnecting'
    backendReconnectAttempt.value = state.attempt || 0
  })
  wsBridge.on('ws:error', (error) => {
    backendConnectionState.value = 'error'
    backendLastError.value = error instanceof Error
      ? error.message
      : typeof error === 'object' && error && 'message' in error
        ? String((error as { message?: unknown }).message)
        : String(error)
  })

  async function startExecution(): Promise<{ executionId: string | null; status: EngineStatus }> {
    if (!currentWorkflow.value || startingExecution) {
      return { executionId: null, status: executionStatus.value }
    }

    startingExecution = true
    try {
      backendLastError.value = null
      await saveWorkflow(currentWorkflow.value)
      partialExecutionStartNodeId.value = null
      const result = await createWorkflowDomainApi().workflow.execute(currentWorkflow.value.id)
      currentExecutionId = result.executionId
      executionStatus.value = result.status as EngineStatus
      return { executionId: currentExecutionId, status: executionStatus.value }
    } catch (error) {
      backendLastError.value = error instanceof Error ? error.message : String(error)
      executionStatus.value = 'error'
      return { executionId: currentExecutionId, status: executionStatus.value }
    } finally {
      startingExecution = false
    }
  }

  async function startPartialExecution(nodeId: string): Promise<{ executionId: string | null; status: EngineStatus }> {
    if (!currentWorkflow.value || startingExecution) {
      return { executionId: null, status: executionStatus.value }
    }

    const snapshot = buildPartialWorkflowSnapshot(currentWorkflow.value, nodeId)
    if (!snapshot) {
      return { executionId: null, status: executionStatus.value }
    }

    startingExecution = true
    try {
      backendLastError.value = null
      await saveWorkflow(currentWorkflow.value)
      partialExecutionStartNodeId.value = nodeId
      const result = await createWorkflowDomainApi().workflow.execute(
        currentWorkflow.value.id,
        {},
        snapshot,
      )
      currentExecutionId = result.executionId
      executionStatus.value = result.status as EngineStatus
      return { executionId: currentExecutionId, status: executionStatus.value }
    } catch (error) {
      partialExecutionStartNodeId.value = null
      backendLastError.value = error instanceof Error ? error.message : String(error)
      executionStatus.value = 'error'
      return { executionId: currentExecutionId, status: executionStatus.value }
    } finally {
      startingExecution = false
    }
  }

  function pauseExecution(): void {
    if (!currentExecutionId) return
    createWorkflowDomainApi().workflow.pause(currentExecutionId)
  }

  async function resumeExecution(): Promise<void> {
    if (!currentExecutionId) return
    const result = await createWorkflowDomainApi().workflow.resume(currentExecutionId)
    currentExecutionId = result.executionId
    executionStatus.value = result.status as EngineStatus
    setTimeout(() => {
      void recoverExecutionState()
    }, 100)
    if (executionStatus.value === 'completed' || executionStatus.value === 'error') {
      partialExecutionStartNodeId.value = null
      pausedNodeId.value = null
      pausedReason.value = null
    }
  }

  async function stopExecution(): Promise<void> {
    if (!currentExecutionId) return
    const result = await createWorkflowDomainApi().workflow.stop(currentExecutionId)
    currentExecutionId = result.executionId
    executionStatus.value = result.status as EngineStatus
    if (executionStatus.value !== 'running' && executionStatus.value !== 'paused') {
      partialExecutionStartNodeId.value = null
      pausedNodeId.value = null
      pausedReason.value = null
    }
  }

  return {
    startExecution,
    startPartialExecution,
    pauseExecution,
    resumeExecution,
    stopExecution,
    partialExecutionStartNodeId,
    pausedNodeId,
    pausedReason,
    backendConnectionState,
    backendReconnectAttempt,
    backendLastError,
  }
}
