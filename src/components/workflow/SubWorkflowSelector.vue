<script setup lang="ts">
import { computed, ref } from 'vue'
import { useWorkflowStore } from '@/stores/workflow'
import { Button } from '@/components/ui/button'
import WorkflowListDialog from './WorkflowListDialog.vue'
import type { Workflow } from '@/lib/workflow/types'

const props = defineProps<{
  nodeId?: string
  workflowId?: string
  workflowName?: string
}>()

const store = useWorkflowStore()
const open = ref(false)

const selectedWorkflow = computed(() => {
  if (!props.workflowId) return null
  return store.workflows.find((workflow) => workflow.id === props.workflowId) ?? null
})

const displayName = computed(() => props.workflowName || selectedWorkflow.value?.name || '')

function cloneInputFields(value: unknown) {
  return Array.isArray(value) ? JSON.parse(JSON.stringify(value)) : []
}

function selectWorkflow(workflow: Workflow | null) {
  if (!workflow || !props.nodeId) return
  const startNode = workflow.nodes.find((node) => node.type === 'start')
  store.updateNodeData(props.nodeId, {
    workflowId: workflow.id,
    workflowName: workflow.name,
    inputFields: cloneInputFields(startNode?.data?.inputFields),
  })
}
</script>

<template>
  <div class="flex h-full min-h-[96px] flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border bg-muted/20 p-3 text-center">
    <div class="max-w-full truncate text-xs font-medium">
      {{ displayName || '未选择工作流' }}
    </div>
    <Button
      size="sm"
      variant="outline"
      class="h-7 text-xs"
      @click.stop="open = true"
    >
      {{ displayName ? '更换工作流' : '选择工作流' }}
    </Button>
    <WorkflowListDialog
      v-model:open="open"
      @select="selectWorkflow"
    />
  </div>
</template>
