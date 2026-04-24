<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { ToolCall } from '@/types'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import JsonEditor from '@/components/ui/json-editor/JsonEditor.vue'

const props = defineProps<{
  toolCall: ToolCall
}>()

const emit = defineEmits<{
  rerun: [toolCall: ToolCall]
  answerQuestion: [answer: string]
}>()

const isRerunning = ref(false)
const showArgs = ref(true)
const showResult = ref(false)
const copied = ref(false)
const selectedAnswers = ref<Record<number, string[]>>({})
const submitted = ref(false)

interface AskQuestionOption {
  label: string
  description?: string
  preview?: string
}

interface AskQuestionItem {
  question: string
  header?: string
  options: AskQuestionOption[]
  multiSelect?: boolean
}

function copyResult() {
  const lines: string[] = []
  lines.push(`工具: ${props.toolCall.name}`)
  if (props.toolCall.input != null) {
    lines.push(`\n参数:\n${typeof props.toolCall.input === 'string' ? props.toolCall.input : JSON.stringify(props.toolCall.input, null, 2)}`)
  }
  if (props.toolCall.error) {
    lines.push(`\n错误:\n${props.toolCall.error}`)
  } else if (props.toolCall.result != null) {
    lines.push(`\n结果:\n${formattedResult.value}`)
  }
  const text = lines.join('')
  if (!text) return
  navigator.clipboard.writeText(text).then(() => {
    copied.value = true
    setTimeout(() => (copied.value = false), 1500)
  })
}

