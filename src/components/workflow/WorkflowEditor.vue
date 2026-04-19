<script setup lang="ts">
import { ref, markRaw, watch, onMounted, onUnmounted } from 'vue'
import { VueFlow, useVueFlow, ConnectionMode } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { MiniMap } from '@vue-flow/minimap'
import { Controls } from '@vue-flow/controls'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import '@vue-flow/controls/dist/style.css'
import '@vue-flow/minimap/dist/style.css'
import '@vue-flow/node-resizer/dist/style.css'

import {
  Menubar,
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
} from '@/components/ui/menubar'
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable'
import { useWorkflowStore } from '@/stores/workflow'
import CustomNodeWrapper from './CustomNodeWrapper.vue'
import CustomEdge from './CustomEdge.vue'
import NodeSidebar from './NodeSidebar.vue'
import RightPanel from './RightPanel.vue'
import ExecutionBar from './ExecutionBar.vue'
import WorkflowListDialog from './WorkflowListDialog.vue'
import NodeSelectDialog from './NodeSelectDialog.vue'
import { Plus, FolderOpen, Import, RotateCcw, RotateCw } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

import { useConnectionDrop } from '@/composables/workflow/useConnectionDrop'
import { useEdgeInsert } from '@/composables/workflow/useEdgeInsert'
import { useExecutionPanel } from '@/composables/workflow/useExecutionPanel'
import { usePanelSizes } from '@/composables/workflow/usePanelSizes'
import { useFlowCanvas } from '@/composables/workflow/useFlowCanvas'
import { useWorkflowFileActions } from '@/composables/workflow/useWorkflowFileActions'
import { useClipboard } from '@/composables/workflow/useClipboard'
import { useEditorShortcuts } from '@/composables/workflow/useEditorShortcuts'

const store = useWorkflowStore()
const listDialogOpen = ref(false)
const nodeSelectOpen = ref(false)
const FLOW_ID = 'workflow-editor-flow'

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

// 连线放手添加节点
const {
  onConnectStart,
  onConnectEnd,
  onNodeSelectFromDialog,
  resetConnectionDrop,
  markConnectSucceeded,
} = useConnectionDrop(project, vueFlowRef, nodeSelectOpen)

// 边加号插入节点
const {
  onEdgeInsertNode,
  onNodeSelectFromEdge,
  resetEdgeInsert,
  hasInsertContext,
} = useEdgeInsert()

// 执行面板
const {
  executionBarExpanded,
  savedExecPanelSize,
  execPanelRef,
  onExecBarResize,
} = useExecutionPanel()

// 面板尺寸
const { panelSizes, handlePanelResize } = usePanelSizes()

// 画布
const {
  nodes,
  edges,
  handleConnect,
  handleNodesInitialized,
} = useFlowCanvas(FLOW_ID)

// 文件操作
const {
  isEditingName,
  editingName,
  nameInput,
  openWorkflow,
  startEditName,
  finishEditName,
  cancelEditName,
  saveWorkflow,
  exportWorkflow,
  importWorkflow,
  onListSelect,
} = useWorkflowFileActions(listDialogOpen)

// 复制/粘贴
const {
  copySelectedNodes,
  pasteClipboardNodes,
  deleteSelected,
} = useClipboard({
  getSelectedNodes,
  getSelectedEdges,
  getNodes,
  addSelectedNodes,
  nodesSelectionActive,
})

