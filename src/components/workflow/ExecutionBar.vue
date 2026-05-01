<script setup lang="ts">
import { computed, inject, ref } from 'vue'
import { DynamicScroller, DynamicScrollerItem, RecycleScroller } from 'vue-virtual-scroller'
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css'
import { useWorkflowStore } from '@/stores/workflow'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import JsonEditor from '@/components/ui/json-editor/JsonEditor.vue'
import { Play, Pause, Square, ChevronDown, ChevronUp, CheckCircle, XCircle, Loader2, Circle, Trash2, AlertTriangle, Info, AlertCircle as AlertCircleIcon, Copy, Check, MoreHorizontal, FolderOpen } from 'lucide-vue-next'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { executionLogBackendApi } from '@/lib/backend-api/execution-log'
import type { ExecutionLog, ExecutionStep, WorkflowNode } from '@/lib/workflow/types'
import type { OutputField } from '@shared/workflow-types'
import { getNodesForExecutionScope } from '@shared/workflow-composite'
import { WORKFLOW_EXEC_BAR_LAYOUT_KEY } from './workflowLayoutContext'
import ExecutionInputDrawer from './ExecutionInputDrawer.vue'

// ====== 步骤分组：loop / sub_workflow 子节点包裹 ======

type StepGroupItem =
  | { type: 'single'; step: ExecutionStep }
  | { type: 'group'; groupKey: string; parentLabel: string; parentType: string; hue: number; steps: ExecutionStep[] }

type StepCardItem = {
  key: string
  step: ExecutionStep
  groupHue?: number
}

type StepLog = NonNullable<ExecutionStep['logs']>[number]

const SCOPE_PARENT_TYPES = new Set(['loop', 'sub_workflow'])

const snapshotNodeMap = computed(() => {
  if (!displayLog.value?.snapshot) return new Map<string, WorkflowNode>()
  return new Map(displayLog.value.snapshot.nodes.map(n => [n.id, n]))
})

/** 将父节点 ID 哈希为色相值 (0–345) */
function parentIdToHue(id: string): number {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash)
  }
  return (Math.abs(hash) % 24) * 15
}

function stepsOfItem(item: StepGroupItem): ExecutionStep[] {
  return item.type === 'single' ? [item.step] : item.steps
}

function logItemKey(_log: StepLog, index: number): number {
  return index
}

function activeStepTab(stepKey: string): string {
  return stepTabs.value[stepKey] || 'input'
}

/** 将扁平步骤列表按 scope 父节点分组 */
const groupedSteps = computed<StepGroupItem[]>(() => {
  const log = displayLog.value
  if (!log?.snapshot) {
    return log ? log.steps.map(s => ({ type: 'single' as const, step: s })) : []
  }

  const nodeMap = snapshotNodeMap.value
  const result: StepGroupItem[] = []
  let currentGroup: { groupKey: string; parentLabel: string; parentType: string; steps: ExecutionStep[] } | null = null

  /** 关闭当前分组，推入 result */
  function flushGroup() {
    if (!currentGroup) return
    result.push({
      type: 'group',
      ...currentGroup,
      hue: parentIdToHue(currentGroup.groupKey),
    })
    currentGroup = null
  }

  for (const step of log.steps) {
    const node = nodeMap.get(step.nodeId)

    // 1) 节点本身是 scope 父节点（loop / sub_workflow）
    if (node && SCOPE_PARENT_TYPES.has(node.type)) {
      const gid = step.nodeId
      if (currentGroup && currentGroup.groupKey === gid) {
        currentGroup.steps.push(step)
      } else {
        flushGroup()
        currentGroup = { groupKey: gid, parentLabel: node.label, parentType: node.type, steps: [step] }
      }
      continue
    }

    // 2) 节点有 composite 元信息指向 scope 父节点
    if (node?.composite?.rootId) {
      const root = nodeMap.get(node.composite.rootId)
      if (root && SCOPE_PARENT_TYPES.has(root.type)) {
        const gid = root.id
        if (currentGroup && currentGroup.groupKey === gid) {
          currentGroup.steps.push(step)
        } else {
          flushGroup()
          currentGroup = { groupKey: gid, parentLabel: root.label, parentType: root.type, steps: [step] }
        }
        continue
      }
    }

    // 3) 节点不在 snapshot 中（嵌入式子工作流 / 引用工作流的节点），归入最近活跃分组
    if (!node && currentGroup) {
      currentGroup.steps.push(step)
      continue
    }

    // 4) 独立步骤
    flushGroup()
    result.push({ type: 'single', step })
  }

  flushGroup()
  return result
})

