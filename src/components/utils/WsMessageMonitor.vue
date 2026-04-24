<template>
  <FloatingPanel
    :visible="state.visible"
    :x="state.x"
    :y="state.y"
    :width="state.width"
    :height="state.height"
    :z-index="state.zIndex"
    title="WS Message Monitor"
    @update:visible="updateState('visible', $event)"
    @update:x="updateState('x', $event)"
    @update:y="updateState('y', $event)"
    @update:width="updateState('width', $event)"
    @update:height="updateState('height', $event)"
    @update:z-index="updateState('zIndex', $event)"
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

      <!-- Main content: table + detail panel -->
      <div class="content-area">
        <!-- Table -->
        <div class="table-wrap">
          <Table>
            <TableHeader>
              <TableRow v-for="headerGroup in table.getHeaderGroups()" :key="headerGroup.id">
                <TableHead
                  v-for="header in headerGroup.headers"
                  :key="header.id"
                  class="table-head"
                  :class="{ 'cursor-pointer select-none': header.column.getCanSort() }"
                  @click="header.column.getToggleSortingHandler()?.($event)"
                >
                  <div class="flex items-center gap-1">
                    <FlexRender
                      v-if="!header.isPlaceholder"
                      :render="header.column.columnDef.header"
                      :props="header.getContext()"
                    />
                    <span v-if="header.column.getIsSorted() === 'asc'" class="sort-icon">&#9650;</span>
                    <span v-else-if="header.column.getIsSorted() === 'desc'" class="sort-icon">&#9660;</span>
                  </div>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <template v-if="table.getRowModel().rows?.length">
                <TableRow
                  v-for="row in table.getRowModel().rows"
                  :key="row.id"
                  class="table-row"
                  :class="{ 'row-selected': selectedId === row.original.id }"
                  @click="selectRow(row.original)"
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

        <!-- Right detail panel -->
        <div v-if="selectedMessage" class="detail-panel">
          <div class="detail-header">
            <span class="detail-title">Detail</span>
            <button class="detail-close" @click="selectedId = null">&times;</button>
          </div>
          <div class="detail-fields">
            <div class="detail-field">
              <span class="field-label">Time</span>
              <span class="field-value">{{ formatFullTime(new Date(selectedMessage.timestamp)) }}</span>
            </div>
            <div class="detail-field">
              <span class="field-label">Direction</span>
              <Badge :variant="selectedMessage.direction === 'sent' ? 'default' : 'secondary'" class="text-[10px]">
                {{ selectedMessage.direction === 'sent' ? 'OUT' : 'IN' }}
              </Badge>
            </div>
            <div class="detail-field">
              <span class="field-label">Type</span>
              <span :class="['text-xs font-mono', typeColorMap[selectedMessage.type] || '']">
                {{ selectedMessage.type }}
              </span>
            </div>
            <div class="detail-field">
              <span class="field-label">Channel</span>
              <span class="field-value font-mono">{{ selectedMessage.channel || '-' }}</span>
            </div>
          </div>
          <pre class="detail-pre">{{ formatJson(selectedMessage.raw) }}</pre>
          <Button variant="outline" size="sm" class="copy-btn" @click="copyRaw">
            Copy
          </Button>
        </div>
      </div>

      <!-- Pagination -->
      <div class="pagination">
        <div class="pagination-info">
          {{ paginationRange }}
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
            :disabled="(paginationState.pageIndex + 1) * paginationState.pageSize >= table.getRowModel().rows.length"
            @click="paginationState.pageIndex++"
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  </FloatingPanel>
</template>

<script setup lang="ts">
import { h, ref, reactive, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import type { ColumnDef, SortingState } from '@tanstack/vue-table'
import {
  FlexRender,
  getCoreRowModel,
  getSortedRowModel,
  useVueTable,
} from '@tanstack/vue-table'
import { valueUpdater } from '@/components/ui/table/utils'

import FloatingPanel from './FloatingPanel.vue'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

import { wsBridge, type WsMessageEntry } from '@/lib/ws-bridge'

// --- Persistence ---

const STORAGE_KEY = 'workfox.wsMonitor'

interface PanelState {
  visible: boolean
  x: number
  y: number
  width: number
  height: number
  zIndex: number
}

function loadState(): PanelState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      return {
        visible: parsed.visible ?? false,
        x: parsed.x ?? 50,
        y: parsed.y ?? 50,
        width: parsed.width ?? 820,
        height: parsed.height ?? 460,
        zIndex: parsed.zIndex ?? 1,
      }
    }
  } catch { /* ignore */ }
  return { visible: false, x: 50, y: 50, width: 820, height: 460, zIndex: 1 }
}

const state = reactive<PanelState>(loadState())

function updateState<K extends keyof PanelState>(key: K, value: PanelState[K]): void {
  state[key] = value
  persistState()
}

function persistState(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch { /* ignore */ }
}

// Auto-persist on any state change
watch(state, persistState, { deep: true })

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
const selectedId = ref<string | null>(null)
const paginationState = reactive({ pageIndex: 0, pageSize: 20 })

// --- Sorting ---

const sorting = ref<SortingState>([{ id: 'timestamp', desc: true }])

// --- Message capture ---

function extractField(parsed: unknown, field: string): string {
  if (!parsed || typeof parsed !== 'object') return ''
  return (parsed as Record<string, unknown>)[field] as string ?? ''
}

function toRow(entry: WsMessageEntry): WsRow {
  const parsed = entry.parsed as Record<string, unknown>
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

  window.addEventListener('keydown', toggleShortcut)
  window.addEventListener('toggle-ws-monitor', toggleShortcut)
})

