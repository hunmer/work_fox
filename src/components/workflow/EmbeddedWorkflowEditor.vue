<script setup lang="ts">
import { computed, markRaw } from 'vue'
import { VueFlow, useVueFlow, MarkerType } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import type { EmbeddedWorkflow, WorkflowNode } from '@/lib/workflow/types'
import { getNodeDefinition } from '@/lib/workflow/nodeRegistry'
import { WORKFLOW_NODE_DRAG_MIME } from './dragDrop'
import EmbeddedWorkflowNode from './EmbeddedWorkflowNode.vue'
import EmbeddedWorkflowEdge from './EmbeddedWorkflowEdge.vue'

const props = defineProps<{
  modelValue: EmbeddedWorkflow
  flowId: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: EmbeddedWorkflow]
}>()

const nodeTypes = { embedded: markRaw(EmbeddedWorkflowNode) }
const edgeTypes = { embedded: markRaw(EmbeddedWorkflowEdge) }

const { project } = useVueFlow(props.flowId)

function cloneWorkflow(): EmbeddedWorkflow {
  return JSON.parse(JSON.stringify(props.modelValue)) as EmbeddedWorkflow
}

function createNodeData(type: string): Record<string, any> {
  const definition = getNodeDefinition(type)
  const data: Record<string, any> = {}
  for (const prop of definition?.properties || []) {
    if (prop.default !== undefined) data[prop.key] = JSON.parse(JSON.stringify(prop.default))
  }
  if (definition?.outputs?.length) {
    data.outputs = JSON.parse(JSON.stringify(definition.outputs))
  }
  return data
}

function createEmbeddedNode(type: string, position: { x: number; y: number }): WorkflowNode | null {
  const definition = getNodeDefinition(type)
  if (!definition || definition.manualCreate === false) return null

  return {
    id: crypto.randomUUID(),
    type,
    label: definition.label || type,
    position,
    data: createNodeData(type),
  }
}

const nodes = computed(() =>
  props.modelValue.nodes.map((node) => ({
    id: node.id,
    type: 'embedded',
    position: node.position,
    data: {
      ...node.data,
      label: node.label,
      nodeType: node.type,
    },
    draggable: node.type !== 'start' && node.type !== 'end',
    selectable: true,
  })),
)

const edges = computed(() =>
  props.modelValue.edges.map((edge) => ({
    id: edge.id,
    type: 'embedded',
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle,
    targetHandle: edge.targetHandle,
    markerEnd: MarkerType.ArrowClosed,
  })),
)

function emitWorkflow(nextWorkflow: EmbeddedWorkflow) {
  emit('update:modelValue', nextWorkflow)
}

function addNodeAt(type: string, position: { x: number; y: number }): WorkflowNode | null {
  const node = createEmbeddedNode(type, position)
  if (!node) return null
  const nextWorkflow = cloneWorkflow()
  nextWorkflow.nodes.push(node)
  emitWorkflow(nextWorkflow)
  return node
}

function onConnect(params: { source?: string | null; target?: string | null; sourceHandle?: string | null; targetHandle?: string | null }) {
  if (!params.source || !params.target) return
  const nextWorkflow = cloneWorkflow()
  const exists = nextWorkflow.edges.some((edge) =>
    edge.source === params.source
    && edge.target === params.target
    && (edge.sourceHandle ?? null) === (params.sourceHandle ?? null)
    && (edge.targetHandle ?? null) === (params.targetHandle ?? null),
  )
  if (exists) return
  nextWorkflow.edges.push({
    id: `e-${params.source}-${params.sourceHandle ?? 'default'}-${params.target}-${params.targetHandle ?? 'default'}`,
    source: params.source,
    target: params.target,
    sourceHandle: params.sourceHandle ?? null,
    targetHandle: params.targetHandle ?? null,
  })
  emitWorkflow(nextWorkflow)
}