const stepCards = computed<StepCardItem[]>(() => {
  const cards: StepCardItem[] = []

  for (const item of groupedSteps.value) {
    const steps = stepsOfItem(item)
    steps.forEach((step, index) => {
      cards.push({
        key: item.type === 'single'
          ? `s-${step.nodeId}-${step.startedAt}-${index}`
          : `g-${item.groupKey}-${step.nodeId}-${step.startedAt}-${index}`,
        step,
        groupHue: item.type === 'group' ? item.hue : undefined,
      })
    })
  }

  return cards
})

const stepTabs = ref<Record<string, string>>({})
const copiedNodeId = ref<string | null>(null)

function copyNodeInfo(step: ExecutionLog['steps'][number]) {
  const node = snapshotNodeMap.value.get(step.nodeId)
  const parts = [
    `# ${step.nodeLabel}`,
    node?.type ? `节点类型: ${node.type}` : '',
    '',
    '## 输入',
    step.input !== undefined && step.input !== null ? JSON.stringify(step.input, null, 2) : '无',
    '',
    '## 输出',
    step.output !== undefined && step.output !== null ? JSON.stringify(step.output, null, 2) : '无',
  ]
  if (step.logs?.length) {
    parts.push('', '## 日志')
    step.logs.forEach(l => parts.push(`[${l.level}] ${l.message}`))
  }
  if (step.error) {
    parts.push('', '## 错误', step.error)
  }
  navigator.clipboard.writeText(parts.join('\n')).then(() => {
    copiedNodeId.value = `info-${step.nodeId}`
    setTimeout(() => { copiedNodeId.value = null }, 1500)
  })
}

function copyError(step: ExecutionLog['steps'][number]) {
  if (!step.error) return
  navigator.clipboard.writeText(step.error).then(() => {
    copiedNodeId.value = step.nodeId
    setTimeout(() => { copiedNodeId.value = null }, 1500)
  })
}

const isElectron = navigator.userAgent.includes('Electron')

async function openLogFile(log: ExecutionLog) {
  const path = await executionLogBackendApi.getPath(log.workflowId, log.id)
  window.api.fs.openInExplorer(path)
}

async function copyLogPath(log: ExecutionLog) {
  const path = await executionLogBackendApi.getPath(log.workflowId, log.id)
  navigator.clipboard.writeText(path)
}

const EXEC_BAR_PANEL_SIZES_KEY = 'workflow-exec-bar-panel-sizes'
const execBarPanelSizes = ref<number[]>(JSON.parse(localStorage.getItem(EXEC_BAR_PANEL_SIZES_KEY) || '[25, 75]'))

function handleExecBarPanelResize(sizes: number[]) {
  execBarPanelSizes.value = sizes
  localStorage.setItem(EXEC_BAR_PANEL_SIZES_KEY, JSON.stringify(sizes))
}

const store = useWorkflowStore()
const execBarLayout = inject(WORKFLOW_EXEC_BAR_LAYOUT_KEY, null)
const expanded = computed(() => execBarLayout?.getExpanded() ?? false)

// ====== 执行前输入表单 Drawer ======
const inputDrawerOpen = ref(false)
const selectedStartNodeId = ref<string | null>(null)

const startNodes = computed<WorkflowNode[]>(() => {
  const nodes = store.currentWorkflow?.nodes
  if (!nodes) return []
  return getNodesForExecutionScope(nodes, null).filter(n => n.type === 'start')
})

const activeStartNode = computed<WorkflowNode | null>(() => {
  if (selectedStartNodeId.value) {
    const selected = startNodes.value.find(node => node.id === selectedStartNodeId.value)
    if (selected) return selected
  }
  return startNodes.value[0] ?? null
})

const startInputFields = computed<OutputField[]>(() => {
  const fields = activeStartNode.value?.data?.inputFields
  return Array.isArray(fields) ? fields : []
})

function handleExecuteClick(startNodeId?: string) {
  selectedStartNodeId.value = startNodeId ?? startNodes.value[0]?.id ?? null
  if (startInputFields.value.length > 0) {
    inputDrawerOpen.value = true
  } else {
    store.startExecution(undefined, selectedStartNodeId.value ?? undefined)
    setExpanded(true)
  }
}

