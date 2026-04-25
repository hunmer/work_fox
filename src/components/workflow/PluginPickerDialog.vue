<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { usePluginStore } from '@/stores/plugin'
import { Puzzle, User, Tag, Layers, Wrench } from 'lucide-vue-next'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card'

const props = defineProps<{
  enabledPlugins: string[]
  open: boolean
}>()

const emit = defineEmits<{
  (e: 'update:enabledPlugins', value: string[]): void
  (e: 'update:open', value: boolean): void
}>()

const pluginStore = usePluginStore()
const workflowPlugins = ref<Array<{ id: string; name: string; description: string; nodeCount: number; enabled: boolean; version?: string; author?: string; tags?: string[]; type?: string }>>([])

onMounted(async () => {
  const list = await pluginStore.listWorkflowPlugins()
  const enabledSet = new Set(props.enabledPlugins)
  workflowPlugins.value = list.map((p: any) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    nodeCount: p.nodeCount,
    enabled: enabledSet.has(p.id),
    version: p.version,
    author: typeof p.author === 'object' ? p.author?.name : p.author,
    tags: p.tags || [],
    type: p.type,
  }))
})

function togglePlugin(pluginId: string) {
  const updated = workflowPlugins.value.map((p) =>
    p.id === pluginId ? { ...p, enabled: !p.enabled } : p,
  )
  workflowPlugins.value = updated
  emit('update:enabledPlugins', updated.filter((p) => p.enabled).map((p) => p.id))
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:max-w-[480px]">
      <DialogHeader>
        <DialogTitle>工作流插件</DialogTitle>
      </DialogHeader>
      <ScrollArea class="max-h-[420px]">
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 p-2">
          <HoverCard v-for="plugin in workflowPlugins" :key="plugin.id" :open-delay="400" :close-delay="150">
            <HoverCardTrigger as-child>
              <button
                class="flex flex-col items-center gap-2 rounded-lg border p-4 cursor-pointer transition-all hover:bg-muted/50 hover:border-primary/30"
                :class="plugin.enabled ? 'border-primary/50 bg-primary/5' : 'border-border'"
                @click="togglePlugin(plugin.id)"
              >
                <div
                  class="flex items-center justify-center w-10 h-10 rounded-lg transition-colors"
                  :class="plugin.enabled ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'"
                >
                  <Puzzle class="w-5 h-5" />
                </div>
                <span class="text-xs font-medium text-center leading-tight truncate w-full">
                  {{ plugin.name }}
                </span>
                <Badge v-if="plugin.enabled" variant="default" class="text-[10px] px-1.5 py-0 h-4">
                  已启用
                </Badge>
              </button>
            </HoverCardTrigger>
            <HoverCardContent class="w-72" side="top">
              <div class="space-y-3">
                <div class="flex items-center justify-between">
                  <h4 class="text-sm font-semibold">{{ plugin.name }}</h4>
                  <Badge :variant="plugin.enabled ? 'default' : 'secondary'" class="text-[10px]">
                    {{ plugin.nodeCount }} 个节点
                  </Badge>
                </div>
                <p class="text-xs text-muted-foreground leading-relaxed">{{ plugin.description }}</p>
                <div class="space-y-1.5 text-xs text-muted-foreground">
                  <div v-if="plugin.author" class="flex items-center gap-1.5">
                    <User class="w-3.5 h-3.5 opacity-70" />
                    <span>{{ plugin.author }}</span>
                  </div>
                  <div v-if="plugin.version" class="flex items-center gap-1.5">
                    <Layers class="w-3.5 h-3.5 opacity-70" />
                    <span>v{{ plugin.version }}</span>
                  </div>
                  <div v-if="plugin.type" class="flex items-center gap-1.5">
                    <Wrench class="w-3.5 h-3.5 opacity-70" />
                    <span>{{ plugin.type === 'server' ? '服务端插件' : plugin.type === 'client' ? '客户端插件' : plugin.type }}</span>
                  </div>
                  <div v-if="plugin.tags?.length" class="flex items-center gap-1.5 flex-wrap">
                    <Tag class="w-3.5 h-3.5 opacity-70 shrink-0" />
                    <div class="flex gap-1 flex-wrap">
                      <Badge v-for="tag in plugin.tags" :key="tag" variant="outline" class="text-[10px] px-1 py-0 h-4 font-normal">
                        {{ tag }}
                      </Badge>
                    </div>
                  </div>
                </div>
                <p class="text-[10px] text-muted-foreground/70 pt-1 border-t">
                  点击{{ plugin.enabled ? '禁用' : '启用' }}此插件
                </p>
              </div>
            </HoverCardContent>
          </HoverCard>
          <div
            v-if="workflowPlugins.length === 0"
            class="col-span-3 text-center text-sm text-muted-foreground py-8"
          >
            没有可用的工作流插件
          </div>
        </div>
      </ScrollArea>
    </DialogContent>
  </Dialog>
</template>
