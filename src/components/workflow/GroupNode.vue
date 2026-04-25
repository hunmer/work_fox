<script setup lang="ts">
import { ref, computed, inject } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import { NodeResizer } from '@vue-flow/node-resizer'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { WORKFLOW_STORE_KEY, type WorkflowStore } from '@/stores/workflow'
import { Lock, Unlock, Play, Ban, Group, Trash2, ArrowDownToLine, Palette } from 'lucide-vue-next'

const props = defineProps<{
  id: string
  data: {
    name: string
    childNodeIds: string[]
    childGroupIds: string[]
    locked: boolean
    disabled: boolean
    color?: string
    width?: number
    height?: number
  }
}>()

const store = inject(WORKFLOW_STORE_KEY) as WorkflowStore

const isEditing = ref(false)
const editName = ref(props.data.name)
const colorPopoverOpen = ref(false)

const GROUP_COLORS = [
  '#ef4444',
  '#f97316',
  '#f59e0b',
  '#84cc16',
  '#22c55e',
  '#14b8a6',
  '#06b6d4',
  '#3b82f6',
  '#6366f1',
  '#8b5cf6',
  '#d946ef',
  '#ec4899',
]

function startEdit() {
  editName.value = props.data.name
  isEditing.value = true
}

function commitEdit() {
  isEditing.value = false
  const trimmed = editName.value.trim()
  if (trimmed && trimmed !== props.data.name) {
    store.renameGroup(props.id, trimmed)
  }
}

function cancelEdit() {
  isEditing.value = false
  editName.value = props.data.name
}

const headerLabel = computed(() => {
  const count = props.data.childNodeIds.length + props.data.childGroupIds.length
  return `${props.data.name} (${count})`
})

const groupStyle = computed(() => ({
  width: props.data.width ? `${props.data.width}px` : '100%',
  height: props.data.height ? `${props.data.height}px` : '100%',
  backgroundColor: props.data.color ? `${props.data.color}99` : 'transparent',
}))

function selectColor(color?: string) {
  store.updateGroupColor(props.id, color)
  colorPopoverOpen.value = false
}
</script>

<template>
  <ContextMenu>
    <ContextMenuTrigger as-child>
      <div
        class="group-node"
        :class="{
          'group-node--locked': data.locked,
          'group-node--disabled': data.disabled,
        }"
        :style="groupStyle"
      >
        <!-- 标题栏 -->
        <div class="group-node__header" @dblclick.stop="startEdit">
          <Lock v-if="data.locked" class="w-3 h-3 shrink-0 opacity-60" />
          <Unlock v-else class="w-3 h-3 shrink-0 opacity-40" />

          <template v-if="isEditing">
            <Input
              v-model="editName"
              class="h-5 px-1 text-xs bg-transparent border-border/50"
              @keydown.enter="commitEdit"
              @keydown.escape="cancelEdit"
              @blur="commitEdit"
              @pointerdown.stop
              @click.stop
            />
          </template>
          <span v-else class="group-node__name truncate">
            {{ headerLabel }}
          </span>

          <div class="group-node__actions" @pointerdown.stop @click.stop>
            <Popover v-model:open="colorPopoverOpen">
              <PopoverTrigger as-child>
                <button class="group-node__action" title="设置颜色">
                  <span
                    class="group-node__color-dot"
                    :style="{ backgroundColor: data.color || 'transparent' }"
                  />
                </button>
              </PopoverTrigger>
              <PopoverContent class="w-48 p-2" align="end" :side-offset="6">
                <div class="group-node__color-grid">
                  <button
                    v-for="color in GROUP_COLORS"
                    :key="color"
                    class="group-node__color-option"
                    :class="{ 'group-node__color-option--active': data.color === color }"
                    :style="{ backgroundColor: color }"
                    :title="color"
                    @click="selectColor(color)"
                  />
                </div>
                <button class="group-node__clear-color" @click="selectColor(undefined)">
                  清除颜色
                </button>
              </PopoverContent>
            </Popover>

            <button class="group-node__action" title="整理节点" @click="store.arrangeGroupNodes(id)">
              <ArrowDownToLine class="w-3 h-3" />
            </button>

            <button class="group-node__action" :title="data.locked ? '解除固定' : '固定分组'" @click="store.toggleGroupLock(id)">
              <Lock v-if="!data.locked" class="w-3 h-3" />
              <Unlock v-else class="w-3 h-3" />
            </button>
          </div>
        </div>

        <!-- 禁用遮罩 -->
        <div v-if="data.disabled" class="group-node__disabled-overlay" />

        <!-- NodeResizer -->
        <NodeResizer
          :is-visible="!data.locked"
          :is-resizable="!data.locked"
          :min-width="100"
          :min-height="60"
          handle-style="{ width: '6px', height: '6px', background: '#6366f1', border: '1px solid white' }"
        />
      </div>
    </ContextMenuTrigger>

    <ContextMenuContent class="w-48">
      <ContextMenuSub>
        <ContextMenuSubTrigger>
          <Palette class="w-4 h-4 mr-2" />
          设置颜色
        </ContextMenuSubTrigger>
        <ContextMenuSubContent class="w-48 p-2">
          <div class="group-node__color-grid">
            <button
              v-for="color in GROUP_COLORS"
              :key="color"
              class="group-node__color-option"
              :class="{ 'group-node__color-option--active': data.color === color }"
              :style="{ backgroundColor: color }"
              :title="color"
              @click="selectColor(color)"
            />
          </div>
          <button class="group-node__clear-color" @click="selectColor(undefined)">
            清除颜色
          </button>
        </ContextMenuSubContent>
      </ContextMenuSub>
      <ContextMenuItem @click="store.arrangeGroupNodes(id)">
        <ArrowDownToLine class="w-4 h-4 mr-2" />
        整理节点
      </ContextMenuItem>
      <ContextMenuItem @click="store.toggleGroupLock(id)">
        <Lock v-if="!data.locked" class="w-4 h-4 mr-2" />
        <Unlock v-else class="w-4 h-4 mr-2" />
        {{ data.locked ? '解除固定' : '固定分组' }}
      </ContextMenuItem>
      <ContextMenuItem @click="store.toggleGroupDisabled(id)">
        <Ban v-if="!data.disabled" class="w-4 h-4 mr-2" />
        <Play v-else class="w-4 h-4 mr-2" />
        {{ data.disabled ? '启用分组' : '禁用分组' }}
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem
        :disabled="data.locked"
        @click="store.ungroup(id)"
      >
        <Group class="w-4 h-4 mr-2" />
        解除分组
      </ContextMenuItem>
      <ContextMenuItem
        class="text-destructive focus:text-destructive"
        @click="store.deleteGroup(id)"
      >
        <Trash2 class="w-4 h-4 mr-2" />
        删除分组
      </ContextMenuItem>
    </ContextMenuContent>
  </ContextMenu>