function handleInputSubmit(inputs: Record<string, unknown>) {
  store.startExecution(inputs, selectedStartNodeId.value ?? undefined)
  setExpanded(true)
}

const isRunning = computed(() => store.executionStatus === 'running')
const isPaused = computed(() => store.executionStatus === 'paused')
const controlStatus = computed(() => store.executionControlStatus)
const canStart = computed(() => {
  if (isRunning.value || isPaused.value || controlStatus.value !== 'idle') return false
  return !store.executionValidationError
})
const canPause = computed(() => isRunning.value && controlStatus.value === 'idle')
const canResume = computed(() => isPaused.value && controlStatus.value === 'idle')
const canStop = computed(() => (isRunning.value || isPaused.value) && controlStatus.value === 'idle')
const showResumeButton = computed(() => isPaused.value || controlStatus.value === 'resuming')
const pauseButtonText = computed(() => controlStatus.value === 'pausing' ? '暂停中' : '暂停')
const stopButtonText = computed(() => controlStatus.value === 'stopping' ? '停止中' : '停止')
const resumeButtonText = computed(() => controlStatus.value === 'resuming' ? '继续中' : '继续')
const executionStatusText = computed(() => {
  if (controlStatus.value === 'pausing') return '暂停请求已发送'
  if (controlStatus.value === 'stopping') return '停止请求已发送'
  if (controlStatus.value === 'resuming') return '继续请求已发送'
  return store.executionStatus
})

const progressText = computed(() => {
  if (!store.executionLog) return ''
  const completed = store.executionLog.steps.filter((s) => s.status === 'completed').length
  const total = store.executionLog.steps.length
  return `${completed}/${total}`
})

const elapsedText = computed(() => {
  if (!store.executionLog) return ''
  const start = store.executionLog.startedAt
  const end = store.executionLog.finishedAt || Date.now()
  const seconds = ((end - start) / 1000).toFixed(1)
  return `${seconds}s`
})

