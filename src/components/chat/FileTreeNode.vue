<script setup lang="ts">
import { ref, nextTick, watch } from 'vue'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { ChevronRight, ChevronDown, File, Folder, FolderOpen, X } from 'lucide-vue-next'
import { fsApi } from '@/lib/backend-api/fs'

export interface FileEntry {
  name: string
  path: string
  type: 'file' | 'directory'
  modifiedAt: string
}

const props = defineProps<{
  entry: FileEntry
  depth: number
  editing?: boolean
}>()

const emit = defineEmits<{
  deleted: [path: string]
  refresh: [dirPath: string]
  renamed: [oldPath: string, newPath: string]
  'update:editing': [value: boolean]
}>()

const expanded = ref(false)
const children = ref<FileEntry[]>([])
const loading = ref(false)
const isEditing = ref(false)
const editValue = ref('')
const inputRef = ref<HTMLInputElement>()

/** 双击检测：记录上一次点击时间 */
let lastClickTime = 0

/** 外部 prop 驱动编辑状态（新建后自动编辑） */
watch(() => props.editing, (val) => {
  if (val && !isEditing.value) {
    startEditing()
  }
}, { immediate: true })

function focusAndSelectInput() {
  setTimeout(() => {
    const el = inputRef.value
    if (!el) return
    el.focus()
    const dotIndex = props.entry.name.lastIndexOf('.')
    if (dotIndex > 0 && props.entry.type === 'file') {
      el.setSelectionRange(0, dotIndex)
    } else {
      el.select()
    }
  }, 100)
}

function startEditing() {
  isEditing.value = true
  editValue.value = props.entry.name
  emit('update:editing', false)
  focusAndSelectInput()
}

function handleNameClick() {
  const now = Date.now()
  const elapsed = now - lastClickTime
  lastClickTime = now

  if (elapsed > 500 && elapsed < 2000 && !isEditing.value) {
    startEditing()
  }
}

async function confirmRename() {
  if (!isEditing.value) return
  isEditing.value = false

  const newName = editValue.value.trim()
  if (!newName || newName === props.entry.name) return

  const result = await fsApi.rename(props.entry.path, newName)
  if (result.success && result.newPath) {
    // 如果是目录且已展开，刷新子项
    if (props.entry.type === 'directory' && expanded.value) {
      children.value = await fsApi.listDir(result.newPath)
    }
    emit('renamed', props.entry.path, result.newPath)
  }
}

function cancelRename() {
  isEditing.value = false
}

async function toggle() {
  if (isEditing.value) return
  if (!expanded.value) {
    loading.value = true
    try {
      children.value = await fsApi.listDir(props.entry.path)
    } catch {
      children.value = []
    } finally {
      loading.value = false
    }
  }
  expanded.value = !expanded.value
}

async function handleDelete() {
  const { success } = await fsApi.delete(props.entry.path)
  if (success) {
    emit('deleted', props.entry.path)
  }
}

async function handleOpenInExplorer() {
  await window.api.fs.openInExplorer(props.entry.path)
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text)
}

function joinPath(base: string, name: string): string {
  const sep = base.includes('\\') ? '\\' : '/'
  return `${base}${sep}${name}`
}

async function handleCreateFile() {
  if (props.entry.type !== 'directory') return
  const newName = 'untitled'
  await fsApi.createFile(joinPath(props.entry.path, newName))
  if (!expanded.value) {
    expanded.value = true
  }
  children.value = await fsApi.listDir(props.entry.path)
  emit('refresh', props.entry.path)
}

async function handleCreateDir() {
  if (props.entry.type !== 'directory') return
  const newName = 'new_folder'
  await fsApi.createDir(joinPath(props.entry.path, newName))
  if (!expanded.value) {
    expanded.value = true
  }
  children.value = await fsApi.listDir(props.entry.path)
  emit('refresh', props.entry.path)
}

