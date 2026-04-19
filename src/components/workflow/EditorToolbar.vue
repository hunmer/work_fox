<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { Minus, Square, X, Maximize2 } from 'lucide-vue-next'
import {
  Menubar,
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
} from '@/components/ui/menubar'

const props = defineProps<{
  isEditingName: boolean
  editingName: string
  workflowName: string
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
  <div class="flex items-center border-b border-border px-2 py-1 app-drag">
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
      @dblclick="emit('startEditName')"
    >
      {{ workflowName || '未命名工作流' }}
    </span>

    <div class="flex-1" />

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
</template>
