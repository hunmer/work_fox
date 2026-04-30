<script setup lang="ts">
import { ref, markRaw, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useVueFlow, ConnectionMode } from '@vue-flow/core'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import '@vue-flow/controls/dist/style.css'
import '@vue-flow/minimap/dist/style.css'
import '@vue-flow/node-resizer/dist/style.css'

import { GoldenLayout } from '@/components/ui/golden-layout'
import type { ComponentRegistry, ProvideMap } from '@/components/ui/golden-layout'
import { WORKFLOW_STORE_KEY } from '@/stores/workflow'
import { useEditorLayout } from '@/composables/workflow/useEditorLayout'
import type { LayoutConfig } from 'golden-layout'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { Spinner } from '@/components/ui/spinner'
import { Button } from '@/components/ui/button'
import { AlertCircle, Copy } from 'lucide-vue-next'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import JsonEditor from '@/components/ui/json-editor/JsonEditor.vue'
import { provideWorkflowStore, type WorkflowStore } from '@/stores/workflow'
import { useTabStore, type Tab } from '@/stores/tab'
import CustomNodeWrapper from './CustomNodeWrapper.vue'
import CustomEdge from './CustomEdge.vue'
import GroupNode from './GroupNode.vue'
import WorkflowCanvas from './WorkflowCanvas.vue'
import NodeSidebar from './NodeSidebar.vue'
import RightPanel from './RightPanel.vue'
import RightProperties from './RightProperties.vue'
import RightVersion from './RightVersion.vue'
import RightOperations from './RightOperations.vue'
import GroupManagePanel from './GroupManagePanel.vue'
import FloatingPanel from '@/components/utils/FloatingPanel.vue'
import RightAssistant from './RightAssistant.vue'
import RightStaging from './RightStaging.vue'
import ExecutionBar from './ExecutionBar.vue'
import WorkflowListDialog from './WorkflowListDialog.vue'
import NodeSelectDialog from './NodeSelectDialog.vue'
import EditorToolbar from './EditorToolbar.vue'
import ActivityBar from './ActivityBar.vue'
import PluginsDialog from '@/components/plugins/PluginsDialog.vue'
import SettingsDialog from '@/components/settings/SettingsDialog.vue'
import PluginPickerDialog from './PluginPickerDialog.vue'
import TriggerSettingsDialog from './TriggerSettingsDialog.vue'
import { WORKFLOW_NODE_DRAG_MIME } from './dragDrop'
import EditorRightBar from './EditorRightBar.vue'
import { LOOP_BODY_NODE_TYPE } from '@shared/workflow-composite'

import { useConnectionDrop } from '@/composables/workflow/useConnectionDrop'
import { useEdgeInsert } from '@/composables/workflow/useEdgeInsert'
import { useFlowCanvas } from '@/composables/workflow/useFlowCanvas'
import { useWorkflowFileActions } from '@/composables/workflow/useWorkflowFileActions'
import { getNodeDefinition } from '@/lib/workflow/nodeRegistry'
import { useNotification } from '@/composables/useNotification'
import type { WorkflowNode } from '@/lib/workflow/types'
import { useClipboard } from '@/composables/workflow/useClipboard'
import { useEditorShortcuts } from '@/composables/workflow/useEditorShortcuts'
import { useAgentSettingsStore } from '@/stores/agent-settings'
import {
  WORKFLOW_CANVAS_CONTEXT_KEY,
  type WorkflowCanvasContext,
} from './workflowCanvasContext'
import { WORKFLOW_EXEC_BAR_LAYOUT_KEY, type WorkflowExecBarLayout } from './workflowLayoutContext'
import { NODE_SIDEBAR_CONTEXT_KEY, type NodeSidebarContext } from './nodeSidebarContext'

const props = defineProps<{
  tab: Tab
  store: WorkflowStore
}>()

provideWorkflowStore(props.store)

