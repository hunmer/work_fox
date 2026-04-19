<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { ChatStoreInstance } from '@/stores/chat'
import { useAIProviderStore } from '@/stores/ai-provider'
import { useChatUIStore } from '@/stores/chat-ui'
import { useTabStore } from '@/stores/tab'
import { BROWSER_TOOL_LIST } from '@/lib/agent/tools'
import type { ToolDisplayItem } from '@/types'
import ChatMessageList from './ChatMessageList.vue'
import ChatInput from './ChatInput.vue'
import ModelSelector from './ModelSelector.vue'
import SessionManager from './SessionManager.vue'
import ProviderManager from './ProviderManager.vue'
import { Button } from '@/components/ui/button'
import { Settings, X } from 'lucide-vue-next'

const props = defineProps<{
  chat: ChatStoreInstance
}>()

const providerStore = useAIProviderStore()
const uiStore = useChatUIStore()
const tabStore = useTabStore()
const showProviderManager = ref(false)
const pluginTools = ref<ToolDisplayItem[]>([])

const enabledPlugins = computed(() => {
  const workflowStore = tabStore.activeStore
  return workflowStore?.currentWorkflow?.enabledPlugins || []
})

async function loadPluginTools(pluginIds: string[]) {
  if (!pluginIds.length) {
    pluginTools.value = []
    return
  }
  try {
    const tools = await window.api.plugin.getAgentTools(pluginIds)
    pluginTools.value = (tools || []).map((t: any) => ({
      name: t.name,
      description: t.description,
      category: '插件工具',
    }))
  } catch {
    pluginTools.value = []
  }
}

watch(enabledPlugins, (ids) => loadPluginTools(ids), { immediate: true })

const toolDisplayItems = computed<ToolDisplayItem[]>(() => {
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

function handleSend(content: string, images: string[]) {
  props.chat.sendMessage(content, images.length > 0 ? images : undefined)
}


function handleClear() {
  if (props.chat.currentSessionId) {
    props.chat.clearSessionMessages(props.chat.currentSessionId)
  }
}

function handleEdit(messageId: string, newContent: string) {
  props.chat.editMessage(messageId, newContent)
}
</script>

<template>
  <div class="flex flex-col h-full bg-background border-l border-border">
    <!-- 头部工具栏 -->
    <div class="flex items-center gap-1.5 px-3 py-2 border-b shrink-0">
      <ModelSelector />
      <SessionManager :chat="chat" />
      <Button
        variant="ghost"
        size="icon"
        class="h-7 w-7"
        @click="showProviderManager = true"
      >
        <Settings class="h-4 w-4" />
      </Button>
    </div>

    <!-- 消息列表 -->
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

    <!-- 输入区域 -->
    <ChatInput
      :is-streaming="chat.isStreaming"
      :disabled="!providerStore.currentModel"
      :tools="toolDisplayItems"
      :enabled-tools="enabledTools"
      @send="handleSend"
      @stop="chat.stopGeneration()"
      @clear="handleClear"
      @toggle-tool="handleToggleTool"
    />

    <!-- 供应商管理对话框 -->
    <ProviderManager v-model:open="showProviderManager" />
  </div>
</template>
