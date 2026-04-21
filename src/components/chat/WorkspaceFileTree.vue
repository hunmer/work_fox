<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { useAgentSettingsStore } from '@/stores/agent-settings'
import { useTabStore } from '@/stores/tab'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { Plus, Search, File, FolderPlus } from 'lucide-vue-next'
import FileTreeNode from './FileTreeNode.vue'

interface FileEntry {
  name: string
  path: string
  type: 'file' | 'directory'
  modifiedAt: string
}

const agentSettingsStore = useAgentSettingsStore()
const tabStore = useTabStore()

const rootEntries = ref<FileEntry[]>([])
const searchText = ref('')
const newEntryPath = ref<string | null>(null)

const workspacePath = computed(() => {
  const workflowAgent = tabStore.activeStore?.currentWorkflow?.agentConfig
  if (workflowAgent?.workspaceDir) return workflowAgent.workspaceDir
  return agentSettingsStore.globalSettings.workspaceDir || ''
})

const filteredEntries = computed(() => {
  if (!searchText.value.trim()) return rootEntries.value
  const keyword = searchText.value.toLowerCase()
  return rootEntries.value.filter(e => e.name.toLowerCase().includes(keyword))
})

function joinPath(base: string, name: string): string {
  const sep = base.includes('\\') ? '\\' : '/'
  return `${base}${sep}${name}`
}

async function loadRoot() {
  if (!workspacePath.value) {
    rootEntries.value = []
    return
  }
  try {
    rootEntries.value = await window.api.fs.listDir(workspacePath.value)
  } catch {
    rootEntries.value = []
  }
}

async function handleCreateFile() {
  if (!workspacePath.value) return
  const newPath = joinPath(workspacePath.value, 'untitled')
  await window.api.fs.createFile(newPath)
  await loadRoot()
  newEntryPath.value = newPath
}

async function handleCreateDir() {
  if (!workspacePath.value) return
  const newPath = joinPath(workspacePath.value, 'new_folder')
  await window.api.fs.createDir(newPath)
  await loadRoot()
  newEntryPath.value = newPath
}

function handleChildDeleted(_path: string) {
  rootEntries.value = rootEntries.value.filter(e => e.path !== _path)
  if (newEntryPath.value === _path) newEntryPath.value = null
}

function handleChildRenamed(oldPath: string, newPath: string) {
  rootEntries.value = rootEntries.value.map(e =>
    e.path === oldPath ? { ...e, path: newPath, name: newPath.split(/[/\\]/).pop() || e.name } : e
  )
  if (newEntryPath.value === oldPath) newEntryPath.value = null
}

function handleRefresh(dirPath: string) {
  if (dirPath === workspacePath.value) {
    loadRoot()
  }
}

watch(workspacePath, () => loadRoot(), { immediate: true })
</script>

<template>
  <div class="h-full flex flex-col">
    <div
      v-if="!workspacePath"
      class="flex-1 flex items-center justify-center text-sm text-muted-foreground p-4"
    >
      未设置工作目录，请在 Agent 设置中配置
    </div>

    <template v-else>
      <!-- Header：搜索框 + 新建下拉 -->
      <div class="shrink-0 flex items-center gap-1.5 px-2 py-1.5 border-b">
        <div class="relative flex-1">
          <Search class="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" />
          <Input
            v-model="searchText"
            placeholder="搜索文件..."
            class="h-6 text-xs pl-6"
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <Button
              variant="ghost"
              size="icon"
              class="h-6 w-6 shrink-0"
            >
              <Plus class="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem @select="handleCreateFile">
              <File class="size-3.5 mr-2" />
              新建文件
            </DropdownMenuItem>
            <DropdownMenuItem @select="handleCreateDir">
              <FolderPlus class="size-3.5 mr-2" />
              新建文件夹
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <!-- 文件列表 -->
      <ContextMenu>
        <ContextMenuTrigger as-child>
          <ScrollArea class="flex-1 min-h-0">
            <div class="p-2">
              <FileTreeNode
                v-for="entry in filteredEntries"
                :key="entry.path"
                :entry="entry"
                :depth="0"
                :editing="entry.path === newEntryPath"
                @deleted="handleChildDeleted"
                @refresh="handleRefresh"
                @renamed="handleChildRenamed"
              />
              <div
                v-if="filteredEntries.length === 0"
                class="text-xs text-muted-foreground text-center py-4"
              >
                {{ searchText ? '未找到匹配文件' : '空目录' }}
              </div>
            </div>
          </ScrollArea>
        </ContextMenuTrigger>

        <!-- 空白区右键菜单 -->
        <ContextMenuContent class="w-48">
          <ContextMenuItem @select="handleCreateDir">
            <FolderPlus class="size-3.5 mr-2" />
            新建文件夹
          </ContextMenuItem>
          <ContextMenuItem @select="handleCreateFile">
            <File class="size-3.5 mr-2" />
            新建文件
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </template>
  </div>
</template>
