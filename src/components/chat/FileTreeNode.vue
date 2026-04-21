<script setup lang="ts">
import { ref } from 'vue'
import { ChevronRight, ChevronDown, File, Folder, FolderOpen } from 'lucide-vue-next'

interface FileEntry {
  name: string
  path: string
  type: 'file' | 'directory'
}

const props = defineProps<{
  entry: FileEntry
  depth: number
}>()

const expanded = ref(false)
const children = ref<FileEntry[]>([])
const loading = ref(false)

async function toggle() {
  if (!expanded.value) {
    loading.value = true
    try {
      children.value = await window.api.fs.listDir(props.entry.path)
    } catch {
      children.value = []
    } finally {
      loading.value = false
    }
  }
  expanded.value = !expanded.value
}
</script>

<template>
  <div>
    <div
      class="flex items-center gap-1 px-2 py-1 text-xs rounded cursor-pointer hover:bg-muted/50 select-none"
      :style="{ paddingLeft: depth * 12 + 8 + 'px' }"
      @click="entry.type === 'directory' ? toggle() : undefined"
    >
      <component
        :is="entry.type === 'directory' ? (expanded ? ChevronDown : ChevronRight) : undefined"
        v-if="entry.type === 'directory'"
        class="w-3 h-3 shrink-0 text-muted-foreground"
      />
      <span
        v-else
        class="w-3 shrink-0"
      />
      <component
        :is="entry.type === 'directory' ? (expanded ? FolderOpen : Folder) : File"
        class="w-3.5 h-3.5 shrink-0"
        :class="entry.type === 'directory' ? 'text-amber-500' : 'text-muted-foreground'"
      />
      <span class="truncate ml-1">{{ entry.name }}</span>
    </div>
    <template v-if="entry.type === 'directory' && expanded">
      <FileTreeNode
        v-for="child in children"
        :key="child.path"
        :entry="child"
        :depth="depth + 1"
      />
    </template>
  </div>
</template>
