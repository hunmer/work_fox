<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, unref, watch } from 'vue'
import { Handle, Position, useVueFlow } from '@vue-flow/core'
import type { NodeProps } from '@vue-flow/core'
import { NodeResizer } from '@vue-flow/node-resizer'
import { X, CircleSlash, SkipForward, FileText, CircleCheck, CircleX, ChevronRight, ChevronDown, Play, Loader2, Square, Flag } from 'lucide-vue-next'
import { getNodeDefinition } from '@/lib/workflow/nodeRegistry'
import { resolveLucideIcon } from '@/lib/lucide-resolver'
import JsonEditor from '@/components/ui/json-editor/JsonEditor.vue'
import NodePropertyForm from './NodePropertyForm.vue'
import { useWorkflowStore } from '@/stores/workflow'
import { resolveInteraction, rejectInteraction } from '@/lib/backend-api/interaction'
import type { EmbeddedWorkflow, NodeBreakpoint, NodeRunState, WorkflowNode } from '@/lib/workflow/types'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { LOOP_BODY_NODE_TYPE, LOOP_BODY_SOURCE_HANDLE } from '@shared/workflow-composite'

const props = defineProps<NodeProps>()
defineEmits<{ (e: 'updateNodeInternals'): void }>()
const store = useWorkflowStore()
const { updateNodeInternals } = useVueFlow()

const nodeRootRef = ref<HTMLElement | null>(null)
const measuredNodeSize = ref({ width: 0, height: 0 })
const controlBarRect = ref({ left: 0, top: 0, width: 180 })
const isEditing = ref(false)
const editLabel = ref('')
const inputRef = ref<HTMLInputElement | null>(null)

const definition = computed(() => getNodeDefinition(props.data?.nodeType || props.type))
const IconComponent = computed(() => resolveLucideIcon(definition.value?.icon || 'Circle'))
const nodeMinWidth = computed(() => definition.value?.customViewMinSize?.width || 140)
const nodeMinHeight = computed(() => definition.value?.customViewMinSize?.height || 60)
const embeddedHostNodeId = computed(() => typeof props.data?.embeddedHostNodeId === 'string' ? props.data.embeddedHostNodeId : null)
const isEmbeddedNode = computed(() => !!embeddedHostNodeId.value)
const embeddedWorkflowNode = computed<WorkflowNode | null>(() => {
  const node = props.data?.embeddedWorkflowNode
  return node && typeof node === 'object' ? (node as WorkflowNode) : null
})
const currentWorkflowNode = computed<WorkflowNode | null>(() => {
  if (isEmbeddedNode.value) return embeddedWorkflowNode.value
  return store.currentWorkflow?.nodes.find((n) => n.id === props.id) ?? null
})
const renderedNodeSize = computed(() => ({
  width: measuredNodeSize.value.width || (typeof props.data?.width === 'number' ? props.data.width : 0),
  height: measuredNodeSize.value.height || (typeof props.data?.height === 'number' ? props.data.height : 0),
}))

/** 是否显示输入/输出连接*/
const showTargetHandle = computed(() => definition.value?.handles?.target !== false)
const showSourceHandle = computed(() => definition.value?.handles?.source !== false)
const staticSourceHandles = computed(() => definition.value?.handles?.sourceHandles || [])

/** 是否为流程边界节点（开结束*/
const isBoundaryNode = computed(() => definition.value?.type === 'start' || definition.value?.type === 'end')

/** 获取当前节点的运行状*/
const currentNodeState = computed<NodeRunState>(() => {
  return currentWorkflowNode.value?.nodeState || 'normal'
})

const currentBreakpoint = computed<NodeBreakpoint | null>(() => {
  return currentWorkflowNode.value?.breakpoint || null
})

/** 执行时的节点状*/
const nodeStatus = computed(() => {
  const log = store.isPreview ? store.selectedExecutionLog : store.executionLog
  const step = log?.steps.find((s) => s.nodeId === props.id)
  return step?.status || 'idle'
})

