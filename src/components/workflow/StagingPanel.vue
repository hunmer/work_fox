<script setup lang="ts">
import { computed } from 'vue'
import { useWorkflowStore } from '@/stores/workflow'
import { getNodeDefinition } from '@/lib/workflow/nodeRegistry'
import { resolveLucideIcon } from '@/lib/lucide-resolver'
import { stringToHsl } from '@/lib/utils'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Trash2, Archive, ClipboardPaste } from 'lucide-vue-next'
import type { StagedNode } from '@shared/workflow-types'

const store = useWorkflowStore()

const stagedNodes = computed(() => store.stagedNodes)

function getNodeIcon(type: string) {
  const def = getNodeDefinition(type)
  if (!def) return null
  return resolveLucideIcon(def.icon)
}

function getNodeColor(type: string): string {
  return stringToHsl(type, 45, 90)
}

function getNodeTextColor(type: string): string {
  return stringToHsl(type, 55, 35)
}

function getNodeLabel(type: string): string {
  return getNodeDefinition(type)?.label ?? type
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function handleDelete(stagedId: string) {
  store.removeStagedNode(stagedId)
}

function handleClearAll() {
  store.clearStagedNodes()
}

function handlePasteBack(stagedNode: StagedNode) {
  store.pasteStagedNode(stagedNode)
}
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Header -->
    <div class="flex items-center justify-between px-3 py-2 border-b border-border">
      <span class="text-xs text-muted-foreground">
        暂存节点 ({{ stagedNodes.length }})
      </span>
      <Button
        v-if="stagedNodes.length > 0"
        variant="ghost"
        size="sm"
        class="h-6 text-xs text-muted-foreground hover:text-destructive"
        @click="handleClearAll"
      >
        <Trash2 class="w-3 h-3 mr-1" />
        全部清除
      </Button>
    </div>

    <!-- Empty state -->
    <div
      v-if="stagedNodes.length === 0"
      class="flex flex-col items-center justify-center flex-1 text-muted-foreground gap-2"
    >
      <Archive class="w-8 h-8 opacity-30" />
      <span class="text-xs">暂存箱为空</span>
      <span class="text-xs opacity-60">右键节点可复制或移动到暂存</span>
    </div>

    <!-- Node list -->
    <ScrollArea v-else class="flex-1">
      <div class="p-2 space-y-1">
        <div
          v-for="node in stagedNodes"
          :key="node.id"
          class="group flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-accent/50 transition-colors"
        >
          <!-- Node type icon -->
          <div
            class="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
            :style="{
              backgroundColor: getNodeColor(node.type),
              color: getNodeTextColor(node.type),
            }"
          >
            <component
              :is="getNodeIcon(node.type)"
              v-if="getNodeIcon(node.type)"
              class="w-3.5 h-3.5"
            />
            <span v-else class="text-xs font-bold">{{ node.label?.charAt(0) ?? '?' }}</span>
          </div>

          <!-- Node info -->
          <div class="flex-1 min-w-0">
            <div class="text-xs font-medium truncate">{{ node.label }}</div>
            <div class="text-[10px] text-muted-foreground flex items-center gap-1">
              <span>{{ getNodeLabel(node.type) }}</span>
              <span class="opacity-50">·</span>
              <span>{{ formatTime(node.stagedAt) }}</span>
            </div>
          </div>

          <!-- Actions -->
          <div class="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              variant="ghost"
              size="icon"
              class="h-6 w-6"
              title="粘贴回画布"
              @click="handlePasteBack(node)"
            >
              <ClipboardPaste class="w-3 h-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              class="h-6 w-6 text-muted-foreground hover:text-destructive"
              title="从暂存箱移除"
              @click="handleDelete(node.id)"
            >
              <Trash2 class="w-3 h-3" />
            </Button>
          </div>
        </div>
      </div>
    </ScrollArea>
  </div>
</template>
