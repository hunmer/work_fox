<script setup lang="ts">
import { ref, markRaw, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { VueFlow, useVueFlow, ConnectionMode } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { MiniMap } from '@vue-flow/minimap'
import { Controls } from '@vue-flow/controls'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import '@vue-flow/controls/dist/style.css'
import '@vue-flow/minimap/dist/style.css'
import '@vue-flow/node-resizer/dist/style.css'

import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable'
import { provideWorkflowStore, type WorkflowStore } from '@/stores/workflow'
import { useTabStore, type Tab } from '@/stores/tab'
import CustomNodeWrapper from './CustomNodeWrapper.vue'
import CustomEdge from './CustomEdge.vue'
import NodeSidebar from './NodeSidebar.vue'
import RightPanel from './RightPanel.vue'
import ExecutionBar from './ExecutionBar.vue'
import WorkflowListDialog from './WorkflowListDialog.vue'
import NodeSelectDialog from './NodeSelectDialog.vue'
import EditorToolbar from './EditorToolbar.vue'
import CanvasToolbar from './CanvasToolbar.vue'
import PluginsDialog from '@/components/plugins/PluginsDialog.vue'
import SettingsDialog from '@/components/settings/SettingsDialog.vue'
import PluginPickerDialog from './PluginPickerDialog.vue'

import { useConnectionDrop } from '@/composables/workflow/useConnectionDrop'
import { useEdgeInsert } from '@/composables/workflow/useEdgeInsert'
import { useExecutionPanel } from '@/composables/workflow/useExecutionPanel'
import { usePanelSizes } from '@/composables/workflow/usePanelSizes'
import { useFlowCanvas } from '@/composables/workflow/useFlowCanvas'
import { useWorkflowFileActions } from '@/composables/workflow/useWorkflowFileActions'
import { useClipboard } from '@/composables/workflow/useClipboard'
import { useEditorShortcuts } from '@/composables/workflow/useEditorShortcuts'

const props = defineProps<{
  tab: Tab
  store: WorkflowStore
}>()

provideWorkflowStore(props.store)

const tabStore = useTabStore()
const store = props.store
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
  execPanelSizes,
  execPanelRef,
  onExecBarResize,
} = useExecutionPanel()

const { panelSizes, handlePanelResize } = usePanelSizes()

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

function onNodeSelectDialogClose(open: boolean) {
  nodeSelectOpen.value = open
  if (!open) {
    resetEdgeInsert()
    resetConnectionDrop()
  }
}

function onNodeClick({ node }: any) {
  store.selectedNodeId = node?.id || null
}

function onPaneClick() {
  store.selectedNodeId = null
}

function onDragOver(event: DragEvent) {
  event.preventDefault()
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move'
  }
}

function onDrop(event: DragEvent) {
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
    store.selectedNodeId = null
  }
}

function openWorkflowList(createMode = false) {
  listDialogCreateMode.value = createMode
  openWorkflow()
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
  if (val) store.saveDraft()
}, { deep: true, immediate: true })

// 定时自动保存：10秒内有变更则保存
let cleanupFileUpdates: (() => void) | null = null
let cleanupWorkflowToolRequests: (() => void) | null = null
let autoSaveTimer: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  cleanupFileUpdates = store.listenForFileUpdates()
  cleanupWorkflowToolRequests = store.listenForWorkflowToolRequests()
  if ((route.query.open === '1' || route.query.create === '1') && !store.currentWorkflow) {
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
    />

    <ResizablePanelGroup
      v-if="store.currentWorkflow"
      direction="vertical"
      @layout="onExecBarResize"
    >
        <ResizablePanel
          :default-size="execPanelSizes[0]"
          :min-size="40"
        >
          <ResizablePanelGroup
            direction="horizontal"
            class="h-full overflow-hidden"
            @layout="handlePanelResize"
          >
            <ResizablePanel
              :default-size="panelSizes[0]"
              :min-size="10"
              :max-size="35"
            >
              <NodeSidebar
                :enabled-plugins="enabledPlugins"
                @open-plugin-picker="pluginPickerOpen = true"
              />
            </ResizablePanel>

            <ResizableHandle with-handle />

            <ResizablePanel
              :default-size="panelSizes[1]"
              :min-size="30"
              class="relative"
            >
              <VueFlow
                :id="FLOW_ID"
                :nodes="nodes"
                :edges="edges"
                :node-types="nodeTypes"
                :edge-types="edgeTypes"
                :min-zoom="0.2"
                :max-zoom="4"
                :connection-mode="ConnectionMode.Loose"
                class="h-full"
                @connect="onConnect"
                @connect-start="onConnectStart"
                @connect-end="onConnectEnd"
                @dragover="onDragOver"
                @drop="onDrop"
                @node-click="onNodeClick"
                @nodes-initialized="handleNodesInitialized as any"
                @pane-click="onPaneClick"
              >
                <Background />
                <MiniMap />
                <template #edge-custom="edgeProps">
                  <CustomEdge
                    v-bind="edgeProps"
                    @insert-node="onEdgeInsertNode"
                  />
                </template>
                <Controls />
              </VueFlow>

              <CanvasToolbar />
            </ResizablePanel>

            <ResizableHandle with-handle />

            <ResizablePanel
              :default-size="panelSizes[2]"
              :min-size="15"
              :max-size="50"
            >
              <RightPanel />
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>

        <ResizableHandle
          v-if="executionBarExpanded"
          with-handle
        />

        <ResizablePanel
          ref="execPanelRef"
          :collapsible="!executionBarExpanded"
          :collapsed-size="4"
          :default-size="executionBarExpanded ? execPanelSizes[1] : 4"
          :min-size="executionBarExpanded ? 15 : 4"
          :max-size="executionBarExpanded ? 60 : 4"
        >
          <ExecutionBar v-model:expanded="executionBarExpanded" />
        </ResizablePanel>
      </ResizablePanelGroup>

    <WorkflowListDialog
      :open="listDialogOpen"
      :create-mode="listDialogCreateMode"
      @update:open="listDialogOpen = $event"
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
