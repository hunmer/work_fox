import { computed, watch, nextTick, onUnmounted } from 'vue'
import { useVueFlow, MarkerType } from '@vue-flow/core'
import type { WorkflowStore } from '@/stores/workflow'
import type { WorkflowGroup } from '@/lib/workflow/types'
import {
  isHiddenWorkflowNode,
  isScopeBoundaryWorkflowNode,
  getCompositeParentId,
  LOOP_BODY_NODE_TYPE,
} from '@shared/workflow-composite'

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
  } = flowStore

  function syncScopeBoundaryLayout(scopeNodeId: string): void {
    const workflow = store.currentWorkflow
    if (!workflow) return

    const scopeNode = workflow.nodes.find((node) => node.id === scopeNodeId)
    if (!scopeNode || !isScopeBoundaryWorkflowNode(scopeNode)) return

    const children = workflow.nodes.filter((node) => getCompositeParentId(node) === scopeNodeId)
    if (!children.length) return

    const minX = Math.min(...children.map((node) => node.position.x))
    const minY = Math.min(...children.map((node) => node.position.y))
    const maxX = Math.max(...children.map((node) => node.position.x + Number(node.data?.width || 220)))
    const maxY = Math.max(...children.map((node) => node.position.y + Number(node.data?.height || 120)))

    const nextX = Math.max(0, minX - CONTAINER_PADDING.left)
    const nextY = Math.max(0, minY - CONTAINER_PADDING.top)
    const nextWidth = Math.max(MIN_CONTAINER_SIZE.width, maxX - minX + CONTAINER_PADDING.left + CONTAINER_PADDING.right)
    const nextHeight = Math.max(MIN_CONTAINER_SIZE.height, maxY - minY + CONTAINER_PADDING.top + CONTAINER_PADDING.bottom)

    const offsetX = scopeNode.position.x - nextX
    const offsetY = scopeNode.position.y - nextY
    if (offsetX !== 0 || offsetY !== 0) {
      for (const child of children) {
        store.updateNodePosition(child.id, {
          x: child.position.x + offsetX,
          y: child.position.y + offsetY,
        })
      }
      store.updateNodePosition(scopeNode.id, { x: nextX, y: nextY })
    }

    store.updateNodeData(scopeNode.id, {
      width: nextWidth,
      height: nextHeight,
    })
  }

  function syncAllScopeBoundaries(): void {
    const workflow = store.currentWorkflow
    if (!workflow) return
    const scopeNodes = workflow.nodes.filter((node) => isScopeBoundaryWorkflowNode(node))
    for (const node of scopeNodes) {
      syncScopeBoundaryLayout(node.id)
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
    return { x: position.x, y: position.y, width: size.width, height: size.height }
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
    let nextSelectedNodeIds: string[] | null = null

    for (const change of changes) {
      if (change.type === 'remove') {
        if (store.canDeleteNode(change.id)) {
          const removedNode = store.currentWorkflow?.nodes.find((node) => node.id === change.id)
          store.removeNode(change.id)
          const parentId = removedNode ? getCompositeParentId(removedNode) : null
          if (parentId) syncScopeBoundaryLayout(parentId)
        }
      } else if (change.type === 'position' && change.position) {
        const currentNode = store.currentWorkflow?.nodes.find((node) => node.id === change.id)
        const previousPosition = currentNode ? { ...currentNode.position } : null
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
      const isChild = !!parentId && !isScopeBoundaryWorkflowNode(n)
      const width = typeof n.data?.width === 'number' ? n.data.width : undefined
      const height = typeof n.data?.height === 'number' ? n.data.height : undefined

      return {
        id: n.id,
        type: 'custom',
        position: n.position,
        selected: store.selectedNodeIds.includes(n.id),
        parentNode: isChild ? parentId : undefined,
        extent: isChild ? 'parent' : undefined,
        expandParent: false,
        draggable: true,
        dragHandle: n.type === LOOP_BODY_NODE_TYPE ? '.loop-body-header' : undefined,
        width,
        height,
        style: width || height ? {
          width: width ? `${width}px` : undefined,
          height: height ? `${height}px` : undefined,
        } : undefined,
        data: { ...n.data, label: n.label, nodeType: n.type }
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
        draggable: false,
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
  }
}
