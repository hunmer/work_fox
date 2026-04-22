<template>
  <FloatingPanel
    :visible="visible"
    :x="x"
    :y="y"
    :width="width"
    :height="height"
    :z-index="zIndex"
    title="WS Message Monitor"
    @update:visible="$emit('update:visible', $event)"
    @update:x="$emit('update:x', $event)"
    @update:y="$emit('update:y', $event)"
    @update:width="$emit('update:width', $event)"
    @update:height="$emit('update:height', $event)"
    @update:z-index="$emit('update:zIndex', $event)"
  >
    <div class="monitor-root">
      <!-- Toolbar -->
      <div class="toolbar">
        <Input
          v-model="channelFilter"
          placeholder="Filter channel..."
          class="filter-input"
        />
        <Select v-model="directionFilter">
          <SelectTrigger class="filter-select">
            <SelectValue placeholder="Direction" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="received">Received</SelectItem>
          </SelectContent>
        </Select>
        <Select v-model="typeFilter">
          <SelectTrigger class="filter-select">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="request">request</SelectItem>
            <SelectItem value="response">response</SelectItem>
            <SelectItem value="event">event</SelectItem>
            <SelectItem value="error">error</SelectItem>
            <SelectItem value="interaction_required">interaction_required</SelectItem>
            <SelectItem value="interaction_response">interaction_response</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="sm"
          :class="{ 'text-orange-400': paused }"
          @click="paused = !paused"
        >
          {{ paused ? 'Resume' : 'Pause' }}
        </Button>
        <Button variant="outline" size="sm" @click="clearMessages">
          Clear
        </Button>
        <span class="count-badge">{{ filteredMessages.length }}</span>
      </div>

      <!-- Table -->
      <div class="table-wrap">
        <Table>
          <TableHeader>
            <TableRow v-for="headerGroup in table.getHeaderGroups()" :key="headerGroup.id">
              <TableHead v-for="header in headerGroup.headers" :key="header.id" class="table-head">
                <FlexRender
                  v-if="!header.isPlaceholder"
                  :render="header.column.columnDef.header"
                  :props="header.getContext()"
                />
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <template v-if="table.getRowModel().rows?.length">
              <TableRow
                v-for="row in table.getRowModel().rows"
                :key="row.id"
                class="table-row"
                @click="expandRow(row.original)"
              >
                <TableCell v-for="cell in row.getVisibleCells()" :key="cell.id" class="table-cell">
                  <FlexRender :render="cell.column.columnDef.cell" :props="cell.getContext()" />
                </TableCell>
              </TableRow>
            </template>
            <template v-else>
              <TableRow>
                <TableCell :colspan="columns.length" class="empty-cell">
                  No messages.
                </TableCell>
              </TableRow>
            </template>
          </TableBody>
        </Table>
      </div>

      <!-- Pagination -->
      <div class="pagination">
        <div class="pagination-info">
          {{ paginationState.pageIndex * paginationState.pageSize + 1 }}-{{ Math.min((paginationState.pageIndex + 1) * paginationState.pageSize, filteredMessages.length) }} of {{ filteredMessages.length }}
        </div>
        <div class="pagination-controls">
          <Select
            :model-value="String(paginationState.pageSize)"
            @update:model-value="changePageSize(Number($event))"
          >
            <SelectTrigger class="page-size-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent side="top">
              <SelectItem v-for="size in [10, 20, 50]" :key="size" :value="String(size)">
                {{ size }}/page
              </SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" :disabled="paginationState.pageIndex === 0" @click="paginationState.pageIndex--">
            Prev
          </Button>
          <Button
            variant="outline"
            size="sm"
            :disabled="(paginationState.pageIndex + 1) * paginationState.pageSize >= filteredMessages.length"
            @click="paginationState.pageIndex++"
          >
            Next
          </Button>
        </div>
      </div>

      <!-- Detail Dialog -->
      <Dialog v-model:open="detailOpen">
        <DialogContent class="detail-dialog">
          <DialogHeader>
            <DialogTitle>Message Detail</DialogTitle>
          </DialogHeader>
          <pre class="detail-pre">{{ detailContent }}</pre>
        </DialogContent>
      </Dialog>
    </div>
  </FloatingPanel>
</template>

<script setup lang="ts">
import { h, ref, reactive, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import type { ColumnDef } from '@tanstack/vue-table'
import {
  FlexRender,
  getCoreRowModel,
  getSortedRowModel,
  useVueTable,
} from '@tanstack/vue-table'

import FloatingPanel from './FloatingPanel.vue'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

import { wsBridge, type WsMessageEntry } from '@/lib/ws-bridge'

// --- Props & Emits ---

defineProps<{
  visible: boolean
  x: number
  y: number
  width: number
  height: number
  zIndex: number
}>()

defineEmits([
  'update:visible',
  'update:x',
  'update:y',
  'update:width',
  'update:height',
  'update:zIndex',
])

// --- Data model ---

interface WsRow {
  id: string
  timestamp: number
  direction: 'sent' | 'received'
  type: string
  channel: string
  preview: string
  raw: string
}

const MAX_MESSAGES = 2000

const messages = ref<WsRow[]>([])
const paused = ref(false)
const channelFilter = ref('')
const directionFilter = ref('all')
const typeFilter = ref('all')
const detailOpen = ref(false)
const detailContent = ref('')
const paginationState = reactive({ pageIndex: 0, pageSize: 20 })

// --- Message capture ---

function extractField(parsed: any, field: string): string {
  if (!parsed || typeof parsed !== 'object') return ''
  return parsed[field] ?? ''
}

function toRow(entry: WsMessageEntry): WsRow {
  const parsed = entry.parsed as any
  const type = extractField(parsed, 'type') || 'hello'
  const channel = extractField(parsed, 'channel') || ''
  const preview = truncate(JSON.stringify(parsed), 120)
  return {
    id: crypto.randomUUID(),
    timestamp: entry.timestamp,
    direction: entry.direction,
    type,
    channel,
    preview,
    raw: entry.raw,
  }
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) + '...' : str
}