/** 当前节点的执行日*/
const nodeLogs = computed(() => {
  const log = store.isPreview ? store.selectedExecutionLog : store.executionLog
  const step = log?.steps.find((s) => s.nodeId === props.id)
  return step?.logs || []
})

/** 日志摘要文本（用tooltip*/
const nodeLogsSummary = computed(() => {
  if (nodeLogs.value.length === 0) return ''
  const lines = nodeLogs.value.map((l) => `[${l.level}] ${l.message}`)
  return lines.join('\n')
})

const pausedNodeId = computed(() => unref(store.pausedNodeId))
const pausedReason = computed(() => unref(store.pausedReason))
const partialExecutionStartNodeId = computed(() => unref(store.partialExecutionStartNodeId))

const isPausedAtThisNode = computed(() => {
  return store.executionStatus === 'paused'
    && pausedNodeId.value === String(props.id)
    && (
      pausedReason.value === 'breakpoint-start'
      || pausedReason.value === 'breakpoint-end'
      || !!currentBreakpoint.value
    )
})

const controlBarStyle = computed(() => ({
  left: `${controlBarRect.value.left}px`,
  top: `${controlBarRect.value.top}px`,
  width: `${controlBarRect.value.width}px`,
}))

/** 节点状态对应的样式 */
const statusColor = computed(() => {
  if (isPausedAtThisNode.value) {
    return 'border-blue-600 ring-2 ring-blue-500 shadow-blue-500/40 shadow-md animate-pulse'
  }
  switch (nodeStatus.value) {
    case 'running':
      return 'border-blue-500 shadow-blue-500/30 shadow-md animate-pulse'
    case 'completed':
      return 'border-green-500'
    case 'error':
      return 'border-red-500'
    case 'skipped':
      return 'border-yellow-500'
    default:
      return 'border-border'
  }
})

const NODE_COLOR_MAP: Record<string, string> = {
  emerald: '#10b981',
  blue: '#3b82f6',
  violet: '#8b5cf6',
  rose: '#f43f5e',
  orange: '#f97316',
  amber: '#f59e0b',
  cyan: '#06b6d4',
  pink: '#ec4899',
  slate: '#64748b',
  red: '#ef4444',
  indigo: '#6366f1',
}

/** 节点运行状态对应的背景样式 */
const stateBackground = computed(() => {
  if (currentNodeState.value !== 'normal') {
    switch (currentNodeState.value) {
      case 'disabled':
        return 'bg-red-500/10'
      case 'skipped':
        return 'bg-yellow-500/10'
    }
  }
  if (definition.value?.type === 'start') return 'bg-emerald-500/10'
  if (definition.value?.type === 'end') return 'bg-slate-500/10'
  return 'bg-background'
})

const nodeColorStyle = computed(() => {
  const color = currentWorkflowNode.value?.nodeColor
  if (!color) return null
  const hex = NODE_COLOR_MAP[color]
  if (!hex) return null
  return { backgroundColor: `${hex}1a` }
})

/** 状态徽标文*/
const stateBadge = computed(() => {
  switch (currentNodeState.value) {
    case 'disabled':
      return '已禁'
    case 'skipped':
      return '已跳'
    default:
      return ''
  }
})

const breakpointBadge = computed(() => {
  switch (currentBreakpoint.value) {
    case 'start':
      return '开始断点'
    case 'end':
      return '结束断点'
    default:
      return ''
  }
})

function startEdit() {
  editLabel.value = props.data?.label || ''
  isEditing.value = true
  setTimeout(() => inputRef.value?.focus(), 0)
}

function finishEdit() {
  isEditing.value = false
  if (isEmbeddedNode.value) {
    updateEmbeddedWorkflowNode('rename embedded node', (node) => {
      node.label = editLabel.value
    })
    return
  }
  store.updateNodeLabel(String(props.id), editLabel.value)
}

function handleDelete() {
  if (isEmbeddedNode.value) {
    deleteEmbeddedWorkflowNode()
    return
  }
  if (!store.canDeleteNode(String(props.id))) return
  store.removeNode(String(props.id))
}

function handleClone() {
  if (!store.canCloneNode(String(props.id))) return
  store.cloneNode(String(props.id))
}

