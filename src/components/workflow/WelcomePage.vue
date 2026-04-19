<script setup lang="ts">
import { Plus, FolderOpen, Import } from 'lucide-vue-next'

defineEmits<{
  'new': []
  open: []
  import: []
}>()
</script>

<template>
  <div class="flex-1 flex items-center justify-center">
    <div class="flex gap-8">
      <button
        class="group flex flex-col items-center gap-4 p-8 rounded-xl border-2 border-dashed border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50 transition-all cursor-pointer w-52"
        @click="$emit('new')"
      >
        <div class="p-4 rounded-full bg-muted group-hover:bg-primary/10 transition-colors">
          <Plus class="w-8 h-8 text-muted-foreground group-hover:text-primary transition-colors" />
        </div>
        <span class="text-base font-medium">新建工作流</span>
        <span class="text-xs text-muted-foreground text-center">从空白画布开始创建</span>
      </button>

      <button
        class="group flex flex-col items-center gap-4 p-8 rounded-xl border-2 border-dashed border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50 transition-all cursor-pointer w-52"
        @click="$emit('open')"
      >
        <div class="p-4 rounded-full bg-muted group-hover:bg-primary/10 transition-colors">
          <FolderOpen class="w-8 h-8 text-muted-foreground group-hover:text-primary transition-colors" />
        </div>
        <span class="text-base font-medium">打开工作流</span>
        <span class="text-xs text-muted-foreground text-center">浏览并打开已有工作流</span>
      </button>

      <button
        class="group flex flex-col items-center gap-4 p-8 rounded-xl border-2 border-dashed border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50 transition-all cursor-pointer w-52"
        @click="$emit('import')"
      >
        <div class="p-4 rounded-full bg-muted group-hover:bg-primary/10 transition-colors">
          <Import class="w-8 h-8 text-muted-foreground group-hover:text-primary transition-colors" />
        </div>
        <span class="text-base font-medium">导入工作流</span>
        <span class="text-xs text-muted-foreground text-center">从 .workflow 文件导入</span>
      </button>
    </div>
  </div>
</template>
