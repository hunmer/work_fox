<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useWorkflowStore } from '@/stores/workflow'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import WorkflowFolderTree from './WorkflowFolderTree.vue'
import WorkflowList from './WorkflowList.vue'
import type { Workflow } from '@/lib/workflow/types'

const props = defineProps<{
  open: boolean
  createMode?: boolean
}>()
const emit = defineEmits<{
  'update:open': [value: boolean]
  select: [workflow: Workflow | null]
}>()

const store = useWorkflowStore()
const selectedFolderId = ref<string | null>(null)
const hasSelectedLocation = ref(false)
const selectedWorkflow = ref<Workflow | null>(null)
const isCreating = ref(false)
const newWorkflowName = ref('新工作流')

onMounted(() => {
  store.loadData()
})

watch(() => props.open, (open) => {
  if (!open) return
  isCreating.value = !!props.createMode
  selectedWorkflow.value = null
  hasSelectedLocation.value = false
})

function onSelectWorkflow(wf: Workflow) {
  selectedWorkflow.value = wf
}

function confirm() {
  emit('select', selectedWorkflow.value)
  emit('update:open', false)
}

async function createNew() {
  const name = newWorkflowName.value.trim()
  if (!name || !hasSelectedLocation.value) return
  store.newWorkflow(selectedFolderId.value, name)
  const workflow = store.currentWorkflow
  if (!workflow) return
  await store.saveWorkflow(workflow)
  emit('select', workflow)
  emit('update:open', false)
  isCreating.value = false
  newWorkflowName.value = '新工作流'
}

function startCreate() {
  isCreating.value = true
  selectedWorkflow.value = null
}

function onSelectLocation() {
  hasSelectedLocation.value = true
}
</script>

<template>
  <Dialog
    :open="open"
    @update:open="emit('update:open', $event)"
  >
    <DialogContent class="sm:max-w-[700px] h-[500px] flex flex-col p-0">
      <DialogHeader class="px-4 pt-4">
        <DialogTitle class="text-sm">
          {{ isCreating ? '新建工作流' : '打开工作流' }}
        </DialogTitle>
      </DialogHeader>

      <ResizablePanelGroup
        direction="horizontal"
        class="flex-1 min-h-0 px-4"
      >
        <ResizablePanel
          :default-size="30"
          :min-size="20"
          :max-size="40"
        >
          <WorkflowFolderTree
            v-model:selected-folder-id="selectedFolderId"
            @select-location="onSelectLocation"
          />
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel>
          <WorkflowList
            :folder-id="selectedFolderId"
            @select="onSelectWorkflow"
          />
        </ResizablePanel>
      </ResizablePanelGroup>

      <div
        v-if="isCreating"
        class="px-4 pb-3 space-y-2"
      >
        <Input
          v-model="newWorkflowName"
          class="h-8 text-xs"
          placeholder="工作流名称"
          @keydown.enter="createNew"
        />
        <p class="text-xs text-muted-foreground">
          请选择左侧文件夹或“全部工作流”作为保存位置后再创建。
        </p>
      </div>

      <DialogFooter class="px-4 pb-4 gap-2">
        <Button
          v-if="!isCreating"
          variant="outline"
          size="sm"
          class="text-xs"
          @click="startCreate"
        >
          新建工作流
        </Button>
        <Button
          v-else
          variant="outline"
          size="sm"
          class="text-xs"
          @click="isCreating = false"
        >
          取消新建
        </Button>
        <Button
          size="sm"
          class="text-xs"
          :disabled="isCreating ? !newWorkflowName.trim() || !hasSelectedLocation : !selectedWorkflow"
          @click="isCreating ? createNew() : confirm()"
        >
          {{ isCreating ? '创建并打开' : '打开' }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
