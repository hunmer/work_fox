<script setup lang="ts">
import { ref, computed } from 'vue'
import { Plus, Maximize, CircleCheck, CircleSlash, SkipForward, Info, Group, Trash2, Flag, FlagOff, Settings, Copy, FolderTree, Workflow, Palette, Archive, ArchiveRestore, CornerUpLeft } from 'lucide-vue-next'
import { WORKFLOW_CANVAS_CONTEXT_KEY } from './workflowCanvasContext'
import { useWorkflowStore } from '@/stores/workflow'
import { getNodeDefinition } from '@/lib/workflow/nodeRegistry'
import type { EmbeddedWorkflow, NodeBreakpoint, NodeRunState, WorkflowNode } from '@/lib/workflow/types'
import { getCompositeParentId, isScopeBoundaryWorkflowNode } from '@shared/workflow-composite'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'

const canvas = inject(WORKFLOW_CANVAS_CONTEXT_KEY)!
const store = useWorkflowStore()

// ── 右键菜单上下文 ──
const menuContext = ref<'pane' | 'node' | 'embedded-node'>('pane')
const contextNodeId = ref<string | null>(null)
const contextHostNodeId = ref<string | null>(null)
const contextMenuEvent = ref<MouseEvent | null>(null)

function handleContextMenuCapture(event: MouseEvent) {
  if (store.isPreview) return
  const target = event.target as HTMLElement
  const nodeEl = target.closest('.vue-flow__node')
  const embeddedEditor = target.closest('[data-embedded-workflow="true"]') as HTMLElement | null
  if (embeddedEditor && (!nodeEl || !embeddedEditor.contains(nodeEl))) {
    menuContext.value = 'pane'
    contextNodeId.value = null
    contextHostNodeId.value = null
    return
  }
  if (nodeEl) {
    const nodeId = nodeEl.getAttribute('data-id')
    if (nodeId && embeddedEditor?.contains(nodeEl)) {
      menuContext.value = 'embedded-node'
      contextNodeId.value = nodeId
      contextHostNodeId.value = embeddedEditor.dataset.hostNodeId || null
      return
    }
    if (nodeId && !store.currentWorkflow?.groups?.some(g => g.id === nodeId)) {
      menuContext.value = 'node'
      contextNodeId.value = nodeId
      contextHostNodeId.value = null
    } else {
      menuContext.value = 'pane'
      contextNodeId.value = null
      contextHostNodeId.value = null
    }
  } else {
    menuContext.value = 'pane'
    contextNodeId.value = null
    contextHostNodeId.value = null
  }
}

function onPaneContextMenu(event: MouseEvent) {
  contextMenuEvent.value = event
}

// ── 节点辅助判断 ──
const contextNode = computed(() => {
  if (!contextNodeId.value) return null
  return store.currentWorkflow?.nodes.find(n => n.id === contextNodeId.value) ?? null
})

const contextNodeDefinition = computed(() => {
  if (!contextNode.value) return null
  return getNodeDefinition(contextNode.value.type)
})

const isBoundaryNode = computed(() => {
  const type = contextNodeDefinition.value?.type
  return type === 'start' || type === 'end'
})

const targetNodeIds = computed(() => {
  if (menuContext.value === 'pane') {
    return store.selectedNodeIds
  }
  if (menuContext.value === 'embedded-node') {
    return contextNodeId.value ? [contextNodeId.value] : []
  }
  if (store.selectedNodeIds.length >= 2 && contextNodeId.value && store.selectedNodeIds.includes(contextNodeId.value)) {
    return store.selectedNodeIds
  }
  return contextNodeId.value ? [contextNodeId.value] : []
})

const isMultiSelect = computed(() => targetNodeIds.value.length >= 2)
const hasPaneSelectionMenu = computed(() => menuContext.value === 'pane' && targetNodeIds.value.length > 0)
const showPaneActions = computed(() => menuContext.value === 'pane' && !hasPaneSelectionMenu.value)
const availableGroups = computed(() => store.currentWorkflow?.groups || [])