const tabStore = useTabStore()
const store = props.store
const agentSettings = useAgentSettingsStore()
const notify = useNotification()
const listDialogOpen = ref(false)
const listDialogCreateMode = ref(false)
const nodeSelectOpen = ref(false)
const paneContextMenuPosition = ref<{ x: number; y: number } | null>(null)
const nodeInfoDialogOpen = ref(false)
const nodeInfoDialogNodeId = ref<string | null>(null)
const nodeInfoDialogHostNodeId = ref<string | null>(null)
const groupPickerDialogOpen = ref(false)
const groupPickerDialogNodeId = ref<string | null>(null)
const pluginsDialogOpen = ref(false)
const settingsDialogOpen = ref(false)
const pluginPickerOpen = ref(false)
const groupPanelVisible = ref(false)
const groupPanelX = computed(() => (typeof window !== 'undefined' ? window.innerWidth - 400 : 520))
const triggerDialogOpen = ref(false)
const FLOW_ID = `workflow-editor-flow-${props.tab.id}`

const {
  project,
  getViewport,
  setViewport,
  vueFlowRef,
  zoomIn,
  zoomOut,
  zoomTo,
  fitView,
  getSelectedNodes,
  getSelectedEdges,
  addSelectedNodes,
  nodesSelectionActive,
  getNodes,
} = useVueFlow(FLOW_ID)

const {
  onConnectStart,
  onConnectEnd,
  onNodeSelectFromDialog,
  resetConnectionDrop,
  markConnectSucceeded,
} = useConnectionDrop(store, project, vueFlowRef, nodeSelectOpen)

const {
  onEdgeInsertNode,
  onNodeSelectFromEdge,
  resetEdgeInsert,
  hasInsertContext,
} = useEdgeInsert(store, nodeSelectOpen)

const {
  nodes,
  edges,
  handleConnect,
  handleNodesInitialized,
  handleNodeDrag,
  handleNodeDragStop,
  syncScopeBoundaryLayout,
  helperLineHorizontal,
  helperLineVertical,
} = useFlowCanvas(store, FLOW_ID)

const {
  isEditingName,
  editingName,
  openWorkflow,
  startEditName,
  finishEditName,
  cancelEditName,
  saveWorkflow,
  exportWorkflow,
  importWorkflow,
  onListSelect,
} = useWorkflowFileActions(store, listDialogOpen)

function handleUpdateMetadata(data: { name: string; icon: string; description: string; tags: string[] }) {
  const wf = store.currentWorkflow
  if (!wf) return
  wf.name = data.name
  wf.icon = data.icon || undefined
  wf.description = data.description || undefined
  wf.tags = data.tags.length ? data.tags : undefined
  tabStore.updateTabWorkflow(tabStore.activeTabId!, wf.id, data.name)
  saveWorkflow()
}

const {
  copySelectedNodes,
  pasteClipboardNodes,
  deleteSelected,
} = useClipboard(store, {
  getSelectedNodes,
  getSelectedEdges,
  getNodes,
  addSelectedNodes,
  nodesSelectionActive,
})

const { handleKeyDown } = useEditorShortcuts(store, {
  saveWorkflow,
  copySelectedNodes,
  pasteClipboardNodes,
  deleteSelected,
  addSelectedNodes,
  getNodes,
  zoomIn,
  zoomOut,
  zoomTo,
})

const nodeTypes = { custom: markRaw(CustomNodeWrapper), group: markRaw(GroupNode) }
const edgeTypes = { custom: markRaw(CustomEdge) }

// ── Golden Layout 配置 ──────────────────────────────
const {
  loadLayout,
  saveLayout,
  resetToDefault,
  hasCustomLayout,
  presets,
  addPreset,
  deletePreset,
  applyPreset,
} = useEditorLayout(store)

