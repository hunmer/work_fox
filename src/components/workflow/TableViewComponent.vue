<script setup lang="ts">
import { ref, computed } from 'vue'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'

interface TableHeaderDef {
  id: string
  title: string
  type: 'string' | 'number' | 'boolean'
}

interface TableCellDef {
  id: string
  data: Record<string, any>
}

const props = withDefaults(defineProps<{
  headers?: TableHeaderDef[]
  cells?: TableCellDef[]
  selectionMode?: 'none' | 'single' | 'multi'
  interactive?: boolean
  onSubmit?: (selectedRows: TableCellDef[]) => void
}>(), {
  headers: () => [],
  cells: () => [],
  selectionMode: 'none',
  interactive: false,
})

const selectedIds = ref<Set<string>>(new Set())

const canSubmit = computed(() => {
  if (props.selectionMode === 'none') return true
  return selectedIds.value.size > 0
})

function toggleRow(id: string) {
  if (props.selectionMode === 'single') {
    selectedIds.value = new Set(selectedIds.value.has(id) ? [] : [id])
  } else {
    const next = new Set(selectedIds.value)
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
    }
    selectedIds.value = next
  }
}

function handleSubmit() {
  if (!canSubmit.value) return
  const selected = props.selectionMode === 'none'
    ? props.cells
    : props.cells.filter((c) => selectedIds.value.has(c.id))
  props.onSubmit?.(selected)
}
</script>

<template>
  <div class="flex flex-col gap-2 w-full">
    <div class="overflow-auto max-h-[200px] overscroll-contain" @wheel.stop>
      <Table class="text-xs w-full table-fixed">
        <TableHeader>
          <TableRow>
            <TableHead
              v-if="selectionMode !== 'none'"
              class="w-8 px-1"
            />
            <TableHead
              v-for="header in headers"
              :key="header.id"
              class="px-2 py-1 whitespace-nowrap overflow-hidden text-ellipsis"
            >
              {{ header.title }}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow
            v-for="cell in cells"
            :key="cell.id"
            class="cursor-pointer hover:bg-muted/50"
            @click="selectionMode !== 'none' && toggleRow(cell.id)"
          >
            <TableCell
              v-if="selectionMode !== 'none'"
              class="w-8 px-1"
            >
              <Checkbox
                :checked="selectedIds.has(cell.id)"
                class="size-3.5"
              />
            </TableCell>
            <TableCell
              v-for="header in headers"
              :key="header.id"
              class="px-2 py-1 truncate max-w-[120px]"
            >
              {{ cell.data?.[header.id] ?? '' }}
            </TableCell>
          </TableRow>
          <TableRow v-if="cells.length === 0">
            <TableCell
              :colspan="selectionMode !== 'none' ? headers.length + 1 : headers.length"
              class="text-center text-muted-foreground py-3"
            >
              暂无数据
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
    <div v-if="interactive" class="flex justify-end">
      <Button
        size="sm"
        :disabled="!canSubmit"
        @click.stop="handleSubmit"
      >
        提交
      </Button>
    </div>
  </div>
</template>