function setNodeState(state: NodeRunState) {
  if (isEmbeddedNode.value) {
    updateEmbeddedWorkflowNode('update embedded node state', (node) => {
      node.nodeState = state
    })
    return
  }
  store.updateNodeState(String(props.id), state)
}

function cloneEmbeddedWorkflow() {
  const hostNodeId = embeddedHostNodeId.value
  if (!hostNodeId) return null
  const hostNode = store.currentWorkflow?.nodes.find((node) => node.id === hostNodeId)
  const workflow = hostNode?.data?.bodyWorkflow
  if (!workflow || !Array.isArray(workflow.nodes) || !Array.isArray(workflow.edges)) return null
  return JSON.parse(JSON.stringify(workflow)) as EmbeddedWorkflow
}

function updateEmbeddedWorkflowNode(description: string, updater: (node: WorkflowNode) => void) {
  const hostNodeId = embeddedHostNodeId.value
  if (!hostNodeId) return

  const nextWorkflow = cloneEmbeddedWorkflow()
  if (!nextWorkflow) return

  const node = nextWorkflow.nodes.find((item) => item.id === String(props.id))
  if (!node) return

  updater(node)
  store.updateEmbeddedWorkflow(hostNodeId, nextWorkflow, { description })

  if (store.selectedEmbeddedNode?.hostNodeId === hostNodeId && store.selectedEmbeddedNode.nodeId === String(props.id)) {
    store.selectedEmbeddedNode.node = JSON.parse(JSON.stringify(node))
  }
}

function deleteEmbeddedWorkflowNode() {
  const hostNodeId = embeddedHostNodeId.value
  if (!hostNodeId || isBoundaryNode.value) return

  const nextWorkflow = cloneEmbeddedWorkflow()
  if (!nextWorkflow) return

  nextWorkflow.nodes = nextWorkflow.nodes.filter((node) => node.id !== String(props.id))
  nextWorkflow.edges = nextWorkflow.edges.filter((edge) => edge.source !== String(props.id) && edge.target !== String(props.id))
  store.updateEmbeddedWorkflow(hostNodeId, nextWorkflow, { description: 'delete embedded node' })

  if (store.selectedEmbeddedNode?.hostNodeId === hostNodeId && store.selectedEmbeddedNode.nodeId === String(props.id)) {
    store.selectedEmbeddedNode = null
  }
}

// ── 节点内部刷新 ──

function refreshNodeInternals(reason: string) {
  nextTick(() => {
    updateNodeInternals([props.id])
  })
}

function updateControlBarRect() {
  if (!isPausedAtThisNode.value) return
  const rect = nodeRootRef.value?.getBoundingClientRect()
  if (!rect) return
  controlBarRect.value = {
    left: rect.left + 8,
    top: rect.bottom + 4,
    width: Math.max(180, rect.width - 16),
  }
}

function handleCustomViewMouseDown(event: MouseEvent) {
  if (!isLoopBodyContainer.value) {
    event.stopPropagation()
  }
}

function handleCustomViewPointerDown(event: PointerEvent) {
  if (!isLoopBodyContainer.value) {
    event.stopPropagation()
  }
}

const displayLabel = computed(() => props.data?.label || definition.value?.label || props.type)
const isFirstConnectedNode = computed(() => {
  if (isEmbeddedNode.value) return false
  const workflow = store.currentWorkflow
  if (!workflow) return false
  const nodeId = String(props.id)
  const hasIncoming = workflow.edges.some((edge) => edge.target === nodeId)
  const hasOutgoing = workflow.edges.some((edge) => edge.source === nodeId)
  return hasOutgoing && !hasIncoming
})

/** 自定义视图组*/
const CustomViewComponent = computed(() => definition.value?.customView)

/** 自定义视图所需props */
const executionStep = computed(() => {
  const log = store.isPreview ? store.selectedExecutionLog : store.executionLog
  return log?.steps.find((s) => s.nodeId === props.id)
})