const editorLayout = ref<LayoutConfig>(loadLayout())
const execBarExpanded = ref(false)
const layoutKey = ref(0) // 递增时强制重建 GoldenLayout，确保尺寸完全重置
const goldenLayoutRef = ref<InstanceType<typeof GoldenLayout> | null>(null)

const RIGHT_TAB_MAP: Record<string, string> = {
  properties: 'right-properties',
  version: 'right-version',
  operations: 'right-operations',
  'ai-assistant': 'right-assistant',
  staging: 'right-staging',
}

function activateRightPanelTab(tab: string) {
  const gl = goldenLayoutRef.value?.getLayout()
  if (!gl) return
  const componentType = RIGHT_TAB_MAP[tab]
  if (!componentType) return
  try {
    const items = gl.getAllContentItems?.() ?? []
    const target = items.find((item: any) => item.componentType === componentType)
    target?.select?.()
  } catch { /* layout may not be ready */ }
}

const componentRegistry: ComponentRegistry = {
  'node-sidebar': NodeSidebar,
  'flow-canvas': WorkflowCanvas,
  'right-panel': RightPanel,
  'right-properties': RightProperties,
  'right-version': RightVersion,
  'right-operations': RightOperations,
  'right-assistant': RightAssistant,
  'right-staging': RightStaging,
  'exec-bar': ExecutionBar,
}

function updateExecBarSize(size: '7%' | '45%') {
  function cloneItem(item: any): any {
    if (!item || typeof item !== 'object') return item

    const nextItem: Record<string, unknown> = { ...item }
    if (Array.isArray(item.content)) {
      nextItem.content = item.content.map(cloneItem)
    }
    if (
      item.type === 'stack'
      && Array.isArray(item.content)
      && item.content.some((child: any) => child?.type === 'component' && child.componentType === 'exec-bar')
    ) {
      nextItem.size = size
    }
    return nextItem
  }

  editorLayout.value = {
    ...editorLayout.value,
    root: cloneItem(editorLayout.value.root),
  }
}

const execBarLayout: WorkflowExecBarLayout = {
  getExpanded() {
    return execBarExpanded.value
  },
  setExpanded(expanded) {
    execBarExpanded.value = expanded
    updateExecBarSize(expanded ? '45%' : '7%')
  },
}

const canvasContext: WorkflowCanvasContext = {
  flowId: FLOW_ID,
  nodes,
  edges,
  nodeTypes,
  edgeTypes,
  connectionMode: ConnectionMode.Loose,
  nodesDraggable: computed(() => !store.isPreview),
  nodesConnectable: computed(() => !store.isPreview),
  edgesUpdatable: computed(() => !store.isPreview),
  minimapVisible: computed(() => agentSettings.minimapVisible),
  helperLineHorizontal,
  helperLineVertical,
  onConnect,
  onConnectStart,
  onConnectEnd,
  onDragOver,
  onDrop,
  onNodeClick,
  onNodeDrag: handleNodeDrag,
  onNodeDragStop: handleNodeDragStop,
  onPaneClick,
  onNodesInitialized: handleNodesInitialized,
  onEdgeInsertNode,
  syncScopeBoundaryLayout,
  fitView,
  getViewport,
  setViewport,
  openNodeSelectAtPosition,
  openNodeInfoDialog,
  openGroupPickerDialog,
}

const nodeSidebarContext: NodeSidebarContext = {
  openPluginPicker: () => { pluginPickerOpen.value = true },
}

const parentProvides: ProvideMap = [
  { key: WORKFLOW_STORE_KEY, value: props.store },
  { key: WORKFLOW_CANVAS_CONTEXT_KEY, value: canvasContext },
  { key: WORKFLOW_EXEC_BAR_LAYOUT_KEY, value: execBarLayout },
  { key: NODE_SIDEBAR_CONTEXT_KEY, value: nodeSidebarContext },
]

function onLayoutChange(config: LayoutConfig) {
  saveLayout(config)
}

