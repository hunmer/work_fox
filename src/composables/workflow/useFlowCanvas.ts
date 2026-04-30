import { computed, ref, watch, nextTick, onUnmounted } from 'vue'
import { useVueFlow, MarkerType } from '@vue-flow/core'
import type { GraphNode, NodeChange, NodeDragEvent } from '@vue-flow/core'
import type { WorkflowStore } from '@/stores/workflow'
import type { WorkflowGroup, WorkflowNode } from '@/lib/workflow/types'
import { normalizeEmbeddedWorkflow } from '@shared/embedded-workflow'
import {
  isHiddenWorkflowNode,
  isHiddenWorkflowEdge,
  isScopeBoundaryWorkflowNode,
  getCompositeParentId,
  LOOP_BODY_ROLE,
  LOOP_BODY_NODE_TYPE,
} from '@shared/workflow-composite'
import { getHelperLines } from '@/components/workflow/helper-line-utils'

const CONTAINER_PADDING = {
  top: 56,
  right: 56,
  bottom: 44,
  left: 56,
}

const MIN_CONTAINER_SIZE = {
  width: 520,
  height: 260,
}

const GROUP_PADDING = 20
const GROUP_HEADER_HEIGHT = 32
const DEFAULT_NODE_SIZE = {
  width: 220,
  height: 120,
}

type Bounds = { x: number; y: number; width: number; height: number }

const resizingNodeIds = new Set<string>()