const customViewProps = computed(() => {
  if (!CustomViewComponent.value) return {}
  if (definition.value?.type === 'gallery_preview') {
    const items = props.data?.items
    const outputItems = executionStep.value?.output?.items
    if (Array.isArray(outputItems)) {
      return { items: outputItems }
    }
    // items 是真正的数组，直接用
    if (Array.isArray(items)) {
      return { items: nodeStatus.value === 'completed' ? items : [] }
    }
    // items 是变量表达式，从执行结果取解析后的数
    return { items: [] }
  }
  if (definition.value?.type === 'music_player') {
    const tracks = props.data?.tracks
    const volume = props.data?.volume ?? 80
    const loop = props.data?.loop ?? false
    const output = executionStep.value?.output
    if (output) {
      return {
        tracks: Array.isArray(output.tracks) ? output.tracks : [],
        volume: output.volume ?? volume,
        loop: output.loop ?? loop,
      }
    }
    // 静态数组：执行完成后才显示，与 gallery_preview 行为一
    if (Array.isArray(tracks)) {
      return {
        tracks: nodeStatus.value === 'completed' ? tracks : [],
        volume,
        loop,
      }
    }
    // 变量表达式：从执行结果取解析后的数据
    return { tracks: [], volume, loop }
  }
  if (definition.value?.type === 'table_display') {
    const headers = props.data?.headers
    const cells = props.data?.cells
    const selectionMode = props.data?.selectionMode ?? 'none'
    const pending = store.pendingInteraction
    const isPending = pending?.nodeId === props.id && pending?.interactionType === 'table_confirm'
    const isStaticHeaders = Array.isArray(headers)
    const isStaticCells = Array.isArray(cells)
    const output = executionStep.value?.output
    // pending interaction 时用 schema 中的数据（后端解析变量后的实际值）
    const schema = isPending ? (pending.schema as any) : null
    // 静态数据：执行完成后才显示
    const resolvedHeaders = isStaticHeaders
      ? (nodeStatus.value === 'completed' ? headers : [])
      : (Array.isArray(output?.headers) ? output.headers : [])
    const resolvedCells = isStaticCells
      ? (nodeStatus.value === 'completed' ? cells : [])
      : (Array.isArray(output?.selectedRows) ? output.selectedRows : (Array.isArray(output?.cells) ? output.cells : []))
    return {
      headers: schema?.headers ?? resolvedHeaders,
      cells: schema?.cells ?? resolvedCells,
      selectionMode: schema?.selectionMode ?? selectionMode,
      interactive: !!isPending,
      onSubmit: isPending
        ? (rows: Array<{ id: string; data: Record<string, any> }>) => {
            store.pendingInteraction = null
            resolveInteraction({ selectedRows: rows, selectedCount: rows.length })
          }
        : undefined,
    }
  }
  if (definition.value?.type === LOOP_BODY_NODE_TYPE) {
    return {
      nodeId: props.id,
      bodyWorkflow: props.data?.bodyWorkflow,
      outputLabel: props.data?.outputLabel,
    }
  }
  if (definition.value?.type === 'sub_workflow') {
    return {
      nodeId: props.id,
      workflowId: props.data?.workflowId,
      workflowName: props.data?.workflowName,
    }
  }
  if (definition.value?.type === 'sticky_note') {
    return {
      nodeId: props.id,
    }
  }
  return props.data || {}
})

/** 是否有自定义视图 */
const hasCustomView = computed(() => !!CustomViewComponent.value)
const isLoopBodyContainer = computed(() => definition.value?.type === LOOP_BODY_NODE_TYPE)
const showInlinePropertyForm = computed(() => {
  return !isEmbeddedNode.value
    && !hasCustomView.value
    && renderedNodeSize.value.width > 200
    && renderedNodeSize.value.height > 200
    && !!currentWorkflowNode.value
})

/** 动态输出连接点（switch 节点*/
const dynamicHandles = computed(() => {
  const ds = definition.value?.handles?.dynamicSource
  if (!ds) return null
  const value = props.data?.[ds.dataKey]
  const conditions: any[] = Array.isArray(value) ? value : []
  const extra = ds.extraCount || 0
  const total = conditions.length + extra
  if (total === 0) return null
  return Array.from({ length: total }, (_, i) => ({
    id: i < conditions.length ? `case-${i}` : 'default',
    label: i < conditions.length ? `条件 ${i + 1}` : '默认',
    index: i,
    total,
  }))
})

