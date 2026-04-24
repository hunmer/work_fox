<script setup lang="ts">
import { computed, markRaw, onMounted, onUnmounted, ref, watch } from 'vue'
import { VueFlow, useVueFlow, MarkerType, ConnectionMode } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Maximize2, Minimize2 } from 'lucide-vue-next'
import type { EmbeddedWorkflow, WorkflowEdge, WorkflowNode } from '@/lib/workflow/types'
import { getNodeDefinition } from '@/lib/workflow/nodeRegistry'
import { useWorkflowStore } from '@/stores/workflow'
import { createWorkflowShortcutHandler } from '@/composables/workflow/useEditorShortcuts'
import { WORKFLOW_NODE_DRAG_MIME } from './dragDrop'
import EmbeddedWorkflowNode from './EmbeddedWorkflowNode.vue'
import EmbeddedWorkflowEdge from './EmbeddedWorkflowEdge.vue'
import NodeSelectDialog from './NodeSelectDialog.vue'

const props = defineProps<{
  modelValue: EmbeddedWorkflow
  flowId: string
  hostNodeId?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: EmbeddedWorkflow]
}>()

const store = useWorkflowStore()
const nodeTypes = { embedded: markRaw(EmbeddedWorkflowNode) }
const edgeTypes = { embedded: markRaw(EmbeddedWorkflowEdge) }

const {
  addSelectedNodes,
  getSelectedEdges,
  getSelectedNodes,
  project,
  setViewport,
  viewport,
  vueFlowRef,
  zoomIn,
  zoomOut,
  zoomTo,
} = useVueFlow({ id: props.flowId })
const nodeSelectOpen = ref(false)
const editorRef = ref<HTMLElement | null>(null)
const pendingInsert = ref<{ sourceId: string; targetId?: string; position?: { x: number; y: number } } | null>(null)
const flowNodes = ref<Array<Record<string, any>>>([])
const flowEdges = ref<Array<Record<string, any>>>([])
const clipboardNodes = ref<WorkflowNode[]>([])
const clipboardEdges = ref<WorkflowEdge[]>([])
const outerZoom = ref(1)
const fullscreenSnapshot = ref<{
  innerViewport: { x: number; y: number; zoom: number }
  outerViewport: { x: number; y: number; zoom: number } | null
  hostNode: WorkflowNode
} | null>(null)
const isFullscreen = computed(() => !!fullscreenSnapshot.value)
const flowStyle = computed(() => ({
  width: outerZoom.value === 1 ? '100%' : `${100 / outerZoom.value}%`,
  height: outerZoom.value === 1 ? '100%' : `${100 / outerZoom.value}%`,
  transform: outerZoom.value === 1 ? undefined : `scale(${outerZoom.value})`,
  transformOrigin: 'top left',
}))

function cloneWorkflow(): EmbeddedWorkflow {
  return JSON.parse(JSON.stringify(props.modelValue)) as EmbeddedWorkflow
}

function mapWorkflowNode(node: WorkflowNode) {
  return {
    id: node.id,
    type: 'embedded',
    position: node.position,
    data: {
      ...node.data,
      label: node.label,
      nodeType: node.type,
    },
    draggable: true,
    dragHandle: '.embedded-node-body',
    selectable: true,
    connectable: true,
  }
}