export function useFlowCanvas(store: WorkflowStore, flowId: string) {
  const flowStore = useVueFlow(flowId)
  const {
    onNodesChange,
    onEdgesChange,
    onViewportChange,
    setViewport,
    fitView,
    updateNodeInternals,
    getNodes,
  } = flowStore

  // ── 对齐辅助线状态 ──
  const helperLineHorizontal = ref<number | undefined>(undefined)
  const helperLineVertical = ref<number | undefined>(undefined)
  const activeLoopBodyDropTargetId = ref<string | null>(null)

  function syncScopeBoundaryLayout(scopeNodeId: string): void {
    const workflow = store.currentWorkflow
    if (!workflow) return

    const scopeNode = workflow.nodes.find((node) => node.id === scopeNodeId)
    if (!scopeNode || !isScopeBoundaryWorkflowNode(scopeNode)) return

    const children = workflow.nodes.filter((node) => getCompositeParentId(node) === scopeNodeId && !isHiddenWorkflowNode(node))
    if (!children.length) return

    const minX = Math.min(...children.map((node) => node.position.x))
    const minY = Math.min(...children.map((node) => node.position.y))
    const maxX = Math.max(...children.map((node) => node.position.x + Number(node.data?.width || 220)))
    const maxY = Math.max(...children.map((node) => node.position.y + Number(node.data?.height || 120)))

    const nextX = minX - CONTAINER_PADDING.left
    const nextY = minY - CONTAINER_PADDING.top
    const nextWidth = Math.max(MIN_CONTAINER_SIZE.width, maxX - minX + CONTAINER_PADDING.left + CONTAINER_PADDING.right)
    const nextHeight = Math.max(MIN_CONTAINER_SIZE.height, maxY - minY + CONTAINER_PADDING.top + CONTAINER_PADDING.bottom)

    if (scopeNode.position.x !== nextX || scopeNode.position.y !== nextY) {
      store.updateNodePosition(scopeNode.id, { x: nextX, y: nextY })
    }

    scopeNode.data = {
      ...scopeNode.data,
      width: nextWidth,
      height: nextHeight,
    }
  }

  function migrateEmbeddedLoopBodyNodes(): void {
    const workflow = store.currentWorkflow
    if (!workflow) return

    for (const bodyNode of workflow.nodes) {
      if (bodyNode.type !== LOOP_BODY_NODE_TYPE || bodyNode.composite?.role !== LOOP_BODY_ROLE) continue
      if (workflow.nodes.some((node) => getCompositeParentId(node) === bodyNode.id)) continue

      const embedded = bodyNode.data?.bodyWorkflow
      if (!embedded || typeof embedded !== 'object') continue

      const normalized = normalizeEmbeddedWorkflow(embedded, () => crypto.randomUUID())
      const migratedNodes = normalized.nodes
        .map((node): WorkflowNode => ({
          ...JSON.parse(JSON.stringify(node)),
          position: {
            x: bodyNode.position.x + node.position.x,
            y: bodyNode.position.y + node.position.y,
          },
          composite: {
            ...(node.composite ? JSON.parse(JSON.stringify(node.composite)) : {}),
            rootId: bodyNode.id,
            parentId: bodyNode.id,
            generated: node.type === 'start' || node.type === 'end',
            hidden: false,
          },
        }))

      if (!migratedNodes.length) continue

      const migratedNodeIds = new Set(migratedNodes.map((node) => node.id))
      const startNode = migratedNodes.find((node) => node.type === 'start')
      const migratedEdges = normalized.edges
        .map((edge) => {
          const source = edge.source
          if (!migratedNodeIds.has(source)) return null
          if (!migratedNodeIds.has(edge.target)) return null
          return {
            ...JSON.parse(JSON.stringify(edge)),
            id: `e-${source}-${edge.sourceHandle ?? 'default'}-${edge.target}-${edge.targetHandle ?? 'default'}`,
            source,
            target: edge.target,
            sourceHandle: edge.sourceHandle ?? null,
            targetHandle: edge.targetHandle ?? null,
          }
        })
        .filter(Boolean) as NonNullable<typeof workflow.edges[number]>[]

      if (startNode) {
        migratedEdges.push({
          id: `e-${bodyNode.id}-default-${startNode.id}-target`,
          source: bodyNode.id,
          target: startNode.id,
          sourceHandle: null,
          targetHandle: 'target',
          composite: {
            rootId: bodyNode.id,
            parentId: bodyNode.id,
            generated: true,
            hidden: true,
            locked: true,
          },
        })
      }

      workflow.nodes.push(...migratedNodes)
      workflow.edges.push(...migratedEdges)
      delete bodyNode.data.bodyWorkflow
    }
  }

  function ensureLoopBodyBoundaryNodes(): void {
    const workflow = store.currentWorkflow
    if (!workflow) return

    for (const bodyNode of workflow.nodes) {
      if (bodyNode.type !== LOOP_BODY_NODE_TYPE || bodyNode.composite?.role !== LOOP_BODY_ROLE) continue
      const children = workflow.nodes.filter((node) => getCompositeParentId(node) === bodyNode.id)
      for (const child of children) {
        child.composite = {
          ...(child.composite || {}),
          rootId: bodyNode.id,
          parentId: bodyNode.id,
          ...(child.type === 'start' || child.type === 'end' ? { generated: true, hidden: false } : {}),
        }
      }
      const hasStart = children.some((node) => node.type === 'start')
      const hasEnd = children.some((node) => node.type === 'end')
      if (hasStart && hasEnd) continue

      const startNode: WorkflowNode = {
        id: crypto.randomUUID(),
        type: 'start',
        label: '开始',
        position: { x: bodyNode.position.x + 80, y: bodyNode.position.y + 140 },
        data: {},
        composite: {
          rootId: bodyNode.id,
          parentId: bodyNode.id,
          generated: true,
          hidden: false,
        },
      }
      const endNode: WorkflowNode = {
        id: crypto.randomUUID(),
        type: 'end',
        label: '结束',
        position: { x: bodyNode.position.x + 420, y: bodyNode.position.y + 140 },
        data: {},
        composite: {
          rootId: bodyNode.id,
          parentId: bodyNode.id,
          generated: true,
          hidden: false,
        },
      }

      if (!hasStart) workflow.nodes.push(startNode)
      if (!hasEnd) workflow.nodes.push(endNode)
      const entryTarget = hasStart ? children.find((node) => node.type === 'start')! : startNode
      const endTarget = hasEnd ? children.find((node) => node.type === 'end')! : endNode
      const entryEdgeId = `e-${bodyNode.id}-default-${entryTarget.id}-target`
      const existingEntryEdge = workflow.edges.find((edge) => edge.id === entryEdgeId)
      if (existingEntryEdge) {
        existingEntryEdge.composite = {
          ...(existingEntryEdge.composite || {}),
          rootId: bodyNode.id,
          parentId: bodyNode.id,
          generated: true,
          hidden: true,
          locked: true,
        }
      } else {
        workflow.edges.push({
          id: entryEdgeId,
          source: bodyNode.id,
          target: entryTarget.id,
          sourceHandle: null,
          targetHandle: 'target',
          composite: {
            rootId: bodyNode.id,
            parentId: bodyNode.id,
            generated: true,
            hidden: true,
            locked: true,
          },
        })
      }
      if (!hasStart || !hasEnd) {
        const startToEndId = `e-${entryTarget.id}-default-${endTarget.id}-target`
        if (!workflow.edges.some((edge) => edge.id === startToEndId)) {
          workflow.edges.push({
            id: startToEndId,
            source: entryTarget.id,
            target: endTarget.id,
            sourceHandle: null,
            targetHandle: 'target',
          })
        }
      }
    }
  }

  function syncAllScopeBoundaries(): void {
    const workflow = store.currentWorkflow
    if (!workflow) return
    const scopeNodes = workflow.nodes.filter((node) => isScopeBoundaryWorkflowNode(node))
    for (const node of scopeNodes) {
      syncScopeBoundaryLayout(node.id)
    }
  }

  function isNodeAllowedInScope(node: WorkflowNode | undefined, scopeNodeId: string): boolean {
    if (!node) return false
    if (node.id === scopeNodeId) return false
    if (isScopeBoundaryWorkflowNode(node)) return false
    if (getCompositeParentId(node) === scopeNodeId) return false
    return store.canDeleteNode(node.id)
  }

  function findLoopBodyDropTarget(nodeId: string, position: { x: number; y: number }): WorkflowNode | null {
    const workflow = store.currentWorkflow
    if (!workflow) return null

    const draggedNode = workflow.nodes.find((node) => node.id === nodeId)
    const loopBodies = workflow.nodes.filter((node) => node.type === LOOP_BODY_NODE_TYPE)
    for (let i = loopBodies.length - 1; i >= 0; i--) {
      const node = loopBodies[i]
      if (!isNodeAllowedInScope(draggedNode, node.id)) continue
      const absoluteX = node.position.x
      const absoluteY = node.position.y
      const width = Number(node.data?.width || MIN_CONTAINER_SIZE.width)
      const height = Number(node.data?.height || MIN_CONTAINER_SIZE.height)
      if (
        position.x >= absoluteX
        && position.x <= absoluteX + width
        && position.y >= absoluteY
        && position.y <= absoluteY + height
      ) {
        return node
      }
    }
    return null
  }

  function getDragEventPosition(event: NodeDragEvent): { x: number; y: number } {
    const width = getNumber(event.node.dimensions?.width) ?? getNumber(event.node.width) ?? DEFAULT_NODE_SIZE.width
    const height = getNumber(event.node.dimensions?.height) ?? getNumber(event.node.height) ?? DEFAULT_NODE_SIZE.height
    const x = event.node.position?.x ?? event.node.computedPosition?.x ?? 0
    const y = event.node.position?.y ?? event.node.computedPosition?.y ?? 0
    return {
      x: x + width / 2,
      y: y + height / 2,
    }
  }

  function handleNodeDrag(event: NodeDragEvent): void {
    if (store.isPreview) return
    const target = findLoopBodyDropTarget(event.node.id, getDragEventPosition(event))
    activeLoopBodyDropTargetId.value = target?.id ?? null
  }

  function handleNodeDragStop(event: NodeDragEvent): void {
    if (store.isPreview) return
    const target = findLoopBodyDropTarget(event.node.id, getDragEventPosition(event))
    activeLoopBodyDropTargetId.value = null
    if (!target) return
    if (store.moveNodeToScope(event.node.id, target.id)) {
      syncScopeBoundaryLayout(target.id)
    }
  }

  function getNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined
  }

  function getRenderedNodeSize(nodeId: string, data: Record<string, unknown> | undefined): { width: number; height: number } {
    const flowNode = flowStore.findNode(nodeId) as any
    return {
      width: getNumber(flowNode?.dimensions?.width)
        ?? getNumber(flowNode?.width)
        ?? getNumber(data?.width)
        ?? DEFAULT_NODE_SIZE.width,
      height: getNumber(flowNode?.dimensions?.height)
        ?? getNumber(flowNode?.height)
        ?? getNumber(data?.height)
        ?? DEFAULT_NODE_SIZE.height,
    }
  }

  function intersects(a: Bounds, b: Bounds): boolean {
    return a.x < b.x + b.width
      && a.x + a.width > b.x
      && a.y < b.y + b.height
      && a.y + a.height > b.y
  }

  function isSameBounds(a: Bounds, b: Bounds): boolean {
    return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
  }

  function computeGroupContentBounds(
    group: WorkflowGroup,
    overrideNode?: { id: string; position: { x: number; y: number } },
  ): Bounds {
    const workflow = store.currentWorkflow
    if (!workflow) return { x: 0, y: 0, width: 100, height: 60 }

    const childNodes = group.childNodeIds
      .map(id => workflow.nodes.find(n => n.id === id))
      .filter((n): n is NonNullable<typeof n> => !!n)

    const childGroups = group.childGroupIds
      .map(id => workflow.groups?.find(g => g.id === id))
      .filter((g): g is NonNullable<typeof g> => !!g)
      .map(g => computeGroupBoundingBox(g))

    if (childNodes.length === 0 && childGroups.length === 0) {
      return { x: 0, y: 0, width: 100, height: 60 }
    }

    const allBoxes = [
      ...childNodes.map(n => {
        const size = getRenderedNodeSize(n.id, n.data)
        const position = overrideNode?.id === n.id ? overrideNode.position : n.position
        return {
          x: position.x,
          y: position.y,
          width: size.width,
          height: size.height,
        }
      }),
      ...childGroups,
    ]

    const minX = Math.min(...allBoxes.map(b => b.x))
    const minY = Math.min(...allBoxes.map(b => b.y))
    const maxX = Math.max(...allBoxes.map(b => b.x + b.width))
    const maxY = Math.max(...allBoxes.map(b => b.y + b.height))

    const autoWidth = Math.max(100, maxX - minX + GROUP_PADDING * 2)
    const autoHeight = Math.max(60, maxY - minY + GROUP_HEADER_HEIGHT + GROUP_PADDING * 2)

    return {
      x: minX - GROUP_PADDING,
      y: minY - GROUP_HEADER_HEIGHT - GROUP_PADDING,
      width: autoWidth,
      height: autoHeight,
    }
  }

  /** 计算分组边界：已有边界只向外扩张，不随子节点向内移动收缩 */
  function computeGroupBoundingBox(group: WorkflowGroup): Bounds {
    const contentBounds = computeGroupContentBounds(group)
    const currentX = group.x ?? contentBounds.x
    const currentY = group.y ?? contentBounds.y
    const currentRight = currentX + (group.width ?? contentBounds.width)
    const currentBottom = currentY + (group.height ?? contentBounds.height)
    const contentRight = contentBounds.x + contentBounds.width
    const contentBottom = contentBounds.y + contentBounds.height
    const nextX = Math.min(currentX, contentBounds.x)
    const nextY = Math.min(currentY, contentBounds.y)

    return {
      x: nextX,
      y: nextY,
      width: Math.max(currentRight, contentRight) - nextX,
      height: Math.max(currentBottom, contentBottom) - nextY,
    }
  }

  function expandGroupToContent(groupId: string, movedNode?: { id: string; position: { x: number; y: number } }): Bounds | null {
    const group = store.currentWorkflow?.groups?.find(g => g.id === groupId)
    if (!group) return null
    const current = computeGroupBoundingBox(group)
    const content = computeGroupContentBounds(group, movedNode)
    const nextX = Math.min(current.x, content.x)
    const nextY = Math.min(current.y, content.y)
    const nextRight = Math.max(current.x + current.width, content.x + content.width)
    const nextBottom = Math.max(current.y + current.height, content.y + content.height)
    return { x: nextX, y: nextY, width: nextRight - nextX, height: nextBottom - nextY }
  }

  /** 查找节点所属的分组 ID */
  function findGroupOfNode(nodeId: string): string | undefined {
    const groups = store.currentWorkflow?.groups || []
    for (const group of groups) {
      if (group.childNodeIds.includes(nodeId)) return group.id
    }
    return undefined
  }

  function isNodeInGroup(group: WorkflowGroup, nodeId: string): boolean {
    return group.childNodeIds.includes(nodeId)
      || group.childGroupIds.some((childGroupId) => {
        const childGroup = store.currentWorkflow?.groups?.find(g => g.id === childGroupId)
        return childGroup ? isNodeInGroup(childGroup, nodeId) : false
      })
  }

  function getNodeBounds(nodeId: string, position: { x: number; y: number }): Bounds | null {
    const node = store.currentWorkflow?.nodes.find(n => n.id === nodeId)
    if (!node) return null
    const size = getRenderedNodeSize(node.id, node.data)
    return {
      x: position.x,
      y: position.y,
      width: size.width,
      height: size.height,
    }
  }

  function findGroupExternalCollision(groupId: string, bounds: Bounds): string | null {
    const workflow = store.currentWorkflow
    const group = workflow?.groups?.find(g => g.id === groupId)
    if (!workflow || !group) return null

    for (const node of workflow.nodes) {
      if (isHiddenWorkflowNode(node) || isNodeInGroup(group, node.id)) continue
      const nodeBounds = getNodeBounds(node.id, node.position)
      if (nodeBounds && intersects(bounds, nodeBounds)) return node.id
    }

    return null
  }

  function moveGroup(group: WorkflowGroup, position: { x: number; y: number }): void {
    const currentBounds = computeGroupBoundingBox(group)
    const dx = position.x - currentBounds.x
    const dy = position.y - currentBounds.y
    if (dx === 0 && dy === 0) return

    store.updateGroupBounds(group.id, {
      x: position.x,
      y: position.y,
      width: currentBounds.width,
      height: currentBounds.height,
    })

    for (const nodeId of store.getDescendantNodeIds(group.id)) {
      const node = store.currentWorkflow?.nodes.find(n => n.id === nodeId)
      if (!node) continue
      store.updateNodePosition(node.id, {
        x: node.position.x + dx,
        y: node.position.y + dy,
      })
    }

    for (const childGroupId of store.getDescendantGroupIds(group.id)) {
      const childGroup = store.currentWorkflow?.groups?.find(g => g.id === childGroupId)
      if (!childGroup) continue
      const childBounds = computeGroupBoundingBox(childGroup)
      store.updateGroupBounds(childGroup.id, {
        x: childBounds.x + dx,
        y: childBounds.y + dy,
        width: childBounds.width,
        height: childBounds.height,
      })
    }
  }

  function updateNodeSize(nodeId: string, dimensions: { width?: number; height?: number }, resizing?: boolean): void {
    const node = store.currentWorkflow?.nodes.find((n) => n.id === nodeId)
    if (!node) return

    if (!resizingNodeIds.has(nodeId)) {
      store.pushUndo('调整节点大小')
      resizingNodeIds.add(nodeId)
    }

    node.data = {
      ...node.data,
      ...(typeof dimensions.width === 'number' ? { width: dimensions.width } : {}),
      ...(typeof dimensions.height === 'number' ? { height: dimensions.height } : {}),
    }

    if (resizing === false) {
      resizingNodeIds.delete(nodeId)
    }
  }

  // HMR 清理：销毁 VueFlow 全局 store，防止 HMR 后节点位置混乱
  onUnmounted(() => {
    flowStore.$destroy?.()
  })

  onNodesChange((changes) => {
    if (store.isPreview) return

    // ── 对齐线：单节点拖拽时计算 snap 并覆写 position ──
    helperLineHorizontal.value = undefined
    helperLineVertical.value = undefined
    if (
      changes.length === 1
      && changes[0].type === 'position'
      && changes[0].dragging
      && changes[0].position
    ) {
      const helperLines = getHelperLines(
        changes[0],
        getNodes.value as GraphNode[],
      )
      changes[0].position.x = helperLines.snapPosition.x ?? changes[0].position.x
      changes[0].position.y = helperLines.snapPosition.y ?? changes[0].position.y
      helperLineHorizontal.value = helperLines.horizontal
      helperLineVertical.value = helperLines.vertical
    }

    let nextSelectedNodeIds: string[] | null = null
    const resizingGroupIds = new Set(
      changes
        .filter(change => change.type === 'dimensions' && store.currentWorkflow?.groups?.some(g => g.id === change.id))
        .map(change => change.id),
    )

    for (const change of changes) {
      if (change.type === 'remove') {
        if (store.canDeleteNode(change.id)) {
          const removedNode = store.currentWorkflow?.nodes.find((node) => node.id === change.id)
          store.removeNode(change.id)
          const parentId = removedNode ? getCompositeParentId(removedNode) : null
          if (parentId) syncScopeBoundaryLayout(parentId)
        }
      } else if (change.type === 'position' && change.position) {
        const changedGroup = store.currentWorkflow?.groups?.find(g => g.id === change.id)
        if (changedGroup) {
          if (resizingGroupIds.has(changedGroup.id)) {
            store.updateGroupBounds(changedGroup.id, change.position)
          } else {
            moveGroup(changedGroup, change.position)
          }
          continue
        }

        const currentNode = store.currentWorkflow?.nodes.find((node) => node.id === change.id)
        const previousPosition = currentNode ? { ...currentNode.position } : null
        if (currentNode && isScopeBoundaryWorkflowNode(currentNode)) {
          const dx = change.position.x - currentNode.position.x
          const dy = change.position.y - currentNode.position.y
          store.updateNodePosition(currentNode.id, change.position)
          if (dx !== 0 || dy !== 0) {
            const children = store.currentWorkflow?.nodes.filter((node) => getCompositeParentId(node) === currentNode.id) || []
            for (const child of children) {
              store.updateNodePosition(child.id, {
                x: child.position.x + dx,
                y: child.position.y + dy,
              })
            }
          }
          continue
        }
        const groupId = findGroupOfNode(change.id)
        const group = groupId ? store.currentWorkflow?.groups?.find(g => g.id === groupId) : null
        const currentGroupBounds = group ? computeGroupBoundingBox(group) : null
        const nextGroupBounds = groupId
          ? expandGroupToContent(groupId, { id: change.id, position: change.position })
          : null

        if (
          groupId
          && currentGroupBounds
          && nextGroupBounds
          && !isSameBounds(currentGroupBounds, nextGroupBounds)
          && findGroupExternalCollision(groupId, nextGroupBounds)
        ) {
          if (previousPosition) {
            flowStore.updateNode(change.id, { position: previousPosition })
          }
          continue
        }

        store.updateNodePosition(change.id, change.position)
        if (groupId && nextGroupBounds) {
          store.updateGroupBounds(groupId, nextGroupBounds)
        }
        const movedNode = store.currentWorkflow?.nodes.find((node) => node.id === change.id)
        const parentId = movedNode ? getCompositeParentId(movedNode) : null
        if (parentId) syncScopeBoundaryLayout(parentId)
      } else if (change.type === 'dimensions') {
        if (change.dimensions) {
          const group = store.currentWorkflow?.groups?.find(g => g.id === change.id)
          if (group) {
            const currentBounds = computeGroupBoundingBox(group)
            store.updateGroupBounds(change.id, { ...currentBounds, ...change.dimensions })
          } else {
            updateNodeSize(change.id, change.dimensions, change.resizing)
          }
          const resizedNode = store.currentWorkflow?.nodes.find((node) => node.id === change.id)
          const parentId = resizedNode ? getCompositeParentId(resizedNode) : null
          if (parentId) syncScopeBoundaryLayout(parentId)
        } else if (change.resizing === false) {
          resizingNodeIds.delete(change.id)
        }
      } else if (change.type === 'select') {
        if (!nextSelectedNodeIds) nextSelectedNodeIds = [...store.selectedNodeIds]
        if (change.selected) {
          if (!nextSelectedNodeIds.includes(change.id)) nextSelectedNodeIds.push(change.id)
        } else {
          nextSelectedNodeIds = nextSelectedNodeIds.filter(id => id !== change.id)
        }
      }
    }

    if (nextSelectedNodeIds) {
      store.selectedNodeIds = nextSelectedNodeIds
    }
  })

  onEdgesChange((changes) => {
    if (store.isPreview) return
    for (const change of changes) {
      if (change.type === 'remove') {
        if (store.canDeleteEdge(change.id)) {
          store.removeEdge(change.id)
        }
      }
    }
  })

  const VIEWPORT_KEY = (id: string) => `workflow-vp-${id}`
  let viewportSaveTimer: ReturnType<typeof setTimeout> | null = null

  onViewportChange(({ zoom, x, y }) => {
    if (!store.currentWorkflow) return
    if (viewportSaveTimer) clearTimeout(viewportSaveTimer)
    viewportSaveTimer = setTimeout(() => {
      localStorage.setItem(
        VIEWPORT_KEY(store.currentWorkflow!.id),
        JSON.stringify({ zoom, x, y }),
      )
    }, 300)
  })

  function getSavedViewport(workflowId: string): { zoom: number; x: number; y: number } | null {
    try {
      const raw = localStorage.getItem(VIEWPORT_KEY(workflowId))
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  }

  watch(() => store.currentWorkflow?.id, async (id) => {
    if (!id) return
    await nextTick()
    migrateEmbeddedLoopBodyNodes()
    ensureLoopBodyBoundaryNodes()
    syncAllScopeBoundaries()
    const saved = getSavedViewport(id)
    if (saved) {
      setViewport(saved)
    } else {
      fitView()
    }
  })

  const nodes = computed(() => {
    const normalNodes = (store.currentWorkflow?.nodes || [])
      .filter((n) => !isHiddenWorkflowNode(n))
      .map((n) => {
      const parentId = getCompositeParentId(n)
      const width = typeof n.data?.width === 'number' ? n.data.width : undefined
      const height = typeof n.data?.height === 'number' ? n.data.height : undefined
      const isLoopBody = n.type === LOOP_BODY_NODE_TYPE
      const isScopedChild = !!parentId && !isScopeBoundaryWorkflowNode(n)

      return {
        id: n.id,
        type: 'custom',
        position: n.position,
        selected: store.selectedNodeIds.includes(n.id),
        expandParent: false,
        draggable: true,
        dragHandle: n.type === LOOP_BODY_NODE_TYPE ? '.loop-body-header' : undefined,
        zIndex: isLoopBody ? -1 : (isScopedChild ? 20 : 1),
        width,
        height,
        style: width || height ? {
          width: width ? `${width}px` : undefined,
          height: height ? `${height}px` : undefined,
          ...(isLoopBody ? { zIndex: -1 } : {}),
        } : (isLoopBody ? { zIndex: -1 } : undefined),
        data: { ...n.data, label: n.label, nodeType: n.type, isDropTarget: isLoopBody && activeLoopBodyDropTargetId.value === n.id }
      }
      })

    // 追加分组虚拟节点
    const groups = store.currentWorkflow?.groups || []
    const groupNodes = groups.map(group => {
      const bb = computeGroupBoundingBox(group)
      return {
        id: group.id,
        type: 'group',
        position: { x: bb.x, y: bb.y },
        selected: false,
        draggable: !group.locked,
        dragHandle: '.group-node__header',
        width: bb.width,
        height: bb.height,
        style: {
          width: `${bb.width}px`,
          height: `${bb.height}px`,
        },
        data: {
          name: group.name,
          childNodeIds: group.childNodeIds,
          childGroupIds: group.childGroupIds,
          locked: group.locked,
          disabled: group.disabled,
          color: group.color,
          width: bb.width,
          height: bb.height,
        }
      }
    })

    // 分组节点排在前面（z-index 更低），普通节点排在后面
    return [...groupNodes, ...normalNodes]
  })

  const edges = computed(() =>
    (store.currentWorkflow?.edges || [])
      .filter((e) => !isHiddenWorkflowEdge(e))
      .map((e) => ({
      id: e.id,
      type: 'custom',
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle,
      targetHandle: e.targetHandle,
      animated: true,
      markerEnd: MarkerType.ArrowClosed,
      data: {
        composite: e.composite || null,
        sourceHandle: e.sourceHandle ?? null,
        targetHandle: e.targetHandle ?? null,
      },
      })),
  )

  function handleConnect(params: any) {
    store.addEdge(
      params.source,
      params.target,
      params.sourceHandle ?? null,
      params.targetHandle ?? null,
    )
  }

  function handleNodesInitialized(nodes: any[]) {
    nextTick(() => {
      updateNodeInternals(nodes.map((node) => node.id))
    })
  }

  return {
    nodes,
    edges,
    handleConnect,
    handleNodesInitialized,
    handleNodeDrag,
    handleNodeDragStop,
    syncScopeBoundaryLayout,
    activeLoopBodyDropTargetId,
    helperLineHorizontal,
    helperLineVertical,
  }
}
