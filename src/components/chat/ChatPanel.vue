<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { ChatStoreInstance } from '@/stores/chat'
import { useAIProviderStore } from '@/stores/ai-provider'
import { useChatUIStore } from '@/stores/chat-ui'
import { useTabStore } from '@/stores/tab'
import { usePluginStore } from '@/stores/plugin'
import { BROWSER_TOOL_LIST } from '@/lib/agent/tools'
import { WORKFLOW_TOOL_DEFINITIONS } from '@/lib/agent/workflow-tools'
import { WORKFLOW_AGENT_TOOL_DEFINITIONS } from '@/lib/agent/workflow-agent-tools'
import type { ToolDisplayItem } from '@/types'
import ChatMessageList from './ChatMessageList.vue'
import ChatInput from './ChatInput.vue'
import WorkspaceFileTree from './WorkspaceFileTree.vue'
import WorkflowWorkspaceDialog from './WorkflowWorkspaceDialog.vue'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Settings, X, MessageSquare, History, FolderTree, FolderOpen } from 'lucide-vue-next'
import SettingsDialog from '@/components/settings/SettingsDialog.vue'
import { getChatHistoryPath } from '@/lib/chat-db'

const props = defineProps<{
  chat: ChatStoreInstance
  enabledPlugins?: string[]
}>()

const providerStore = useAIProviderStore()
const uiStore = useChatUIStore()
const tabStore = useTabStore()
const pluginStore = usePluginStore()
const showSettings = ref(false)
const showWorkflowWorkspaceDialog = ref(false)
const pluginTools = ref<ToolDisplayItem[]>([])
const activeTab = ref<string>('messages')

const isElectron = navigator.userAgent.includes('Electron')

async function openSessionFile() {
  const sk = props.chat.scopeKey.value
  if (!sk) return
  const path = await getChatHistoryPath(sk)
  window.api.fs.openInExplorer(path)
}

async function copySessionPath() {
  const sk = props.chat.scopeKey.value
  if (!sk) return
  const path = await getChatHistoryPath(sk)
  navigator.clipboard.writeText(path)
}

async function loadPluginTools(pluginIds: string[]) {
  if (!pluginIds?.length) {
    pluginTools.value = []
    return
  }
  try {
    const rawIds = JSON.parse(JSON.stringify(pluginIds))
    const tools = await pluginStore.getAgentTools(rawIds)
    pluginTools.value = (tools || []).map((t: any) => ({
      name: t.name,
      description: t.description,
      category: '插件工具',
    }))
  } catch {
    pluginTools.value = []
  }
}

watch(() => props.enabledPlugins, (ids) => loadPluginTools(ids || []), { immediate: true })

const toolDisplayItems = computed<ToolDisplayItem[]>(() => {
  if (props.chat.scope === 'workflow-agent') {
    return WORKFLOW_AGENT_TOOL_DEFINITIONS.map((t) => ({
      name: t.name,
      description: t.description,
      category: '工作流执行',
    }))
  }
  if (isWorkflowContext.value && uiStore.workflowEditMode) {
    return WORKFLOW_TOOL_DEFINITIONS.map((t) => ({
      name: t.name,
      description: t.description,
      category: '工作流编辑',
    }))
  }
  const base = BROWSER_TOOL_LIST.map((t) => ({
    name: t.name,
    description: t.description,
    category: t.category,
  }))
  return [...base, ...pluginTools.value]
})

const enabledTools = computed(() => {
  return uiStore.enabledTools
})

function handleToggleTool(toolName: string) {
  uiStore.toggleTool(toolName)
}

const isWorkflowContext = computed(() => {
  const session = props.chat.currentSession
  return !!session?.workflowId
})

const selectedNodes = computed(() => {
  const nodes = tabStore.activeStore?.selectedNodes
  if (!nodes?.length) return []
  return nodes.map((n) => ({ id: n.id, type: n.type, label: n.label }))
})

const recentSessions = computed(() => props.chat.sessions.slice(0, 50))

function handleToggleWorkflowEdit(enabled: boolean) {
  uiStore.setWorkflowEditMode(enabled)
}

function handleSend(content: string, images: string[]) {
  props.chat.sendMessage(content, images.length > 0 ? images : undefined)
}

function handleClear() {
  if (props.chat.currentSessionId) {
    props.chat.clearSessionMessages(props.chat.currentSessionId)
  }
}

function handleOpenAgentSettings() {
  if (isWorkflowContext.value) {
    showWorkflowWorkspaceDialog.value = true
    return
  }
  showSettings.value = true
}

function handleOpenSettings() {
  if (isWorkflowContext.value) {
    showWorkflowWorkspaceDialog.value = true
    return
  }
  showSettings.value = true
}

