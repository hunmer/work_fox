<script setup lang="ts">
import { ref, markRaw, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { provideWorkflowStore, type WorkflowStore } from '@/stores/workflow'
import { useTabStore, type Tab } from '@/stores/tab'
import CustomNodeWrapper from './CustomNodeWrapper.vue'
import CustomEdge from './CustomEdge.vue'
import WorkflowCanvas from './WorkflowCanvas.vue'
import NodeSidebar from './NodeSidebar.vue'
import RightPanel from './RightPanel.vue'
import RightProperties from './RightProperties.vue'
import RightVersion from './RightVersion.vue'
import RightOperations from './RightOperations.vue'
import RightAssistant from './RightAssistant.vue'
import ExecutionBar from './ExecutionBar.vue'
import WorkflowListDialog from './WorkflowListDialog.vue'
import NodeSelectDialog from './NodeSelectDialog.vue'
import EditorToolbar from './EditorToolbar.vue'
import PluginsDialog from '@/components/plugins/PluginsDialog.vue'
import SettingsDialog from '@/components/settings/SettingsDialog.vue'
import PluginPickerDialog from './PluginPickerDialog.vue'
import { WORKFLOW_NODE_DRAG_MIME } from './dragDrop'

import { useConnectionDrop } from '@/composables/workflow/useConnectionDrop'
import { useEdgeInsert } from '@/composables/workflow/useEdgeInsert'
import { useFlowCanvas } from '@/composables/workflow/useFlowCanvas'
import { useWorkflowFileActions } from '@/composables/workflow/useWorkflowFileActions'
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
const listDialogOpen = ref(false)
const listDialogCreateMode = ref(false)
const nodeSelectOpen = ref(false)
const pluginsDialogOpen = ref(false)
const settingsDialogOpen = ref(false)
const pluginPickerOpen = ref(false)
const FLOW_ID = `workflow-editor-flow-${props.tab.id}`

const {
  project,
  setViewport,
  vueFlowRef,
  zoomIn,
  zoomOut,
  zoomTo,
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

const nodeTypes = { custom: markRaw(CustomNodeWrapper) }
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
  onConnect,
  onConnectStart,
  onConnectEnd,
  onDragOver,
  onDrop,
  onNodeClick,
  onPaneClick,
  onNodesInitialized: handleNodesInitialized,
  onEdgeInsertNode,
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
  }
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
  const bounds = vueFlowRef.value?.getBoundingClientRect()
  if (!bounds) return
  const position = project({
    x: event.clientX - bounds.left,
    y: event.clientY - bounds.top,
  })
  store.addNode(type, position)
}

const recentWorkflows = computed(() =>
  [...store.workflows]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 10)
    .map(wf => ({ id: wf.id, name: wf.name, updatedAt: wf.updatedAt })),
)

const router = useRouter()
const route = useRoute()

function goHome() {
  router.push('/home')
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
  if (!store.currentWorkflow) {
    openWorkflowList(route.query.create === '1')
  }
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
      :hide-tab-switcher="!store.currentWorkflow"
      :is-dirty="store.isDirty"
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
      @open-plugins="pluginsDialogOpen = true"
      @open-settings="settingsDialogOpen = true"
      @go-home="goHome"
      @open-recent="openRecentWorkflow"
      @reset-layout="handleResetLayout"
      @save-preset="handleSavePreset"
      @apply-preset="handleApplyPreset"
      @delete-preset="handleDeletePreset"
    />

    <div
      v-if="store.currentWorkflow"
      class="relative flex-1 min-h-0"
      @dragover.capture="onLayoutDragOver"
      @drop.capture="onLayoutDrop"
    >
      <!-- Golden Layout：画布作为真实面板挂载，避免透明覆盖层拦截事件 -->
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

    <Empty v-else class="flex-1">
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
      @select="hasInsertContext() ? onNodeSelectFromEdge($event) : onNodeSelectFromDialog($event)"
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
  </div>
</template>