function handleResetLayout() {
  editorLayout.value = resetToDefault()
  layoutKey.value++
}

const savePresetDialogOpen = ref(false)
const savePresetName = ref('')

function handleSavePreset() {
  savePresetName.value = ''
  savePresetDialogOpen.value = true
}

function confirmSavePreset() {
  const name = savePresetName.value.trim()
  if (!name) return
  addPreset(name, editorLayout.value)
  savePresetDialogOpen.value = false
}

function handleApplyPreset(id: string) {
  const layout = applyPreset(id)
  if (layout) editorLayout.value = layout
}

function handleDeletePreset(id: string) {
  deletePreset(id)
}

// 标签页切换时恢复布局
watch(() => props.tab.id, () => {
  editorLayout.value = loadLayout()
})

function onNodeSelectDialogClose(open: boolean) {
  nodeSelectOpen.value = open
  if (!open) {
    resetEdgeInsert()
    resetConnectionDrop()
    paneContextMenuPosition.value = null
  }
}

function openNodeSelectAtPosition(event: MouseEvent) {
  const bounds = vueFlowRef.value?.getBoundingClientRect()
  if (!bounds) return
  const flowPos = project({ x: event.clientX - bounds.left, y: event.clientY - bounds.top })
  paneContextMenuPosition.value = flowPos
  nodeSelectOpen.value = true
}

function onNodeSelectFromPane(type: string) {
  if (!paneContextMenuPosition.value || !store.currentWorkflow) return
  store.addNode(type, paneContextMenuPosition.value)
  paneContextMenuPosition.value = null
}

function openNodeInfoDialog(nodeId: string, options?: { hostNodeId?: string }) {
  nodeInfoDialogNodeId.value = nodeId
  nodeInfoDialogHostNodeId.value = options?.hostNodeId ?? null
  nodeInfoDialogOpen.value = true
}

function openGroupPickerDialog(nodeId: string) {
  groupPickerDialogNodeId.value = nodeId
  groupPickerDialogOpen.value = true
}

function handleAddToGroup(groupId: string) {
  if (!groupPickerDialogNodeId.value) return
  store.addNodesToGroup(groupId, [groupPickerDialogNodeId.value])
  groupPickerDialogOpen.value = false
}

function getNodeInfoTarget(): { node: WorkflowNode; hostNodeId: string | null } | null {
  const nodeId = nodeInfoDialogNodeId.value
  if (!nodeId) return null

  const hostNodeId = nodeInfoDialogHostNodeId.value
  if (hostNodeId) {
    const hostNode = store.currentWorkflow?.nodes.find((n) => n.id === hostNodeId)
    const embeddedNode = hostNode?.data?.bodyWorkflow?.nodes?.find((n: WorkflowNode) => n.id === nodeId)
    return embeddedNode ? { node: embeddedNode, hostNodeId } : null
  }

  const node = store.currentWorkflow?.nodes.find((n) => n.id === nodeId)
  return node ? { node, hostNodeId: null } : null
}

function buildNodeInfoData() {
  const target = getNodeInfoTarget()
  if (!target) return {}
  const { node, hostNodeId } = target
  const nodeId = node.id
  const step = store.executionLog?.steps.find((s) => s.nodeId === nodeId)
  const definition = getNodeDefinition(node.type)
  return {
    id: nodeId,
    embeddedInNodeId: hostNodeId,
    type: node.type,
    label: node.label || definition?.label || node.type,
    nodeState: node.nodeState || 'normal',
    definition: { type: definition?.type, icon: definition?.icon, category: definition?.category },
    data: node.data,
    execution: step
      ? { status: step.status, startedAt: step.startedAt, finishedAt: step.finishedAt, input: step.input, output: step.output, error: step.error, logs: step.logs }
      : null,
  }
}

async function copyNodeInfo() {
  if (!nodeInfoDialogNodeId.value) return
  const data = buildNodeInfoData()
  await navigator.clipboard.writeText(JSON.stringify(data, null, 2))
}

