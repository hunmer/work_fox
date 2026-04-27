<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed } from 'vue'
import { Toaster } from '@/components/ui/sonner'
import CommandPaletteDialog from '@/components/command-palette/CommandPaletteDialog.vue'
import WorkflowInfoCardDialog from '@/components/command-palette/WorkflowInfoCardDialog.vue'
import { createWorkflowProvider } from '@/components/command-palette/providers/workflowProvider'
import WsMessageMonitor from '@/components/utils/WsMessageMonitor.vue'
import { Empty, EmptyMedia, EmptyTitle, EmptyDescription } from '@/components/ui/empty'
import { Button } from '@/components/ui/button'
import { useTabStore } from '@/stores/tab'
import { usePluginStore } from '@/stores/plugin'
import { useAIProviderStore } from '@/stores/ai-provider'
import { useShortcutActions } from '@/composables/useShortcutActions'
import { wsBridge } from '@/lib/ws-bridge'
import type { CommandProvider } from '@/types/command'
import type { Workflow } from '@shared/workflow-types'

const tabStore = useTabStore()
const pluginStore = usePluginStore()
const providerStore = useAIProviderStore()

const commandPaletteOpen = ref(false)
const wsError = ref<string | null>(null)
const reconnecting = ref(false)
const reconnectAttempt = ref(0)

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

function onWsReconnecting(data: { attempt: number }) {
  reconnectAttempt.value = data.attempt
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

onMounted(async () => {
  wsBridge.on('ws:disconnected', onWsDisconnected)
  wsBridge.on('ws:error', onWsError)
  wsBridge.on('ws:reconnecting', onWsReconnecting)
  wsBridge.on('ws:connected', onWsConnected)
  wsBridge.on('ws:reconnected', onWsConnected)

  await pluginStore.init()
  await providerStore.init()
  await tabStore.restoreTabs()
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
    <RouterView />
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
