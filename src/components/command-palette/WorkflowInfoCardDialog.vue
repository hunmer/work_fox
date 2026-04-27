<!-- src/components/command-palette/WorkflowInfoCardDialog.vue -->
<!-- 工作流信息卡片：展示工作流详情，运行后展示结束节点的输出结果 -->

<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Spinner } from '@/components/ui/spinner'
import { useNotification } from '@/composables/useNotification'
import { workflowBackendApi } from '@/lib/backend-api/workflow'
import { createWorkflowDomainApi } from '@/lib/backend-api/workflow-domain'
import { wsBridge } from '@/lib/ws-bridge'
import type { Workflow, ExecutionLog, ExecutionStep } from '@shared/workflow-types'
import type { OutputField } from '@shared/workflow-types'
import type { ExecutionEventMap, ExecutionEventChannel } from '@shared/execution-events'
import {
  Play,
  FolderOpen,
  Clock,
  GitBranch,
  Eye,
  Loader2,
  CheckCircle2,
  XCircle,
  ArrowLeft,
} from 'lucide-vue-next'

type RunStatus = 'idle' | 'running' | 'completed' | 'error'

const props = defineProps<{
  open: boolean
  workflowId: string | null
}>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'open-in-editor', workflow: Workflow): void
}>()

const notify = useNotification()

const workflow = ref<Workflow | null>(null)
const loading = ref(false)
const runStatus = ref<RunStatus>('idle')
const executionError = ref<string | null>(null)
const endNodeOutput = ref<unknown>(null)
const executionSteps = ref<ExecutionStep[]>([])
const currentExecutionId = ref<string | null>(null)

const startNode = computed(() => {
  if (!workflow.value) return null
  return workflow.value.nodes.find((n) => n.type === 'start') ?? null
})

const inputFields = computed<OutputField[]>(() => {
  if (!startNode.value) return []
  return (startNode.value.data?.inputFields as OutputField[]) ?? []
})

const hasInputFields = computed(() => inputFields.value.length > 0)
const nodeCount = computed(() => workflow.value?.nodes.length ?? 0)
const edgeCount = computed(() => workflow.value?.edges.length ?? 0)
const isRunning = computed(() => runStatus.value === 'running')
const hasResult = computed(() => runStatus.value === 'completed' || runStatus.value === 'error')

