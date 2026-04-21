<script setup lang="ts">
import { ref } from 'vue'
import { useWorkflowStore } from '@/stores/workflow'
import { ScrollArea } from '@/components/ui/scroll-area'
import { History, Undo2, Trash2 } from 'lucide-vue-next'

const store = useWorkflowStore()
const restoring = ref(false)

function formatTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

async function restoreTo(index: number) {
  if (restoring.value) return
  restoring.value = true
  await store.restoreToStep(index)
  restoring.value = false
}

function clearHistory() {
  store.undoStack.splice(0)
  store.redoStack.splice(0)
  store.operationLog.splice(0)
  void store.clearOperationHistory()
}
</script>

<template>
  <div class="flex flex-col h-full">
    <div v-if="store.operationLog.length > 0" class="flex items-center justify-end px-2 py-1 border-b">
      <button
        class="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1 transition-colors"
        :disabled="restoring"
        @click="clearHistory"
      >
        <Trash2 class="w-3 h-3" />
        清空
      </button>
    </div>
    <ScrollArea class="flex-1 overflow-hidden">
      <div class="p-2 space-y-0.5">
        <div
          v-for="(op, index) in store.operationLog"
          :key="index"
          class="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs group transition-colors"
          :class="[
            restoring && 'pointer-events-none',
            op.snapshot
              ? 'cursor-pointer hover:bg-accent'
              : 'opacity-50 cursor-default',
          ]"
          @click="restoreTo(index)"
        >
          <History class="w-3 h-3 text-muted-foreground shrink-0" />
          <span class="flex-1 truncate">{{ op.description }}</span>
          <span class="text-[10px] text-muted-foreground shrink-0">
            {{ formatTime(op.timestamp) }}
          </span>
          <Undo2
            v-if="op.snapshot"
            class="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
          />
        </div>

        <div
          v-if="store.operationLog.length === 0"
          class="text-xs text-muted-foreground text-center py-6"
        >
          暂无操作记录
        </div>
      </div>
    </ScrollArea>
  </div>
</template>
