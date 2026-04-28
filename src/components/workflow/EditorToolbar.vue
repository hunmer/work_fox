<script setup lang="ts">
import { ref, watch, nextTick, type Ref } from 'vue'
import { useRouter } from 'vue-router'
import { Minus, Square, X, Maximize2, Plus, Save, LayoutDashboard, SaveAll, RotateCcw, Trash2, Pencil, Zap } from 'lucide-vue-next'
import {
  Menubar,
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarSub,
  MenubarSubTrigger,
  MenubarSubContent,
  MenubarSeparator,
} from '@/components/ui/menubar'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { useTabStore } from '@/stores/tab'
import type { LayoutPreset } from '@/composables/workflow/useEditorLayout'

const router = useRouter()
const tabStore = useTabStore()

function closeTab(tabId: string) {
  const isLast = tabStore.tabs.length === 1
  tabStore.closeTab(tabId)
  if (isLast) router.push('/home')
}

const props = defineProps<{
  isEditingName: boolean
  editingName: string
  workflowName: string
  hideTabSwitcher?: boolean
  isDirty?: boolean
  hasCustomLayout?: boolean
  hasTriggers?: boolean
  layoutPresets: LayoutPreset[]
  recentWorkflows: { id: string; name: string; updatedAt: number }[]
}>()

const emit = defineEmits<{
  'new': []
  open: []
  save: []
  export: []
  import: []
  'update:editingName': [value: string]
  startEditName: []
  finishEditName: []
  cancelEditName: []
  openSettings: []
  openRecent: [id: string]
  'reset-layout': []
  'save-preset': []
  'apply-preset': [id: string]
  'delete-preset': [id: string]
  'open-triggers': []
}>()

const isMaximized = ref(false)
const isElectron = navigator.userAgent.includes('Electron')

// 重命名对话框
const renameDialogOpen = ref(false)
const renameTabId = ref<string | null>(null)
const renameInput = ref('')
const renameInputEl = ref<HTMLInputElement | null>(null)

watch(renameDialogOpen, (val) => {
  if (val) nextTick(() => renameInputEl.value?.focus())
})

function openRenameDialog(tabId: string) {
  const tab = tabStore.tabs.find(t => t.id === tabId)
  if (!tab) return
  renameTabId.value = tabId
  renameInput.value = tab.name || ''
  renameDialogOpen.value = true
}

function confirmRename() {
  if (!renameTabId.value) return
  const trimmed = renameInput.value.trim()
  if (trimmed && renameTabId.value === tabStore.activeTabId) {
    emit('update:editingName', trimmed)
    emit('finishEditName')
  }
  renameDialogOpen.value = false
}

async function refreshMaximized() {
  isMaximized.value = await window.api.window.isMaximized()
}

function handleMinimize() {
  window.api.window.minimize()
}

function handleMaximize() {
  window.api.window.maximize()
  setTimeout(refreshMaximized, 100)
}

function handleClose() {
  window.api.window.close()
}

refreshMaximized()
</script>

