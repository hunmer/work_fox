<script setup lang="ts">
import { ref, computed, inject } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import { NodeResizer } from '@vue-flow/node-resizer'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { Input } from '@/components/ui/input'
import { WORKFLOW_STORE_KEY, type WorkflowStore } from '@/stores/workflow'
import { Lock, Unlock, Play, Ban, Group, Trash2, ArrowDownToLine } from 'lucide-vue-next'

const props = defineProps<{
  id: string
  data: {
    name: string
    childNodeIds: string[]
    childGroupIds: string[]
    locked: boolean
    disabled: boolean
    width?: number
    height?: number
  }
}>()

const store = inject(WORKFLOW_STORE_KEY) as WorkflowStore

const isEditing = ref(false)
const editName = ref(props.data.name)

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
        :style="{
          width: data.width ? `${data.width}px` : '100%',
          height: data.height ? `${data.height}px` : '100%',
        }"
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
              @click.stop
            />
          </template>
          <span v-else class="group-node__name truncate">
            {{ headerLabel }}
          </span>
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
  cursor: default;
  user-select: none;
  font-size: 12px;
  color: var(--vf-node-text, #334155);
  pointer-events: auto;
}

.group-node__name {
  pointer-events: none;
}

.group-node--locked {
  border-style: solid;
  border-color: var(--vf-node-border, #94a3b8);
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
