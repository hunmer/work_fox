<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import type { ChatMessage as ChatMessageType, ToolCall } from '@/types'
import type { ChatStoreInstance } from '@/stores/chat'
import ChatMessage from './ChatMessage.vue'

const props = defineProps<{
  chat: ChatStoreInstance
  messages: ChatMessageType[]
  isStreaming: boolean
  streamingToken: string
  streamingToolCalls: ToolCall[]
  streamingThinkingBlocks: Array<{ index: number; content: string }>
  streamingUsage: { inputTokens: number; outputTokens: number } | null
}>()

const emit = defineEmits<{
  retry: [messageId: string]
  delete: [messageId: string]
  edit: [messageId: string, newContent: string]
}>()

const containerRef = ref<HTMLDivElement>()
const autoScroll = ref(true)

watch(
  () => [props.messages.length, props.streamingToken, props.streamingThinkingBlocks],
  () => {
    if (autoScroll.value) {
      nextTick(() => scrollToBottom())
    }
  },
)

function scrollToBottom() {
  const el = containerRef.value
  if (el) {
    el.scrollTop = el.scrollHeight
  }
}

function handleScroll() {
  const el = containerRef.value
  if (!el) return
  autoScroll.value = el.scrollHeight - el.scrollTop - el.clientHeight < 50
}

/** 判断是否是最后一条 assistant 消息 */
function isLastAssistantMessage(index: number): boolean {
  if (props.messages[index].role !== 'assistant') return false
  // 向后查找，是否还有其他 assistant 消息
  for (let i = index + 1; i < props.messages.length; i++) {
    if (props.messages[i].role === 'assistant') return false
  }
  return true
}
</script>

<template>
  <div
    ref="containerRef"
    class="flex-1 overflow-y-auto px-4"
    @scroll="handleScroll"
  >
    <!-- 无消息时的空状态 -->
    <div
      v-if="!messages.length && !isStreaming"
      class="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground"
    >
      <svg
        class="w-10 h-10 opacity-40"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
      >
        <path d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
      <p class="text-sm">
        开始新的对话
      </p>
    </div>

    <!-- 消息列表 -->
    <ChatMessage
      v-for="(msg, index) in messages"
      :key="msg.id"
      :chat="chat"
      :message="msg"
      :all-messages="messages"
      :is-streaming="isStreaming && index === messages.length - 1 && msg.role === 'assistant'"
      :is-last-assistant="isLastAssistantMessage(index)"
      :streaming-content="isStreaming && index === messages.length - 1 ? streamingToken : undefined"
      :streaming-thinking-blocks="isStreaming && index === messages.length - 1 ? streamingThinkingBlocks : undefined"
      :streaming-tool-calls="isStreaming && index === messages.length - 1 ? streamingToolCalls : undefined"
      :streaming-usage="isStreaming && index === messages.length - 1 ? streamingUsage : undefined"
      @retry="emit('retry', $event)"
      @delete="emit('delete', $event)"
      @edit="(id, content) => emit('edit', id, content)"
    />

    <!-- Streaming 占位消息 -->
    <div
      v-if="isStreaming && !(messages.length > 0 && messages[messages.length - 1].role === 'assistant')"
      class="group/msg flex gap-3 py-3"
    >
      <div class="h-7 w-7 shrink-0 mt-0.5 rounded-full bg-muted flex items-center justify-center text-xs">AI</div>
      <div class="flex-1 min-w-0 space-y-1">
        <div class="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-muted-foreground bg-muted">
          <span class="thinking-dots">正在思考</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.thinking-dots::after {
  content: '';
  animation: dots 1.5s steps(4, end) infinite;
}

@keyframes dots {
  0%   { content: ''; }
  25%  { content: '.'; }
  50%  { content: '..'; }
  75%  { content: '...'; }
  100% { content: ''; }
}
</style>
