import { type Ref } from 'vue'
import type { Workflow, WorkflowNode, WorkflowGroup } from '@/lib/workflow/types'
import type { createUndoRedoManager } from './undo-redo'

const GRID_GAP = 30
const ARRANGE_PADDING = 20
const ARRANGE_HEADER_HEIGHT = 32
const GROUP_PADDING = 20
const GROUP_HEADER_HEIGHT = 32
const DEFAULT_NODE_WIDTH = 220
const DEFAULT_NODE_HEIGHT = 120

export function createGroupActions(
  currentWorkflow: Ref<Workflow | null>,
  undoRedo: ReturnType<typeof createUndoRedoManager>,
) {
  function ensureGroups(): WorkflowGroup[] {
    if (!currentWorkflow.value) return []
    if (!currentWorkflow.value.groups) {
      currentWorkflow.value.groups = []
    }
    return currentWorkflow.value.groups
  }

  function getNodeSize(node: WorkflowNode): { width: number; height: number } {
    return {
      width: typeof node.data?.width === 'number' ? node.data.width : DEFAULT_NODE_WIDTH,
      height: typeof node.data?.height === 'number' ? node.data.height : DEFAULT_NODE_HEIGHT,
    }
  }

  function computeNodeBounds(nodeIds: string[]): { x: number; y: number; width: number; height: number } | null {
    const workflow = currentWorkflow.value
    if (!workflow) return null
    const nodes = nodeIds
      .map(id => workflow.nodes.find(n => n.id === id))
      .filter((node): node is WorkflowNode => !!node)
    if (nodes.length === 0) return null

    const minX = Math.min(...nodes.map(node => node.position.x))
    const minY = Math.min(...nodes.map(node => node.position.y))
    const maxX = Math.max(...nodes.map(node => {
      const size = getNodeSize(node)
      return node.position.x + size.width
    }))
    const maxY = Math.max(...nodes.map(node => {
      const size = getNodeSize(node)
      return node.position.y + size.height
    }))

    return {
      x: minX - GROUP_PADDING,
      y: minY - GROUP_HEADER_HEIGHT - GROUP_PADDING,
      width: Math.max(100, maxX - minX + GROUP_PADDING * 2),
      height: Math.max(60, maxY - minY + GROUP_HEADER_HEIGHT + GROUP_PADDING * 2),
    }
  }

  function computeGroupBounds(group: WorkflowGroup): { x: number; y: number; width: number; height: number } | null {
    if (typeof group.x === 'number' && typeof group.y === 'number' && typeof group.width === 'number' && typeof group.height === 'number') {
      return { x: group.x, y: group.y, width: group.width, height: group.height }
    }

    const nodeBounds = computeNodeBounds(getDescendantNodeIds(group.id))
    if (!nodeBounds) return null
    return nodeBounds
  }

  function computeGroupItemBounds(nodeIds: string[], groupIds: string[]): { x: number; y: number; width: number; height: number } | null {
    const nodeBounds = computeNodeBounds(nodeIds)
    const boxes = [
      ...(nodeBounds ? [nodeBounds] : []),
      ...groupIds
        .map(id => getGroupById(id))
        .filter((group): group is WorkflowGroup => !!group)
        .map(group => computeGroupBounds(group))
        .filter((bounds): bounds is { x: number; y: number; width: number; height: number } => !!bounds),
    ]
    if (boxes.length === 0) return null

    const minX = Math.min(...boxes.map(box => box.x))
    const minY = Math.min(...boxes.map(box => box.y))
    const maxX = Math.max(...boxes.map(box => box.x + box.width))
    const maxY = Math.max(...boxes.map(box => box.y + box.height))

    return {
      x: minX - GROUP_PADDING,
      y: minY - GROUP_HEADER_HEIGHT - GROUP_PADDING,
      width: Math.max(100, maxX - minX + GROUP_PADDING * 2),
      height: Math.max(60, maxY - minY + GROUP_HEADER_HEIGHT + GROUP_PADDING * 2),
    }
  }

  function getGroupOfNode(nodeId: string): WorkflowGroup | undefined {
    return (currentWorkflow.value?.groups || []).find(g => g.childNodeIds.includes(nodeId))
  }

  function getGroupById(groupId: string): WorkflowGroup | undefined {
    return (currentWorkflow.value?.groups || []).find(g => g.id === groupId)
  }

  function getParentGroup(groupId: string): WorkflowGroup | undefined {
    return (currentWorkflow.value?.groups || []).find(g => g.childGroupIds.includes(groupId))
  }

  function getDescendantNodeIds(groupId: string): string[] {
    const groups = currentWorkflow.value?.groups || []
    const group = groups.find(g => g.id === groupId)
    if (!group) return []
    const result = [...group.childNodeIds]
    for (const childGroupId of group.childGroupIds) {
      result.push(...getDescendantNodeIds(childGroupId))
    }
    return result
  }

  function getDescendantGroupIds(groupId: string): string[] {
    const groups = currentWorkflow.value?.groups || []
    const group = groups.find(g => g.id === groupId)
    if (!group) return []
    const result = [...group.childGroupIds]
    for (const childGroupId of group.childGroupIds) {
      result.push(...getDescendantGroupIds(childGroupId))
    }
    return result
  }

  function createGroup(nodeIds: string[], name?: string): void {
    if (!currentWorkflow.value) return
    if (nodeIds.length === 0) return
    undoRedo.pushUndo('创建分组')

    const groups = ensureGroups()
    const groupId = 'group_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)
    const newGroup: WorkflowGroup = {
      id: groupId,
      name: name || `分组 ${groups.length + 1}`,
      childNodeIds: [],
      childGroupIds: [],
      locked: false,
      disabled: false,
      savedNodeStates: {},
    }

    const childGroupIds = new Set<string>()

    for (const nodeId of nodeIds) {
      const oldGroup = getGroupOfNode(nodeId)
      if (oldGroup) {
        childGroupIds.add(oldGroup.id)
        continue
      }
      newGroup.childNodeIds.push(nodeId)
    }

    for (const childGroupId of childGroupIds) {
      const parentGroup = getParentGroup(childGroupId)
      if (parentGroup) {
        parentGroup.childGroupIds = parentGroup.childGroupIds.filter(id => id !== childGroupId)
      }
      newGroup.childGroupIds.push(childGroupId)
    }

    const bounds = computeGroupItemBounds(newGroup.childNodeIds, newGroup.childGroupIds)
    if (bounds) {
      Object.assign(newGroup, bounds)
    }

    groups.push(newGroup)
  }

  function ungroup(groupId: string): void {
    if (!currentWorkflow.value) return
    const group = getGroupById(groupId)
    if (!group || group.locked) return
    undoRedo.pushUndo('解除分组')

    const groups = ensureGroups()
    const parentGroup = getParentGroup(groupId)

    if (parentGroup) {
      for (const childGroupId of group.childGroupIds) {
        if (!parentGroup.childGroupIds.includes(childGroupId)) {
          parentGroup.childGroupIds.push(childGroupId)
        }
      }
    }

    currentWorkflow.value.groups = groups.filter(g => g.id !== groupId)
  }

  function deleteGroup(groupId: string): void {
    if (!currentWorkflow.value) return
    const group = getGroupById(groupId)
    if (!group) return
    undoRedo.pushUndo('删除分组')

    for (const childGroupId of [...group.childGroupIds]) {
      deleteGroup(childGroupId)
    }

    const nodesToRemove = new Set(group.childNodeIds)
    currentWorkflow.value.nodes = currentWorkflow.value.nodes.filter(n => !nodesToRemove.has(n.id))
    currentWorkflow.value.edges = currentWorkflow.value.edges.filter(
      e => !nodesToRemove.has(e.source) && !nodesToRemove.has(e.target)
    )

    const parentGroup = getParentGroup(groupId)
    if (parentGroup) {
      parentGroup.childGroupIds = parentGroup.childGroupIds.filter(id => id !== groupId)
    }

    currentWorkflow.value.groups = (currentWorkflow.value.groups || []).filter(g => g.id !== groupId)
  }

  function addNodesToGroup(groupId: string, nodeIds: string[]): void {
    if (!currentWorkflow.value) return
    const group = getGroupById(groupId)
    if (!group) return
    undoRedo.pushUndo('加入分组')

    for (const nodeId of nodeIds) {
      const oldGroup = getGroupOfNode(nodeId)
      if (oldGroup && oldGroup.id !== groupId) {
        oldGroup.childNodeIds = oldGroup.childNodeIds.filter(id => id !== nodeId)
      }
      if (!group.childNodeIds.includes(nodeId)) {
        group.childNodeIds.push(nodeId)
      }
    }
  }

  function removeNodesFromGroup(groupId: string, nodeIds: string[]): void {
    if (!currentWorkflow.value) return
    const group = getGroupById(groupId)
    if (!group) return
    undoRedo.pushUndo('移出分组')
    group.childNodeIds = group.childNodeIds.filter(id => !nodeIds.includes(id))
  }

  function renameGroup(groupId: string, name: string): void {
    const group = getGroupById(groupId)
    if (!group) return
    undoRedo.pushUndo('重命名分组')
    group.name = name
  }

  function updateGroupBounds(groupId: string, bounds: { x?: number; y?: number; width?: number; height?: number }): void {
    const group = getGroupById(groupId)
    if (!group) return

    if (typeof bounds.x === 'number' && Number.isFinite(bounds.x)) {
      group.x = bounds.x
    }
    if (typeof bounds.y === 'number' && Number.isFinite(bounds.y)) {
      group.y = bounds.y
    }
    if (typeof bounds.width === 'number' && Number.isFinite(bounds.width)) {
      group.width = bounds.width
    }
    if (typeof bounds.height === 'number' && Number.isFinite(bounds.height)) {
      group.height = bounds.height
    }
  }

  const updateGroupSize = updateGroupBounds

  function updateGroupColor(groupId: string, color?: string): void {
    const group = getGroupById(groupId)
    if (!group) return
    undoRedo.pushUndo('修改分组颜色')
    group.color = color
  }

  function toggleGroupLock(groupId: string): void {
    const group = getGroupById(groupId)
    if (!group) return
    undoRedo.pushUndo(group.locked ? '解除固定' : '固定分组')
    group.locked = !group.locked
  }

  function toggleGroupDisabled(groupId: string): void {
    if (!currentWorkflow.value) return
    const group = getGroupById(groupId)
    if (!group) return
    undoRedo.pushUndo(group.disabled ? '启用分组' : '禁用分组')

    if (!group.disabled) {
      group.savedNodeStates = {}
      const allNodeIds = getDescendantNodeIds(groupId)
      for (const nodeId of allNodeIds) {
        const node = currentWorkflow.value.nodes.find(n => n.id === nodeId)
        if (node) {
          group.savedNodeStates[nodeId] = node.nodeState || 'normal'
          node.nodeState = 'disabled'
        }
      }
      group.disabled = true
    } else {
      for (const [nodeId, state] of Object.entries(group.savedNodeStates)) {
        const node = currentWorkflow.value.nodes.find(n => n.id === nodeId)
        if (node) {
          node.nodeState = state
        }
      }
      group.savedNodeStates = {}
      group.disabled = false
    }
  }

  function arrangeGroupNodes(groupId: string): void {
    if (!currentWorkflow.value) return
    const group = getGroupById(groupId)
    if (!group) return
    undoRedo.pushUndo('整理节点')

    const workflow = currentWorkflow.value

    const childNodes = group.childNodeIds
      .map(id => workflow.nodes.find(n => n.id === id))
      .filter((n): n is NonNullable<typeof n> => !!n)

    if (childNodes.length === 0) return

    const childGroupBoxes = group.childGroupIds
      .map(gid => getGroupById(gid))
      .filter(Boolean)
      .map(g => {
        const ids = getDescendantNodeIds(g!.id)
        const nodes = ids.map(id => workflow.nodes.find(n => n.id === id)).filter(Boolean)
        if (nodes.length === 0) return null
        return {
          id: g!.id,
          x: Math.min(...nodes.map(n => n!.position.x)),
          y: Math.min(...nodes.map(n => n!.position.y)),
          width: Math.max(...nodes.map(n => n!.position.x + Number(n!.data?.width || 220))) - Math.min(...nodes.map(n => n!.position.x)),
          height: Math.max(...nodes.map(n => n!.position.y + Number(n!.data?.height || 120))) - Math.min(...nodes.map(n => n!.position.y)),
        }
      })
      .filter(Boolean) as { id: string; x: number; y: number; width: number; height: number }[]

    const allItems = [
      ...childNodes.map(n => ({
        id: n.id,
        width: Number(n.data?.width || 220),
        height: Number(n.data?.height || 120),
      })),
      ...childGroupBoxes.map(b => ({ id: b.id, width: b.width, height: b.height })),
    ]

    if (allItems.length === 0) return

    const avgWidth = allItems.reduce((sum, item) => sum + item.width, 0) / allItems.length
    const groupLeft = Math.min(
      ...childNodes.map(n => n.position.x),
      ...(childGroupBoxes.length > 0 ? childGroupBoxes.map(b => b.x) : [Infinity])
    )
    const groupRight = Math.max(
      ...childNodes.map(n => n.position.x + Number(n.data?.width || 220)),
      ...(childGroupBoxes.length > 0 ? childGroupBoxes.map(b => b.x + b.width) : [-Infinity])
    )
    const availableWidth = Math.max((groupRight - groupLeft) || (avgWidth + GRID_GAP) * 2, avgWidth + GRID_GAP)

    const columns = Math.max(1, Math.floor((availableWidth + GRID_GAP) / (avgWidth + GRID_GAP)))

    const startX = groupLeft
    const startY = Math.min(
      ...childNodes.map(n => n.position.y),
      ...(childGroupBoxes.length > 0 ? childGroupBoxes.map(b => b.y) : [Infinity])
    )

    allItems.forEach((item, index) => {
      const col = index % columns
      const row = Math.floor(index / columns)
      const cellWidth = (availableWidth + GRID_GAP) / columns
      const x = startX + col * cellWidth + (cellWidth - item.width) / 2
      const y = startY + row * (Math.max(...allItems.map(i => i.height)) + GRID_GAP)

      const node = workflow.nodes.find(n => n.id === item.id)
      if (node) {
        node.position = { x, y }
      } else {
        const descendantIds = getDescendantNodeIds(item.id)
        const dx = x - (childGroupBoxes.find(b => b.id === item.id)?.x ?? 0)
        const dy = y - (childGroupBoxes.find(b => b.id === item.id)?.y ?? 0)
        for (const did of descendantIds) {
          const dnode = workflow.nodes.find(n => n.id === did)
          if (dnode) {
            dnode.position = { x: dnode.position.x + dx, y: dnode.position.y + dy }
          }
        }
      }
    })
  }

  function cleanupGroupOnNodeDelete(nodeId: string): void {
    const group = getGroupOfNode(nodeId)
    if (!group) return
    group.childNodeIds = group.childNodeIds.filter(id => id !== nodeId)
    if (group.savedNodeStates[nodeId] !== undefined) {
      delete group.savedNodeStates[nodeId]
    }
  }

  return {
    getGroupOfNode,
    getGroupById,
    getParentGroup,
    getDescendantNodeIds,
    getDescendantGroupIds,
    createGroup,
    ungroup,
    deleteGroup,
    addNodesToGroup,
    removeNodesFromGroup,
    renameGroup,
    updateGroupBounds,
    updateGroupSize,
    updateGroupColor,
    toggleGroupLock,
    toggleGroupDisabled,
    arrangeGroupNodes,
    cleanupGroupOnNodeDelete,
  }
}
