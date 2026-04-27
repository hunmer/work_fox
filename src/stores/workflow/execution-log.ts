import { ref, type Ref } from 'vue'
import type { Workflow, ExecutionLog } from '@/lib/workflow/types'

export function createExecutionLogManager(currentWorkflow: Ref<Workflow | null>, api: () => any) {
  const executionLogs = ref<ExecutionLog[]>([])
  const selectedExecutionLogId = ref<string | null>(null)

  async function loadExecutionLogs(): Promise<void> {
    const workflowId = currentWorkflow.value?.id
    if (!workflowId) { executionLogs.value = []; return }
    executionLogs.value = await api().executionLog.list(workflowId)
    if (selectedExecutionLogId.value && !executionLogs.value.find((l) => l.id === selectedExecutionLogId.value)) {
      selectedExecutionLogId.value = null
    }
  }

  async function deleteExecutionLog(logId: string): Promise<void> {
    const workflowId = currentWorkflow.value?.id
    if (!workflowId) return
    await api().executionLog.delete(workflowId, logId)
    executionLogs.value = executionLogs.value.filter((l) => l.id !== logId)
    if (selectedExecutionLogId.value === logId) selectedExecutionLogId.value = null
  }

  async function clearExecutionLogs(): Promise<void> {
    const workflowId = currentWorkflow.value?.id
    if (!workflowId) return
    await api().executionLog.clear(workflowId)
    executionLogs.value = []
    selectedExecutionLogId.value = null
  }

  function appendCompletedLog(log: ExecutionLog, workflowId: string, snapshot?: { nodes: any[]; edges: any[] }) {
    if (!log.id) {
      log.id = `exec-${Date.now()}`
    }
    log.workflowId = workflowId
    if (snapshot) log.snapshot = JSON.parse(JSON.stringify(snapshot))
    executionLogs.value.unshift(log)
    if (executionLogs.value.length > 100) executionLogs.value.length = 100
    selectedExecutionLogId.value = log.id
    try {
      const serializable = JSON.parse(JSON.stringify(log))
      api().executionLog.save(workflowId, serializable).catch(() => {})
    } catch { /* serialization failed, skip persist */ }
  }

  return { executionLogs, selectedExecutionLogId, loadExecutionLogs, deleteExecutionLog, clearExecutionLogs, appendCompletedLog }
}