function onNodeClick({ node, event }: any) {
  const nodeId = node?.id
  if (!nodeId) return
  if (event?.shiftKey || event?.metaKey) {
    const ids = [...store.selectedNodeIds]
    const idx = ids.indexOf(nodeId)
    if (idx >= 0) ids.splice(idx, 1)
    else ids.push(nodeId)
    store.selectedNodeIds = ids
  } else {
    store.selectedNodeIds = [nodeId]
  }
  store.selectedEmbeddedNode = null
  store.rightPanelTab = 'properties'
  activateRightPanelTab('properties')
}

function onPaneClick() {
  store.selectedNodeIds = []
  store.selectedEmbeddedNode = null
}

function onDragOver(event: DragEvent) {
  event.preventDefault()
  if (store.isPreview) return
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move'
  }
}

function onDrop(event: DragEvent) {
  if (store.isPreview) return
  addNodeFromDropEvent(event)
}

function hasWorkflowNodeDrag(event: DragEvent) {
  return Array.from(event.dataTransfer?.types ?? []).includes(WORKFLOW_NODE_DRAG_MIME)
}

function isDropInsideCanvas(event: DragEvent) {
  const bounds = vueFlowRef.value?.getBoundingClientRect()
  if (!bounds) return false
  return (
    event.clientX >= bounds.left
    && event.clientX <= bounds.right
    && event.clientY >= bounds.top
    && event.clientY <= bounds.bottom
  )
}

function onLayoutDragOver(event: DragEvent) {
  const target = event.target as HTMLElement | null
  if (target?.closest?.('[data-embedded-workflow="true"]')) return
  if (store.isPreview || !hasWorkflowNodeDrag(event) || !isDropInsideCanvas(event)) return
  event.preventDefault()
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move'
  }
}

function onLayoutDrop(event: DragEvent) {
  const target = event.target as HTMLElement | null
  if (target?.closest?.('[data-embedded-workflow="true"]')) return
  if (store.isPreview || !hasWorkflowNodeDrag(event) || !isDropInsideCanvas(event)) return
  event.preventDefault()
  event.stopPropagation()
  addNodeFromDropEvent(event)
}

function addNodeFromDropEvent(event: DragEvent) {
  const type = event.dataTransfer?.getData(WORKFLOW_NODE_DRAG_MIME)
  if (!type) return
  if (!store.canCreateNode(type)) {
    const def = getNodeDefinition(type)
    notify.warning(`${def?.label ?? type} 节点已存在，同一工作流中只能有一个`)
    return
  }
  const bounds = vueFlowRef.value?.getBoundingClientRect()
  if (!bounds) return
  const position = project({
    x: event.clientX - bounds.left,
    y: event.clientY - bounds.top,
  })
  const scopeNode = findDropLoopBodyScope(position)
  store.addNode(type, position, scopeNode ? { scopeNodeId: scopeNode.id } : undefined)
  if (scopeNode) {
    syncScopeBoundaryLayout(scopeNode.id)
  }
}

