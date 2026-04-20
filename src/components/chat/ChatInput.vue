<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
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
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import {
  Braces, FolderTree, ImagePlus, Send, Square, Trash2, Wrench, Crosshair,
} from 'lucide-vue-next'
import type { ToolDisplayItem } from '@/types'
import { useAgentSettingsStore } from '@/stores/agent-settings'
import { useChatUIStore } from '@/stores/chat-ui'
import { useTabStore } from '@/stores/tab'

const props = defineProps<{
  isStreaming: boolean
  disabled?: boolean
  tools?: ToolDisplayItem[]
  enabledTools?: Record<string, boolean>
  isWorkflowContext?: boolean
  workflowEditMode?: boolean
  selectedNode?: { id: string; type: string; label: string } | null
}>()

const emit = defineEmits<{
  send: [content: string, images: string[]]
  stop: []
  clear: []
  toggleTool: [toolName: string]
  toggleWorkflowEdit: [enabled: boolean]
  openAgentSettings: [scope: 'global' | 'workflow']
}>()

const inputText = ref('')
const images = ref<string[]>([])

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

onMounted(() => {
  agentSettingsStore.init()
})

function handleKeydown(e: KeyboardEvent) {
  if (e.isComposing || e.key === 'Process') return
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSend()
  }
}

function handleSend() {
  const text = inputText.value.trim()
  if (!text || props.isStreaming) return
  emit('send', text, images.value)
  inputText.value = ''
  images.value = []
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
  <div class="p-3">
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
        v-if="isWorkflowContext && selectedNode"
        align="block-start"
        class="px-2 pt-1"
      >
        <Badge
          :variant="uiStore.nodeContextEnabled ? 'default' : 'outline'"
          class="cursor-pointer select-none gap-1 text-xs transition-colors"
          @click="uiStore.toggleNodeContext()"
        >
          <Crosshair class="size-3" />
          {{ selectedNode.label || selectedNode.type }}
        </Badge>
      </InputGroupAddon>

      <!-- 输入框 -->
      <InputGroupTextarea
        v-model="inputText"
        :disabled="disabled"
        placeholder="输入消息... (Enter 发送, Shift+Enter 换行)"
        class="max-h-[200px] min-h-[36px] py-2"
        @keydown="handleKeydown"
      />

      <!-- 底部工具栏 -->
      <InputGroupAddon align="block-end">
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

        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <InputGroupButton
              variant="ghost"
              size="xs"
              :disabled="isStreaming"
              class="gap-1"
            >
              <Braces class="size-3.5" />
              <span class="text-[10px] text-muted-foreground">
                {{ isWorkflowContext ? workflowSkillCount : globalSkillCount }}
              </span>
            </InputGroupButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" class="w-72">
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
            <InputGroupButton
              variant="ghost"
              size="xs"
              :disabled="isStreaming"
              class="gap-1"
            >
              <Wrench class="size-3.5" />
              <span class="text-[10px] text-muted-foreground">
                {{ isWorkflowContext ? workflowMcpCount : globalMcpCount }}
              </span>
            </InputGroupButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" class="w-72">
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
            <InputGroupButton
              variant="ghost"
              size="xs"
              :disabled="isStreaming"
            >
              <FolderTree class="size-3.5" />
            </InputGroupButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" class="w-80">
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

        <InputGroupText class="ml-auto">
          {{ inputText.length }}
        </InputGroupText>

        <Separator
          orientation="vertical"
          class="!h-4"
        />

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
          :disabled="!inputText.trim() || disabled"
          @click="handleSend"
        >
          <Send class="size-4" />
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  </div>
</template>