const NODE_COLORS = [
  { label: '默认', value: null, class: 'bg-background border border-border' },
  { label: '翡翠绿', value: 'emerald', class: 'bg-emerald-500' },
  { label: '蓝色', value: 'blue', class: 'bg-blue-500' },
  { label: '紫色', value: 'violet', class: 'bg-violet-500' },
  { label: '玫红', value: 'rose', class: 'bg-rose-500' },
  { label: '橙色', value: 'orange', class: 'bg-orange-500' },
  { label: '琥珀', value: 'amber', class: 'bg-amber-500' },
  { label: '青色', value: 'cyan', class: 'bg-cyan-500' },
  { label: '粉色', value: 'pink', class: 'bg-pink-500' },
  { label: '石板灰', value: 'slate', class: 'bg-slate-500' },
  { label: '红色', value: 'red', class: 'bg-red-500' },
  { label: '靛蓝', value: 'indigo', class: 'bg-indigo-500' },
]

// ── 嵌入式节点操作 ──
function cloneEmbeddedWorkflow(hostNodeId: string): EmbeddedWorkflow | null {
  const hostNode = store.currentWorkflow?.nodes.find((node) => node.id === hostNodeId)
  const workflow = hostNode?.data?.bodyWorkflow
  if (!workflow || !Array.isArray(workflow.nodes) || !Array.isArray(workflow.edges)) return null
  return JSON.parse(JSON.stringify(workflow)) as EmbeddedWorkflow
}

function findEmbeddedContextNode(): WorkflowNode | null {
  if (!contextHostNodeId.value || !contextNodeId.value) return null
  const workflow = cloneEmbeddedWorkflow(contextHostNodeId.value)
  return workflow?.nodes.find((node) => node.id === contextNodeId.value) ?? null
}

function updateEmbeddedNode(description: string, updater: (node: WorkflowNode) => void) {
  const hostNodeId = contextHostNodeId.value
  const nodeId = contextNodeId.value
  if (!hostNodeId || !nodeId) return

  const nextWorkflow = cloneEmbeddedWorkflow(hostNodeId)
  if (!nextWorkflow) return

  const node = nextWorkflow.nodes.find((item) => item.id === nodeId)
  if (!node) return

  updater(node)
  store.updateEmbeddedWorkflow(hostNodeId, nextWorkflow, { description })

  if (store.selectedEmbeddedNode?.hostNodeId === hostNodeId && store.selectedEmbeddedNode.nodeId === nodeId) {
    store.selectedEmbeddedNode.node = JSON.parse(JSON.stringify(node))
  }
}

const isContextBoundaryNode = computed(() => {
  const node = menuContext.value === 'embedded-node' ? findEmbeddedContextNode() : contextNode.value
  return node?.type === 'start' || node?.type === 'end'
})

const primaryTargetNode = computed(() => {
  const id = targetNodeIds.value[0]
  if (!id) return null
  return store.currentWorkflow?.nodes.find((node) => node.id === id) ?? null
})

const canMoveContextNodeOutOfLoopBody = computed(() => {
  const node = primaryTargetNode.value
  if (!node || node.type === 'start' || node.type === 'end' || !store.canDeleteNode(node.id)) return false
  const parentId = getCompositeParentId(node)
  if (!parentId) return false
  const parentNode = store.currentWorkflow?.nodes.find((item) => item.id === parentId)
  return !!parentNode && isScopeBoundaryWorkflowNode(parentNode)
})

// ── 画布操作 ──
function handleAddNode() {
  if (!contextMenuEvent.value) return
  canvas.openNodeSelectAtPosition(contextMenuEvent.value)
  contextMenuEvent.value = null
}

function handleFitView() {
  canvas.fitView()
}