function mapWorkflowEdge(edge: WorkflowEdge) {
  return {
    id: edge.id,
    type: 'embedded',
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle,
    targetHandle: edge.targetHandle,
    markerEnd: MarkerType.ArrowClosed,
  }
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

watch(
  () => props.modelValue,
  (workflow) => {
    flowNodes.value = workflow.nodes.map(mapWorkflowNode)
    flowEdges.value = workflow.edges.map(mapWorkflowEdge)
    const selected = store.selectedEmbeddedNode
    if (selected?.hostNodeId === props.hostNodeId) {
      const node = workflow.nodes.find((item) => item.id === selected.nodeId)
      if (node) selected.node = JSON.parse(JSON.stringify(node))
      else store.selectedEmbeddedNode = null
    }
  },
  { immediate: true, deep: true },
)

function emitWorkflow(nextWorkflow: EmbeddedWorkflow) {
  emit('update:modelValue', nextWorkflow)
}

function syncLocalState(nextWorkflow: EmbeddedWorkflow) {
  flowNodes.value = nextWorkflow.nodes.map(mapWorkflowNode)
  flowEdges.value = nextWorkflow.edges.map(mapWorkflowEdge)
}

function addNodeAt(type: string, position: { x: number; y: number }): WorkflowNode | null {
  const node = createEmbeddedNode(type, position)
  if (!node) return null
  const nextWorkflow = cloneWorkflow()
  nextWorkflow.nodes.push(node)
  syncLocalState(nextWorkflow)
  emitWorkflow(nextWorkflow)
  return node
}

function replaceWorkflow(nextWorkflow: EmbeddedWorkflow) {
  syncLocalState(nextWorkflow)
  emitWorkflow(nextWorkflow)
}

function copySelectedNodes() {
  const selectedNodeIds = new Set(getSelectedNodes.value.map((node) => String(node.id)))
  if (!selectedNodeIds.size) return
  clipboardNodes.value = props.modelValue.nodes
    .filter((node) => selectedNodeIds.has(node.id))
    .map((node) => JSON.parse(JSON.stringify(node)))
  clipboardEdges.value = props.modelValue.edges
    .filter((edge) => selectedNodeIds.has(edge.source) && selectedNodeIds.has(edge.target))
    .map((edge) => JSON.parse(JSON.stringify(edge)))
}

function pasteClipboardNodes() {
  if (!clipboardNodes.value.length) return

  const nextWorkflow = cloneWorkflow()
  const idMap = new Map<string, string>()
  const pastedNodes = clipboardNodes.value.map((node) => {
    const nextId = crypto.randomUUID()
    idMap.set(node.id, nextId)
    return {
      ...JSON.parse(JSON.stringify(node)),
      id: nextId,
      position: {
        x: node.position.x + 30,
        y: node.position.y + 30,
      },
    }
  })
  const pastedEdges = clipboardEdges.value
    .map((edge) => {
      const source = idMap.get(edge.source)
      const target = idMap.get(edge.target)
      if (!source || !target) return null
      return {
        ...JSON.parse(JSON.stringify(edge)),
        id: `e-${source}-${edge.sourceHandle ?? 'default'}-${target}-${edge.targetHandle ?? 'default'}`,
        source,
        target,
      }
    })
    .filter(Boolean) as WorkflowEdge[]

  nextWorkflow.nodes.push(...pastedNodes)
  nextWorkflow.edges.push(...pastedEdges)
  replaceWorkflow(nextWorkflow)
  addSelectedNodes(pastedNodes.map(mapWorkflowNode))
}

function deleteSelected() {
  const selectedNodeIds = new Set(getSelectedNodes.value.map((node) => String(node.id)))
  const selectedEdgeIds = new Set(getSelectedEdges.value.map((edge) => String(edge.id)))
  if (!selectedNodeIds.size && !selectedEdgeIds.size) return

  const nextWorkflow = cloneWorkflow()
  nextWorkflow.nodes = nextWorkflow.nodes.filter((node) => !selectedNodeIds.has(node.id) || node.type === 'start' || node.type === 'end')
  const deletedNodeIds = new Set(props.modelValue.nodes
    .filter((node) => selectedNodeIds.has(node.id) && node.type !== 'start' && node.type !== 'end')
    .map((node) => node.id))
  nextWorkflow.edges = nextWorkflow.edges.filter((edge) => (
    !selectedEdgeIds.has(edge.id)
    && !deletedNodeIds.has(edge.source)
    && !deletedNodeIds.has(edge.target)
  ))
  replaceWorkflow(nextWorkflow)
}

function selectEmbeddedNode(nodeId: string, additive = false) {
  if (!props.hostNodeId) return
  const node = props.modelValue.nodes.find((item) => item.id === nodeId)
  if (!node) return

  if (!additive) {
    store.selectedNodeIds = []
  }
  store.selectedEmbeddedNode = {
    hostNodeId: props.hostNodeId,
    nodeId,
    node: JSON.parse(JSON.stringify(node)),
  }
  store.rightPanelTab = 'properties'
}

function clearEmbeddedSelection() {
  if (store.selectedEmbeddedNode?.hostNodeId === props.hostNodeId) {
    store.selectedEmbeddedNode = null
  }
}

function selectAllNodes() {
  addSelectedNodes(flowNodes.value)
  clearEmbeddedSelection()
}

const handleKeyDown = createWorkflowShortcutHandler({
  hasWorkflow: () => !!props.modelValue,
  isPreview: () => store.isPreview,
  saveWorkflow: () => {
    if (store.currentWorkflow) void store.saveWorkflow(store.currentWorkflow)
  },
  undo: store.undo,
  redo: store.redo,
  copySelectedNodes,
  pasteClipboardNodes,
  deleteSelected,
  selectAllNodes,
})

function onWorkflowZoomIn(event: Event) {
  if (!isEventInsideEditor(event)) return
  zoomIn()
  event.preventDefault()
}

function onWorkflowZoomOut(event: Event) {
  if (!isEventInsideEditor(event)) return
  zoomOut()
  event.preventDefault()
}

function onWorkflowZoomReset(event: Event) {
  if (!isEventInsideEditor(event)) return
  zoomTo(1)
  event.preventDefault()
}

function isEventInsideEditor(event: Event) {
  const target = event.target
  if (!(target instanceof Node)) return false
  return !target || !vueFlowRef.value || vueFlowRef.value.contains(target)
}

function getHostNode() {
  if (!props.hostNodeId) return null
  return store.currentWorkflow?.nodes.find((node) => node.id === props.hostNodeId) ?? null
}

function getOuterCanvasState() {
  const hostElement = editorRef.value?.closest('.vue-flow__node') as HTMLElement | null
  const flowElement = hostElement?.closest('.vue-flow') as HTMLElement | null
  const viewportElement = flowElement?.querySelector('.vue-flow__transformationpane') as HTMLElement | null
  if (!flowElement || !viewportElement) return null

  const bounds = flowElement.getBoundingClientRect()
  const matrix = new DOMMatrixReadOnly(getComputedStyle(viewportElement).transform)
  const zoom = matrix.a || 1
  const padding = 16

  return {
    position: {
      x: Math.floor((padding - matrix.e) / zoom),
      y: Math.floor((padding - matrix.f) / zoom),
    },
    size: {
      width: Math.max(520, Math.floor((bounds.width - padding * 2) / zoom)),
      height: Math.max(260, Math.floor((bounds.height - padding * 2) / zoom)),
    },
  }
}

function getOuterViewport() {
  const flowElement = editorRef.value?.closest('.vue-flow') as HTMLElement | null
  const viewportElement = flowElement?.querySelector('.vue-flow__transformationpane') as HTMLElement | null
  if (!viewportElement) return null
  const matrix = new DOMMatrixReadOnly(getComputedStyle(viewportElement).transform)
  return { x: matrix.e, y: matrix.f, zoom: matrix.a || 1 }
}

function setOuterViewport(nextViewport: { x: number; y: number; zoom: number }) {
  window.dispatchEvent(new CustomEvent('workflow:embedded-set-viewport', { detail: nextViewport }))
}

function syncOuterZoom() {
  outerZoom.value = getOuterViewport()?.zoom || 1
}

function toggleFullscreen() {
  const hostNode = getHostNode()
  if (!hostNode) return

  if (fullscreenSnapshot.value) {
    const snapshot = fullscreenSnapshot.value
    fullscreenSnapshot.value = null
    store.updateNodeData(hostNode.id, {
      width: snapshot.hostNode.data?.width,
      height: snapshot.hostNode.data?.height,
    })
    store.updateNodePosition(hostNode.id, snapshot.hostNode.position)
    if (snapshot.outerViewport) setOuterViewport(snapshot.outerViewport)
    void setViewport(snapshot.innerViewport)
    return
  }

  const outerCanvasState = getOuterCanvasState()
  if (!outerCanvasState) return
  fullscreenSnapshot.value = {
    innerViewport: { ...viewport.value },
    outerViewport: getOuterViewport(),
    hostNode: JSON.parse(JSON.stringify(hostNode)),
  }
  store.updateNodePosition(hostNode.id, outerCanvasState.position)
  store.updateNodeData(hostNode.id, outerCanvasState.size)
  setOuterViewport({ x: 0, y: 0, zoom: 1 })
  void setViewport({
    x: outerCanvasState.size.width / 2 - 260,
    y: outerCanvasState.size.height / 2 - 130,
    zoom: 1,
  })
}

function focusEditor() {
  editorRef.value?.focus()
}

watch(
  () => props.hostNodeId,
  () => {
    fullscreenSnapshot.value = null
  },
)

onMounted(() => {
  syncOuterZoom()
  window.addEventListener('workflow:zoom-in', onWorkflowZoomIn)
  window.addEventListener('workflow:zoom-out', onWorkflowZoomOut)
  window.addEventListener('workflow:zoom-reset', onWorkflowZoomReset)
  window.addEventListener('wheel', syncOuterZoom, true)
  window.addEventListener('pointerup', syncOuterZoom, true)
})

onUnmounted(() => {
  window.removeEventListener('workflow:zoom-in', onWorkflowZoomIn)
  window.removeEventListener('workflow:zoom-out', onWorkflowZoomOut)
  window.removeEventListener('workflow:zoom-reset', onWorkflowZoomReset)
  window.removeEventListener('wheel', syncOuterZoom, true)
  window.removeEventListener('pointerup', syncOuterZoom, true)
})

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
  syncLocalState(nextWorkflow)
  emitWorkflow(nextWorkflow)
}

