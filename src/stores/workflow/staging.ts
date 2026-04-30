import { ref, type Ref } from 'vue'
import type { StagedNode } from '@shared/workflow-types'
import type { Workflow, WorkflowNode } from '@/lib/workflow/types'

export function createStagingManager(
  currentWorkflow: Ref<Workflow | null>,
  api: () => any,
) {
  const stagedNodes = ref<StagedNode[]>([])

  async function loadStagedNodes(): Promise<void> {
    const workflowId = currentWorkflow.value?.id
    if (!workflowId) { stagedNodes.value = []; return }
    try {
      stagedNodes.value = await api().staging.load(workflowId)
    } catch {
      stagedNodes.value = []
    }
  }

  async function saveStagedNodes(): Promise<void> {
    const workflowId = currentWorkflow.value?.id
    if (!workflowId) return
    await api().staging.save(workflowId, stagedNodes.value)
  }

  async function copyNodeToStaging(nodeId: string): Promise<void> {
    const wf = currentWorkflow.value
    if (!wf) return
    const node = wf.nodes.find((n: WorkflowNode) => n.id === nodeId)
    if (!node) return
    const entry: StagedNode = {
      id: crypto.randomUUID(),
      sourceNodeId: node.id,
      type: node.type,
      label: node.label,
      data: JSON.parse(JSON.stringify(node.data)),
      composite: node.composite ? JSON.parse(JSON.stringify(node.composite)) : undefined,
      stagedAt: Date.now(),
    }
    stagedNodes.value.push(entry)
    await saveStagedNodes()
  }

  async function moveNodeToStaging(nodeId: string, removeFn: (id: string) => void): Promise<void> {
    await copyNodeToStaging(nodeId)
    removeFn(nodeId)
  }

  async function removeStagedNode(stagedId: string): Promise<void> {
    stagedNodes.value = stagedNodes.value.filter((n) => n.id !== stagedId)
    await saveStagedNodes()
  }

  async function clearStagedNodes(): Promise<void> {
    stagedNodes.value = []
    await saveStagedNodes()
  }

  return {
    stagedNodes,
    loadStagedNodes,
    copyNodeToStaging,
    moveNodeToStaging,
    removeStagedNode,
    clearStagedNodes,
  }
}