function getHandleTop(index: number, total: number): string {
  return `${((index + 1) / (total + 1)) * 100}%`
}

function getSourceHandleStyle(index: number, total: number) {
  return {
    top: getHandleTop(index, total),
    borderWidth: '2px',
  }
}

let nodeResizeObserver: ResizeObserver | null = null

onMounted(() => {
  refreshNodeInternals('mounted')
  updateControlBarRect()
  if (nodeRootRef.value) {
    const rect = nodeRootRef.value.getBoundingClientRect()
    measuredNodeSize.value = { width: rect.width, height: rect.height }
    nodeResizeObserver = new ResizeObserver(([entry]) => {
      measuredNodeSize.value = {
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      }
    })
    nodeResizeObserver.observe(nodeRootRef.value)
  }
  window.addEventListener('scroll', updateControlBarRect, true)
  window.addEventListener('resize', updateControlBarRect)
})

watch(isPausedAtThisNode, (paused) => {
  if (!paused) return
  nextTick(updateControlBarRect)
})

onUnmounted(() => {
  nodeResizeObserver?.disconnect()
  nodeResizeObserver = null
  window.removeEventListener('scroll', updateControlBarRect, true)
  window.removeEventListener('resize', updateControlBarRect)
})

const inputExpanded = ref(true)
const outputExpanded = ref(true)

/** 节点是否有执行结果可展示 */
const hasExecutionResult = computed(() => {
  return (nodeStatus.value === 'completed' || nodeStatus.value === 'error') && !!executionStep.value
})

/** 执行耗时 */
const executionDuration = computed(() => {
  const step = executionStep.value
  if (!step?.startedAt || !step?.finishedAt) return ''
  const ms = step.finishedAt - step.startedAt
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
})

/** 判断数据是否JSON 对象/数组（可JsonEditor 渲染*/
function isJsonObject(data: any): boolean {
  return data !== null && data !== undefined && typeof data === 'object'
}

/** 格式化非 JSON 数据用于文本展示 */
function formatPlain(data: any): string {
  if (data === undefined || data === null) return '('
  return String(data)
}

/** 当前节点是否正在调试 */
const isCurrentNodeDebugging = computed(() => {
  return store.debugNodeId === props.id && store.debugNodeStatus === 'running'
})
const isPartialTesting = computed(() => {
  return (store.executionStatus === 'running' || store.executionStatus === 'paused')
    && partialExecutionStartNodeId.value === String(props.id)
})

/** 测试当前节点 */
async function handleTestNode() {
  if (isCurrentNodeDebugging.value) {
    store.cancelDebug()
    return
  }
  await store.debugSingleNode(String(props.id), isEmbeddedNode.value ? currentWorkflowNode.value ?? undefined : undefined)
}

async function handlePartialTest() {
  if (store.executionStatus === 'running' || store.executionStatus === 'paused') return
  await store.startPartialExecution(String(props.id))
}

async function handleResumeFromBreakpoint() {
  await store.resumeExecution()
}

async function handleStopAtBreakpoint() {
  await store.stopExecution()
}
</script>