function onNodesChange(changes: Array<any>) {
  let nextWorkflow: EmbeddedWorkflow | null = null

  for (const change of changes) {
    if (change.type === 'position' && change.position) {
      const node = props.modelValue.nodes.find((item) => item.id === change.id)
      if (!node || node.type === 'start' || node.type === 'end') continue
      if (!nextWorkflow) nextWorkflow = cloneWorkflow()
      const index = nextWorkflow.nodes.findIndex((item) => item.id === change.id)
      if (index >= 0) {
        nextWorkflow.nodes[index] = {
          ...nextWorkflow.nodes[index],
          position: change.position,
        }
      }
    }

    if (change.type === 'remove') {
      const node = props.modelValue.nodes.find((item) => item.id === change.id)
      if (!node || node.type === 'start' || node.type === 'end') continue
      if (!nextWorkflow) nextWorkflow = cloneWorkflow()
      nextWorkflow.nodes = nextWorkflow.nodes.filter((item) => item.id !== change.id)
      nextWorkflow.edges = nextWorkflow.edges.filter((edge) => edge.source !== change.id && edge.target !== change.id)
    }
  }

  if (nextWorkflow) emitWorkflow(nextWorkflow)
}

function onEdgesChange(changes: Array<any>) {
  let nextWorkflow: EmbeddedWorkflow | null = null
  for (const change of changes) {
    if (change.type !== 'remove') continue
    if (!nextWorkflow) nextWorkflow = cloneWorkflow()
    nextWorkflow.edges = nextWorkflow.edges.filter((edge) => edge.id !== change.id)
  }
  if (nextWorkflow) emitWorkflow(nextWorkflow)
}

function onDragOver(event: DragEvent) {
  event.preventDefault()
  event.stopPropagation()
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move'
  }
}

function onDrop(event: DragEvent) {
  event.preventDefault()
  event.stopPropagation()

  const type = event.dataTransfer?.getData(WORKFLOW_NODE_DRAG_MIME)
  if (!type) return

  const target = event.currentTarget as HTMLElement | null
  const bounds = target?.getBoundingClientRect()
  if (!bounds) return

  const position = project({
    x: event.clientX - bounds.left,
    y: event.clientY - bounds.top,
  })
  addNodeAt(type, position)
}

function onEdgeInsertNode(_edgeId: string, sourceId: string, targetId: string) {
  const sourceNode = props.modelValue.nodes.find((item) => item.id === sourceId)
  const targetNode = props.modelValue.nodes.find((item) => item.id === targetId)
  if (!sourceNode || !targetNode) return

  const nextPosition = {
    x: (sourceNode.position.x + targetNode.position.x) / 2,
    y: (sourceNode.position.y + targetNode.position.y) / 2,
  }
  const inserted = createEmbeddedNode('run_code', nextPosition)
  if (!inserted) return

  const nextWorkflow = cloneWorkflow()
  nextWorkflow.nodes.push(inserted)
  nextWorkflow.edges = nextWorkflow.edges.filter((edge) => !(edge.source === sourceId && edge.target === targetId))
  nextWorkflow.edges.push(
    { id: `e-${sourceId}-${inserted.id}`, source: sourceId, target: inserted.id },
    { id: `e-${inserted.id}-${targetId}`, source: inserted.id, target: targetId },
  )
  emitWorkflow(nextWorkflow)
}
</script>

<template>
  <div class="h-full w-full" data-embedded-workflow="true" @dragover="onDragOver" @drop="onDrop">
    <VueFlow
      :id="flowId"
      :nodes="nodes"
      :edges="edges"
      :node-types="nodeTypes"
      :edge-types="edgeTypes"
      :min-zoom="0.4"
      :max-zoom="1.8"
      :fit-view-on-init="true"
      class="h-full w-full"
      @connect="onConnect"
      @nodes-change="onNodesChange"
      @edges-change="onEdgesChange"
    >
      <Background :gap="20" :size="1" pattern-color="rgba(148, 163, 184, 0.18)" />

      <template #edge-embedded="edgeProps">
        <EmbeddedWorkflowEdge
          v-bind="edgeProps"
          @insert-node="onEdgeInsertNode"
        />
      </template>
    </VueFlow>
  </div>
</template>