// ── 节点操作 ──
function setNodeColor(color: string | null) {
  if (menuContext.value === 'embedded-node') {
    updateEmbeddedNode('update embedded node color', (node) => {
      if (color) node.nodeColor = color
      else delete node.nodeColor
    })
    return
  }
  for (const id of targetNodeIds.value) {
    store.updateNodeColor(id, color)
  }
}

function setNodeState(state: NodeRunState) {
  if (menuContext.value === 'embedded-node') {
    updateEmbeddedNode('update embedded node state', (node) => {
      node.nodeState = state
    })
    return
  }
  for (const id of targetNodeIds.value) {
    store.updateNodeState(id, state)
  }
}

function setNodeBreakpoint(breakpoint: NodeBreakpoint | null) {
  if (menuContext.value === 'embedded-node') {
    updateEmbeddedNode('update embedded node breakpoint', (node) => {
      if (breakpoint) node.breakpoint = breakpoint
      else delete node.breakpoint
    })
    return
  }
  for (const id of targetNodeIds.value) {
    store.updateNodeBreakpoint(id, breakpoint)
  }
}

function handleCloneNode() {
  const id = targetNodeIds.value[0]
  if (id && store.canCloneNode(id)) {
    store.cloneNode(id)
  }
}

function handleCopyToStaging() {
  const id = targetNodeIds.value[0]
  if (id) {
    store.copyNodeToStaging(id)
  }
}

function handleMoveToStaging() {
  const id = targetNodeIds.value[0]
  if (id && store.canDeleteNode(id)) {
    store.moveNodeToStaging(id, store.removeNode)
  }
}

function handleDeleteNode() {
  const id = targetNodeIds.value[0]
  if (menuContext.value === 'embedded-node') {
    const hostNodeId = contextHostNodeId.value
    if (!hostNodeId || !id || isContextBoundaryNode.value) return

    const nextWorkflow = cloneEmbeddedWorkflow(hostNodeId)
    if (!nextWorkflow) return

    nextWorkflow.nodes = nextWorkflow.nodes.filter((node) => node.id !== id)
    nextWorkflow.edges = nextWorkflow.edges.filter((edge) => edge.source !== id && edge.target !== id)
    store.updateEmbeddedWorkflow(hostNodeId, nextWorkflow, { description: 'delete embedded node' })

    if (store.selectedEmbeddedNode?.hostNodeId === hostNodeId && store.selectedEmbeddedNode.nodeId === id) {
      store.selectedEmbeddedNode = null
    }
    return
  }

  if (id && store.canDeleteNode(id)) {
    store.removeNode(id)
  }
}

function handleShowNodeInfo() {
  const id = targetNodeIds.value[0]
  if (!id) return
  canvas.openNodeInfoDialog(id, contextHostNodeId.value ? { hostNodeId: contextHostNodeId.value } : undefined)
}

function handleShowGroupPicker() {
  const id = targetNodeIds.value[0]
  if (id) canvas.openGroupPickerDialog(id)
}

function handleMoveOutOfLoopBody() {
  const id = targetNodeIds.value[0]
  if (!id) return
  const parentId = store.moveNodeOutOfScope(id)
  if (parentId) canvas.syncScopeBoundaryLayout(parentId)
}

function handleMergeToGroup() {
  const ids = targetNodeIds.value.filter(id => store.canDeleteNode(id))
  if (ids.length >= 2) {
    store.createGroup(ids)
  }
}

function handleBatchDelete() {
  const ids = targetNodeIds.value.filter(id => store.canDeleteNode(id))
  store.pushUndo('批量删除节点')
  for (const id of ids) {
    store.removeNode(id)
  }
}

async function handleMergeToWorkflow() {
  const ids = targetNodeIds.value.filter(id => store.canDeleteNode(id))
  if (ids.length >= 2) {
    await store.mergeNodesToSubWorkflow(ids)
  }
}

defineExpose({ handleContextMenuCapture, onPaneContextMenu })
</script>