function findDropLoopBodyScope(position: { x: number; y: number }): WorkflowNode | null {
  const workflow = store.currentWorkflow
  if (!workflow) return null

  const loopBodies = workflow.nodes.filter((node) => node.type === LOOP_BODY_NODE_TYPE)
  for (let i = loopBodies.length - 1; i >= 0; i--) {
    const node = loopBodies[i]
    const absoluteX = node.position.x
    const absoluteY = node.position.y
    const width = Number(node.data?.width || 520)
    const height = Number(node.data?.height || 260)
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

const recentWorkflows = computed(() =>
  [...store.workflows]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 10)
    .map(wf => ({ id: wf.id, name: wf.name, updatedAt: wf.updatedAt })),
)

const hasTriggers = computed(() =>
  (store.currentWorkflow?.triggers?.length ?? 0) > 0
)

const router = useRouter()

function goHome() {
  router.push('/home')
}

function retryLoad() {
  const workflowId = props.tab.workflowId
  if (!workflowId) { goHome(); return }
  store.loadState = 'loading'
  store.loadError = null

  const MAX_RETRIES = 5
  let attempt = 0

  function tryLoad(): Promise<void> {
    return store.loadData().then(() => {
      const wf = store.workflows.find(w => w.id === workflowId)
      if (!wf) {
        store.loadState = 'error'
        store.loadError = '工作流不存在或已被删除'
        return
      }
      store.loadState = 'loaded'
      store.currentWorkflow = JSON.parse(JSON.stringify(wf))
    }).catch((err: unknown) => {
      attempt++
      if (attempt < MAX_RETRIES) {
        return new Promise<void>(resolve => setTimeout(resolve, 1000)).then(tryLoad)
      }
      store.loadState = 'error'
      store.loadError = err instanceof Error ? err.message : '加载工作流失败'
    })
  }

  void tryLoad()
}

function openRecentWorkflow(id: string) {
  const wf = store.workflows.find(w => w.id === id)
  if (wf) {
    store.currentWorkflow = JSON.parse(JSON.stringify(wf))
    store.selectedNodeIds = []
  }
}

function openWorkflowList(createMode = false) {
  listDialogCreateMode.value = createMode
  openWorkflow()
}

function onWorkflowListOpenChange(open: boolean) {
  listDialogOpen.value = open
  if (!open && !store.currentWorkflow) {
    tabStore.closeTab(props.tab.id)
    router.push('/home')
  }
}

function onWorkflowListCancel() {
  if (store.currentWorkflow) return
  tabStore.closeTab(props.tab.id)
  router.push('/home')
}

async function handlePluginUpdate(plugins: string[]) {
  if (!store.currentWorkflow) return
  store.currentWorkflow.enabledPlugins = plugins
  await saveWorkflow()
}

// 跳过首次加载的变更检测
let skipDraft = true
watch(() => store.currentWorkflow, (val) => {
  tabStore.updateTabWorkflow(props.tab.id, val?.id ?? null, val?.name || '')
  if (skipDraft) { skipDraft = false; return }
  if (val) store.markDirty()
}, { deep: true, immediate: true })

// 定时自动保存：10秒内有变更则保存
let cleanupFileUpdates: (() => void) | null = null
let cleanupWorkflowToolRequests: (() => void) | null = null
let autoSaveTimer: ReturnType<typeof setInterval> | null = null
let cleanupTableConfirm: (() => void) | null = null

function onEmbeddedSetViewport(event: Event) {
  const viewport = (event as CustomEvent<{ x: number; y: number; zoom: number }>).detail
  if (!viewport) return
  void setViewport(viewport)
}

onMounted(() => {
  window.addEventListener('workflow:embedded-set-viewport', onEmbeddedSetViewport)
  agentSettings.init()
  cleanupFileUpdates = store.listenForFileUpdates()
  cleanupWorkflowToolRequests = store.listenForWorkflowToolRequests()
  cleanupTableConfirm = store.listenForUIInteractions()
  autoSaveTimer = setInterval(() => {
    if (store.isDirty && store.currentWorkflow) {
      saveWorkflow()
    }
  }, 10_000)
})
onUnmounted(() => {
  window.removeEventListener('workflow:embedded-set-viewport', onEmbeddedSetViewport)
  cleanupFileUpdates?.()
  cleanupWorkflowToolRequests?.()
  cleanupTableConfirm?.()
  if (autoSaveTimer) clearInterval(autoSaveTimer)
})

function onConnect(params: any) {
  if (store.isPreview) return
  markConnectSucceeded()
  handleConnect(params)
}
</script>

<template>
  <div
    class="flex flex-col h-full min-h-0 bg-background overflow-hidden"
    tabindex="0"
    @keydown="handleKeyDown"
  >
    <EditorToolbar
      :is-editing-name="isEditingName"
      :editing-name="editingName"
      :workflow-name="store.currentWorkflow?.name || ''"
      :workflow-icon="store.currentWorkflow?.icon"
      :workflow-description="store.currentWorkflow?.description"
      :workflow-tags="store.currentWorkflow?.tags"
      :hide-tab-switcher="!store.currentWorkflow"
      :is-dirty="store.isDirty"
      :has-triggers="hasTriggers"
      :recent-workflows="recentWorkflows"
      :has-custom-layout="hasCustomLayout"
      :layout-presets="presets"
      @new="openWorkflowList(true)"
      @open="openWorkflowList(false)"
      @save="saveWorkflow"
      @export="exportWorkflow"
      @import="importWorkflow"
      @update:editing-name="editingName = $event"
      @start-edit-name="startEditName"
      @finish-edit-name="finishEditName"
      @cancel-edit-name="cancelEditName"
      @open-settings="settingsDialogOpen = true"
      @open-recent="openRecentWorkflow"
      @open-triggers="triggerDialogOpen = true"
      @reset-layout="handleResetLayout"
      @save-preset="handleSavePreset"
      @apply-preset="handleApplyPreset"
      @delete-preset="handleDeletePreset"
      @update-metadata="handleUpdateMetadata"
    />

    <div
      v-if="store.currentWorkflow"
      class="flex flex-1 min-h-0"
    >
      <ActivityBar
        @go-home="goHome"
        @open-plugins="pluginsDialogOpen = true"
        @open-settings="settingsDialogOpen = true"
      />

      <div
        class="relative flex-1 min-h-0"
        @dragover.capture="onLayoutDragOver"
        @drop.capture="onLayoutDrop"
      >
        <GoldenLayout
          ref="goldenLayoutRef"
          :key="layoutKey"
          :config="editorLayout"
          :registry="componentRegistry"
          :provides="parentProvides"
          class="absolute inset-0 z-10"
          @layout-change="onLayoutChange"
        />
      </div>

      <EditorRightBar @toggle-group-panel="groupPanelVisible = !groupPanelVisible" />
    </div>

    <Empty v-else-if="store.loadState === 'loading'" class="flex-1">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Spinner class="size-8" />
        </EmptyMedia>
        <EmptyTitle>加载工作流中</EmptyTitle>
        <EmptyDescription>正在加载工作流数据，请稍候...</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="outline" size="sm" @click="goHome">
          返回主页
        </Button>
      </EmptyContent>
    </Empty>

    <Empty v-else-if="store.loadState === 'error'" class="flex-1">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <AlertCircle class="size-8 text-destructive" />
        </EmptyMedia>
        <EmptyTitle>加载失败</EmptyTitle>
        <EmptyDescription>{{ store.loadError || '未知错误' }}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent class="flex gap-2">
        <Button variant="outline" size="sm" @click="goHome">
          返回主页
        </Button>
        <Button variant="outline" size="sm" @click="retryLoad">
          重试
        </Button>
      </EmptyContent>
    </Empty>

    <Empty v-else class="flex-1">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <AlertCircle class="size-8 text-muted-foreground" />
        </EmptyMedia>
        <EmptyTitle>未选择工作流</EmptyTitle>
        <EmptyDescription>请选择已有工作流，或新建一个工作流开始编辑。</EmptyDescription>
      </EmptyHeader>
      <EmptyContent class="flex gap-2">
        <Button variant="outline" size="sm" @click="openWorkflowList(true)">
          新建工作流
        </Button>
        <Button variant="outline" size="sm" @click="openWorkflowList(false)">
          打开工作流
        </Button>
        <Button variant="ghost" size="sm" @click="goHome">
          返回主页
        </Button>
      </EmptyContent>
    </Empty>

    <WorkflowListDialog
      :open="listDialogOpen"
      :create-mode="listDialogCreateMode"
      @update:open="onWorkflowListOpenChange"
      @cancel="onWorkflowListCancel"
      @select="onListSelect"
    />

    <NodeSelectDialog
      :open="nodeSelectOpen"
      @update:open="onNodeSelectDialogClose"
      @select="hasInsertContext() ? onNodeSelectFromEdge($event) : paneContextMenuPosition ? onNodeSelectFromPane($event) : onNodeSelectFromDialog($event)"
    />

    <PluginsDialog
      :open="pluginsDialogOpen"
      @update:open="pluginsDialogOpen = $event"
    />
    <SettingsDialog
      :open="settingsDialogOpen"
      initial-tab="agent"
      @update:open="settingsDialogOpen = $event"
    />
    <PluginPickerDialog
      v-if="store.currentWorkflow"
      :open="pluginPickerOpen"
      :enabled-plugins="store.currentWorkflow.enabledPlugins || []"
      @update:open="pluginPickerOpen = $event"
      @update:enabled-plugins="handlePluginUpdate($event)"
    />

    <!-- 节点信息对话框（从右键菜单触发） -->
    <Dialog :open="nodeInfoDialogOpen" @update:open="nodeInfoDialogOpen = $event">
      <DialogContent class="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>节点信息</DialogTitle>
        </DialogHeader>
        <div class="flex-1 overflow-auto">
          <JsonEditor
            v-if="nodeInfoDialogNodeId"
            :model-value="buildNodeInfoData()"
            :readonly="true"
            :height="400"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" @click="copyNodeInfo">
            <Copy class="w-4 h-4 mr-1" />
            复制 JSON
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- 加入分组对话框（从右键菜单触发） -->
    <Dialog :open="groupPickerDialogOpen" @update:open="groupPickerDialogOpen = $event">
      <DialogContent class="max-w-sm">
        <DialogHeader>
          <DialogTitle>加入分组</DialogTitle>
        </DialogHeader>
        <div class="space-y-1 max-h-60 overflow-auto">
          <button
            v-for="group in store.currentWorkflow?.groups || []"
            :key="group.id"
            class="w-full text-left px-3 py-2 rounded-md hover:bg-accent text-sm transition-colors"
            @click="handleAddToGroup(group.id)"
          >
            {{ group.name }}
            <span class="text-muted-foreground ml-1">({{ group.childNodeIds.length }})</span>
          </button>
          <div v-if="!(store.currentWorkflow?.groups || []).length" class="text-sm text-muted-foreground py-4 text-center">
            暂无分组
          </div>
        </div>
      </DialogContent>
    </Dialog>

    <!-- 分组管理面板 -->
    <FloatingPanel
      id="group-manage"
      v-model:visible="groupPanelVisible"
      title="分组管理"
      :x="groupPanelX"
      :y="80"
      :width="320"
      :height="340"
    >
      <GroupManagePanel />
    </FloatingPanel>

    <!-- 保存布局预设 Dialog -->
    <Dialog :open="savePresetDialogOpen" @update:open="savePresetDialogOpen = $event">
      <DialogContent class="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>保存布局预设</DialogTitle>
        </DialogHeader>
        <div class="py-2">
          <Input
            v-model="savePresetName"
            placeholder="输入预设名称"
            autofocus
            @keydown.enter="confirmSavePreset"
          />
        </div>
        <DialogFooter class="gap-2">
          <DialogClose as-child>
            <Button variant="outline" size="sm">取消</Button>
          </DialogClose>
          <Button size="sm" :disabled="!savePresetName.trim()" @click="confirmSavePreset">
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- 触发器设置 Dialog -->
    <TriggerSettingsDialog
      v-if="store.currentWorkflow"
      :workflow-id="store.currentWorkflow.id"
      :open="triggerDialogOpen"
      @update:open="triggerDialogOpen = $event"
    />
  </div>
</template>