function formatTime(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function formatDuration(start: number, end?: number): string {
  const ms = (end || Date.now()) - start
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function selectLog(log: ExecutionLog) {
  if (store.isPreview) {
    store.exitPreview()
  }
  store.selectedExecutionLogId = log.id
  store.enterPreview(log)
}

const displayLog = computed(() => store.selectedExecutionLog)
const backendStatusText = computed(() => {
  if (store.backendConnectionState === 'idle' || store.backendConnectionState === 'connected') {
    return ''
  }
  if (store.backendConnectionState === 'reconnecting') {
    return store.backendReconnectAttempt > 0
      ? `后端重连中 #${store.backendReconnectAttempt}`
      : '后端重连中'
  }
  return store.backendLastError ? `后端异常: ${store.backendLastError}` : '后端连接异常'
})
function setExpanded(nextExpanded: boolean) {
  execBarLayout?.setExpanded(nextExpanded)
}
</script>

<template>
  <div class="border-t border-border bg-background flex flex-col h-full">
    <!-- 控制栏 -->
    <div class="flex items-center gap-2 px-3 py-1.5">
      <Button
        v-if="showResumeButton"
        variant="ghost"
        size="sm"
        class="h-6 text-xs gap-1 px-2"
        @click="store.resumeExecution()"
      >
        <Loader2
          v-if="controlStatus === 'resuming'"
          class="w-3 h-3 animate-spin"
        />
        <Play
          v-else
          class="w-3 h-3"
        />
        {{ resumeButtonText }}
      </Button>
      <template v-else>
        <Button
          v-if="startNodes.length <= 1"
          variant="ghost"
          size="sm"
          class="h-6 text-xs gap-1 px-2"
          :disabled="!canStart"
          @click="handleExecuteClick()"
        >
          <Play class="w-3 h-3" /> 执行
        </Button>
        <DropdownMenu v-else>
          <DropdownMenuTrigger as-child>
            <Button
              variant="ghost"
              size="sm"
              class="h-6 text-xs gap-1 px-2"
              :disabled="!canStart"
            >
              <Play class="w-3 h-3" /> 执行
              <ChevronDown class="w-3 h-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" class="w-56">
            <DropdownMenuItem
              v-for="node in startNodes"
              :key="node.id"
              class="text-xs"
              @click="handleExecuteClick(node.id)"
            >
              {{ node.label || '开始' }}
              <span class="ml-auto text-[10px] text-muted-foreground">{{ node.id.slice(0, 8) }}</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </template>

      <!-- 验证错误提示 -->
      <div
        v-if="store.executionValidationError && !isRunning && !isPaused"
        class="flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400"
      >
        <AlertTriangle class="w-3 h-3 shrink-0" />
        <span>{{ store.executionValidationError }}</span>
      </div>

      <Button
        variant="ghost"
        size="sm"
        class="h-6 text-xs gap-1 px-2"
        :disabled="!canPause"
        @click="store.pauseExecution()"
      >
        <Loader2
          v-if="controlStatus === 'pausing'"
          class="w-3 h-3 animate-spin"
        />
        <Pause
          v-else
          class="w-3 h-3"
        />
        {{ pauseButtonText }}
      </Button>

      <Button
        variant="ghost"
        size="sm"
        class="h-6 text-xs gap-1 px-2"
        :disabled="!canStop"
        @click="store.stopExecution()"
      >
        <Loader2
          v-if="controlStatus === 'stopping'"
          class="w-3 h-3 animate-spin"
        />
        <Square
          v-else
          class="w-3 h-3"
        />
        {{ stopButtonText }}
      </Button>

      <div class="ml-auto flex items-center gap-3 text-[10px] text-muted-foreground">
        <span
          v-if="backendStatusText"
          class="text-amber-600 dark:text-amber-400"
        >
          {{ backendStatusText }}
        </span>
        <span v-if="progressText">进度: {{ progressText }}</span>
        <span v-if="elapsedText">耗时: {{ elapsedText }}</span>
        <span>{{ executionStatusText }}</span>
      </div>

      <Button
        variant="ghost"
        size="sm"
        class="h-5 w-5 p-0"
        @click="setExpanded(!expanded)"
      >
        <ChevronDown
          v-if="!expanded"
          class="w-3 h-3"
        />
        <ChevronUp
          v-else
          class="w-3 h-3"
        />
      </Button>
    </div>

    <!-- 展开区域：左右分栏 -->
    <div class="border-t border-border flex-1 min-h-0">
      <ResizablePanelGroup
        direction="horizontal"
        class="h-full"
        @layout="handleExecBarPanelResize"
      >
        <!-- 左侧：历史执行列表 -->
        <ResizablePanel
          :default-size="execBarPanelSizes[0]"
          :min-size="15"
          :max-size="40"
        >
          <div class="h-full flex flex-col">
            <div class="flex items-center justify-between px-2 py-1 border-b border-border">
              <span class="text-[10px] text-muted-foreground font-medium">执行历史</span>
              <Button
                v-if="store.executionLogs.length > 0"
                variant="ghost"
                size="sm"
                class="h-4 w-4 p-0"
                @click="store.clearExecutionLogs()"
              >
                <Trash2 class="w-2.5 h-2.5 text-muted-foreground" />
              </Button>
            </div>
            <ScrollArea class="flex-1 min-h-0">
              <div class="space-y-px p-1">
                <div
                  v-for="log in store.executionLogs"
                  :key="log.id"
                  class="flex items-center gap-1.5 px-2 py-1 rounded text-[10px] cursor-pointer hover:bg-muted/50 transition-colors"
                  :class="store.selectedExecutionLogId === log.id ? 'bg-muted' : ''"
                  @click="selectLog(log)"
                >
                  <CheckCircle
                    v-if="log.status === 'completed'"
                    class="w-3 h-3 text-green-500 shrink-0"
                  />
                  <XCircle
                    v-else-if="log.status === 'error'"
                    class="w-3 h-3 text-red-500 shrink-0"
                  />
                  <Circle
                    v-else
                    class="w-3 h-3 text-muted-foreground shrink-0"
                  />

                  <div class="flex-1 min-w-0">
                    <div class="truncate">
                      {{ formatTime(log.startedAt) }}
                    </div>
                    <div class="text-muted-foreground">
                      {{ log.steps.length }} 节点 · {{ formatDuration(log.startedAt, log.finishedAt) }}
                    </div>
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger as-child>
                      <Button
                        variant="ghost"
                        size="sm"
                        class="h-5 w-5 p-0 shrink-0 opacity-40 hover:opacity-100"
                        @click.stop
                      >
                        <MoreHorizontal class="w-3 h-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" class="min-w-[160px]">
                      <DropdownMenuItem
                        v-if="isElectron"
                        class="text-[11px] gap-2"
                        @click="openLogFile(log)"
                      >
                        <FolderOpen class="w-3 h-3" />
                        打开日志文件
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        class="text-[11px] gap-2"
                        @click="copyLogPath(log)"
                      >
                        <Copy class="w-3 h-3" />
                        复制日志位置
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        class="text-[11px] gap-2 text-red-500 focus:text-red-500"
                        @click="store.deleteExecutionLog(log.id)"
                      >
                        <Trash2 class="w-3 h-3" />
                        删除日志
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div
                  v-if="store.executionLogs.length === 0"
                  class="text-center text-[10px] text-muted-foreground py-4"
                >
                  暂无执行记录
                </div>
              </div>
            </ScrollArea>
          </div>
        </ResizablePanel>

        <ResizableHandle with-handle />

        <!-- 右侧：节点执行详情 - 横向滚动卡片 -->
        <ResizablePanel
          :default-size="execBarPanelSizes[1]"
          :min-size="40"
        >
          <div class="h-full flex flex-col">
            <div
              v-if="displayLog"
              class="execution-cards flex-1 min-h-0"
            >
              <RecycleScroller
                :items="stepCards"
                :item-size="288"
                :buffer="576"
                :key-field="'key'"
                direction="horizontal"
                class="h-full w-full px-2 py-2"
                item-class="execution-card-item"
              >
                <template #default="{ item: stepCard }">
                  <div class="h-full pr-2">
                    <div
                      class="w-[280px] border border-border rounded-md flex flex-col h-full overflow-hidden"
                      :class="stepCard.groupHue === undefined ? 'bg-background' : ''"
                      :style="stepCard.groupHue === undefined
                        ? undefined
                        : {
                          backgroundColor: `hsla(${stepCard.groupHue}, 45%, 50%, 0.05)`,
                          borderLeft: `3px solid hsl(${stepCard.groupHue}, 55%, 55%)`,
                        }"
                    >
                      <!-- 卡片 Header：状态 + 名称 + 时间 -->
                      <div class="flex items-center gap-1.5 px-2.5 py-1.5 border-b border-border">
                        <CheckCircle
                          v-if="stepCard.step.status === 'completed'"
                          class="w-3 h-3 text-green-500 shrink-0"
                        />
                        <XCircle
                          v-else-if="stepCard.step.status === 'error'"
                          class="w-3 h-3 text-red-500 shrink-0"
                        />
                        <Loader2
                          v-else-if="stepCard.step.status === 'running'"
                          class="w-3 h-3 text-blue-500 animate-spin shrink-0"
                        />
                        <Circle
                          v-else
                          class="w-3 h-3 text-muted-foreground shrink-0"
                        />
                        <span class="text-xs font-medium truncate flex-1">{{ stepCard.step.nodeLabel }}</span>
                        <span class="text-[10px] text-muted-foreground/60 shrink-0 font-mono">
                          {{ snapshotNodeMap.get(stepCard.step.nodeId)?.type || '' }}
                        </span>
                        <span class="text-[10px] text-muted-foreground shrink-0">
                          {{ stepCard.step.finishedAt ? formatDuration(stepCard.step.startedAt, stepCard.step.finishedAt) : '...' }}
                        </span>
                        <button
                          class="shrink-0 p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                          title="复制节点信息"
                          @click="copyNodeInfo(stepCard.step)"
                        >
                          <component :is="copiedNodeId === `info-${stepCard.step.nodeId}` ? Check : Copy" class="w-3 h-3" />
                        </button>
                      </div>

                      <!-- 错误信息 -->
                      <div
                        v-if="stepCard.step.error"
                        class="px-2.5 py-1 pr-1 text-[10px] text-red-500 bg-red-500/10 border-b border-border flex items-start gap-1"
                      >
                        <span class="flex-1 break-all">{{ stepCard.step.error }}</span>
                        <button
                          class="shrink-0 p-0.5 rounded hover:bg-red-500/20 text-red-400 hover:text-red-300 transition-colors"
                          title="复制错误信息"
                          @click="copyError(stepCard.step)"
                        >
                          <component :is="copiedNodeId === stepCard.step.nodeId ? Check : Copy" class="w-3 h-3" />
                        </button>
                      </div>

                      <!-- Tabs：输入 / 输出 / 日志 -->
                      <Tabs
                        :model-value="activeStepTab(stepCard.key)"
                        class="flex-1 flex flex-col min-h-0"
                        @update:model-value="stepTabs[stepCard.key] = $event"
                      >
                        <TabsList class="w-full h-7 rounded-none border-b border-border bg-transparent px-1">
                          <TabsTrigger
                            value="input"
                            class="text-[10px] h-5 px-2 flex-1"
                          >
                            输入
                          </TabsTrigger>
                          <TabsTrigger
                            value="output"
                            class="text-[10px] h-5 px-2 flex-1"
                          >
                            输出
                          </TabsTrigger>
                          <TabsTrigger
                            value="logs"
                            class="text-[10px] h-5 px-2 flex-1"
                          >
                            日志
                          </TabsTrigger>
                        </TabsList>

                        <TabsContent
                          value="input"
                          class="flex-1 min-h-0 mt-0"
                        >
                          <JsonEditor
                            v-if="activeStepTab(stepCard.key) === 'input' && stepCard.step.input !== undefined && stepCard.step.input !== null"
                            :model-value="stepCard.step.input"
                            :readonly="true"
                            height="100%"
                            mode="tree"
                            class="h-full [&_.json-editor-wrapper]:h-full [&_.json-editor-wrapper]:border-0"
                          />
                          <div
                            v-else
                            class="p-2 text-[10px] text-muted-foreground"
                          >
                            无输入
                          </div>
                        </TabsContent>

                        <TabsContent
                          value="output"
                          class="flex-1 min-h-0 mt-0"
                        >
                          <JsonEditor
                            v-if="activeStepTab(stepCard.key) === 'output' && stepCard.step.output !== undefined && stepCard.step.output !== null"
                            :model-value="stepCard.step.output"
                            :readonly="true"
                            height="100%"
                            mode="tree"
                            class="h-full [&_.json-editor-wrapper]:h-full [&_.json-editor-wrapper]:border-0"
                          />
                          <div
                            v-else
                            class="p-2 text-[10px] text-muted-foreground"
                          >
                            无输出
                          </div>
                        </TabsContent>

                        <TabsContent
                          value="logs"
                          class="flex-1 min-h-0 mt-0"
                        >
                          <DynamicScroller
                            v-if="activeStepTab(stepCard.key) === 'logs' && stepCard.step.logs && stepCard.step.logs.length > 0"
                            :items="stepCard.step.logs"
                            :min-item-size="22"
                            :key-field="logItemKey"
                            class="h-full px-2 py-1 execution-log-scroller"
                          >
                            <template #default="{ item: log, index, active }">
                              <DynamicScrollerItem
                                :item="log"
                                :active="active"
                                :index="index"
                                :size-dependencies="[log.level, log.message]"
                                :emit-resize="true"
                              >
                                <div
                                  class="flex items-start gap-1 text-[10px] px-1.5 py-0.5 my-px rounded"
                                  :class="{
                                    'text-blue-600 dark:text-blue-400 bg-blue-500/10': log.level === 'info',
                                    'text-yellow-600 dark:text-yellow-400 bg-yellow-500/10': log.level === 'warning',
                                    'text-red-600 dark:text-red-400 bg-red-500/10': log.level === 'error',
                                  }"
                                >
                                  <Info v-if="log.level === 'info'" class="w-2.5 h-2.5 shrink-0 mt-0.5" />
                                  <AlertTriangle v-else-if="log.level === 'warning'" class="w-2.5 h-2.5 shrink-0 mt-0.5" />
                                  <AlertCircleIcon v-else class="w-2.5 h-2.5 shrink-0 mt-0.5" />
                                  <span class="break-all">{{ log.message }}</span>
                                </div>
                              </DynamicScrollerItem>
                            </template>
                          </DynamicScroller>
                          <div
                            v-else
                            class="p-2 text-[10px] text-muted-foreground"
                          >
                            无日志
                          </div>
                        </TabsContent>
                      </Tabs>
                    </div>
                  </div>
                </template>
              </RecycleScroller>
            </div>
            <div
              v-else
              class="flex-1 flex items-center justify-center text-[10px] text-muted-foreground"
            >
              选择一条执行记录查看详情
            </div>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>

    <!-- 执行输入表单 Drawer -->
    <ExecutionInputDrawer
      v-model:open="inputDrawerOpen"
      :fields="startInputFields"
      :workflow-id="store.currentWorkflow?.id ?? ''"
      @submit="handleInputSubmit"
    />
  </div>
</template>

<style scoped>
.execution-cards {
  scrollbar-width: none;
}
.execution-cards::-webkit-scrollbar {
  display: none;
}
</style>