function onNodeClick({ node, event }: any) {
  const nodeId = node?.id
  if (!nodeId) return
  selectEmbeddedNode(String(nodeId), !!event?.shiftKey || !!event?.metaKey)
}

function onEmbeddedNodeSelect(payload: { id: string; event: MouseEvent }) {
  selectEmbeddedNode(payload.id, payload.event.shiftKey || payload.event.metaKey)
}

function onPaneClick() {
  clearEmbeddedSelection()
}

function onNodesChange(changes: Array<any>) {
  let nextWorkflow: EmbeddedWorkflow | null = null

  for (const change of changes) {
    if (change.type === 'position' && change.position) {
      const node = props.modelValue.nodes.find((item) => item.id === change.id)
      if (!node) continue
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
      if (store.selectedEmbeddedNode?.hostNodeId === props.hostNodeId && store.selectedEmbeddedNode.nodeId === change.id) {
        store.selectedEmbeddedNode = null
      }
      if (!nextWorkflow) nextWorkflow = cloneWorkflow()
      nextWorkflow.nodes = nextWorkflow.nodes.filter((item) => item.id !== change.id)
      nextWorkflow.edges = nextWorkflow.edges.filter((edge) => edge.source !== change.id && edge.target !== change.id)
    }
  }

  if (nextWorkflow) {
    syncLocalState(nextWorkflow)
    emitWorkflow(nextWorkflow)
  }
}

