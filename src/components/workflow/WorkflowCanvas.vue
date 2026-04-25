<script setup lang="ts">
import { ref, inject } from 'vue'
import { VueFlow } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { MiniMap } from '@vue-flow/minimap'
import { Controls } from '@vue-flow/controls'
import { Plus, Maximize } from 'lucide-vue-next'
import CustomEdge from './CustomEdge.vue'
import CanvasToolbar from './CanvasToolbar.vue'
import { WORKFLOW_CANVAS_CONTEXT_KEY } from './workflowCanvasContext'
import { useWorkflowStore } from '@/stores/workflow'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'

const canvas = inject(WORKFLOW_CANVAS_CONTEXT_KEY)
if (!canvas) {
  throw new Error('WorkflowCanvas must be used inside WorkflowEditor')
}

const store = useWorkflowStore()

/** 右键菜单捕获的原始事件，用于坐标转换 */
const contextMenuEvent = ref<MouseEvent | null>(null)

function onPaneContextMenu(event: MouseEvent) {
  if (store.isPreview) return
  contextMenuEvent.value = event
}

function handleAddNode() {
  if (!contextMenuEvent.value) return
  canvas.openNodeSelectAtPosition(contextMenuEvent.value)
  contextMenuEvent.value = null
}

function handleFitView() {
  canvas.fitView()
}
</script>

<template>
  <div class="relative h-full w-full">
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
        <ContextMenuItem @click="handleAddNode">
          <Plus class="w-4 h-4 mr-2" />
          新建节点
        </ContextMenuItem>
        <ContextMenuItem @click="handleFitView">
          <Maximize class="w-4 h-4 mr-2" />
          缩放至合适位置
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>

    <CanvasToolbar class="absolute bottom-10 left-1/2 -translate-x-1/2 z-20" />
  </div>
</template>
