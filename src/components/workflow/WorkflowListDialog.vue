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
import WorkflowFolderTree from './WorkflowFolderTree.vue'
import WorkflowList from './WorkflowList.vue'
import WorkflowMetadataDialog from './WorkflowMetadataDialog.vue'
import type { Workflow } from '@/lib/workflow/types'

const props = defineProps<{
  open: boolean
  createMode?: boolean
}>()
const emit = defineEmits<{
  'update:open': [value: boolean]
  select: [workflow: Workflow | null]
  cancel: []
}>()

const store = useWorkflowStore()
const selectedFolderId = ref<string | null>(null)
const hasSelectedLocation = ref(false)
const selectedWorkflow = ref<Workflow | null>(null)
const metadataDialogOpen = ref(false)

onMounted(() => {
  store.loadData()
})

watch(() => props.open, (open) => {
  if (!open) return
  selectedWorkflow.value = null
  if (selectedFolderId.value === null) {
    const first = store.workflowFolders.find((f) => f.parentId === null)
    if (first) selectedFolderId.value = first.id
  }
  hasSelectedLocation.value = true
})

function onSelectWorkflow(wf: Workflow) {
  selectedWorkflow.value = wf
}

function confirm() {
  emit('select', selectedWorkflow.value)
  emit('update:open', false)
}

function cancel() {
  emit('cancel')
  emit('update:open', false)
}

function startCreate() {
  metadataDialogOpen.value = true
}

async function handleMetadataConfirm(data: { name: string; icon: string; description: string; tags: string[] }) {
  if (!hasSelectedLocation.value) {
    hasSelectedLocation.value = true
  }
  store.newWorkflow(selectedFolderId.value, data.name)
  const workflow = store.currentWorkflow
  if (!workflow) return
  workflow.icon = data.icon || undefined
  workflow.description = data.description || undefined
  workflow.tags = data.tags.length ? data.tags : undefined
  await store.saveWorkflow(workflow)
  emit('select', workflow)
  emit('update:open', false)
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
    <DialogContent
      class="sm:max-w-[700px] h-[500px] flex flex-col p-0"
      @escape-key-down="cancel"
      @pointer-down-outside="cancel"
    >
      <DialogHeader class="px-4 pt-4">
        <DialogTitle class="text-sm">
          打开工作流
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
            :selected-id="selectedWorkflow?.id ?? null"
            @select="onSelectWorkflow"
          />
        </ResizablePanel>
      </ResizablePanelGroup>

      <DialogFooter class=”px-4 pb-4 gap-2”>
        <Button
          variant="outline"
          size="sm"
          class="text-xs"
          @click="startCreate"
        >
          新建工作流
        </Button>
        <Button
          size="sm"
          class="text-xs"
          :disabled="!selectedWorkflow"
          @click="confirm()"
        >
          打开
        </Button>
      </DialogFooter>

      <WorkflowMetadataDialog
        :open="metadataDialogOpen"
        @update:open="metadataDialogOpen = $event"
        @confirm="handleMetadataConfirm"
      />
    </DialogContent>
  </Dialog>
</template>