function formatDate(ts: number | string | undefined): string {
  if (!ts) return '-'
  const d = typeof ts === 'number' ? new Date(ts) : new Date(ts)
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function resetInputValues() {
  const values: Record<string, unknown> = {}
  for (const field of inputFields.value) {
    if (field.value !== undefined) {
      values[field.key] = field.value
    } else {
      switch (field.type) {
        case 'number':
          values[field.key] = 0
          break
        case 'boolean':
          values[field.key] = false
          break
        default:
          values[field.key] = ''
          break
      }
    }
  }
  inputValues.value = values
}

function resetExecutionState() {
  runStatus.value = 'idle'
  executionError.value = null
  endNodeOutput.value = null
  executionSteps.value = []
  currentExecutionId.value = null
}

const inputValues = ref<Record<string, unknown>>({})

async function loadWorkflow() {
  if (!props.workflowId) {
    workflow.value = null
    return
  }
  loading.value = true
  try {
    const data = await workflowBackendApi.get(props.workflowId)
    workflow.value = data as Workflow
    resetInputValues()
    resetExecutionState()
  } catch {
    notify.error('加载工作流失败')
    workflow.value = null
  } finally {
    loading.value = false
  }
}

// 从 execution log 中提取 end 节点的输出
function extractEndNodeOutput(log: ExecutionLog, wf: Workflow | null): unknown {
  if (!log?.steps || !wf) return undefined

  const endStep = log.steps.find((step) => {
    const node = wf.nodes.find((n) => n.id === step.nodeId)
    return node?.type === 'end'
  })

  return endStep?.output
}

// 监听执行事件
function handleExecutionEvent(channel: ExecutionEventChannel, payload: ExecutionEventMap[ExecutionEventChannel]) {
  // 只处理当前执行的 workflow
  if (!workflow.value) return
  if (payload.workflowId && payload.workflowId !== workflow.value.id) return

  switch (channel) {
    case 'workflow:completed': {
      const completedPayload = payload as ExecutionEventMap['workflow:completed']
      runStatus.value = 'completed'
      executionSteps.value = completedPayload.log?.steps ?? []
      endNodeOutput.value = extractEndNodeOutput(completedPayload.log, workflow.value)
      break
    }
    case 'workflow:error': {
      const errorPayload = payload as ExecutionEventMap['workflow:error']
      runStatus.value = 'error'
      executionError.value = errorPayload.error?.message || '执行失败'
      executionSteps.value = errorPayload.log?.steps ?? []
      endNodeOutput.value = extractEndNodeOutput(errorPayload.log!, workflow.value)
      break
    }
  }
}

const executionChannels: ExecutionEventChannel[] = ['workflow:completed', 'workflow:error']

watch(
  () => props.workflowId,
  (id) => {
    if (id && props.open) {
      loadWorkflow()
    } else {
      workflow.value = null
      resetExecutionState()
    }
  },
)

watch(
  () => props.open,
  (val) => {
    if (val && props.workflowId) {
      loadWorkflow()
      // 注册执行事件监听
      for (const channel of executionChannels) {
        wsBridge.on(channel, handleExecutionEvent as any)
      }
    } else {
      // 清理监听
      for (const channel of executionChannels) {
        wsBridge.off(channel, handleExecutionEvent as any)
      }
    }
  },
)

onBeforeUnmount(() => {
  for (const channel of executionChannels) {
    wsBridge.off(channel, handleExecutionEvent as any)
  }
})

async function handleRun() {
  if (!workflow.value || isRunning.value) return
  resetExecutionState()
  runStatus.value = 'running'
  try {
    const input = hasInputFields.value ? { ...inputValues.value } : undefined
    const result = await createWorkflowDomainApi().workflow.execute(workflow.value.id, input)
    currentExecutionId.value = result.executionId
    // 不关闭对话框，等待 workflow:completed 事件
  } catch (err) {
    runStatus.value = 'error'
    executionError.value = err instanceof Error ? err.message : String(err)
  }
}

function handleBack() {
  resetExecutionState()
}

function handleOpenInEditor() {
  if (!workflow.value) return
  emit('open-in-editor', workflow.value)
  emit('update:open', false)
}

function formatOutput(value: unknown): string {
  if (value === undefined || value === null) return '(无输出)'
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

// 获取完成的步骤数
const completedStepCount = computed(() =>
  executionSteps.value.filter((s) => s.status === 'completed').length,
)
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:max-w-lg" :show-close_button="true">
      <!-- Loading -->
      <div v-if="loading" class="flex items-center justify-center py-12">
        <Spinner class="size-6" />
        <span class="ml-2 text-sm text-muted-foreground">加载中...</span>
      </div>

      <!-- Content -->
      <template v-else-if="workflow">
        <!-- ====== 执行结果视图 ====== -->
        <template v-if="hasResult">
          <DialogHeader>
            <DialogTitle class="flex items-center gap-2">
              <CheckCircle2 v-if="runStatus === 'completed'" class="size-5 text-green-500" />
              <XCircle v-else class="size-5 text-destructive" />
              {{ runStatus === 'completed' ? '执行完成' : '执行失败' }}
            </DialogTitle>
            <DialogDescription>{{ workflow.name }}</DialogDescription>
          </DialogHeader>

          <!-- 执行统计 -->
          <div class="flex flex-wrap gap-2 py-1">
            <Badge variant="secondary" class="gap-1">
              <GitBranch class="size-3" />
              {{ completedStepCount }} / {{ executionSteps.length }} 步骤
            </Badge>
          </div>

          <!-- 错误信息 -->
          <div
            v-if="executionError"
            class="rounded-md bg-destructive/10 p-3 text-sm text-destructive"
          >
            {{ executionError }}
          </div>

          <!-- 结束节点输出 -->
          <template v-if="endNodeOutput !== undefined && endNodeOutput !== null">
            <Separator />
            <div class="space-y-2">
              <h4 class="text-sm font-medium flex items-center gap-1.5">
                <CheckCircle2 class="size-3.5 text-green-500" />
                输出结果
              </h4>
              <!-- 对象类型输出 -->
              <div
                v-if="typeof endNodeOutput === 'object'"
                class="space-y-1.5"
              >
                <div
                  v-for="(value, key) in (endNodeOutput as Record<string, unknown>)"
                  :key="String(key)"
                  class="flex flex-col gap-0.5 rounded-md border px-3 py-2"
                >
                  <span class="text-xs font-medium text-muted-foreground">{{ key }}</span>
                  <span class="text-sm break-all">{{ formatOutput(value) }}</span>
                </div>
              </div>
              <!-- 简单类型输出 -->
              <div v-else class="rounded-md border px-3 py-2">
                <pre class="whitespace-pre-wrap break-all text-sm">{{ formatOutput(endNodeOutput) }}</pre>
              </div>
            </div>
          </template>

          <!-- 无输出提示 -->
          <template v-else-if="runStatus === 'completed'">
            <Separator />
            <p class="text-sm text-muted-foreground">工作流执行完成，结束节点无输出数据。</p>
          </template>

          <DialogFooter class="gap-2">
            <Button variant="outline" size="sm" @click="handleBack">
              <ArrowLeft class="mr-1 size-4" />
              返回
            </Button>
            <Button variant="outline" size="sm" @click="handleOpenInEditor">
              <FolderOpen class="mr-1 size-4" />
              在编辑器中打开
            </Button>
            <Button size="sm" :disabled="isRunning" @click="handleRun">
              <Play class="mr-1 size-4" />
              重新运行
            </Button>
          </DialogFooter>
        </template>

        <!-- ====== 运行中视图 ====== -->
        <template v-else-if="isRunning">
          <DialogHeader>
            <DialogTitle class="flex items-center gap-2">
              <Loader2 class="size-5 animate-spin text-primary" />
              正在运行...
            </DialogTitle>
            <DialogDescription>{{ workflow.name }}</DialogDescription>
          </DialogHeader>
          <div class="flex flex-col items-center justify-center py-8 gap-3">
            <Spinner class="size-8" />
            <p class="text-sm text-muted-foreground">工作流执行中，请稍候...</p>
          </div>
        </template>

        <!-- ====== 详情视图（默认） ====== -->
        <template v-else>
          <DialogHeader>
            <DialogTitle class="flex items-center gap-2">
              <Play class="size-5 text-primary" />
              {{ workflow.name }}
            </DialogTitle>
            <DialogDescription v-if="workflow.description">
              {{ workflow.description }}
            </DialogDescription>
          </DialogHeader>

          <!-- 工作流元信息 -->
          <div class="flex flex-wrap gap-2 py-1">
            <Badge variant="secondary" class="gap-1">
              <GitBranch class="size-3" />
              {{ nodeCount }} 个节点
            </Badge>
            <Badge variant="secondary" class="gap-1">
              <Eye class="size-3" />
              {{ edgeCount }} 条连线
            </Badge>
            <Badge variant="secondary" class="gap-1">
              <Clock class="size-3" />
              {{ formatDate(workflow.updatedAt) }}
            </Badge>
            <Badge v-if="workflow.folderId" variant="outline" class="gap-1">
              <FolderOpen class="size-3" />
              {{ workflow.folderId }}
            </Badge>
          </div>

          <!-- 参数表单 -->
          <template v-if="hasInputFields">
            <Separator />
            <div class="space-y-3">
              <h4 class="text-sm font-medium">运行参数</h4>
              <div
                v-for="field in inputFields"
                :key="field.key"
                class="space-y-1"
              >
                <label
                  :for="`input-${field.key}`"
                  class="text-sm font-medium leading-none"
                >
                  {{ field.key }}
                  <span class="ml-1 text-xs text-muted-foreground">
                    ({{ field.type }})
                  </span>
                </label>

                <!-- Boolean -->
                <template v-if="field.type === 'boolean'">
                  <div class="flex items-center gap-2">
                    <input
                      :id="`input-${field.key}`"
                      v-model="inputValues[field.key]"
                      type="checkbox"
                      class="size-4 rounded border-input"
                    />
                    <span class="text-sm text-muted-foreground">
                      {{ inputValues[field.key] ? '是' : '否' }}
                    </span>
                  </div>
                </template>

                <!-- Number -->
                <template v-else-if="field.type === 'number'">
                  <input
                    :id="`input-${field.key}`"
                    v-model.number="inputValues[field.key]"
                    type="number"
                    class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </template>

                <!-- String / Object / Any -->
                <template v-else>
                  <textarea
                    :id="`input-${field.key}`"
                    v-model="inputValues[field.key]"
                    rows="2"
                    class="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
                    :placeholder="`输入 ${field.key} 的值`"
                  />
                </template>
              </div>
            </div>
          </template>

          <!-- 无参数提示 -->
          <template v-else>
            <Separator />
            <p class="text-sm text-muted-foreground">
              此工作流无需输入参数，可直接运行。
            </p>
          </template>

          <DialogFooter class="gap-2">
            <Button variant="outline" @click="handleOpenInEditor">
              <FolderOpen class="mr-1 size-4" />
              在编辑器中打开
            </Button>
            <Button :disabled="isRunning" @click="handleRun">
              <Loader2 v-if="isRunning" class="mr-1 size-4 animate-spin" />
              <Play v-else class="mr-1 size-4" />
              运行工作流
            </Button>
          </DialogFooter>
        </template>
      </template>

      <!-- 空状态 -->
      <template v-else>
        <DialogHeader>
          <DialogTitle>工作流详情</DialogTitle>
        </DialogHeader>
        <p class="py-8 text-center text-sm text-muted-foreground">
          未选择工作流
        </p>
      </template>
    </DialogContent>
  </Dialog>
</template>