function formatModifiedTime(iso: string): string {
  if (!iso) return ''
  const date = new Date(iso)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`
  if (diff < 172800000) return '昨天'
  return `${date.getMonth() + 1}/${date.getDate()}`
}

function onChildDeleted(childPath: string) {
  if (expanded.value) {
    children.value = children.value.filter(c => c.path !== childPath)
  }
  emit('deleted', childPath)
}

function onChildRenamed(oldPath: string, newPath: string) {
  emit('renamed', oldPath, newPath)
}

function onChildRefresh(dirPath: string) {
  emit('refresh', dirPath)
}

/** 新建后自动进入编辑：查找新创建的子项 */
const newChildEditingPath = ref<string | null>(null)

watch(children, async (newChildren) => {
  if (!newChildEditingPath.value) return
  const target = newChildren.find(c => c.path === newChildEditingPath.value)
  if (target) {
    // 延迟一帧确保 DOM 已渲染
    await nextTick()
    newChildEditingPath.value = null
  }
})

async function handleCreateFileAndEdit() {
  if (props.entry.type !== 'directory') return
  const newName = 'untitled'
  const newPath = joinPath(props.entry.path, newName)
  await fsApi.createFile(newPath)
  if (!expanded.value) {
    expanded.value = true
  }
  children.value = await fsApi.listDir(props.entry.path)
  newChildEditingPath.value = newPath
  emit('refresh', props.entry.path)
}

async function handleCreateDirAndEdit() {
  if (props.entry.type !== 'directory') return
  const newName = 'new_folder'
  const newPath = joinPath(props.entry.path, newName)
  await fsApi.createDir(newPath)
  if (!expanded.value) {
    expanded.value = true
  }
  children.value = await fsApi.listDir(props.entry.path)
  newChildEditingPath.value = newPath
  emit('refresh', props.entry.path)
}
</script>

<template>
  <div>
    <ContextMenu>
      <ContextMenuTrigger as-child>
        <div
          class="group flex items-center gap-1 px-2 py-1 text-xs rounded hover:bg-muted/50 select-none"
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

          <!-- 名称：普通模式 / 编辑模式 -->
          <span
            v-if="!isEditing"
            class="truncate ml-1 flex-1 min-w-0 cursor-text"
            @click.stop="handleNameClick"
          >{{ entry.name }}</span>
          <input
            v-else
            ref="inputRef"
            v-model="editValue"
            class="ml-1 flex-1 min-w-0 h-5 px-1 text-xs bg-background border border-primary rounded outline-none"
            @keydown.enter="confirmRename"
            @keydown.escape="cancelRename"
            @blur="confirmRename"
            @click.stop
          >

          <span
            v-if="entry.modifiedAt && !isEditing"
            class="shrink-0 text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
          >
            {{ formatModifiedTime(entry.modifiedAt) }}
          </span>
          <button
            v-if="!isEditing"
            class="shrink-0 w-4 h-4 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/10"
            @click.stop="handleDelete"
          >
            <X class="w-3 h-3 text-muted-foreground hover:text-destructive" />
          </button>
        </div>
      </ContextMenuTrigger>

      <!-- 文件右键菜单 -->
      <ContextMenuContent
        v-if="entry.type === 'file'"
        class="w-48"
      >
        <ContextMenuItem @select="startEditing">
          重命名
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem @select="copyToClipboard(entry.name)">
          复制文件名
        </ContextMenuItem>
        <ContextMenuItem @select="copyToClipboard(entry.path)">
          复制文件路径
        </ContextMenuItem>
        <ContextMenuItem @select="handleOpenInExplorer">
          打开文件位置
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          class="text-destructive focus:text-destructive"
          @select="handleDelete"
        >
          删除文件
        </ContextMenuItem>
      </ContextMenuContent>

      <!-- 文件夹右键菜单 -->
      <ContextMenuContent
        v-if="entry.type === 'directory'"
        class="w-48"
      >
        <ContextMenuItem @select="startEditing">
          重命名
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem @select="copyToClipboard(entry.name)">
          复制文件夹名
        </ContextMenuItem>
        <ContextMenuItem @select="copyToClipboard(entry.path)">
          复制文件夹路径
        </ContextMenuItem>
        <ContextMenuItem @select="handleOpenInExplorer">
          打开文件夹位置
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem @select="handleCreateDirAndEdit">
          新建子文件夹
        </ContextMenuItem>
        <ContextMenuItem @select="handleCreateFileAndEdit">
          目录下新建文件
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          class="text-destructive focus:text-destructive"
          @select="handleDelete"
        >
          删除目录
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>

    <template v-if="entry.type === 'directory' && expanded">
      <FileTreeNode
        v-for="child in children"
        :key="child.path"
        :entry="child"
        :depth="depth + 1"
        :editing="child.path === newChildEditingPath"
        @deleted="onChildDeleted"
        @refresh="onChildRefresh"
        @renamed="onChildRenamed"
      />
    </template>
  </div>
</template>