<template>
  <div class="relative border-b border-border">
    <div class="absolute inset-x-0 top-0 h-3 app-drag" />
    <div class="relative flex items-center px-2 py-1">
    <Menubar class="border-0 bg-transparent h-7 no-drag">
      <MenubarMenu>
        <MenubarTrigger class="text-xs h-6 px-2">
          文件
        </MenubarTrigger>
        <MenubarContent>
          <MenubarItem
            class="text-xs"
            @click="emit('new')"
          >
            新建
          </MenubarItem>
          <MenubarItem
            class="text-xs"
            @click="emit('open')"
          >
            打开...
          </MenubarItem>
          <MenubarSub v-if="recentWorkflows.length > 0">
            <MenubarSubTrigger class="text-xs">
              最近打开
            </MenubarSubTrigger>
            <MenubarSubContent>
              <MenubarItem
                v-for="wf in recentWorkflows"
                :key="wf.id"
                class="text-xs"
                @click="emit('openRecent', wf.id)"
              >
                {{ wf.name }}
              </MenubarItem>
            </MenubarSubContent>
          </MenubarSub>
          <MenubarItem
            v-if="workflowName"
            class="text-xs"
            @click="emit('save')"
          >
            保存
          </MenubarItem>
          <MenubarItem
            v-if="workflowName"
            class="text-xs"
            @click="emit('export')"
          >
            导出...
          </MenubarItem>
          <MenubarItem
            class="text-xs"
            @click="emit('import')"
          >
            导入...
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>
      <MenubarMenu>
        <MenubarTrigger class="text-xs h-6 px-2">
          布局
        </MenubarTrigger>
        <MenubarContent>
          <MenubarItem
            class="text-xs"
            @click="emit('save-preset')"
          >
            <SaveAll class="w-3 h-3 mr-2" />
            保存为预设...
          </MenubarItem>
          <MenubarSeparator v-if="layoutPresets.length > 0" />
          <MenubarItem
            v-for="preset in layoutPresets"
            :key="preset.id"
            class="text-xs flex items-center justify-between gap-2"
            @click="emit('apply-preset', preset.id)"
          >
            <span class="truncate">{{ preset.name }}</span>
            <button
              class="shrink-0 p-0.5 rounded hover:bg-destructive/20 hover:text-destructive"
              title="删除预设"
              @click.stop="emit('delete-preset', preset.id)"
            >
              <Trash2 class="w-3 h-3" />
            </button>
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem
            class="text-xs"
            @click="emit('reset-layout')"
          >
            <RotateCcw class="w-3 h-3 mr-2" />
            恢复默认布局
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>
    </Menubar>

    <!-- Tab bar -->
    <div v-if="!hideTabSwitcher" class="flex items-center gap-0.5 ml-2 no-drag overflow-x-auto scrollbar-none">
      <ContextMenu v-for="tab in tabStore.tabs" :key="tab.id">
        <ContextMenuTrigger as-child>
          <button
            class="group relative flex items-center gap-1 text-xs px-2 py-1 rounded-t-md transition-colors max-w-32 shrink-0"
            :class="tab.id === tabStore.activeTabId
              ? 'bg-muted text-foreground border-b-2 border-primary'
              : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'"
            @click="tabStore.switchTab(tab.id)"
          >
            <span class="truncate">{{ tab.name || '未选择工作流' }}</span>
            <span
              class="inline-flex items-center justify-center w-4 h-4 rounded-sm opacity-0 group-hover:opacity-100 transition-opacity shrink-0 hover:bg-destructive/20 hover:text-destructive"
              @click.stop="closeTab(tab.id)"
            >
              <X class="w-3 h-3" />
            </span>
          </button>
        </ContextMenuTrigger>
        <ContextMenuContent class="min-w-32">
          <ContextMenuItem class="text-xs" @click="openRenameDialog(tab.id)">
            <Pencil class="w-3 h-3 mr-2" />
            重命名
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      <button
        class="inline-flex items-center justify-center w-5 h-5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0"
        title="打开工作流"
        @click="emit('open')"
      >
        <Plus class="w-3 h-3" />
      </button>
    </div>

    <div class="flex-1" />

    <div class="flex items-center no-drag">
      <button
        class="relative inline-flex items-center justify-center w-7 h-7 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        title="触发器设置"
        @click="emit('open-triggers')"
      >
        <Zap class="w-4 h-4" />
        <span
          v-if="hasTriggers"
          class="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-primary"
        />
      </button>
      <button
        v-if="hasCustomLayout"
        class="inline-flex items-center justify-center w-7 h-7 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        title="重置布局"
        @click="emit('reset-layout')"
      >
        <LayoutDashboard class="w-4 h-4" />
      </button>
      <button
        v-if="isDirty"
        class="inline-flex items-center justify-center w-7 h-7 rounded hover:bg-muted text-orange-400 hover:text-orange-500 transition-colors"
        title="未保存的更改，点击保存"
        @click="emit('save')"
      >
        <Save class="w-3.5 h-3.5" />
      </button>
    </div>

    <div v-if="isElectron" class="flex items-center no-drag">
      <button
        class="inline-flex items-center justify-center w-7 h-7 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        @click="handleMinimize"
      >
        <Minus class="w-3.5 h-3.5" />
      </button>
      <button
        class="inline-flex items-center justify-center w-7 h-7 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        @click="handleMaximize"
      >
        <Maximize2 v-if="isMaximized" class="w-3 h-3" />
        <Square v-else class="w-3 h-3" />
      </button>
      <button
        class="inline-flex items-center justify-center w-7 h-7 rounded hover:bg-destructive/90 hover:text-destructive-foreground text-muted-foreground transition-colors"
        @click="handleClose"
      >
        <X class="w-3.5 h-3.5" />
      </button>
    </div>
    </div>
  </div>

  <!-- 重命名对话框 -->
  <Dialog :open="renameDialogOpen" @update:open="renameDialogOpen = $event">
    <DialogContent class="sm:max-w-sm">
      <DialogHeader>
        <DialogTitle>重命名工作流</DialogTitle>
      </DialogHeader>
      <input
        ref="renameInputEl"
        v-model="renameInput"
        class="w-full text-sm bg-transparent border border-border rounded-md px-3 py-2 outline-none focus:border-primary"
        placeholder="输入工作流名称"
        @keydown.enter="confirmRename"
        @keydown.escape="renameDialogOpen = false"
      />
      <DialogFooter class="gap-2">
        <button
          class="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted transition-colors"
          @click="renameDialogOpen = false"
        >
          取消
        </button>
        <button
          class="text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          @click="confirmRename"
        >
          确定
        </button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
