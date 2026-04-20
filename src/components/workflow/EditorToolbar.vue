<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { Minus, Square, X, Maximize2, ChevronDown, Plus, Home, Save } from 'lucide-vue-next'
import {
  Menubar,
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarSub,
  MenubarSubTrigger,
  MenubarSubContent,
} from '@/components/ui/menubar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useTabStore } from '@/stores/tab'

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
  openPlugins: []
  openSettings: []
  goHome: []
  openRecent: [id: string]
}>()

const nameInput = ref<HTMLInputElement | null>(null)
const isMaximized = ref(false)

watch(() => props.isEditingName, (val) => {
  if (val) nextTick(() => nameInput.value?.focus())
})

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
        <MenubarTrigger
          class="text-xs h-6 px-2 flex items-center gap-1"
          @click="emit('goHome')"
        >
          <Home class="w-3 h-3" />
          主页
        </MenubarTrigger>
      </MenubarMenu>
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
          视图
        </MenubarTrigger>
        <MenubarContent>
          <MenubarItem
            class="text-xs"
            @click="emit('openPlugins')"
          >
            插件
          </MenubarItem>
          <MenubarItem
            class="text-xs"
            @click="emit('openSettings')"
          >
            设置
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>
    </Menubar>

    <!-- Tab switcher -->
    <div v-if="!hideTabSwitcher" class="flex items-center gap-1 ml-2 no-drag">
      <DropdownMenu>
        <DropdownMenuTrigger class="flex items-center gap-1 text-xs px-2 py-1 rounded hover:bg-muted transition-colors max-w-40">
          <span class="truncate">{{ workflowName || '未命名工作流' }}</span>
          <ChevronDown class="w-3 h-3 shrink-0" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" class="min-w-48">
          <DropdownMenuItem
            v-for="tab in tabStore.tabs"
            :key="tab.id"
            class="text-xs flex items-center justify-between gap-2"
            :class="{ 'bg-muted': tab.id === tabStore.activeTabId }"
            @click="tabStore.switchTab(tab.id)"
          >
            <span class="truncate">{{ tab.name || '未命名工作流' }}</span>
            <button
              class="shrink-0 p-0.5 rounded hover:bg-destructive/20 hover:text-destructive"
              @click.stop="closeTab(tab.id)"
            >
              <X class="w-3 h-3" />
            </button>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <button
        class="inline-flex items-center justify-center w-5 h-5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        title="新标签页"
        @click="tabStore.addTab()"
      >
        <Plus class="w-3 h-3" />
      </button>
    </div>

    <template v-if="!hideTabSwitcher">
    <input
      v-if="isEditingName"
      ref="nameInput"
      :value="editingName"
      class="ml-3 text-xs bg-transparent border border-border rounded px-1 py-0.5 outline-none focus:border-primary w-40"
      @input="emit('update:editingName', ($event.target as HTMLInputElement).value)"
      @blur="emit('finishEditName')"
      @keydown.enter="emit('finishEditName')"
      @keydown.escape="emit('cancelEditName')"
    >
    <span
      v-else
      class="ml-3 text-xs text-muted-foreground truncate cursor-pointer hover:text-foreground"
      @click="emit('startEditName')"
    >
      {{ workflowName || '未命名工作流' }}
    </span>
    </template>

    <div class="flex-1" />

    <div class="flex items-center no-drag">
      <button
        v-if="isDirty"
        class="inline-flex items-center justify-center w-7 h-7 rounded hover:bg-muted text-orange-400 hover:text-orange-500 transition-colors"
        title="未保存的更改，点击保存"
        @click="emit('save')"
      >
        <Save class="w-3.5 h-3.5" />
      </button>
    </div>

    <div class="flex items-center no-drag">
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
</template>