onBeforeUnmount(() => {
  unsubscribe?.()
  window.removeEventListener('keydown', toggleShortcut)
  window.removeEventListener('toggle-ws-monitor', toggleShortcut)
})

function toggleShortcut(e: KeyboardEvent): void {
  if (e.ctrlKey && e.shiftKey && e.key === 'M') {
    updateState('visible', !state.visible)
  }
}

function clearMessages(): void {
  messages.value = []
  selectedId.value = null
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

watch([channelFilter, directionFilter, typeFilter], () => {
  paginationState.pageIndex = 0
})

// --- Sorting (client-side via TanStack) ---

// --- Pagination (manual) ---

function changePageSize(size: number): void {
  paginationState.pageSize = size
  paginationState.pageIndex = 0
}

// --- Selection ---

const selectedMessage = computed(() => {
  if (!selectedId.value) return null
  return messages.value.find(m => m.id === selectedId.value) ?? null
})

function selectRow(row: WsRow): void {
  selectedId.value = selectedId.value === row.id ? null : row.id
}

// --- Formatting helpers ---

function formatTime(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
    + '.' + String(d.getMilliseconds()).padStart(3, '0')
}

function formatFullTime(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour12: false })
    + '.' + String(d.getMilliseconds()).padStart(3, '0')
}

function formatJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
}

function copyRaw(): void {
  if (selectedMessage.value) {
    navigator.clipboard.writeText(formatJson(selectedMessage.value.raw))
  }
}

// --- Column definitions ---

const typeColorMap: Record<string, string> = {
  request: 'text-blue-500',
  response: 'text-green-600',
  event: 'text-purple-500',
  error: 'text-red-500',
  interaction_required: 'text-orange-500',
  interaction_response: 'text-teal-500',
  hello: 'text-gray-500',
}

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
    size: 50,
    enableSorting: true,
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
    size: 100,
    cell: ({ row }) => {
      const t = row.original.type
      const color = typeColorMap[t] || 'text-muted-foreground'
      return h('span', { class: `text-xs font-mono ${color}` }, t)
    },
  },
  {
    accessorKey: 'channel',
    header: 'Channel',
    size: 150,
    cell: ({ row }) => h('span', { class: 'text-xs font-mono' }, row.original.channel || '-'),
  },
  {
    accessorKey: 'preview',
    header: 'Data',
    size: 280,
    enableSorting: false,
    cell: ({ row }) => h('span', {
      class: 'text-xs text-muted-foreground font-mono block truncate max-w-[280px]',
    }, row.original.preview),
  },
]

// --- Table instance ---
// We feed filteredMessages as data. TanStack handles sorting.
// We paginate manually from the sorted row model.

const table = useVueTable({
  get data() { return filteredMessages.value },
  get columns() { return columns },
  getCoreRowModel: getCoreRowModel(),
  getSortedRowModel: getSortedRowModel(),
  onSortingChange: updaterOrValue => valueUpdater(updaterOrValue, sorting),
  state: {
    get sorting() { return sorting.value },
  },
  manualPagination: true,
})

// --- Derived from table (must come after useVueTable) ---

const pagedData = computed(() => {
  const sorted = table.getRowModel().rows.map(r => r.original)
  const start = paginationState.pageIndex * paginationState.pageSize
  return sorted.slice(start, start + paginationState.pageSize)
})

const paginationRange = computed(() => {
  const total = table.getRowModel().rows.length
  if (total === 0) return '0'
  const start = paginationState.pageIndex * paginationState.pageSize + 1
  const end = Math.min((paginationState.pageIndex + 1) * paginationState.pageSize, total)
  return `${start}-${end} of ${total}`
})

watch(() => table.getRowModel().rows.length, (total) => {
  const maxPage = Math.max(0, Math.ceil(total / paginationState.pageSize) - 1)
  if (paginationState.pageIndex > maxPage) paginationState.pageIndex = maxPage
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

/* --- Main content: table + side panel --- */

.content-area {
  flex: 1;
  display: flex;
  gap: 0;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 4px;
}

.table-wrap {
  flex: 1;
  overflow: auto;
  min-width: 0;
}

.table-head {
  padding: 4px 6px;
  font-size: 11px;
  height: 28px;
}

.sort-icon {
  font-size: 8px;
  opacity: 0.6;
}

.table-row {
  cursor: pointer;
}

.table-row:hover {
  background: var(--accent);
}

.row-selected {
  background: color-mix(in srgb, var(--primary) 10%, transparent);
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

/* --- Right detail panel --- */

.detail-panel {
  width: 280px;
  flex-shrink: 0;
  border-left: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  background: var(--card);
  overflow: hidden;
}

.detail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px;
  border-bottom: 1px solid var(--border);
  font-size: 11px;
  font-weight: 600;
}

.detail-close {
  background: none;
  border: none;
  font-size: 16px;
  cursor: pointer;
  color: var(--muted-foreground);
  padding: 0 2px;
  line-height: 1;
}

.detail-close:hover {
  color: var(--foreground);
}

.detail-fields {
  padding: 6px 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  border-bottom: 1px solid var(--border);
}

.detail-field {
  display: flex;
  align-items: center;
  gap: 6px;
}

.field-label {
  font-size: 10px;
  color: var(--muted-foreground);
  width: 52px;
  flex-shrink: 0;
}

.field-value {
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.detail-pre {
  flex: 1;
  padding: 6px 8px;
  margin: 0;
  font-size: 10px;
  font-family: monospace;
  white-space: pre-wrap;
  word-break: break-all;
  overflow: auto;
  color: var(--foreground);
  background: transparent;
}

.copy-btn {
  margin: 6px 8px;
  flex-shrink: 0;
}

/* --- Pagination --- */

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
</style>
