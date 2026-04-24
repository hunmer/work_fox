<script setup lang="ts">
import { inject } from 'vue'
import { VueFlow } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { MiniMap } from '@vue-flow/minimap'
import { Controls } from '@vue-flow/controls'
import CustomEdge from './CustomEdge.vue'
import CanvasToolbar from './CanvasToolbar.vue'
import { WORKFLOW_CANVAS_CONTEXT_KEY } from './workflowCanvasContext'

const canvas = inject(WORKFLOW_CANVAS_CONTEXT_KEY)
if (!canvas) {
  throw new Error('WorkflowCanvas must be used inside WorkflowEditor')
}
</script>

<template>
  <div class="relative h-full w-full">
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

    <CanvasToolbar class="absolute bottom-10 left-1/2 -translate-x-1/2 z-20" />
  </div>
</template>
