import { ref, type Ref } from 'vue'
import type { Workflow, WorkflowNode } from '@/lib/workflow/types'
import { createWorkflowDomainApi } from '@/lib/backend-api/workflow-domain'

export function createDebugActions(
  currentWorkflow: Ref<Workflow | null>,
  executionContext: Ref<Record<string, any>>,
) {
  const debugNodeStatus = ref<'idle' | 'running' | 'completed' | 'error'>('idle')
  const debugNodeResult = ref<{ status: 'completed' | 'error'; output?: any; error?: string; duration: number } | null>(null)
  const debugNodeId = ref<string | null>(null)

  async function debugSingleNode(nodeId: string, embeddedNode?: WorkflowNode): Promise<void> {
    if (!currentWorkflow.value) return
    const node = embeddedNode ?? currentWorkflow.value.nodes.find((n) => n.id === nodeId)
    if (!node) return

    debugNodeStatus.value = 'running'
    debugNodeResult.value = null
    debugNodeId.value = nodeId

    const result = await createWorkflowDomainApi().workflow.debugNode(currentWorkflow.value.id, nodeId, {
      context: executionContext.value,
      snapshot: {
        nodes: currentWorkflow.value.nodes,
        edges: currentWorkflow.value.edges,
      },
      embeddedNode,
    })

    debugNodeResult.value = result
    debugNodeStatus.value = result.status
  }

  function cancelDebug() {
    debugNodeStatus.value = 'idle'
    debugNodeResult.value = null
    debugNodeId.value = null
  }

  return { debugNodeStatus, debugNodeResult, debugNodeId, debugSingleNode, cancelDebug }
}