function onEdgesChange(changes: Array<any>) {
  let nextWorkflow: EmbeddedWorkflow | null = null
  for (const change of changes) {
    if (change.type !== 'remove') continue
    if (!nextWorkflow) nextWorkflow = cloneWorkflow()
    nextWorkflow.edges = nextWorkflow.edges.filter((edge) => edge.id !== change.id)
  }
  if (nextWorkflow) {
    syncLocalState(nextWorkflow)
    emitWorkflow(nextWorkflow)
  }
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
  const target = event.currentTarget as HTMLElement | null
  const bounds = target?.getBoundingClientRect()
  if (!bounds) return

  const position = project({
    x: (event.clientX - bounds.left) / Math.max(outerZoom.value, 0.1),
    y: (event.clientY - bounds.top) / Math.max(outerZoom.value, 0.1),
  })
  if (type) {
    addNodeAt(type, position)
    return
  }

  pendingInsert.value = { sourceId: '', position }
  nodeSelectOpen.value = true
}

function onEdgeInsertNode(_edgeId: string, sourceId: string, targetId: string) {
  pendingInsert.value = { sourceId, targetId }
  nodeSelectOpen.value = true
}

function handleSelectNodeType(type: string) {
  const insert = pendingInsert.value
  nodeSelectOpen.value = false
  pendingInsert.value = null
  if (!insert) return

  let position = insert.position
  if (!position && insert.sourceId && insert.targetId) {
    const sourceNode = props.modelValue.nodes.find((item) => item.id === insert.sourceId)
    const targetNode = props.modelValue.nodes.find((item) => item.id === insert.targetId)
    if (!sourceNode || !targetNode) return
    position = {
      x: (sourceNode.position.x + targetNode.position.x) / 2,
      y: (sourceNode.position.y + targetNode.position.y) / 2,
    }
  }

  if (!position) {
    position = { x: 200, y: 140 }
  }

  const inserted = createEmbeddedNode(type, position)
  if (!inserted) return

  const nextWorkflow = cloneWorkflow()
  nextWorkflow.nodes.push(inserted)

  if (insert.sourceId && insert.targetId) {
    nextWorkflow.edges = nextWorkflow.edges.filter((edge) => !(edge.source === insert.sourceId && edge.target === insert.targetId))
    nextWorkflow.edges.push(
      { id: `e-${insert.sourceId}-${inserted.id}`, source: insert.sourceId, target: inserted.id },
      { id: `e-${inserted.id}-${insert.targetId}`, source: inserted.id, target: insert.targetId },
    )
  }

  syncLocalState(nextWorkflow)
  emitWorkflow(nextWorkflow)
}