<template>
  <ContextMenu>
    <ContextMenuTrigger as-child>
      <slot />
    </ContextMenuTrigger>

    <ContextMenuContent v-if="!store.isPreview" class="w-48">
      <!-- 画布菜单项 -->
      <template v-if="showPaneActions">
        <ContextMenuItem @click="handleAddNode">
          <Plus class="w-4 h-4 mr-2" />
          新建节点
        </ContextMenuItem>
        <ContextMenuItem @click="handleFitView">
          <Maximize class="w-4 h-4 mr-2" />
          缩放至合适位置
        </ContextMenuItem>
      </template>

      <!-- 嵌入式节点菜单 -->
      <template v-if="menuContext === 'embedded-node'">
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <Palette class="w-4 h-4 mr-2" />
            节点颜色
          </ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <ContextMenuItem
              v-for="c in NODE_COLORS"
              :key="c.value ?? 'default'"
              class="flex items-center gap-2"
              @click="setNodeColor(c.value)"
            >
              <span class="w-3.5 h-3.5 rounded-sm shrink-0" :class="c.class" />
              {{ c.label }}
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <Settings class="w-4 h-4 mr-2" />
            节点状态
          </ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <ContextMenuItem @click="setNodeState('normal')">
              <CircleCheck class="w-4 h-4 mr-2 text-green-500" />
              正常
            </ContextMenuItem>
            <ContextMenuItem @click="setNodeState('disabled')">
              <CircleSlash class="w-4 h-4 mr-2 text-red-500" />
              禁用（中止执行）
            </ContextMenuItem>
            <ContextMenuItem @click="setNodeState('skipped')">
              <SkipForward class="w-4 h-4 mr-2 text-yellow-500" />
              跳过（跳过执行）
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <Flag class="w-4 h-4 mr-2" />
            断点设置
          </ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <ContextMenuItem @click="setNodeBreakpoint('start')">
              <Flag class="w-4 h-4 mr-2 text-blue-500" />
              设置开始断点
            </ContextMenuItem>
            <ContextMenuItem @click="setNodeBreakpoint('end')">
              <Flag class="w-4 h-4 mr-2 text-purple-500" />
              设置结束断点
            </ContextMenuItem>
            <ContextMenuItem @click="setNodeBreakpoint(null)">
              <FlagOff class="w-4 h-4 mr-2 text-muted-foreground" />
              取消断点
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSeparator />
        <ContextMenuItem @click="handleShowNodeInfo">
          <Info class="w-4 h-4 mr-2" />
          查看节点信息
        </ContextMenuItem>
        <ContextMenuItem
          v-if="!isContextBoundaryNode"
          class="text-destructive"
          @click="handleDeleteNode"
        >
          删除节点
        </ContextMenuItem>
      </template>

      <!-- 主画布节点菜单 -->
      <template v-if="menuContext === 'node' || (menuContext === 'pane' && targetNodeIds.length > 0)">
        <ContextMenuSeparator v-if="menuContext === 'pane'" />

        <!-- 多选菜单 -->
        <template v-if="isMultiSelect">
          <ContextMenuItem @click="handleMergeToWorkflow">
            <Workflow class="w-4 h-4 mr-2" />
            合并为工作流
          </ContextMenuItem>
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <Group class="w-4 h-4 mr-2" />
              分组
            </ContextMenuSubTrigger>
            <ContextMenuSubContent>
              <ContextMenuItem @click="handleMergeToGroup">
                <Group class="w-4 h-4 mr-2" />
                合并成组
              </ContextMenuItem>
            </ContextMenuSubContent>
          </ContextMenuSub>
          <ContextMenuItem class="text-destructive" @click="handleBatchDelete">
            <Trash2 class="w-4 h-4 mr-2" />
            批量删除
          </ContextMenuItem>
        </template>

        <!-- 单选菜单 -->
        <template v-else>
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <Palette class="w-4 h-4 mr-2" />
              节点颜色
            </ContextMenuSubTrigger>
            <ContextMenuSubContent>
              <ContextMenuItem
                v-for="c in NODE_COLORS"
                :key="c.value ?? 'default'"
                class="flex items-center gap-2"
                @click="setNodeColor(c.value)"
              >
                <span class="w-3.5 h-3.5 rounded-sm shrink-0" :class="c.class" />
                {{ c.label }}
              </ContextMenuItem>
            </ContextMenuSubContent>
          </ContextMenuSub>
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <Settings class="w-4 h-4 mr-2" />
              节点状态
            </ContextMenuSubTrigger>
            <ContextMenuSubContent>
              <ContextMenuItem @click="setNodeState('normal')">
                <CircleCheck class="w-4 h-4 mr-2 text-green-500" />
                正常
              </ContextMenuItem>
              <ContextMenuItem @click="setNodeState('disabled')">
                <CircleSlash class="w-4 h-4 mr-2 text-red-500" />
                禁用（中止执行）
              </ContextMenuItem>
              <ContextMenuItem @click="setNodeState('skipped')">
                <SkipForward class="w-4 h-4 mr-2 text-yellow-500" />
                跳过（跳过执行）
              </ContextMenuItem>
            </ContextMenuSubContent>
          </ContextMenuSub>
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <Flag class="w-4 h-4 mr-2" />
              断点设置
            </ContextMenuSubTrigger>
            <ContextMenuSubContent>
              <ContextMenuItem @click="setNodeBreakpoint('start')">
                <Flag class="w-4 h-4 mr-2 text-blue-500" />
                设置开始断点
              </ContextMenuItem>
              <ContextMenuItem @click="setNodeBreakpoint('end')">
                <Flag class="w-4 h-4 mr-2 text-purple-500" />
                设置结束断点
              </ContextMenuItem>
              <ContextMenuItem @click="setNodeBreakpoint(null)">
                <FlagOff class="w-4 h-4 mr-2 text-muted-foreground" />
                取消断点
              </ContextMenuItem>
            </ContextMenuSubContent>
          </ContextMenuSub>
          <template v-if="!isBoundaryNode">
            <ContextMenuSub>
              <ContextMenuSubTrigger>
                <FolderTree class="w-4 h-4 mr-2" />
                分组
              </ContextMenuSubTrigger>
              <ContextMenuSubContent>
                <ContextMenuItem
                  v-if="availableGroups.length > 0"
                  @click="handleShowGroupPicker"
                >
                  <Group class="w-4 h-4 mr-2" />
                  加入分组
                </ContextMenuItem>
              </ContextMenuSubContent>
            </ContextMenuSub>
            <ContextMenuSeparator />
            <ContextMenuItem @click="handleShowNodeInfo">
              <Info class="w-4 h-4 mr-2" />
              查看节点信息
            </ContextMenuItem>
            <ContextMenuItem
              v-if="targetNodeIds[0] && store.canCloneNode(targetNodeIds[0])"
              @click="handleCloneNode"
            >
              <Copy class="w-4 h-4 mr-2" />
              复制节点
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem @click="handleCopyToStaging">
              <Archive class="w-4 h-4 mr-2" />
              复制到暂存
            </ContextMenuItem>
            <ContextMenuItem
              v-if="targetNodeIds[0] && store.canDeleteNode(targetNodeIds[0])"
              @click="handleMoveToStaging"
            >
              <ArchiveRestore class="w-4 h-4 mr-2" />
              移动到暂存
            </ContextMenuItem>
            <ContextMenuItem
              v-if="canMoveContextNodeOutOfLoopBody"
              @click="handleMoveOutOfLoopBody"
            >
              <CornerUpLeft class="w-4 h-4 mr-2" />
              从循环体内部移出
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem
              v-if="targetNodeIds[0] && store.canDeleteNode(targetNodeIds[0])"
              class="text-destructive"
              @click="handleDeleteNode"
            >
              删除节点
            </ContextMenuItem>
          </template>
        </template>
      </template>
    </ContextMenuContent>
  </ContextMenu>
</template>
