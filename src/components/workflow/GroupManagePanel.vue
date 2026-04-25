<script setup lang="ts">
import { ref, computed } from 'vue'
import { useWorkflowStore } from '@/stores/workflow'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Lock, Unlock, Trash2, Pencil, Check, X } from 'lucide-vue-next'

const store = useWorkflowStore()

const editingGroupId = ref<string | null>(null)
const editName = ref('')
const selectedGroupIds = ref<string[]>([])

const groups = computed(() => store.currentWorkflow?.groups || [])

function startEdit(groupId: string, name: string) {
  editingGroupId.value = groupId
  editName.value = name
}

function commitEdit() {
  if (editingGroupId.value) {
    const trimmed = editName.value.trim()
    if (trimmed) {
      store.renameGroup(editingGroupId.value, trimmed)
    }
    editingGroupId.value = null
  }
}

function cancelEdit() {
  editingGroupId.value = null
}

function toggleSelect(groupId: string) {
  const idx = selectedGroupIds.value.indexOf(groupId)
  if (idx >= 0) {
    selectedGroupIds.value.splice(idx, 1)
  } else {
    selectedGroupIds.value.push(groupId)
  }
}

function batchDelete() {
  for (const id of selectedGroupIds.value) {
    store.ungroup(id)
  }
  selectedGroupIds.value = []
}

function focusGroup(groupId: string) {
  // TODO: 与画布 fitView 联动 — 后续可通过 canvas context 实现
  // 目前先在面板内高亮即可
}
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- 头部：批量操作 -->
    <div class="flex items-center justify-between pb-2 border-b mb-2">
      <span class="text-xs text-muted-foreground">
        {{ groups.length }} 个分组
      </span>
      <Button
        v-if="selectedGroupIds.length > 0"
        variant="destructive"
        size="sm"
        class="h-6 text-xs px-2"
        @click="batchDelete"
      >
        <Trash2 class="w-3 h-3 mr-1" />
        删除选中 ({{ selectedGroupIds.length }})
      </Button>
    </div>

    <!-- 分组列表 -->
    <div class="flex-1 overflow-auto space-y-1">
      <div
        v-for="group in groups"
        :key="group.id"
        class="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent/50 group cursor-pointer"
        @click="focusGroup(group.id)"
      >
        <!-- 选择框 -->
        <Checkbox
          :checked="selectedGroupIds.includes(group.id)"
          @update:checked="toggleSelect(group.id)"
          @click.stop
        />

        <!-- 固定图标 -->
        <Lock v-if="group.locked" class="w-3 h-3 shrink-0 opacity-50" />
        <Unlock v-else class="w-3 h-3 shrink-0 opacity-30" />

        <!-- 名称 -->
        <div v-if="editingGroupId === group.id" class="flex-1 flex items-center gap-1">
          <Input
            v-model="editName"
            class="h-5 px-1 text-xs"
            @keydown.enter="commitEdit"
            @keydown.escape="cancelEdit"
            @click.stop
          />
          <button class="p-0.5 hover:text-foreground" @click.stop="commitEdit">
            <Check class="w-3 h-3" />
          </button>
          <button class="p-0.5 hover:text-foreground" @click.stop="cancelEdit">
            <X class="w-3 h-3" />
          </button>
        </div>
        <span v-else class="flex-1 text-xs truncate">
          {{ group.name }}
          <span class="text-muted-foreground">({{ group.childNodeIds.length }})</span>
        </span>

        <!-- 操作按钮 -->
        <div class="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            class="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
            title="重命名"
            @click.stop="startEdit(group.id, group.name)"
          >
            <Pencil class="w-3 h-3" />
          </button>
          <button
            class="p-1 rounded hover:bg-accent text-destructive"
            title="删除分组（保留节点）"
            @click.stop="store.ungroup(group.id)"
          >
            <Trash2 class="w-3 h-3" />
          </button>
        </div>
      </div>

      <div v-if="groups.length === 0" class="py-8 text-center text-xs text-muted-foreground">
        暂无分组
      </div>
    </div>
  </div>
</template>
