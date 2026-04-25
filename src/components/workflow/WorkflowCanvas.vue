<script setup lang="ts">
import { ref, computed, inject } from 'vue'
import { VueFlow } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { MiniMap } from '@vue-flow/minimap'
import { Controls } from '@vue-flow/controls'
import { Plus, Maximize, CircleCheck, CircleSlash, SkipForward, Info, Group, Trash2, Flag, FlagOff, Settings, Copy, FolderTree } from 'lucide-vue-next'
import CustomEdge from './CustomEdge.vue'
import CanvasToolbar from './CanvasToolbar.vue'
import { WORKFLOW_CANVAS_CONTEXT_KEY } from './workflowCanvasContext'
import { useWorkflowStore } from '@/stores/workflow'
import { getNodeDefinition } from '@/lib/workflow/nodeRegistry'
import type { NodeBreakpoint, NodeRunState } from '@/lib/workflow/types'
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

const canvas = inject(WORKFLOW_CANVAS_CONTEXT_KEY)
if (!canvas) {
  throw new Error('WorkflowCanvas must be used inside WorkflowEditor')
}

const store = useWorkflowStore()

// ── 右键菜单上下文 ──
const menuContext = ref<'pane' | 'node'>('pane')
const contextNodeId = ref<string | null>(null)

/** 在捕获阶段检测右键目标，先于 ContextMenu trigger 设置状态 */
function handleContextMenuCapture(event: MouseEvent) {
  if (store.isPreview) return
  const target = event.target as HTMLElement
  const nodeEl = target.closest('.vue-flow__node')
  if (nodeEl) {
    const nodeId = nodeEl.getAttribute('data-id')
    // 排除 group 虚拟节点
    if (nodeId && !store.currentWorkflow?.groups?.some(g => g.id === nodeId)) {
      menuContext.value = 'node'
      contextNodeId.value = nodeId
    } else {
      menuContext.value = 'pane'
      contextNodeId.value = null
    }
  } else {
    menuContext.value = 'pane'
    contextNodeId.value = null
  }
}

/** 右键菜单捕获的原始事件，用于新建节点坐标转换 */
const contextMenuEvent = ref<MouseEvent | null>(null)

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

/** 菜单操作的目标节点 ID 列表（单选取 contextNode，多选取 selectedNodeIds） */
const targetNodeIds = computed(() => {
  if (menuContext.value === 'pane') {
    return store.selectedNodeIds
  }
  // 节点右键时，如果有 2+ 已选中节点（且包含右键节点），走多选逻辑
  if (store.selectedNodeIds.length >= 2 && contextNodeId.value && store.selectedNodeIds.includes(contextNodeId.value)) {
    return store.selectedNodeIds
  }
  return contextNodeId.value ? [contextNodeId.value] : []
})

const isMultiSelect = computed(() => targetNodeIds.value.length >= 2)

const availableGroups = computed(() => store.currentWorkflow?.groups || [])

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
function setNodeState(state: NodeRunState) {
  for (const id of targetNodeIds.value) {
    store.updateNodeState(id, state)
  }
}

function setNodeBreakpoint(breakpoint: NodeBreakpoint | null) {
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

function handleDeleteNode() {
  const id = targetNodeIds.value[0]
  if (id && store.canDeleteNode(id)) {
    store.removeNode(id)
  }
}

function handleShowNodeInfo() {
  const id = targetNodeIds.value[0]
  if (id) canvas.openNodeInfoDialog(id)
}

function handleShowGroupPicker() {
  const id = targetNodeIds.value[0]
  if (id) canvas.openGroupPickerDialog(id)
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
</script>

<template>
  <div class="relative h-full w-full" @contextmenu.capture="handleContextMenuCapture">
    <ContextMenu>
      <ContextMenuTrigger as-child>
        <VueFlow
          :id="canvas.flowId"
          :nodes="canvas.nodes.value"
          :edges="canvas.edges.value"
          :node-types="canvas.nodeTypes"
          :edge-types="canvas.edgeTypes"
          :min-zoom="0.2"
          :max-zoom="4"
          :connection-mode="canvas.connectionMode"
          :nodes-draggable="canvas.nodesDraggable.value"
          :nodes-connectable="canvas.nodesConnectable.value"
          :edges-updatable="canvas.edgesUpdatable.value"
          class="h-full w-full"
          @connect="canvas.onConnect"
          @connect-start="canvas.onConnectStart"
          @connect-end="canvas.onConnectEnd"
          @dragover="canvas.onDragOver"
          @drop="canvas.onDrop"
          @node-click="canvas.onNodeClick"
          @nodes-initialized="canvas.onNodesInitialized"
          @pane-click="canvas.onPaneClick"
          @pane-contextmenu="onPaneContextMenu"
        >
          <Background />
          <MiniMap v-if="canvas.minimapVisible.value" />
          <template #edge-custom="edgeProps">
            <CustomEdge
              v-bind="edgeProps"
              @insert-node="canvas.onEdgeInsertNode"
            />
          </template>
          <Controls />
        </VueFlow>
      </ContextMenuTrigger>

      <ContextMenuContent v-if="!store.isPreview" class="w-48">
        <!-- ── 画布菜单项（始终在节点右键时也隐藏，只在 pane 时显示） ── -->
        <template v-if="menuContext === 'pane'">
          <ContextMenuItem @click="handleAddNode">
            <Plus class="w-4 h-4 mr-2" />
            新建节点
          </ContextMenuItem>
          <ContextMenuItem @click="handleFitView">
            <Maximize class="w-4 h-4 mr-2" />
            缩放至合适位置
          </ContextMenuItem>
        </template>

        <!-- ── 节点菜单项（节点右键 或 画布右键有选中节点时显示） ── -->
        <template v-if="menuContext === 'node' || (menuContext === 'pane' && targetNodeIds.length > 0)">
          <ContextMenuSeparator v-if="menuContext === 'pane'" />

          <!-- 多选菜单 -->
          <template v-if="isMultiSelect">
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

    <CanvasToolbar class="absolute bottom-10 left-1/2 -translate-x-1/2 z-20" />
  </div>
</template>