let unsubscribe: (() => void) | null = null

onMounted(() => {
  unsubscribe = wsBridge.onMessage((entry) => {
    if (paused.value) return
    messages.value.push(toRow(entry))
    if (messages.value.length > MAX_MESSAGES) {
      messages.value = messages.value.slice(-MAX_MESSAGES)
    }
  })
})

onBeforeUnmount(() => {
  unsubscribe?.()
})

function clearMessages() {
  messages.value = []
  paginationState.pageIndex = 0
}

// --- Filtering ---

const filteredMessages = computed(() => {
  return messages.value.filter((msg) => {
    if (directionFilter.value !== 'all' && msg.direction !== directionFilter.value) return false
    if (typeFilter.value !== 'all' && msg.type !== typeFilter.value) return false
    if (channelFilter.value && !msg.channel.toLowerCase().includes(channelFilter.value.toLowerCase())) return false
    return true
  })
})

// Reset page on filter change
watch([channelFilter, directionFilter, typeFilter], () => {
  paginationState.pageIndex = 0
})

// --- Pagination (manual) ---

function changePageSize(size: number) {
  paginationState.pageSize = size
  paginationState.pageIndex = 0
}

const pagedData = computed(() => {
  const start = paginationState.pageIndex * paginationState.pageSize
  return filteredMessages.value.slice(start, start + paginationState.pageSize)
})

// Clamp page index
watch(filteredMessages, (val) => {
  const maxPage = Math.max(0, Math.ceil(val.length / paginationState.pageSize) - 1)
  if (paginationState.pageIndex > maxPage) paginationState.pageIndex = maxPage
})

// --- Detail dialog ---

function expandRow(row: WsRow) {
  detailContent.value = JSON.stringify(JSON.parse(row.raw), null, 2)
  detailOpen.value = true
}

// --- Column definitions ---

const columns: ColumnDef<WsRow>[] = [
  {
    accessorKey: 'timestamp',
    header: 'Time',
    size: 80,
    cell: ({ row }) => {
      const d = new Date(row.original.timestamp)
      return h('span', { class: 'text-xs font-mono' }, formatTime(d))
    },
  },
  {
    accessorKey: 'direction',
    header: 'Dir',
    size: 60,
    cell: ({ row }) => {
      const isSent = row.original.direction === 'sent'
      return h(Badge, {
        variant: isSent ? 'default' : 'secondary',
        class: 'text-[10px] px-1.5 py-0',
      }, () => isSent ? 'OUT' : 'IN')
    },
  },
  {
    accessorKey: 'type',
    header: 'Type',
    size: 110,
    cell: ({ row }) => {
      const t = row.original.type
      const color = typeColorMap[t] || 'text-muted-foreground'
      return h('span', { class: `text-xs font-mono ${color}` }, t)
    },
  },
  {
    accessorKey: 'channel',
    header: 'Channel',
    size: 160,
    cell: ({ row }) => h('span', { class: 'text-xs font-mono' }, row.original.channel || '-'),
  },
  {
    accessorKey: 'preview',
    header: 'Data',
    size: 300,
    cell: ({ row }) => h('span', {
      class: 'text-xs text-muted-foreground font-mono block truncate max-w-[300px]',
      title: row.original.raw,
    }, row.original.preview),
  },
]

const typeColorMap: Record<string, string> = {
  request: 'text-blue-500',
  response: 'text-green-600',
  event: 'text-purple-500',
  error: 'text-red-500',
  interaction_required: 'text-orange-500',
  interaction_response: 'text-teal-500',
  hello: 'text-gray-500',
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
    + '.' + String(d.getMilliseconds()).padStart(3, '0')
}

// --- Table instance ---

const table = useVueTable({
  get data() { return pagedData.value },
  get columns() { return columns },
  getCoreRowModel: getCoreRowModel(),
  getSortedRowModel: getSortedRowModel(),
  manualPagination: true,
})
</script>

<style scoped>
.monitor-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 6px;
  font-size: 12px;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.filter-input {
  height: 28px;
  font-size: 11px;
  min-width: 100px;
}

.filter-select {
  height: 28px;
  font-size: 11px;
  width: 100px;
}

.count-badge {
  margin-left: auto;
  font-size: 11px;
  color: var(--muted-foreground);
}

.table-wrap {
  flex: 1;
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: 4px;
}

.table-head {
  padding: 4px 6px;
  font-size: 11px;
  height: 28px;
}

.table-row {
  cursor: pointer;
}

.table-row:hover {
  background: var(--accent);
}

.table-cell {
  padding: 2px 6px;
  font-size: 11px;
  height: 24px;
}

.empty-cell {
  text-align: center;
  padding: 20px;
  color: var(--muted-foreground);
}

.pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  padding-top: 4px;
}

.pagination-info {
  font-size: 11px;
  color: var(--muted-foreground);
}

.pagination-controls {
  display: flex;
  align-items: center;
  gap: 4px;
}

.page-size-select {
  height: 28px;
  font-size: 11px;
  width: 80px;
}

.detail-dialog {
  max-width: 700px;
  max-height: 80vh;
}

.detail-pre {
  background: var(--muted);
  color: var(--foreground);
  padding: 12px;
  border-radius: 6px;
  font-size: 11px;
  font-family: monospace;
  max-height: 60vh;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
