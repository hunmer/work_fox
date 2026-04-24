import type { WorkflowEdge, WorkflowNode } from './workflow-types'

export const LOOP_NODE_TYPE = 'loop'
export const LOOP_BODY_NODE_TYPE = 'loop_body'
export const LOOP_ROOT_ROLE = 'loop'
export const LOOP_BODY_ROLE = 'loop_body'
export const LOOP_BODY_SOURCE_HANDLE = 'loop-body'
export const LOOP_NEXT_SOURCE_HANDLE = 'loop-next'

export function findWorkflowNode(nodes: WorkflowNode[], nodeId: string | null | undefined): WorkflowNode | undefined {
  if (!nodeId) return undefined
  return nodes.find((node) => node.id === nodeId)
}

export function getCompositeRootId(node: WorkflowNode): string {
  return node.composite?.rootId || node.id
}

export function getCompositeParentId(node: WorkflowNode): string | null {
  return node.composite?.parentId ?? null
}

export function isGeneratedWorkflowNode(node: WorkflowNode): boolean {
  return !!node.composite?.generated
}

export function isHiddenWorkflowNode(node: WorkflowNode): boolean {
  return !!node.composite?.hidden
}

export function isGeneratedWorkflowEdge(edge: WorkflowEdge): boolean {
  return !!edge.composite?.generated
}

export function isHiddenWorkflowEdge(edge: WorkflowEdge): boolean {
  return !!edge.composite?.hidden
}

export function isLockedWorkflowEdge(edge: WorkflowEdge): boolean {
  return !!edge.composite?.locked
}

export function findCompositeChildren(nodes: WorkflowNode[], parentId: string): WorkflowNode[] {
  return nodes.filter((node) => getCompositeParentId(node) === parentId)
}

export function findCompositeChildByRole(
  nodes: WorkflowNode[],
  rootId: string,
  role: string,
): WorkflowNode | undefined {
  return nodes.find((node) => node.composite?.rootId === rootId && node.composite?.role === role)
}

export function isNodeDescendantOf(
  nodes: WorkflowNode[],
  nodeOrId: WorkflowNode | string,
  ancestorId: string,
): boolean {
  let current = typeof nodeOrId === 'string' ? findWorkflowNode(nodes, nodeOrId) : nodeOrId
  while (current) {
    const parentId = getCompositeParentId(current)
    if (!parentId) return false
    if (parentId === ancestorId) return true
    current = findWorkflowNode(nodes, parentId)
  }
  return false
}

export function getNearestScopeAnchorId(
  nodes: WorkflowNode[],
  nodeOrId: WorkflowNode | string,
): string | null {
  let current = typeof nodeOrId === 'string' ? findWorkflowNode(nodes, nodeOrId) : nodeOrId
  while (current) {
    const parentId = getCompositeParentId(current)
    if (!parentId) return null
    const parent = findWorkflowNode(nodes, parentId)
    if (!parent) return null
    if (isGeneratedWorkflowNode(parent) && isHiddenWorkflowNode(parent)) {
      return parent.id
    }
    current = parent
  }
  return null
}

export function getNodesForExecutionScope(
  nodes: WorkflowNode[],
  scopeAnchorId: string | null,
): WorkflowNode[] {
  return nodes.filter((node) => {
    if (isHiddenWorkflowNode(node)) return false
    return getNearestScopeAnchorId(nodes, node) === scopeAnchorId
  })
}
