<script setup lang="ts">
import { computed, inject, ref } from 'vue'
import { useWorkflowStore } from '@/stores/workflow'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import JsonEditor from '@/components/ui/json-editor/JsonEditor.vue'
import { Play, Pause, Square, ChevronDown, ChevronUp, CheckCircle, XCircle, Loader2, Circle, Trash2, AlertTriangle, Info, AlertCircle as AlertCircleIcon, Copy, Check, MoreHorizontal, FolderOpen } from 'lucide-vue-next'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { executionLogBackendApi } from '@/lib/backend-api/execution-log'
import type { ExecutionLog } from '@/lib/workflow/types'
import { WORKFLOW_EXEC_BAR_LAYOUT_KEY } from './workflowLayoutContext'

const stepTabs = ref<Record<string, string>>({})
const copiedNodeId = ref<string | null>(null)

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

const isRunning = computed(() => store.executionStatus === 'running')
const isPaused = computed(() => store.executionStatus === 'paused')
const canStart = computed(() => {
  if (isRunning.value || isPaused.value) return false
  return !store.executionValidationError
})
const canPause = computed(() => isRunning.value)
const canResume = computed(() => isPaused.value)
const canStop = computed(() => isRunning.value || isPaused.value)

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
    store.selectedExecutionLogId = log.id
    if (log.snapshot && store.currentWorkflow) {
      store.currentWorkflow.nodes = JSON.parse(JSON.stringify(log.snapshot.nodes))
      store.currentWorkflow.edges = JSON.parse(JSON.stringify(log.snapshot.edges))
    }
  } else {
    store.selectedExecutionLogId = log.id
    store.enterPreview(log)
  }
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
        v-if="canResume"
        variant="ghost"
        size="sm"
        class="h-6 text-xs gap-1 px-2"
        @click="store.resumeExecution()"
      >
        <Play class="w-3 h-3" /> 继续
      </Button>
      <Button
        v-else
        variant="ghost"
        size="sm"
        class="h-6 text-xs gap-1 px-2"
        :disabled="!canStart"
        @click="store.startExecution(); setExpanded(true)"
      >
        <Play class="w-3 h-3" /> 执行
      </Button>

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
        <Pause class="w-3 h-3" /> 暂停
      </Button>

      <Button
        variant="ghost"
        size="sm"
        class="h-6 text-xs gap-1 px-2"
        :disabled="!canStop"
        @click="store.stopExecution()"
      >
        <Square class="w-3 h-3" /> 停止
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
        <span>{{ store.executionStatus }}</span>
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
              class="execution-cards flex-1 min-h-0 flex gap-2 p-2 overflow-x-auto"
            >
              <div
                v-for="step in displayLog.steps"
                :key="step.nodeId"
                class="shrink-0 w-[280px] border border-border rounded-md flex flex-col h-full bg-background overflow-hidden"
              >
                <!-- 卡片 Header：状态 + 名称 + 时间 -->
                <div class="flex items-center gap-1.5 px-2.5 py-1.5 border-b border-border">
                  <CheckCircle
                    v-if="step.status === 'completed'"
                    class="w-3 h-3 text-green-500 shrink-0"
                  />
                  <XCircle
                    v-else-if="step.status === 'error'"
                    class="w-3 h-3 text-red-500 shrink-0"
                  />
                  <Loader2
                    v-else-if="step.status === 'running'"
                    class="w-3 h-3 text-blue-500 animate-spin shrink-0"
                  />
                  <Circle
                    v-else
                    class="w-3 h-3 text-muted-foreground shrink-0"
                  />
                  <span class="text-xs font-medium truncate flex-1">{{ step.nodeLabel }}</span>
                  <span class="text-[10px] text-muted-foreground shrink-0">
                    {{ step.finishedAt ? formatDuration(step.startedAt, step.finishedAt) : '...' }}
                  </span>
                </div>

                <!-- 错误信息 -->
                <div
                  v-if="step.error"
                  class="px-2.5 py-1 pr-1 text-[10px] text-red-500 bg-red-500/10 border-b border-border flex items-start gap-1"
                >
                  <span class="flex-1 break-all">{{ step.error }}</span>
                  <button
                    class="shrink-0 p-0.5 rounded hover:bg-red-500/20 text-red-400 hover:text-red-300 transition-colors"
                    title="复制错误信息"
                    @click="copyError(step)"
                  >
                    <component :is="copiedNodeId === step.nodeId ? Check : Copy" class="w-3 h-3" />
                  </button>
                </div>

                <!-- Tabs：输入 / 输出 / 日志 -->
                <Tabs
                  :model-value="stepTabs[step.nodeId] || 'input'"
                  class="flex-1 flex flex-col min-h-0"
                  @update:model-value="stepTabs[step.nodeId] = $event"
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
                      v-if="step.input !== undefined && step.input !== null"
                      :model-value="step.input"
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
                      v-if="step.output !== undefined && step.output !== null"
                      :model-value="step.output"
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
                    <ScrollArea class="h-full">
                      <div
                        v-if="step.logs && step.logs.length > 0"
                        class="p-2 space-y-px"
                      >
                        <div
                          v-for="(log, idx) in step.logs"
                          :key="idx"
                          class="flex items-start gap-1 text-[10px] px-1.5 py-0.5 rounded"
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
                      </div>
                      <div
                        v-else
                        class="p-2 text-[10px] text-muted-foreground"
                      >
                        无日志
                      </div>
                    </ScrollArea>
                  </TabsContent>
                </Tabs>
              </div>
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
