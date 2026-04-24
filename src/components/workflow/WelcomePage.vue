<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Plus, FolderOpen, Import, Clock } from 'lucide-vue-next'
import { createWorkflowStore, provideWorkflowStore } from '@/stores/workflow'
import type { Workflow } from '@/lib/workflow/types'
import WorkflowListDialog from './WorkflowListDialog.vue'

interface RecentWorkflow {
  id: string
  name: string
  updatedAt: number
}

defineProps<{
  recentWorkflows?: RecentWorkflow[]
}>()

const emit = defineEmits<{
  open: [workflowId: string]
  select: [workflow: Workflow]
  import: []
}>()

const dialogStore = createWorkflowStore('welcome-dialog')
provideWorkflowStore(dialogStore)

const listDialogOpen = ref(false)
const listDialogCreateMode = ref(false)

onMounted(() => {
  dialogStore.loadData()
})

function onDialogSelect(workflow: Workflow | null) {
  if (!workflow) return
  emit('select', workflow)
}

function formatTime(ts: number) {
  const diff = Date.now() - ts
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} 天前`
  return new Date(ts).toLocaleDateString()
}
</script>

<template>
  <div class="flex-1 flex flex-col items-center justify-center gap-8">
    <div class="flex gap-8">
      <button
        class="group flex flex-col items-center gap-4 p-8 rounded-xl border-2 border-dashed border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50 transition-all cursor-pointer w-52"
        @click="listDialogCreateMode = true; listDialogOpen = true"
      >
        <div class="p-4 rounded-full bg-muted group-hover:bg-primary/10 transition-colors">
          <Plus class="w-8 h-8 text-muted-foreground group-hover:text-primary transition-colors" />
        </div>
        <span class="text-base font-medium">新建工作流</span>
        <span class="text-xs text-muted-foreground text-center">从空白画布开始创建</span>
      </button>

      <button
        class="group flex flex-col items-center gap-4 p-8 rounded-xl border-2 border-dashed border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50 transition-all cursor-pointer w-52"
        @click="listDialogCreateMode = false; listDialogOpen = true"
      >
        <div class="p-4 rounded-full bg-muted group-hover:bg-primary/10 transition-colors">
          <FolderOpen class="w-8 h-8 text-muted-foreground group-hover:text-primary transition-colors" />
        </div>
        <span class="text-base font-medium">打开工作流</span>
        <span class="text-xs text-muted-foreground text-center">浏览并打开已有工作流</span>
      </button>

      <button
        class="group flex flex-col items-center gap-4 p-8 rounded-xl border-2 border-dashed border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50 transition-all cursor-pointer w-52"
        @click="$emit('import')"
      >
        <div class="p-4 rounded-full bg-muted group-hover:bg-primary/10 transition-colors">
          <Import class="w-8 h-8 text-muted-foreground group-hover:text-primary transition-colors" />
        </div>
        <span class="text-base font-medium">导入工作流</span>
        <span class="text-xs text-muted-foreground text-center">从 .workflow 文件导入</span>
      </button>
    </div>

    <div v-if="recentWorkflows && recentWorkflows.length > 0" class="w-full max-w-2xl mt-4">
      <div class="flex items-center gap-2 px-2 mb-3 text-sm font-medium text-muted-foreground">
        <Clock class="w-4 h-4" />
        <span>最近编辑</span>
      </div>
      <div class="rounded-lg border border-border overflow-hidden">
        <button
          v-for="wf in recentWorkflows"
          :key="wf.id"
          class="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors cursor-pointer text-left border-b border-border last:border-b-0"
          @click="$emit('open', wf.id)"
        >
          <span class="text-sm truncate">{{ wf.name }}</span>
          <span class="text-xs text-muted-foreground shrink-0 ml-4">{{ formatTime(wf.updatedAt) }}</span>
        </button>
      </div>
    </div>

    <WorkflowListDialog
      :open="listDialogOpen"
      :create-mode="listDialogCreateMode"
      @update:open="listDialogOpen = $event"
      @select="onDialogSelect"
      @cancel="listDialogOpen = false"
    />
  </div>
</template>
