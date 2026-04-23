<script setup lang="ts">
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import TableViewComponent from '@/components/workflow/TableViewComponent.vue'

interface Props {
  open: boolean
  headers: Array<{ id: string; title: string; type: 'string' | 'number' | 'boolean' }>
  cells: Array<{ id: string; data: Record<string, any> }>
  selectionMode: 'none' | 'single' | 'multi'
}

defineProps<Props>()
const emit = defineEmits<{
  (e: 'submit', selectedRows: Array<{ id: string; data: Record<string, any> }>): void
  (e: 'cancel'): void
}>()
</script>

<template>
  <Dialog :open="open" @update:open="(v) => !v && emit('cancel')">
    <DialogContent class="max-w-2xl max-h-[80vh] flex flex-col" @escape-key-down="emit('cancel')">
      <DialogHeader>
        <DialogTitle>请选择数据行</DialogTitle>
      </DialogHeader>
      <div class="flex-1 overflow-auto">
        <TableViewComponent
          :headers="headers"
          :cells="cells"
          :selection-mode="selectionMode"
          :interactive="true"
          :on-submit="(rows: Array<{ id: string; data: Record<string, any> }>) => emit('submit', rows)"
        />
      </div>
    </DialogContent>
  </Dialog>
</template>
