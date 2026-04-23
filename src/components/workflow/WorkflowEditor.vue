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
import { provideWorkflowStore, type WorkflowStore } from '@/stores/workflow'
import { useTabStore, type Tab } from '@/stores/tab'
import CustomNodeWrapper from './CustomNodeWrapper.vue'
import CustomEdge from './CustomEdge.vue'
import WorkflowCanvas from './WorkflowCanvas.vue'
import NodeSidebar from './NodeSidebar.vue'
import RightPanel from './RightPanel.vue'
import ExecutionBar from './ExecutionBar.vue'
import WorkflowListDialog from './WorkflowListDialog.vue'
import NodeSelectDialog from './NodeSelectDialog.vue'
import EditorToolbar from './EditorToolbar.vue'
import PluginsDialog from '@/components/plugins/PluginsDialog.vue'
import SettingsDialog from '@/components/settings/SettingsDialog.vue'
import PluginPickerDialog from './PluginPickerDialog.vue'

import { useConnectionDrop } from '@/composables/workflow/useConnectionDrop'
import { useEdgeInsert } from '@/composables/workflow/useEdgeInsert'
import { useExecutionPanel } from '@/composables/workflow/useExecutionPanel'
import { useFlowCanvas } from '@/composables/workflow/useFlowCanvas'
import { useWorkflowFileActions } from '@/composables/workflow/useWorkflowFileActions'
import { useClipboard } from '@/composables/workflow/useClipboard'
import { useEditorShortcuts } from '@/composables/workflow/useEditorShortcuts'
import { useAgentSettingsStore } from '@/stores/agent-settings'
import {
  WORKFLOW_CANVAS_CONTEXT_KEY,
  type WorkflowCanvasContext,
} from './workflowCanvasContext'

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
  executionBarExpanded,
} = useExecutionPanel()

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
} = useEditorLayout(store)

const editorLayout = ref<LayoutConfig>(loadLayout())

const componentRegistry: ComponentRegistry = {
  'node-sidebar': NodeSidebar,
  'flow-canvas': WorkflowCanvas,
  'right-panel': RightPanel,
  'exec-bar': ExecutionBar,
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

const parentProvides: ProvideMap = [
  { key: WORKFLOW_STORE_KEY, value: props.store },
  { key: WORKFLOW_CANVAS_CONTEXT_KEY, value: canvasContext },
]

function onLayoutChange(config: LayoutConfig) {
  saveLayout(config)
}

function handleResetLayout() {
  editorLayout.value = resetToDefault()
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
  store.rightPanelTab = 'properties'
}

function onPaneClick() {
  store.selectedNodeIds = []
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
  const type = event.dataTransfer?.getData('application/vueflow')
  if (!type) return
  const bounds = vueFlowRef.value?.getBoundingClientRect()
  if (!bounds) return
  const position = project({
    x: event.clientX - bounds.left,
    y: event.clientY - bounds.top,
  })
  store.addNode(type, position)
}

const enabledPlugins = computed(() => store.currentWorkflow?.enabledPlugins || [])

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
onMounted(() => {
  agentSettings.init()
  cleanupFileUpdates = store.listenForFileUpdates()
  cleanupWorkflowToolRequests = store.listenForWorkflowToolRequests()
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
  cleanupFileUpdates?.()
  cleanupWorkflowToolRequests?.()
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
    />

    <div v-if="store.currentWorkflow" class="relative flex-1 min-h-0">
      <!-- Golden Layout：画布作为真实面板挂载，避免透明覆盖层拦截事件 -->
      <GoldenLayout
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
  </div>
</template>
