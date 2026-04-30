<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupText,
} from '@/components/ui/input-group'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import {
  Braces, CheckCircle2, Circle, CircleDot, FolderTree, ImagePlus, ListTodo, Send, Square, Trash2, Wrench, Crosshair,
} from 'lucide-vue-next'
import type { ToolCall, ToolDisplayItem } from '@/types'
import { useAgentSettingsStore } from '@/stores/agent-settings'
import { useChatUIStore } from '@/stores/chat-ui'
import { useTabStore } from '@/stores/tab'
import ModelSelector from './ModelSelector.vue'
import { ChatInputEditor, SuggestionPopup } from './tiptap'

const props = defineProps<{
  isStreaming: boolean
  disabled?: boolean
  tools?: ToolDisplayItem[]
  enabledTools?: Record<string, boolean>
  streamingToolCalls?: ToolCall[]
  isWorkflowContext?: boolean
  workflowEditMode?: boolean
  selectedNodes?: Array<{ id: string; type: string; label: string }>
}>()

const emit = defineEmits<{
  send: [content: string, images: string[]]
  stop: []
  clear: []
  toggleTool: [toolName: string]
  toggleWorkflowEdit: [enabled: boolean]
  openAgentSettings: [scope: 'global' | 'workflow']
}>()

const images = ref<string[]>([])
const todoPopoverOpen = ref(false)
let todoPopoverCloseTimer: ReturnType<typeof setTimeout> | null = null
const editorRef = ref<InstanceType<typeof ChatInputEditor> | null>(null)

const toolList = computed(() => props.tools ?? [])
const agentSettingsStore = useAgentSettingsStore()
const uiStore = useChatUIStore()
const tabStore = useTabStore()

/** 按分类分组工具列表 */
const groupedTools = computed(() => {
  const groups = new Map<string, ToolDisplayItem[]>()
  for (const tool of toolList.value) {
    const list = groups.get(tool.category) ?? []
    list.push(tool)
    groups.set(tool.category, list)
  }
  return Array.from(groups.entries())
})

/** 已启用工具数量 */
const enabledCount = computed(() => {
  return toolList.value.filter((t) => props.enabledTools?.[t.name] !== false).length
})

const currentWorkflowAgent = computed(() => tabStore.activeStore?.currentWorkflow?.agentConfig ?? null)
const globalSkillCount = computed(() => agentSettingsStore.globalSettings.skills.filter((item) => item.enabled).length)
const workflowSkillCount = computed(() => currentWorkflowAgent.value?.skills.filter((item) => item.enabled).length ?? 0)
const globalMcpCount = computed(() => agentSettingsStore.globalSettings.mcps.filter((item) => item.enabled).length)
const workflowMcpCount = computed(() => currentWorkflowAgent.value?.mcps.filter((item) => item.enabled).length ?? 0)

interface TodoItem {
  id: string
  content: string
  status: string
  completed: boolean
}

