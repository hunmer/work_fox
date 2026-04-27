import { ref, computed, type Ref } from 'vue'
import type { Workflow } from '@/lib/workflow/types'

export function createUndoRedoManager(currentWorkflow: Ref<Workflow | null>, api: () => any) {
  const MAX_HISTORY = 1000
  const undoStack = ref<string[]>([])
  const redoStack = ref<string[]>([])
  const operationLog = ref<{ description: string; timestamp: number; snapshot?: string }[]>([])

  function captureSnapshot(): string {
    if (!currentWorkflow.value) return ''
    return JSON.stringify({
      nodes: currentWorkflow.value.nodes,
      edges: currentWorkflow.value.edges,
      groups: currentWorkflow.value.groups || []
    })
  }

  function applySnapshot(snapshot: string): void {
    if (!currentWorkflow.value || !snapshot) return
    const parsed = JSON.parse(snapshot)
    currentWorkflow.value.nodes = parsed.nodes
    currentWorkflow.value.edges = parsed.edges
    currentWorkflow.value.groups = parsed.groups || []
  }

  function pushUndo(description: string): void {
    const snapshot = captureSnapshot()
    if (!snapshot) return
    undoStack.value.push(snapshot)
    if (undoStack.value.length > MAX_HISTORY) undoStack.value.shift()
    redoStack.value = []
    const entry: { description: string; timestamp: number; snapshot?: string } = {
      description,
      timestamp: Date.now(),
      snapshot,
    }
    operationLog.value.unshift(entry)
    if (operationLog.value.length > MAX_HISTORY) operationLog.value.length = MAX_HISTORY
    persistLog()
  }

  async function restoreToStep(index: number): Promise<void> {
    if (index < 0 || !currentWorkflow.value) return
    const entry = operationLog.value[index]
    if (!entry?.snapshot) return
    applySnapshot(entry.snapshot)
    operationLog.value.splice(0, index + 1)
    undoStack.value = []
    redoStack.value = []
    persistLog()
  }

  function undo(): void {
    if (undoStack.value.length === 0) return
    const snapshot = captureSnapshot()
    redoStack.value.push(captureSnapshot())
    applySnapshot(undoStack.value.pop()!)
    operationLog.value.unshift({ description: '撤销操作', timestamp: Date.now(), snapshot })
    if (operationLog.value.length > MAX_HISTORY) operationLog.value.length = MAX_HISTORY
    persistLog()
  }

  function redo(): void {
    if (redoStack.value.length === 0) return
    const snapshot = captureSnapshot()
    undoStack.value.push(captureSnapshot())
    applySnapshot(redoStack.value.pop()!)
    operationLog.value.unshift({ description: '重做操作', timestamp: Date.now(), snapshot })
    if (operationLog.value.length > MAX_HISTORY) operationLog.value.length = MAX_HISTORY
    persistLog()
  }

  const canUndo = computed(() => undoStack.value.length > 0)
  const canRedo = computed(() => redoStack.value.length > 0)

  let saveTimer: ReturnType<typeof setTimeout> | null = null
  function scheduleSave(): void {
    if (!currentWorkflow.value?.id) return
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      const a = api()
      if (a?.operationHistory?.save) {
        a.operationHistory.save(currentWorkflow.value!.id, JSON.parse(JSON.stringify(operationLog.value)))
      }
    }, 500)
  }

  function persistLog(): void {
    operationLog.value = [...operationLog.value]
    scheduleSave()
  }

  async function loadFromDisk(): Promise<void> {
    const a = api()
    if (!a?.operationHistory?.load || !currentWorkflow.value?.id) return
    try {
      const entries = await a.operationHistory.load(currentWorkflow.value.id)
      if (entries?.length) operationLog.value = entries
    } catch { /* ignore */ }
  }

  async function clearHistory(): Promise<void> {
    const workflowId = currentWorkflow.value?.id
    if (!workflowId) return
    await api().operationHistory.clear(workflowId)
  }

  return {
    undoStack, redoStack, operationLog, pushUndo, undo, redo, restoreToStep,
    reset: () => { undoStack.value = []; redoStack.value = []; operationLog.value = [] },
    loadOperationHistory: loadFromDisk,
    clearOperationHistory: clearHistory,
    canUndo, canRedo,
  }
}