// 快捷键
const { handleKeyDown } = useEditorShortcuts({
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

// 自动保存草稿
watch(() => store.currentWorkflow, (val) => {
  if (val) store.saveDraft()
}, { deep: true })

// 文件更新监听
let cleanupFileUpdates: (() => void) | null = null
onMounted(() => {
  cleanupFileUpdates = store.listenForFileUpdates()
})
onUnmounted(() => {
  cleanupFileUpdates?.()
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
    <!-- 顶部菜单栏 -->
    <div class="flex items-center border-b border-border px-2 py-1">
      <Menubar class="border-0 bg-transparent h-7">
        <MenubarMenu>
          <MenubarTrigger class="text-xs h-6 px-2">
            文件
          </MenubarTrigger>
          <MenubarContent>
            <MenubarItem
              class="text-xs"
              @click="store.newWorkflow()"
            >
              新建
            </MenubarItem>
            <MenubarItem
              class="text-xs"
              @click="openWorkflow"
            >
              打开...
            </MenubarItem>
            <MenubarItem
              v-if="store.currentWorkflow"
              class="text-xs"
              @click="saveWorkflow"
            >
              保存
            </MenubarItem>
            <MenubarItem
              v-if="store.currentWorkflow"
              class="text-xs"
              @click="exportWorkflow"
            >
              导出...
            </MenubarItem>
            <MenubarItem
              class="text-xs"
              @click="importWorkflow"
            >
              导入...
            </MenubarItem>
          </MenubarContent>
        </MenubarMenu>
      </Menubar>
      <input
        v-if="isEditingName"
        ref="nameInput"
        v-model="editingName"
        class="ml-3 text-xs bg-transparent border border-border rounded px-1 py-0.5 outline-none focus:border-primary w-40"
        @blur="finishEditName"
        @keydown.enter="finishEditName"
        @keydown.escape="cancelEditName"
      >
      <span
        v-else
        class="ml-3 text-xs text-muted-foreground truncate cursor-pointer hover:text-foreground"
        @dblclick="startEditName"
      >
        {{ store.currentWorkflow?.name || '未命名工作流' }}
      </span>
    </div>

    <!-- 欢迎页 -->
    <div
      v-if="!store.currentWorkflow"
      class="flex-1 flex items-center justify-center"
    >
      <div class="flex gap-8">
        <button
          class="group flex flex-col items-center gap-4 p-8 rounded-xl border-2 border-dashed border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50 transition-all cursor-pointer w-52"
          @click="store.newWorkflow()"
        >
          <div class="p-4 rounded-full bg-muted group-hover:bg-primary/10 transition-colors">
            <Plus class="w-8 h-8 text-muted-foreground group-hover:text-primary transition-colors" />
          </div>
          <span class="text-base font-medium">新建工作流</span>
          <span class="text-xs text-muted-foreground text-center">从空白画布开始创建</span>
        </button>

        <button
          class="group flex flex-col items-center gap-4 p-8 rounded-xl border-2 border-dashed border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50 transition-all cursor-pointer w-52"
          @click="openWorkflow"
        >
          <div class="p-4 rounded-full bg-muted group-hover:bg-primary/10 transition-colors">
            <FolderOpen class="w-8 h-8 text-muted-foreground group-hover:text-primary transition-colors" />
          </div>
          <span class="text-base font-medium">打开工作流</span>
          <span class="text-xs text-muted-foreground text-center">浏览并打开已有工作流</span>
        </button>

        <button
          class="group flex flex-col items-center gap-4 p-8 rounded-xl border-2 border-dashed border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50 transition-all cursor-pointer w-52"
          @click="importWorkflow"
        >
          <div class="p-4 rounded-full bg-muted group-hover:bg-primary/10 transition-colors">
            <Import class="w-8 h-8 text-muted-foreground group-hover:text-primary transition-colors" />
          </div>
          <span class="text-base font-medium">导入工作流</span>
          <span class="text-xs text-muted-foreground text-center">从 .workflow 文件导入</span>
        </button>
      </div>
    </div>

    <!-- 编辑器 -->
    <template v-else>
      <ResizablePanelGroup
        direction="vertical"
        @layout="onExecBarResize"
      >
        <ResizablePanel
          :default-size="82"
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
              <NodeSidebar />
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

              <!-- 悬浮工具栏 -->
              <div class="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 rounded-lg border border-border bg-background/90 backdrop-blur-sm px-2 py-1 shadow-sm">
                <TooltipProvider :delay-duration="400">
                  <Tooltip>
                    <TooltipTrigger as-child>
                      <Button
                        variant="ghost"
                        size="sm"
                        class="h-7 w-7 p-0"
                        :disabled="!store.canUndo"
                        @click="store.undo()"
                      >
                        <RotateCcw class="w-3.5 h-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent
                      side="top"
                      class="text-xs"
                    >
                      撤销 (Ctrl+Z)
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger as-child>
                      <Button
                        variant="ghost"
                        size="sm"
                        class="h-7 w-7 p-0"
                        :disabled="!store.canRedo"
                        @click="store.redo()"
                      >
                        <RotateCw class="w-3.5 h-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent
                      side="top"
                      class="text-xs"
                    >
                      重做 (Ctrl+Shift+Z)
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <span class="text-[10px] text-muted-foreground ml-0.5 select-none">
                  {{ store.canUndo ? `${store.undoStack.length} 步可撤销` : '' }}
                </span>
              </div>
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
          :default-size="executionBarExpanded ? savedExecPanelSize : 4"
          :min-size="executionBarExpanded ? 15 : 4"
          :max-size="executionBarExpanded ? 60 : 4"
        >
          <ExecutionBar v-model:expanded="executionBarExpanded" />
        </ResizablePanel>
      </ResizablePanelGroup>
    </template>

    <WorkflowListDialog
      :open="listDialogOpen"
      @update:open="listDialogOpen = $event"
      @select="onListSelect"
    />

    <NodeSelectDialog
      :open="nodeSelectOpen"
      @update:open="onNodeSelectDialogClose"
      @select="hasInsertContext() ? onNodeSelectFromEdge($event) : onNodeSelectFromDialog($event)"
    />
  </div>
</template>