function normalizeToolName(name: string): string {
  return name
    .replace(/^mcp__.*?__/, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase()
}

function getObject(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function parseJsonObject(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'string') return undefined
  try {
    return getObject(JSON.parse(value))
  } catch {
    return undefined
  }
}

function unwrapToolResultPayload(value: unknown): unknown {
  const objectValue = getObject(value)
  if (!objectValue) return value
  if (Array.isArray(objectValue.content)) {
    const textItem = objectValue.content
      .filter((item): item is Record<string, unknown> => !!getObject(item))
      .find((item) => typeof item.text === 'string')
    return parseJsonObject(textItem?.text) ?? value
  }
  return parseJsonObject(objectValue.text) ?? objectValue
}

function extractTodosFromValue(value: unknown): TodoItem[] {
  const payload = unwrapToolResultPayload(value)
  const objectValue = getObject(payload)
  const rawTodos = Array.isArray(payload)
    ? payload
    : Array.isArray(objectValue?.todos)
      ? objectValue.todos
      : Array.isArray(objectValue?.items)
        ? objectValue.items
        : []

  return rawTodos
    .filter((item): item is Record<string, unknown> => !!getObject(item))
    .map((item, index) => {
      const status = typeof item.status === 'string'
        ? item.status
        : item.completed === true || item.done === true || item.checked === true
          ? 'completed'
          : 'pending'
      const content = typeof item.content === 'string'
        ? item.content
        : typeof item.text === 'string'
          ? item.text
          : typeof item.title === 'string'
            ? item.title
            : `任务 ${index + 1}`
      return {
        id: typeof item.id === 'string' ? item.id : `${index}-${content}`,
        content,
        status,
        completed: ['completed', 'done', 'success', 'finished'].includes(status.toLowerCase()),
      }
    })
}

const latestTodoCall = computed(() => {
  const calls = props.streamingToolCalls ?? []
  for (let i = calls.length - 1; i >= 0; i--) {
    const call = calls[i]
    const name = normalizeToolName(call.name)
    if (name.includes('todowrite') || name.includes('todo')) return call
  }
  return null
})

const todoItems = computed<TodoItem[]>(() => {
  const call = latestTodoCall.value
  if (!call) return []
  const fromResult = extractTodosFromValue(call.result)
  if (fromResult.length) return fromResult
  return extractTodosFromValue(call.args)
})

const todoTotal = computed(() => todoItems.value.length)
const todoCompleted = computed(() => todoItems.value.filter((item) => item.completed).length)
const todoProgress = computed(() => todoTotal.value ? Math.round((todoCompleted.value / todoTotal.value) * 100) : 0)

function getTodoStatusLabel(item: TodoItem): string {
  const status = item.status.toLowerCase()
  if (item.completed) return '完成'
  if (status === 'in_progress' || status === 'inprogress' || status === 'active') return '进行中'
  if (status === 'cancelled' || status === 'canceled') return '已取消'
  return '待处理'
}

function getTodoStatusClass(item: TodoItem): string {
  const status = item.status.toLowerCase()
  if (item.completed) return 'text-emerald-600 dark:text-emerald-400'
  if (status === 'in_progress' || status === 'inprogress' || status === 'active') return 'text-blue-600 dark:text-blue-400'
  if (status === 'cancelled' || status === 'canceled') return 'text-muted-foreground line-through'
  return 'text-muted-foreground'
}

function openTodoPopover() {
  if (todoPopoverCloseTimer) {
    clearTimeout(todoPopoverCloseTimer)
    todoPopoverCloseTimer = null
  }
  todoPopoverOpen.value = true
}

function scheduleCloseTodoPopover() {
  if (todoPopoverCloseTimer) clearTimeout(todoPopoverCloseTimer)
  todoPopoverCloseTimer = setTimeout(() => {
    todoPopoverOpen.value = false
    todoPopoverCloseTimer = null
  }, 120)
}

/** 字符计数 */
const charCount = computed(() => {
  return editorRef.value?.editor?.getText().length ?? 0
})

onMounted(() => {
  agentSettingsStore.init()
})

function handleEditorSend() {
  const editor = editorRef.value?.editor
  if (!editor || props.isStreaming) return
  const text = editor.getText().trim()
  if (!text) return
  emit('send', text, images.value)
  editor.commands.clearContent()
  images.value = []
}

function handleSuggestionSelect(index: number) {
  editorRef.value?.selectItem(index)
}

function handleImageUpload() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/*'
  input.multiple = true
  input.onchange = async () => {
    if (!input.files) return
    for (const file of Array.from(input.files)) {
      const base64 = await fileToBase64(file)
      images.value.push(base64)
    }
  }
  input.click()
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve(result.split(',')[1] ?? '')
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function removeImage(index: number) {
  images.value.splice(index, 1)
}
</script>

<template>
  <div class="p-3 mb-3 space-y-1">
    <!-- 上方状态栏：Skill / MCP / 工作区 -->
    <div class="flex items-center justify-end gap-0.5">
      <Popover
        v-if="todoTotal > 0"
        v-model:open="todoPopoverOpen"
      >
        <PopoverTrigger as-child>
          <Button
            variant="ghost"
            size="sm"
            class="gap-1 h-6 px-1.5 text-xs"
            @mouseenter="openTodoPopover"
            @mouseleave="scheduleCloseTodoPopover"
          >
            <ListTodo class="size-3.5" />
            <span class="text-[10px] tabular-nums text-muted-foreground">
              {{ todoCompleted }}/{{ todoTotal }}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent
          side="top"
          align="end"
          class="w-80 p-0"
          @mouseenter="openTodoPopover"
          @mouseleave="scheduleCloseTodoPopover"
        >
          <div class="border-b px-3 py-2">
            <div class="flex items-center justify-between gap-3">
              <div class="flex items-center gap-2 text-sm font-medium">
                <ListTodo class="size-4" />
                Todo Writer
              </div>
              <span class="text-xs tabular-nums text-muted-foreground">
                {{ todoCompleted }}/{{ todoTotal }}
              </span>
            </div>
            <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                class="h-full rounded-full bg-primary transition-all"
                :style="{ width: `${todoProgress}%` }"
              />
            </div>
          </div>
          <div class="max-h-72 overflow-y-auto p-1">
            <div
              v-for="item in todoItems"
              :key="item.id"
              class="flex items-start gap-2 rounded px-2 py-1.5 text-xs"
            >
              <CheckCircle2
                v-if="item.completed"
                class="mt-0.5 size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400"
              />
              <CircleDot
                v-else-if="['in_progress', 'inprogress', 'active'].includes(item.status.toLowerCase())"
                class="mt-0.5 size-3.5 shrink-0 text-blue-600 dark:text-blue-400"
              />
              <Circle
                v-else
                class="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
              />
              <div class="min-w-0 flex-1">
                <div
                  class="break-words leading-snug"
                  :class="getTodoStatusClass(item)"
                >
                  {{ item.content }}
                </div>
                <div class="mt-0.5 text-[10px] text-muted-foreground">
                  {{ getTodoStatusLabel(item) }}
                </div>
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <Button variant="ghost" size="sm" :disabled="isStreaming" class="gap-1 h-6 px-1.5 text-xs">
            <Braces class="size-3.5" />
            <span class="text-[10px] text-muted-foreground">
              {{ isWorkflowContext ? workflowSkillCount : globalSkillCount }}
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="end" class="w-72">
          <DropdownMenuLabel>Skill 管理</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <div class="px-2 py-2 space-y-2">
            <div class="flex items-center justify-between text-xs">
              <span>全局启用</span>
              <Badge variant="secondary">{{ globalSkillCount }}</Badge>
            </div>
            <div v-if="isWorkflowContext" class="flex items-center justify-between text-xs">
              <span>工作流启用</span>
              <Badge variant="outline">{{ workflowSkillCount }}</Badge>
            </div>
            <Button size="sm" variant="outline" class="w-full" @click="emit('openAgentSettings', isWorkflowContext ? 'workflow' : 'global')">
              打开 Agent 设置
            </Button>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <Button variant="ghost" size="sm" :disabled="isStreaming" class="gap-1 h-6 px-1.5 text-xs">
            <Wrench class="size-3.5" />
            <span class="text-[10px] text-muted-foreground">
              {{ isWorkflowContext ? workflowMcpCount : globalMcpCount }}
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="end" class="w-72">
          <DropdownMenuLabel>MCP 管理</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <div class="px-2 py-2 space-y-2">
            <div class="flex items-center justify-between text-xs">
              <span>全局启用</span>
              <Badge variant="secondary">{{ globalMcpCount }}</Badge>
            </div>
            <div v-if="isWorkflowContext" class="flex items-center justify-between text-xs">
              <span>工作流启用</span>
              <Badge variant="outline">{{ workflowMcpCount }}</Badge>
            </div>
            <Button size="sm" variant="outline" class="w-full" @click="emit('openAgentSettings', isWorkflowContext ? 'workflow' : 'global')">
              打开 Agent 设置
            </Button>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <Button variant="ghost" size="sm" :disabled="isStreaming" class="h-6 px-1.5 text-xs">
            <FolderTree class="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="end" class="w-80">
          <DropdownMenuLabel>工作区管理</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <div class="px-2 py-2 space-y-2 text-xs">
            <div class="flex items-start justify-between gap-3">
              <span class="text-muted-foreground">全局工作目录</span>
              <span class="text-right break-all">{{ agentSettingsStore.globalSettings.workspaceDir || '未设置' }}</span>
            </div>
            <div v-if="isWorkflowContext" class="flex items-start justify-between gap-3">
              <span class="text-muted-foreground">工作流目录</span>
              <span class="text-right break-all">{{ currentWorkflowAgent?.workspaceDir || '未设置' }}</span>
            </div>
            <div v-if="isWorkflowContext" class="flex items-start justify-between gap-3">
              <span class="text-muted-foreground">工作流数据目录</span>
              <span class="text-right break-all">{{ currentWorkflowAgent?.dataDir || '未设置' }}</span>
            </div>
            <Button size="sm" variant="outline" class="w-full" @click="emit('openAgentSettings', isWorkflowContext ? 'workflow' : 'global')">
              打开 Agent 设置
            </Button>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>

    <InputGroup>
      <!-- 图片预览 -->
      <InputGroupAddon
        v-if="images.length"
        align="block-start"
        class="flex-wrap gap-2"
      >
        <div
          v-for="(img, i) in images"
          :key="i"
          class="relative group"
        >
          <img
            :src="`data:image/png;base64,${img}`"
            class="w-12 h-12 rounded border object-cover"
          >
          <button
            class="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-destructive text-destructive-foreground text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            @click="removeImage(i)"
          >
            ×
          </button>
        </div>
      </InputGroupAddon>

      <!-- 选中节点 Badge -->
      <InputGroupAddon
        v-if="isWorkflowContext && selectedNodes?.length"
        align="block-start"
        class="px-2 pt-1"
      >
        <Badge
          :variant="uiStore.nodeContextEnabled ? 'default' : 'outline'"
          class="cursor-pointer select-none gap-1 text-xs transition-colors"
          @click="uiStore.toggleNodeContext()"
        >
          <Crosshair class="size-3" />
          {{ selectedNodes.length === 1 ? (selectedNodes[0].label || selectedNodes[0].type) : `${selectedNodes.length} 个节点` }}
        </Badge>
      </InputGroupAddon>

      <!-- Tiptap 编辑器 -->
      <ChatInputEditor
        ref="editorRef"
        :disabled="disabled"
        @send="handleEditorSend"
      />

      <!-- Suggestion Popup -->
      <SuggestionPopup
        :state="editorRef?.suggestionState ?? { active: false, type: null, items: [], selectedIndex: 0, query: '', clientRect: null, command: null }"
        @select="handleSuggestionSelect"
      />

      <!-- 底部工具栏 -->
      <InputGroupAddon align="block-end" class="overflow-hidden">
        <!-- 清空对话 -->
        <InputGroupButton
          variant="ghost"
          size="icon-xs"
          :disabled="isStreaming"
          @click="$emit('clear')"
        >
          <Trash2 class="size-4" />
        </InputGroupButton>

        <!-- 图片上传 -->
        <InputGroupButton
          variant="ghost"
          size="icon-xs"
          :disabled="isStreaming"
          @click="handleImageUpload"
        >
          <ImagePlus class="size-4" />
        </InputGroupButton>

        <!-- 工具选择 -->
        <DropdownMenu v-if="toolList.length">
          <DropdownMenuTrigger as-child>
            <InputGroupButton
              variant="ghost"
              size="xs"
              :disabled="isStreaming"
              class="relative gap-1"
            >
              <Wrench class="size-3.5" />
              <span
                v-if="enabledCount < toolList.length"
                class="text-amber-500 text-[10px]"
              >
                {{ enabledCount }}
              </span>
            </InputGroupButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="top"
            align="start"
            class="w-64 max-h-80 overflow-y-auto"
          >
            <DropdownMenuLabel class="flex items-center justify-between">
              <span>工具列表</span>
              <span class="flex items-center gap-2">
                <span v-if="isWorkflowContext" class="flex items-center gap-1.5 text-xs font-normal">
                  <span class="text-muted-foreground">节点编辑</span>
                  <Switch
                    :model-value="workflowEditMode !== false"
                    class="scale-75 origin-right"
                    @update:model-value="emit('toggleWorkflowEdit', $event)"
                  />
                </span>
                <span class="text-xs font-normal text-muted-foreground">
                  {{ enabledCount }}/{{ toolList.length }}
                </span>
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <template
              v-for="([category, categoryTools], gi) in groupedTools"
              :key="category"
            >
              <DropdownMenuLabel
                v-if="gi > 0"
                class="text-xs text-muted-foreground pt-1"
              >
                {{ category }}
              </DropdownMenuLabel>
              <DropdownMenuItem
                v-for="tool in categoryTools"
                :key="tool.name"
                class="flex items-center justify-between gap-3"
                @select.prevent
              >
                <div class="flex flex-col gap-0.5 min-w-0">
                  <span class="font-mono text-xs">{{ tool.name }}</span>
                  <span class="text-[11px] text-muted-foreground leading-tight">{{ tool.description }}</span>
                </div>
                <Switch
                  :model-value="enabledTools?.[tool.name] !== false"
                  class="shrink-0"
                  @update:model-value="emit('toggleTool', tool.name)"
                />
              </DropdownMenuItem>
              <DropdownMenuSeparator v-if="gi < groupedTools.length - 1" />
            </template>
          </DropdownMenuContent>
        </DropdownMenu>

        <InputGroupText class="ml-auto hidden sm:inline-flex">
          {{ charCount }}
        </InputGroupText>

        <Separator
          orientation="vertical"
          class="!h-4 hidden sm:block"
        />

        <ModelSelector class="shrink-1 min-w-0" />

        <!-- 发送/停止 -->
        <InputGroupButton
          v-if="isStreaming"
          variant="destructive"
          size="icon-xs"
          class="rounded-full"
          @click="$emit('stop')"
        >
          <Square class="size-3.5" />
        </InputGroupButton>
        <InputGroupButton
          v-else
          variant="default"
          size="icon-xs"
          class="rounded-full"
          :disabled="charCount === 0 || disabled"
          @click="handleEditorSend"
        >
          <Send class="size-4" />
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  </div>
</template>
