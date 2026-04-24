import type { EmbeddedWorkflow, WorkflowNode } from './workflow-types'

type CreateId = () => string

function defaultCreateId(): string {
  return `node_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

function createBoundaryNode(
  type: 'start' | 'end',
  label: string,
  position: { x: number; y: number },
  createId: CreateId,
): WorkflowNode {
  return {
    id: createId(),
    type,
    label,
    position,
    data: {},
  }
}

export function createDefaultEmbeddedWorkflow(createId: CreateId = defaultCreateId): EmbeddedWorkflow {
  const startNode = createBoundaryNode('start', '开始', { x: 80, y: 140 }, createId)
  const endNode = createBoundaryNode('end', '结束', { x: 420, y: 140 }, createId)

  return {
    nodes: [startNode, endNode],
    edges: [
      {
        id: `e-${startNode.id}-${endNode.id}`,
        source: startNode.id,
        target: endNode.id,
      },
    ],
  }
}

export function normalizeEmbeddedWorkflow(
  value: unknown,
  createId: CreateId = defaultCreateId,
): EmbeddedWorkflow {
  if (
    value
    && typeof value === 'object'
    && Array.isArray((value as EmbeddedWorkflow).nodes)
    && Array.isArray((value as EmbeddedWorkflow).edges)
  ) {
    return value as EmbeddedWorkflow
  }

  return createDefaultEmbeddedWorkflow(createId)
}