function handleEdit(messageId: string, newContent: string) {
  props.chat.editMessage(messageId, newContent)
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`
  return date.toLocaleDateString()
}
</script>

<template>
  <div class="flex flex-col h-full bg-background border-l border-border">
    <!-- 头部：Tab 栏 + 操作按钮 -->
    <div class="flex items-center gap-2 px-2 py-1.5 border-b shrink-0">
      <div class="flex items-center gap-0.5 bg-muted rounded-md p-0.5">
        <button
          class="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-sm transition-colors"
          :class="activeTab === 'history'
            ? 'bg-background shadow-sm text-foreground'
            : 'text-muted-foreground hover:text-foreground'"
          @click="activeTab = 'history'"
        >
          <History class="size-3" />
          历史会话
        </button>
        <button
          class="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-sm transition-colors"
          :class="activeTab === 'messages'
            ? 'bg-background shadow-sm text-foreground'
            : 'text-muted-foreground hover:text-foreground'"
          @click="activeTab = 'messages'"
        >
          <MessageSquare class="size-3" />
          消息
        </button>
        <button
          class="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-sm transition-colors"
          :class="activeTab === 'files'
            ? 'bg-background shadow-sm text-foreground'
            : 'text-muted-foreground hover:text-foreground'"
          @click="activeTab = 'files'"
        >
          <FolderTree class="size-3" />
          工作区
        </button>
      </div>

      <div class="flex-1" />

      <Button
        variant="ghost"
        size="icon"
        class="h-7 w-7"
        @click="handleOpenSettings"
      >
        <Settings class="h-4 w-4" />
      </Button>
    </div>

    <!-- 内容区域：根据活跃 Tab 显示 -->
    <div class="flex-1 overflow-hidden flex flex-col min-h-0">
      <!-- 历史会话 -->
      <ScrollArea
        v-if="activeTab === 'history'"
        class="flex-1 min-h-0"
      >
        <div class="p-2 space-y-0.5">
          <Button
            variant="ghost"
            size="sm"
            class="w-full justify-start text-xs h-7"
            @click="chat.createSession()"
          >
            + 新建对话
          </Button>
          <div class="flex gap-1 px-2">
            <Button
              v-if="isElectron"
              variant="ghost"
              size="sm"
              class="flex-1 justify-start text-[11px] h-6 text-muted-foreground"
              @click="openSessionFile"
            >
              <FolderOpen class="w-3 h-3 mr-1" />
              打开文件位置
            </Button>
            <Button
              v-else
              variant="ghost"
              size="sm"
              class="flex-1 justify-start text-[11px] h-6 text-muted-foreground"
              @click="copySessionPath"
            >
              <FolderOpen class="w-3 h-3 mr-1" />
              复制文件路径
            </Button>
          </div>
          <div
            v-for="session in recentSessions"
            :key="session.id"
            class="group flex items-center gap-2 px-2 py-1.5 text-xs rounded cursor-pointer hover:bg-muted/50"
            :class="session.id === chat.currentSessionId ? 'bg-muted' : ''"
            @click="chat.switchSession(session.id)"
          >
            <MessageSquare class="size-3.5 shrink-0 text-muted-foreground" />
            <div class="flex-1 min-w-0">
              <div class="truncate">{{ session.title || '未命名对话' }}</div>
              <div class="text-[10px] text-muted-foreground">{{ formatTime(session.updatedAt) }}</div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              class="h-5 w-5 shrink-0 opacity-0 group-hover:opacity-100"
              @click.stop="chat.deleteSessionById(session.id)"
            >
              <X class="h-3 w-3" />
            </Button>
          </div>
          <div
            v-if="recentSessions.length === 0"
            class="text-xs text-muted-foreground text-center py-4"
          >
            暂无历史会话
          </div>
        </div>
      </ScrollArea>

      <!-- 消息列表（默认） + 输入区域在 Tab 内部 -->
      <template v-if="activeTab === 'messages'">
        <ChatMessageList
          :chat="chat"
          :messages="chat.messages"
          :is-streaming="chat.isStreaming"
          :streaming-token="chat.streamingToken"
          :streaming-tool-calls="chat.streamingToolCalls"
          :streaming-thinking-blocks="chat.streamingThinkingBlocks"
          :streaming-usage="chat.streamingUsage"
          @retry="chat.retryMessage($event)"
          @delete="chat.deleteMessageAndAfter($event)"
          @edit="handleEdit"
        />
        <ChatInput
          :is-streaming="chat.isStreaming"
          :disabled="!providerStore.currentModel"
          :tools="toolDisplayItems"
          :enabled-tools="enabledTools"
          :streaming-tool-calls="chat.streamingToolCalls"
          :is-workflow-context="isWorkflowContext"
          :workflow-edit-mode="uiStore.workflowEditMode"
          :selected-nodes="selectedNodes"
          @send="handleSend"
          @stop="chat.stopGeneration()"
          @clear="handleClear"
          @toggle-tool="handleToggleTool"
          @toggle-workflow-edit="handleToggleWorkflowEdit"
          @open-agent-settings="handleOpenAgentSettings"
        />
      </template>

      <!-- 工作区文件 -->
      <WorkspaceFileTree
        v-if="activeTab === 'files'"
      />
    </div>

    <!-- 设置对话框 -->
    <SettingsDialog
      :open="showSettings"
      initial-tab="models"
      @update:open="showSettings = $event"
    />

    <WorkflowWorkspaceDialog
      :open="showWorkflowWorkspaceDialog"
      @update:open="showWorkflowWorkspaceDialog = $event"
    />
  </div>
</template>
