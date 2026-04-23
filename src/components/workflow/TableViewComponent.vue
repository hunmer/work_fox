<script setup lang="ts">
import { ref, computed, reactive } from 'vue'
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

const selectedMap = reactive<Record<string, boolean>>({})

const canSubmit = computed(() => {
  if (props.selectionMode === 'none') return true
  return Object.values(selectedMap).some(Boolean)
})

function toggleRow(id: string) {
  if (props.selectionMode === 'single') {
    const wasSelected = selectedMap[id]
    Object.keys(selectedMap).forEach(k => delete selectedMap[k])
    if (!wasSelected) selectedMap[id] = true
  } else {
    selectedMap[id] = !selectedMap[id]
    if (!selectedMap[id]) delete selectedMap[id]
  }
}

function handleSubmit() {
  if (!canSubmit.value) return
  const selected = props.selectionMode === 'none'
    ? props.cells
    : props.cells.filter((c) => selectedMap[c.id])
  props.onSubmit?.(selected)
}
</script>

<template>
  <div class="flex flex-col gap-2 w-full h-full min-h-0">
    <div class="overflow-auto overscroll-contain flex-1 min-h-0" @wheel.stop>
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
              @click.stop="toggleRow(cell.id)"
            >
              <Checkbox
                :model-value="!!selectedMap[cell.id]"
                class="size-3.5 pointer-events-none"
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
