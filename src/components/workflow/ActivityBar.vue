<script setup lang="ts">
import { Home, Settings, User } from 'lucide-vue-next'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

defineEmits<{
  goHome: []
  openSettings: []
}>()
</script>

<template>
  <TooltipProvider :delay-duration="300">
    <div class="w-[50px] h-full flex flex-col items-center py-2 border-r border-border bg-muted/30">
      <Tooltip>
        <TooltipTrigger as-child>
          <button
            class="w-10 h-10 flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            @click="$emit('goHome')"
          >
            <Home class="w-5 h-5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" class="text-xs">
          主页
        </TooltipContent>
      </Tooltip>

      <div class="flex-1" />

      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <button
            class="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors mb-1"
          >
            <User class="w-4 h-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="end" class="mb-2">
          <DropdownMenuItem
            class="text-xs"
            @click="$emit('openSettings')"
          >
            <Settings class="w-4 h-4 mr-2" />
            设置
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  </TooltipProvider>
</template>
