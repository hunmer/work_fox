<script setup lang="ts">
import { ref, computed, reactive, watch } from 'vue'
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
import { Empty, EmptyDescription } from '@/components/ui/empty'

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
  readonly?: boolean
  selectedRows?: string[]
  onSubmit?: (selectedRows: TableCellDef[]) => void
}>(), {
  headers: () => [],
  cells: () => [],
  selectionMode: 'none',
  interactive: false,
  readonly: false,
  selectedRows: () => [],
})

const selectedMap = reactive<Record<string, boolean>>({})

const isReadonly = computed(() => props.readonly || !props.interactive)

const canSubmit = computed(() => {
  if (props.selectionMode === 'none') return true
  return Object.values(selectedMap).some(Boolean)
})

function isRowSelected(id: string) {
  return !!selectedMap[id]
}

function toggleRow(id: string) {
  if (isReadonly.value) return
  if (props.selectionMode === 'single') {
    const wasSelected = selectedMap[id]
    Object.keys(selectedMap).forEach(k => delete selectedMap[k])
    if (!wasSelected) selectedMap[id] = true
  } else {
    selectedMap[id] = !selectedMap[id]
    if (!selectedMap[id]) delete selectedMap[id]
  }
}

watch(() => props.selectedRows, (ids) => {
  if (ids.length > 0) {
    Object.keys(selectedMap).forEach(k => delete selectedMap[k])
    ids.forEach(id => { selectedMap[id] = true })
  }
}, { immediate: true })

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
      <template v-if="cells.length > 0">
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
              :class="[isReadonly ? 'cursor-default' : 'cursor-pointer hover:bg-muted/50', isRowSelected(cell.id) && 'bg-primary/5']"
              @click="toggleRow(cell.id)"
            >
              <TableCell
                v-if="selectionMode !== 'none'"
                class="w-8 px-1"
                @click.stop="toggleRow(cell.id)"
              >
                <Checkbox
                  :model-value="isRowSelected(cell.id)"
                  :disabled="isReadonly"
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
          </TableBody>
        </Table>
      </template>
      <Empty v-else class="h-full">
        <EmptyDescription>暂无数据</EmptyDescription>
      </Empty>
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
