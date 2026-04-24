import { computed, watch, nextTick, onUnmounted } from 'vue'
import { useVueFlow, MarkerType } from '@vue-flow/core'
import type { WorkflowStore } from '@/stores/workflow'
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
        store.updateNodePosition(change.id, change.position)
        const movedNode = store.currentWorkflow?.nodes.find((node) => node.id === change.id)
        const parentId = movedNode ? getCompositeParentId(movedNode) : null
        if (parentId) syncScopeBoundaryLayout(parentId)
      } else if (change.type === 'dimensions') {
        if (change.dimensions) {
          updateNodeSize(change.id, change.dimensions, change.resizing)
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

  const nodes = computed(() =>
    (store.currentWorkflow?.nodes || [])
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
  )

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