<template>
  <NodeResizer
    v-if="!store.isPreview"
    :is-visible="props.selected"
    :min-width="nodeMinWidth"
    :min-height="nodeMinHeight"
  />

  <div
    ref="nodeRootRef"
    class="group/node border-2 rounded-lg shadow-sm w-full h-full cursor-pointer transition-colors relative flex flex-col"
    :class="[statusColor, stateBackground, props.selected ? 'ring-2 ring-primary' : '', { 'loop-body-node': isLoopBodyContainer }]"
    :style="nodeColorStyle"
  >
        <!-- 输入连接点 -->
        <Handle
          v-if="showTargetHandle"
          id="target"
          type="target"
          :position="Position.Left"
          :connectable="props.connectable"
          class="!z-10 !w-3 !h-3 !bg-blue-500 !border-2 !border-blue-300 handle-dot"
        />

        <!-- 悬浮测试按钮（开结束节点隐藏，预览模式下隐藏-->
        <button
          v-if="!isBoundaryNode && !store.isPreview"
          class="absolute -top-2 -left-2 w-5 h-5 rounded-full bg-green-500 text-white flex items-center justify-center opacity-0 group-hover/node:opacity-100 transition-opacity hover:bg-green-600 z-10"
          @click.stop="handleTestNode"
        >
          <Loader2 v-if="isCurrentNodeDebugging" class="w-3 h-3 animate-spin" />
          <Play v-else class="w-3 h-3" />
        </button>

        <!-- 悬浮删除按钮（开结束节点隐藏，预览模式下隐藏-->
        <button
          v-if="!isBoundaryNode && !store.isPreview && (isEmbeddedNode || store.canDeleteNode(String(props.id)))"
          class="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover/node:opacity-100 transition-opacity hover:bg-destructive/80 z-10"
          @click.stop="handleDelete"
        >
          <X class="w-3 h-3" />
        </button>

        <!-- 状态徽-->
        <span
          v-if="stateBadge"
          class="absolute -top-2 left-1/2 -translate-x-1/2 text-[10px] px-1.5 py-0 rounded-full font-medium z-10"
          :class="currentNodeState === 'disabled'
            ? 'bg-red-500 text-white'
            : 'bg-yellow-500 text-white'"
        >
          {{ stateBadge }}
        </span>

        <span
          v-if="breakpointBadge"
          class="absolute -bottom-2 left-2 inline-flex items-center gap-1 text-[10px] px-1.5 py-0 rounded-full font-medium z-10 text-white"
          :class="currentBreakpoint === 'start' ? 'bg-blue-500' : 'bg-purple-500'"
        >
          <Flag class="w-2.5 h-2.5" />
          {{ breakpointBadge }}
        </span>

        <!-- 日志图标（执行结束后有日志时显示-->
        <TooltipProvider v-if="nodeLogs.length > 0 && (nodeStatus === 'completed' || nodeStatus === 'error')">
          <Tooltip>
            <TooltipTrigger as-child>
              <div class="absolute -bottom-1.5 -right-1.5 w-4 h-4 rounded-full bg-muted border border-border flex items-center justify-center z-10 cursor-default">
                <FileText class="w-2.5 h-2.5 text-muted-foreground" />
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" class="max-w-[280px] max-h-[200px] overflow-auto">
              <div class="space-y-0.5 text-xs">
                <div
                  v-for="(log, idx) in nodeLogs"
                  :key="idx"
                  class="flex items-start gap-1"
                  :class="{
                    'text-blue-600 dark:text-blue-400': log.level === 'info',
                    'text-yellow-600 dark:text-yellow-400': log.level === 'warning',
                    'text-red-600 dark:text-red-400': log.level === 'error',
                  }"
                >
                  <span class="opacity-60">[{{ log.level }}]</span>
                  <span class="break-all">{{ log.message }}</span>
                </div>
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <div v-if="!isLoopBodyContainer" class="embedded-node-drag-handle flex items-center gap-2 px-3 py-2 border-b border-border/50">
          <component
            :is="IconComponent"
            v-if="IconComponent"
            class="w-4 h-4 text-muted-foreground shrink-0"
          />
          <input
            v-if="isEditing"
            ref="inputRef"
            v-model="editLabel"
            class="flex-1 text-xs bg-transparent outline-none border-b border-primary min-w-0"
            @blur="finishEdit"
            @keyup.enter="finishEdit"
            @click.stop
          >
          <div
            v-else
            class="text-xs truncate hover:bg-muted/50 rounded px-1 py-0.5 min-w-0 flex-1"
            :class="{ 'opacity-50 line-through': currentNodeState === 'disabled' }"
            @dblclick.stop="!store.isPreview && startEdit()"
          >
            {{ displayLabel }}
          </div>
          <button
            v-if="isFirstConnectedNode && !isBoundaryNode && !store.isPreview"
            class="nodrag nopan shrink-0 inline-flex items-center gap-1 rounded border border-border bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="store.executionStatus === 'running' || store.executionStatus === 'paused'"
            title="局部测试"
            @click.stop="handlePartialTest"
          >
            <Loader2 v-if="isPartialTesting" class="w-2.5 h-2.5 animate-spin" />
            <Play v-else class="w-2.5 h-2.5" />
            局部测试
          </button>
        </div>

        <!-- 自定义视图内容区 -->
        <div
          v-if="hasCustomView"
          class="px-2 pb-2 custom-view-area flex-1 min-h-0 overflow-hidden"
          :class="isLoopBodyContainer ? '' : 'nodrag nopan'"
          @click.stop
          @mousedown="handleCustomViewMouseDown"
          @pointerdown="handleCustomViewPointerDown"
        >
          <component
            :is="CustomViewComponent"
            v-bind="customViewProps"
          />
        </div>

        <div
          v-else-if="showInlinePropertyForm"
          class="nodrag nopan flex-1 min-h-0 overflow-y-auto px-3 py-2 border-t border-border/50 inline-property-form"
          @click.stop
          @mousedown.stop
          @pointerdown.stop
        >
          <NodePropertyForm
            :node="currentWorkflowNode"
            :node-id="String(props.id)"
            compact
          />
        </div>

        <!-- 执行结果指示器（节点完成后显示） -->
        <div
          v-if="hasExecutionResult"
          class="nodrag nopan border-t border-border/50"
          @click.stop
        >
          <Popover>
            <PopoverTrigger as-child>
              <button
                class="w-full flex items-center gap-1.5 px-2 py-1 hover:bg-muted/50 transition-colors rounded-b-md text-[10px]"
                @click.stop
              >
                <CircleCheck v-if="nodeStatus === 'completed'" class="w-3 h-3 text-green-500 shrink-0" />
                <CircleX v-else class="w-3 h-3 text-red-500 shrink-0" />
                <span class="text-muted-foreground truncate">执行结果</span>
                <span v-if="executionDuration" class="text-muted-foreground/60 shrink-0">{{ executionDuration }}</span>
                <ChevronDown class="w-2.5 h-2.5 ml-auto text-muted-foreground shrink-0" />
              </button>
            </PopoverTrigger>
            <PopoverContent side="bottom" :side-offset="4" align="center" class="w-80 p-0">
              <div class="p-2 space-y-2">
                <!-- 错误信息 -->
                <div v-if="executionStep?.error" class="p-2 rounded bg-destructive/10 text-destructive text-xs break-all">
                  {{ executionStep.error }}
                </div>
                <!-- 输入 -->
                <Collapsible v-model:open="inputExpanded">
                  <CollapsibleTrigger class="flex items-center gap-1 w-full text-[10px] font-medium text-muted-foreground py-1 hover:bg-muted/50 rounded px-1">
                    <ChevronRight class="w-3 h-3 transition-transform" :class="inputExpanded ? 'rotate-90' : ''" />
                    输入
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <JsonEditor v-if="isJsonObject(executionStep?.input)" :model-value="executionStep.input" :readonly="true" :height="120" class="mt-1" />
                    <pre v-else class="text-[10px] bg-muted/50 rounded p-2 mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-all">{{ formatPlain(executionStep?.input) }}</pre>
                  </CollapsibleContent>
                </Collapsible>
                <!-- 输出 -->
                <Collapsible v-model:open="outputExpanded">
                  <CollapsibleTrigger class="flex items-center gap-1 w-full text-[10px] font-medium text-muted-foreground py-1 hover:bg-muted/50 rounded px-1">
                    <ChevronRight class="w-3 h-3 transition-transform" :class="outputExpanded ? 'rotate-90' : ''" />
                    输出
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <JsonEditor v-if="isJsonObject(executionStep?.output)" :model-value="executionStep.output" :readonly="true" :height="120" class="mt-1" />
                    <pre v-else class="text-[10px] bg-muted/50 rounded p-2 mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-all">{{ formatPlain(executionStep?.output) }}</pre>
                  </CollapsibleContent>
                </Collapsible>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        <!-- 输出连接-->
        <template v-if="showSourceHandle && !dynamicHandles">
          <Handle
            v-if="staticSourceHandles.length === 0"
            id="source"
            type="source"
            :position="Position.Right"
            :connectable="props.connectable"
            class="!z-10 !w-3 !h-3 !bg-emerald-500 !border-2 !border-emerald-300 handle-dot"
          />
          <template v-else>
            <div
              v-for="(h, index) in staticSourceHandles"
              :key="`${h.id}-label`"
              class="source-handle-label"
              :style="{ top: getHandleTop(index, staticSourceHandles.length) }"
            >
              <span class="text-[9px] text-muted-foreground mr-1 whitespace-nowrap">{{ h.label || h.id }}</span>
            </div>
            <Handle
              v-for="(h, index) in staticSourceHandles"
              :id="h.id"
              :key="h.id"
              type="source"
              :position="Position.Right"
              :connectable="props.connectable"
              class="!z-10 !w-2.5 !h-2.5 handle-dot"
              :class="h.id === LOOP_BODY_SOURCE_HANDLE ? '!bg-blue-500 !border-blue-300' : '!bg-emerald-500 !border-emerald-300'"
              :style="getSourceHandleStyle(index, staticSourceHandles.length)"
            />
          </template>
        </template>

        <!-- 动态输出连接点（switch 节点-->
        <template v-if="dynamicHandles">
          <div
            v-for="h in dynamicHandles"
            :key="`${h.id}-label`"
            class="source-handle-label"
            :style="{ top: getHandleTop(h.index, h.total) }"
          >
            <span class="text-[9px] text-muted-foreground mr-1 whitespace-nowrap">{{ h.label }}</span>
          </div>
          <Handle
            v-for="h in dynamicHandles"
            :id="h.id"
            :key="h.id"
            type="source"
            :position="Position.Right"
            :connectable="props.connectable"
            class="!z-10 !w-2.5 !h-2.5 handle-dot"
            :class="h.id === 'default' ? '!bg-orange-500 !border-orange-300' : '!bg-emerald-500 !border-emerald-300'"
            :style="getSourceHandleStyle(h.index, h.total)"
          />
        </template>
  </div>

  <Teleport to="body">
    <div
      v-if="isPausedAtThisNode"
      class="nodrag nopan fixed flex items-center gap-1 rounded border border-blue-500/40 bg-background/95 p-1 shadow-lg z-[1000]"
      :style="controlBarStyle"
      @click.stop
    >
      <button
        class="inline-flex h-6 flex-1 items-center justify-center gap-1 rounded bg-blue-500 px-2 text-[10px] font-medium text-white hover:bg-blue-600"
        @click.stop="handleResumeFromBreakpoint"
      >
        <Play class="w-3 h-3" />
        继续运行
      </button>
      <button
        class="inline-flex h-6 flex-1 items-center justify-center gap-1 rounded bg-destructive px-2 text-[10px] font-medium text-destructive-foreground hover:bg-destructive/90"
        @click.stop="handleStopAtBreakpoint"
      >
        <Square class="w-3 h-3" />
        中断
      </button>
    </div>
  </Teleport>
</template>

<style scoped>
.handle-dot {
  transition: scale 0.2s ease, box-shadow 0.2s ease;
}

.handle-dot:hover {
  scale: 1.6;
  box-shadow: 0 0 6px currentColor;
}

.source-handle-label {
  position: absolute;
  right: 10px;
  display: flex;
  align-items: center;
  pointer-events: none;
  transform: translateY(-50%);
}

.loop-body-node {
  border-color: rgba(114, 181, 197, 0.5);
  box-shadow: 0 10px 30px rgba(98, 156, 173, 0.14);
  background: linear-gradient(180deg, rgba(233, 247, 250, 0.95), rgba(246, 250, 251, 0.98));
}

.custom-view-area {
  overflow: hidden;
}
.custom-view-area :deep(.gallery-grid) {
  gap: 4px;
}
.custom-view-area :deep(.gallery-item) {
  border-radius: 4px;
}
.custom-view-area :deep(.gallery-caption) {
  display: none;
}
</style>
