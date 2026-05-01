import type { Workflow, WorkflowNode, OutputField } from '@/lib/workflow/types'
import { getNodesForExecutionScope } from '@shared/workflow-composite'

export interface WorkflowChanges {
  upsertNodes: any[]
  deleteNodeIds: string[]
  upsertEdges: any[]
  deleteEdgeIds: string[]
}

export function validateWorkflowExecution(workflow: Workflow): string | null {
  const nodes = getNodesForExecutionScope(workflow.nodes, null)
  const startNodes = nodes.filter((n) => n.type === 'start')
  const endNodes = nodes.filter((n) => n.type === 'end')
  if (startNodes.length === 0) return '缺少「开始」节点'
  if (endNodes.length === 0) return '缺少「结束」节点'
  return null
}

export function buildPartialWorkflowSnapshot(
  workflow: Workflow,
  firstNodeId: string,
): { nodes: WorkflowNode[]; edges: Workflow['edges'] } | null {
  const firstNode = workflow.nodes.find((node) => node.id === firstNodeId)
  if (!firstNode) return null

  const reachableIds = new Set<string>([firstNodeId])
  const queue = [firstNodeId]

  while (queue.length > 0) {
    const sourceId = queue.shift()!
    for (const edge of workflow.edges) {
      if (edge.source !== sourceId || reachableIds.has(edge.target)) continue
      reachableIds.add(edge.target)
      queue.push(edge.target)
    }
  }

  const partialNodes = workflow.nodes.filter((node) => reachableIds.has(node.id))
  const partialEdges = workflow.edges.filter((edge) =>
    reachableIds.has(edge.source) && reachableIds.has(edge.target),
  )
  const orderedNodes = [
    firstNode,
    ...partialNodes.filter((node) => node.id !== firstNodeId),
  ]

  return {
    nodes: orderedNodes,
    edges: partialEdges,
  }
}

export function summarizeChanges(changes: WorkflowChanges): string {
  const parts: string[] = []
  if (changes.upsertNodes.length) parts.push(`+${changes.upsertNodes.length}节点`)
  if (changes.deleteNodeIds.length) parts.push(`-${changes.deleteNodeIds.length}节点`)
  if (changes.upsertEdges.length) parts.push(`+${changes.upsertEdges.length}连线`)
  if (changes.deleteEdgeIds.length) parts.push(`-${changes.deleteEdgeIds.length}连线`)
  return parts.join(' ') || '无变化'
}