const statusConfig: Record<string, { label: string; class: string; icon: string }> = {
  pending: { label: '等待中', class: 'bg-muted text-muted-foreground', icon: '⏳' },
  running: { label: '执行中', class: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300', icon: '⚙️' },
  completed: { label: '完成', class: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300', icon: '✅' },
  error: { label: '错误', class: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300', icon: '❌' },
}

const config = computed(() => statusConfig[props.toolCall.status] ?? statusConfig.pending)

function normalizeToolName(name: string): string {
  return name
    .replace(/^mcp__.*?__/, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase()
}

const isAskUserQuestion = computed(() => {
  return normalizeToolName(props.toolCall.name).includes('askuserquestion')
})

const askUserQuestions = computed<AskQuestionItem[]>(() => {
  const result = props.toolCall.result
  const resultObject = result && typeof result === 'object' && !Array.isArray(result)
    ? result as Record<string, unknown>
    : undefined
  const resultText = resultObject?.content && Array.isArray(resultObject.content)
    ? resultObject.content
        .filter((item): item is Record<string, unknown> => item !== null && typeof item === 'object' && !Array.isArray(item))
        .map((item) => (typeof item.text === 'string' ? item.text : ''))
        .find(Boolean)
    : undefined

  let parsedResultText: Record<string, unknown> | undefined
  if (resultText) {
    try {
      const parsed = JSON.parse(resultText)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        parsedResultText = parsed as Record<string, unknown>
      }
    } catch {
      parsedResultText = undefined
    }
  }

  const rawQuestions = Array.isArray(props.toolCall.args?.questions)
    ? props.toolCall.args.questions
    : Array.isArray(resultObject?.questions)
      ? resultObject.questions
      : Array.isArray(parsedResultText?.questions)
        ? parsedResultText.questions
        : []

  return rawQuestions
    .filter((item): item is Record<string, unknown> => item !== null && typeof item === 'object' && !Array.isArray(item))
    .map((item) => {
      const rawOptions = Array.isArray(item.options) ? item.options : []
      return {
        question: typeof item.question === 'string' ? item.question : '',
        header: typeof item.header === 'string' ? item.header : undefined,
        multiSelect: item.multiSelect === true,
        options: rawOptions
          .filter((option): option is Record<string, unknown> => option !== null && typeof option === 'object' && !Array.isArray(option))
          .map((option) => ({
            label: typeof option.label === 'string' ? option.label : '',
            description: typeof option.description === 'string' ? option.description : undefined,
            preview: typeof option.preview === 'string' ? option.preview : undefined,
          }))
          .filter((option) => option.label),
      }
    })
    .filter((item) => item.question && item.options.length > 0)
})

const hasQuestionSelection = computed(() => askUserQuestions.value.length > 0)

watch(
  () => ({
    id: props.toolCall.id,
    name: props.toolCall.name,
    normalizedName: normalizeToolName(props.toolCall.name),
    status: props.toolCall.status,
    argsKeys: Object.keys(props.toolCall.args ?? {}),
    hasArgsQuestions: Array.isArray(props.toolCall.args?.questions),
    resultType: props.toolCall.result == null
      ? 'none'
      : Array.isArray(props.toolCall.result)
        ? 'array'
        : typeof props.toolCall.result,
    resultKeys: props.toolCall.result && typeof props.toolCall.result === 'object' && !Array.isArray(props.toolCall.result)
      ? Object.keys(props.toolCall.result as Record<string, unknown>)
      : [],
    isAskUserQuestion: isAskUserQuestion.value,
    questionCount: askUserQuestions.value.length,
    args: props.toolCall.args,
    result: props.toolCall.result,
  }),
  (snapshot) => {
    if (snapshot.isAskUserQuestion || snapshot.name.toLowerCase().includes('question')) {
      console.debug('[ToolCallCard] tool snapshot:', snapshot)
    }
  },
  { immediate: true, deep: true },
)

const canSubmitQuestionAnswer = computed(() => {
  return hasQuestionSelection.value && askUserQuestions.value.every((_, index) => selectedAnswers.value[index]?.length)
})

const hasArgs = computed(() => {
  return props.toolCall.args && Object.keys(props.toolCall.args).length > 0
})

const formattedArgs = computed(() => {
  if (!hasArgs.value) return ''
  return JSON.stringify(props.toolCall.args, null, 2)
})

/** 将 args 格式化为更可读的键值对列表 */
const argEntries = computed(() => {
  if (!hasArgs.value) return []
  return Object.entries(props.toolCall.args).map(([key, value]) => ({
    key,
    value: typeof value === 'string' ? value : JSON.stringify(value, null, 2),
  }))
})

const formattedResult = computed(() => {
  const result = props.toolCall.result
  if (result == null) return ''
  if (typeof result === 'string') {
    try {
      const parsed = JSON.parse(result)
      return JSON.stringify(parsed, null, 2)
    } catch {
      return result
    }
  }
  return JSON.stringify(result, null, 2)
})

const parsedResult = computed(() => {
  const result = props.toolCall.result
  if (result == null) return undefined
  if (typeof result === 'string') {
    try { return JSON.parse(result) } catch { return undefined }
  }
  return result
})

const isJsonResult = computed(() => parsedResult.value !== undefined && typeof parsedResult.value === 'object')

function isOptionSelected(questionIndex: number, label: string) {
  return selectedAnswers.value[questionIndex]?.includes(label) ?? false
}

function toggleQuestionOption(questionIndex: number, label: string, multiSelect?: boolean) {
  if (submitted.value) return
  const current = selectedAnswers.value[questionIndex] ?? []
  if (!multiSelect) {
    selectedAnswers.value = { ...selectedAnswers.value, [questionIndex]: [label] }
    return
  }

  const next = current.includes(label)
    ? current.filter((item) => item !== label)
    : [...current, label]
  selectedAnswers.value = { ...selectedAnswers.value, [questionIndex]: next }
}

function submitQuestionAnswer() {
  if (!canSubmitQuestionAnswer.value || submitted.value) return
  const lines = askUserQuestions.value.map((question, index) => {
    const answers = selectedAnswers.value[index] ?? []
    return `${question.header ? `${question.header}: ` : ''}${question.question}\n选择: ${answers.join(', ')}`
  })
  submitted.value = true
  emit('answerQuestion', lines.join('\n\n'))
}

const isImageResult = computed(() => {
  const result = props.toolCall.result
  return result && typeof result === 'object' && '_isImageContent' in result
})

const imageUrl = computed(() => {
  if (!isImageResult.value) return ''
  return (props.toolCall.result as Record<string, unknown>)?.url as string ?? ''
})

/** 格式化耗时 */
const duration = computed(() => {
  const { startedAt, completedAt } = props.toolCall
  if (!startedAt || !completedAt) return ''
  const ms = completedAt - startedAt
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
})

const isFinished = computed(() => props.toolCall.status === 'completed' || props.toolCall.status === 'error')

async function handleRerun() {
  if (isRerunning.value) return
  showResult.value = true
  isRerunning.value = true
  try {
    emit('rerun', props.toolCall)
  } finally {
    isRerunning.value = false
  }
}
</script>

<template>
  <div class="my-1 rounded-md border text-xs">
    <!-- 工具名 + 状态 -->
    <div class="flex items-center justify-between px-3 py-1.5">
      <div class="flex items-center gap-2">
        <span class="font-mono font-medium text-foreground">{{ toolCall.name }}</span>
        <span
          v-if="duration"
          class="text-[10px] text-muted-foreground"
        >{{ duration }}</span>
      </div>
      <div class="flex items-center gap-1">
        <span
          class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium"
          :class="config.class"
        >
          {{ config.icon }} {{ config.label }}
        </span>
        <button
          v-if="isFinished"
          class="p-0.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          :class="{ 'animate-spin': isRerunning }"
          title="重新运行"
          @click="handleRerun"
        >
          <svg
            class="h-3 w-3"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
        </button>
      </div>
    </div>

    <!-- 输入参数 -->
    <!-- askUserQuestion 内嵌选择 UI -->
    <div
      v-if="isAskUserQuestion && hasQuestionSelection"
      class="border-t px-3 py-2 space-y-3"
    >
      <div class="text-[11px] text-muted-foreground">
        Claude 需要你选择后继续。
      </div>

      <div
        v-for="(question, questionIndex) in askUserQuestions"
        :key="`${question.header || 'question'}-${questionIndex}`"
        class="space-y-2"
      >
        <div class="space-y-1">
          <div
            v-if="question.header"
            class="inline-flex rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
          >
            {{ question.header }}
          </div>
          <div class="text-sm font-medium leading-snug">
            {{ question.question }}
          </div>
          <div
            v-if="question.multiSelect"
            class="text-[10px] text-muted-foreground"
          >
            可多选
          </div>
        </div>

        <div class="grid gap-1.5">
          <button
            v-for="option in question.options"
            :key="option.label"
            type="button"
            class="text-left rounded-md border px-2.5 py-2 transition-colors"
            :class="isOptionSelected(questionIndex, option.label)
              ? 'border-primary bg-primary/10 text-foreground'
              : 'border-border hover:border-primary/50 hover:bg-muted/50'"
            :disabled="submitted"
            @click="toggleQuestionOption(questionIndex, option.label, question.multiSelect)"
          >
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <div class="text-xs font-semibold">
                  {{ option.label }}
                </div>
                <div
                  v-if="option.description"
                  class="mt-0.5 text-[11px] text-muted-foreground leading-snug"
                >
                  {{ option.description }}
                </div>
              </div>
              <span
                v-if="isOptionSelected(questionIndex, option.label)"
                class="shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[10px] text-primary-foreground"
              >
                已选
              </span>
            </div>
            <pre
              v-if="option.preview"
              class="mt-2 max-h-32 overflow-auto rounded bg-muted/70 p-2 text-[10px] leading-relaxed whitespace-pre-wrap"
            >{{ option.preview }}</pre>
          </button>
        </div>
      </div>

      <button
        type="button"
        class="w-full rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity disabled:opacity-50"
        :disabled="!canSubmitQuestionAnswer || submitted"
        @click="submitQuestionAnswer"
      >
        {{ submitted ? '已发送选择' : '发送选择' }}
      </button>
    </div>

    <Collapsible
      v-else-if="hasArgs && !isAskUserQuestion"
      v-model:open="showArgs"
      class="border-t"
    >
      <CollapsibleTrigger class="w-full flex items-center gap-1 px-3 py-1 text-muted-foreground hover:text-foreground cursor-pointer text-[11px]">
        <svg
          class="h-3 w-3 transition-transform"
          :class="showArgs ? 'rotate-90' : ''"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M9 18l6-6-6-6" />
        </svg>
        <span>输入参数</span>
        <span class="text-[10px] opacity-60">({{ argEntries.length }})</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div class="px-3 pb-2 space-y-1">
          <div
            v-for="entry in argEntries"
            :key="entry.key"
            class="flex gap-2"
          >
            <span class="font-mono text-blue-600 dark:text-blue-400 shrink-0">{{ entry.key }}:</span>
            <span class="font-mono text-muted-foreground break-all">{{ entry.value }}</span>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>

    <!-- 无参数时的提示（仅 running 状态显示） -->
    <div
      v-else-if="isAskUserQuestion"
      class="px-3 py-2 border-t text-[11px] text-amber-700 dark:text-amber-300 space-y-1"
    >
      <div class="font-medium">
        等待问题参数...
      </div>
      <div class="text-muted-foreground">
        已识别为 askUserQuestion，但当前卡片还没有解析到 questions。请查看控制台 [ToolCallCard] 调试输出。
      </div>
    </div>
    <div
      v-else-if="toolCall.status === 'running'"
      class="px-3 py-1 border-t text-[11px] text-muted-foreground flex items-center gap-1"
    >
      <span class="inline-block w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
      <span>接收参数中...</span>
    </div>

    <!-- 输出结果 -->
    <Collapsible
      v-if="toolCall.result != null || toolCall.error"
      v-model:open="showResult"
      class="border-t"
    >
      <div class="w-full flex items-center justify-between px-3 py-1 text-muted-foreground text-[11px]">
        <CollapsibleTrigger class="flex items-center gap-1 hover:text-foreground cursor-pointer">
          <svg
            class="h-3 w-3 transition-transform"
            :class="showResult ? 'rotate-90' : ''"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M9 18l6-6-6-6" />
          </svg>
          <span>{{ showResult ? '收起结果' : '查看结果' }}</span>
        </CollapsibleTrigger>
        <button
          class="p-0.5 rounded hover:bg-muted hover:text-foreground transition-colors"
          title="复制全部信息"
          @click.stop="copyResult"
        >
          <svg
            v-if="!copied"
            class="h-3 w-3"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <rect
              x="9"
              y="9"
              width="13"
              height="13"
              rx="2"
              ry="2"
            />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
          <svg
            v-else
            class="h-3 w-3 text-green-500"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </button>
      </div>
      <CollapsibleContent>
        <div
          v-if="toolCall.error"
          class="px-3 pb-2 text-red-500 font-mono text-[11px]"
        >
          {{ toolCall.error }}
        </div>
        <div
          v-else-if="isImageResult"
          class="px-3 pb-2"
        >
          <img
            :src="imageUrl"
            alt="Screenshot"
            class="rounded border max-w-full max-h-64 object-contain"
            loading="lazy"
          >
        </div>
        <div
          v-else-if="isJsonResult"
          class="px-3 pb-2"
        >
          <JsonEditor
            :model-value="parsedResult"
            :readonly="true"
            :height="200"
          />
        </div>
        <pre
          v-else
          class="font-mono text-[11px] bg-muted/50 rounded px-3 pb-2 mx-3 mb-2 px-2 py-1 overflow-x-auto whitespace-pre-wrap break-all max-h-60 m-0"
        >{{ formattedResult }}</pre>
      </CollapsibleContent>
    </Collapsible>
  </div>
</template>
