<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed } from 'vue'
import { Toaster } from '@/components/ui/sonner'
import CommandPaletteDialog from '@/components/command-palette/CommandPaletteDialog.vue'
import WorkflowInfoCardDialog from '@/components/command-palette/WorkflowInfoCardDialog.vue'
import { createWorkflowProvider } from '@/components/command-palette/providers/workflowProvider'
import WsMessageMonitor from '@/components/utils/WsMessageMonitor.vue'
import FloatingPanel from '@/components/utils/FloatingPanel.vue'
import ChatPanel from '@/components/chat/ChatPanel.vue'
import { Empty, EmptyMedia, EmptyTitle, EmptyDescription } from '@/components/ui/empty'
import { DialogHost } from '@/lib/dialog'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { useTabStore } from '@/stores/tab'
import { usePluginStore } from '@/stores/plugin'
import { useAIProviderStore } from '@/stores/ai-provider'
import { useShortcutActions } from '@/composables/useShortcutActions'
import { wsBridge } from '@/lib/ws-bridge'
import { createChatStore } from '@/stores/chat'
import type { CommandProvider } from '@/types/command'
import type { Workflow } from '@shared/workflow-types'

const tabStore = useTabStore()
const pluginStore = usePluginStore()
const providerStore = useAIProviderStore()
const workflowAgentChat = createChatStore('workflow-agent')

const commandPaletteOpen = ref(false)
const wsError = ref<string | null>(null)
const reconnecting = ref(false)
const reconnectAttempt = ref(0)
const appReady = ref(false)
const workflowAgentVisible = ref(true)
const workflowAgentX = ref(24)
const workflowAgentY = ref(80)
const workflowAgentWidth = ref(420)
const workflowAgentHeight = ref(720)
const workflowAgentZIndex = ref(5000)

// 工作流信息卡片状态
const workflowInfoOpen = ref(false)
const selectedWorkflowId = ref<string | null>(null)

function handleWorkflowSelect(wf: Workflow) {
  selectedWorkflowId.value = wf.id
  workflowInfoOpen.value = true
  commandPaletteOpen.value = false
}

function handleOpenInEditor(wf: Workflow) {
  // 复用标签页逻辑：检查是否已有 tab 打开此工作流
  const existing = tabStore.tabs.find((t) => t.workflowId === wf.id)
  if (existing) {
    if (existing.id !== tabStore.activeTabId) {
      tabStore.switchTab(existing.id)
    }
    return
  }
  tabStore.addTab(wf.id, wf.name)
}

const commandProviders = computed<CommandProvider[]>(() => [
  createWorkflowProvider(handleWorkflowSelect),
])

useShortcutActions(commandPaletteOpen)

function onWsDisconnected() {
  wsError.value = '与后端服务的连接已断开'
  reconnecting.value = true
}

function onWsError() {
  wsError.value = 'WebSocket 连接失败，无法连接到后端服务'
  reconnecting.value = true
}

function onWsReconnecting(data: unknown) {
  const attempt = typeof data === 'object' && data !== null && 'attempt' in data
    ? Number((data as { attempt: unknown }).attempt)
    : 0
  reconnectAttempt.value = Number.isFinite(attempt) ? attempt : 0
  reconnecting.value = true
}

function onWsConnected() {
  wsError.value = null
  reconnecting.value = false
  reconnectAttempt.value = 0
}

function handleRetry() {
  wsBridge.reconnect()
}

function warnInitFailure(label: string, error: unknown) {
  console.warn(`[app] ${label} 初始化失败:`, error)
}

onMounted(async () => {
  workflowAgentX.value = Math.max(window.innerWidth - workflowAgentWidth.value - 24, 24)
  workflowAgentY.value = Math.max(window.innerHeight - workflowAgentHeight.value - 24, 80)
  wsBridge.on('ws:disconnected', onWsDisconnected)
  wsBridge.on('ws:error', onWsError)
  wsBridge.on('ws:reconnecting', onWsReconnecting)
  wsBridge.on('ws:connected', onWsConnected)
  wsBridge.on('ws:reconnected', onWsConnected)

  try {
    await tabStore.restoreTabs()
    await workflowAgentChat.init()
  } catch (error) {
    warnInitFailure('标签页', error)
  } finally {
    appReady.value = true
  }

  void pluginStore.init().catch((error) => warnInitFailure('插件', error))
  void providerStore.init().catch((error) => warnInitFailure('AI Provider', error))
})

onUnmounted(() => {
  wsBridge.off('ws:disconnected', onWsDisconnected)
  wsBridge.off('ws:error', onWsError)
  wsBridge.off('ws:reconnecting', onWsReconnecting)
  wsBridge.off('ws:connected', onWsConnected)
  wsBridge.off('ws:reconnected', onWsConnected)
})
</script>

<template>
  <div class="h-screen w-screen flex flex-col bg-background text-foreground" :class="{ 'light': true }">
    <RouterView v-if="appReady" />
    <Empty v-else class="flex-1">
      <EmptyMedia variant="icon">
        <Spinner class="size-8" />
      </EmptyMedia>
      <EmptyTitle>正在恢复编辑器</EmptyTitle>
      <EmptyDescription>正在读取上次打开的工作流...</EmptyDescription>
    </Empty>
    <Toaster />
    <CommandPaletteDialog
      :open="commandPaletteOpen"
      :providers="commandProviders"
      @update:open="commandPaletteOpen = $event"
    />
    <WorkflowInfoCardDialog
      :open="workflowInfoOpen"
      :workflow-id="selectedWorkflowId"
      @update:open="workflowInfoOpen = $event"
      @open-in-editor="handleOpenInEditor"
    />
    <WsMessageMonitor />
    <DialogHost />
    <FloatingPanel
      v-model:visible="workflowAgentVisible"
      v-model:x="workflowAgentX"
      v-model:y="workflowAgentY"
      v-model:width="workflowAgentWidth"
      v-model:height="workflowAgentHeight"
      v-model:zIndex="workflowAgentZIndex"
      title="AI"
    >
      <div class="h-full min-h-0 -m-3">
        <ChatPanel :chat="workflowAgentChat" />
      </div>
    </FloatingPanel>

    <!-- WebSocket 连接错误覆盖层 -->
    <Transition name="fade">
      <div
        v-if="wsError"
        class="fixed inset-0 z-[9999] bg-background/80 backdrop-blur-sm flex items-center justify-center"
      >
        <Empty class="max-w-md">
          <EmptyMedia variant="icon">
            <svg xmlns="http://www.w3.org/2000/svg" class="size-12 text-destructive" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </EmptyMedia>
          <EmptyTitle>连接失败</EmptyTitle>
          <EmptyDescription>
            {{ wsError }}
            <span v-if="reconnecting" class="block mt-1">正在尝试重连（第 {{ reconnectAttempt }} 次）...</span>
          </EmptyDescription>
          <Button variant="outline" class="mt-4" @click="handleRetry">
            重新连接
          </Button>
        </Empty>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