</template>

<style scoped>
.group-node {
  position: relative;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  border: 2px dashed var(--vf-node-border, #e2e8f0);
  border-radius: 8px;
  background: transparent;
  pointer-events: auto;
  min-width: 100px;
  min-height: 60px;
}

.group-node__header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-radius: 6px 6px 0 0;
  background: color-mix(in srgb, var(--vf-node-bg, #fff) 70%, transparent);
  backdrop-filter: blur(4px);
  cursor: move;
  user-select: none;
  font-size: 12px;
  color: var(--vf-node-text, #334155);
  pointer-events: auto;
}

.group-node__name {
  flex: 1;
  min-width: 0;
  pointer-events: none;
}

.group-node__actions {
  display: flex;
  align-items: center;
  gap: 2px;
  margin-left: auto;
  pointer-events: auto;
}

.group-node__action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 999px;
  color: var(--vf-node-text, #334155);
  opacity: 0.72;
  transition: background 120ms ease, opacity 120ms ease;
}

.group-node__action:hover {
  background: color-mix(in srgb, var(--vf-node-text, #334155) 10%, transparent);
  opacity: 1;
}

.group-node__color-dot {
  width: 10px;
  height: 10px;
  border: 1px solid color-mix(in srgb, var(--vf-node-text, #334155) 35%, transparent);
  border-radius: 999px;
  background-image: linear-gradient(45deg, #e5e7eb 25%, transparent 25%),
    linear-gradient(-45deg, #e5e7eb 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #e5e7eb 75%),
    linear-gradient(-45deg, transparent 75%, #e5e7eb 75%);
  background-position: 0 0, 0 5px, 5px -5px, -5px 0;
  background-size: 10px 10px;
}

.group-node__color-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 6px;
}

.group-node__color-option {
  width: 22px;
  height: 22px;
  border: 2px solid transparent;
  border-radius: 999px;
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--border, #e5e7eb) 90%, transparent);
}

.group-node__color-option--active {
  border-color: var(--foreground, #111827);
}

.group-node__clear-color {
  width: 100%;
  margin-top: 8px;
  padding: 4px 6px;
  border-radius: 6px;
  font-size: 12px;
  color: var(--muted-foreground, #64748b);
}

.group-node__clear-color:hover {
  background: var(--muted, #f1f5f9);
}

.group-node--locked {
  border-style: solid;
  border-color: var(--vf-node-border, #94a3b8);
}

.group-node--locked .group-node__header {
  cursor: default;
}

.group-node--disabled {
  position: relative;
}

.group-node__disabled-overlay {
  position: absolute;
  inset: 0;
  border-radius: 6px;
  background: color-mix(in srgb, #ef4444 10%, transparent);
  pointer-events: none;
}
</style>