function handleSelectDialogOpenChange(open: boolean) {
  nodeSelectOpen.value = open
  if (!open) {
    pendingInsert.value = null
  }
}
</script>

<template>
  <div
    ref="editorRef"
    class="embedded-workflow-editor relative h-full w-full nodrag nopan"
    data-embedded-workflow="true"
    tabindex="0"
    @pointerdown="focusEditor"
    @dragover="onDragOver"
    @drop="onDrop"
    @keydown="handleKeyDown"
  >
    <VueFlow
      :id="flowId"
      :nodes="flowNodes"
      :edges="flowEdges"
      :node-types="nodeTypes"
      :edge-types="edgeTypes"
      :min-zoom="0.4"
      :max-zoom="1.8"
      :fit-view-on-init="true"
      :connection-mode="ConnectionMode.Loose"
      class="h-full w-full"
      :style="flowStyle"
      :nodes-draggable="true"
      :nodes-connectable="true"
      :pan-on-drag="true"
      no-pan-class-name="embedded-workflow-nopan"
      :select-nodes-on-drag="false"
      :elements-selectable="true"
      @connect="onConnect"
      @node-click="onNodeClick"
      @pane-click="onPaneClick"
      @nodes-change="onNodesChange"
      @edges-change="onEdgesChange"
    >
      <Background :gap="20" :size="1" pattern-color="rgba(148, 163, 184, 0.18)" />

      <template #node-embedded="nodeProps">
        <EmbeddedWorkflowNode
          v-bind="nodeProps"
          @select-node="onEmbeddedNodeSelect"
        />
      </template>

      <template #edge-embedded="edgeProps">
        <EmbeddedWorkflowEdge
          v-bind="edgeProps"
          @insert-node="onEdgeInsertNode"
        />
      </template>
    </VueFlow>

    <button
      v-if="hostNodeId"
      type="button"
      class="embedded-workflow-fullscreen-button nodrag nopan"
      :title="isFullscreen ? '退出全屏显示' : '全屏显示当前节点'"
      @click.stop="toggleFullscreen"
    >
      <Minimize2 v-if="isFullscreen" class="h-4 w-4" />
      <Maximize2 v-else class="h-4 w-4" />
    </button>

    <NodeSelectDialog
      :open="nodeSelectOpen"
      @update:open="handleSelectDialogOpenChange"
      @select="handleSelectNodeType"
    />
  </div>
</template>

<style scoped>
.embedded-workflow-editor {
  overflow: hidden;
}

.embedded-workflow-fullscreen-button {
  position: absolute;
  right: 10px;
  bottom: 10px;
  z-index: 20;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: 8px;
  color: rgb(71, 85, 105);
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 8px 18px rgba(15, 23, 42, 0.12);
  cursor: pointer;
}

.embedded-workflow-fullscreen-button:hover {
  color: rgb(15, 23, 42);
  background: rgba(248, 250, 252, 0.98);
}
</style>
