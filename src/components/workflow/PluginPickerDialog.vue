<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { usePluginStore } from '@/stores/plugin'
import { Puzzle, User, Tag, Layers, Wrench, Search } from 'lucide-vue-next'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
const searchQuery = ref('')
const typeFilter = ref<string>('all')
const workflowPlugins = ref<Array<{ id: string; name: string; description: string; nodeCount: number; enabled: boolean; version?: string; author?: string; tags?: string[]; type?: string }>>([])

const activeTag = ref<string | null>(null)

const typeOptions = computed(() => {
  const types = new Set(workflowPlugins.value.map(p => p.type).filter(Boolean))
  return [
    { label: '全部', value: 'all' },
    ...Array.from(types).map(t => ({
      label: t === 'server' ? '服务端' : t === 'client' ? '客户端' : t!,
      value: t!,
    })),
  ]
})

const allTags = computed(() => {
  const tagCount = new Map<string, number>()
  workflowPlugins.value.forEach(p => p.tags?.forEach(t => tagCount.set(t, (tagCount.get(t) || 0) + 1)))
  return Array.from(tagCount.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([tag]) => tag)
})

const filteredPlugins = computed(() => {
  const q = searchQuery.value.toLowerCase().trim()
  return workflowPlugins.value.filter(p => {
    if (typeFilter.value !== 'all' && p.type !== typeFilter.value) return false
    if (activeTag.value && !p.tags?.includes(activeTag.value)) return false
    if (q && !p.name.toLowerCase().includes(q) && !p.description?.toLowerCase().includes(q) && !p.tags?.some(t => t.toLowerCase().includes(q))) return false
    return true
  })
})

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
    <DialogContent class="sm:max-w-[640px]">
      <DialogHeader>
        <DialogTitle>工作流插件</DialogTitle>
      </DialogHeader>
      <div class="flex items-center gap-2 px-1">
        <div class="relative flex-1">
          <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input v-model="searchQuery" placeholder="搜索插件..." class="pl-8 h-8" />
        </div>
        <Select v-if="allTags.length" :model-value="activeTag ?? '__all__'" @update:model-value="activeTag = $event === '__all__' ? null : $event">
          <SelectTrigger class="w-[140px] h-8 text-xs shrink-0">
            <SelectValue placeholder="按标签过滤">
              {{ activeTag ?? '按标签过滤' }}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">全部标签</SelectItem>
            <SelectItem v-for="tag in allTags" :key="tag" :value="tag">
              {{ tag }}
            </SelectItem>
          </SelectContent>
        </Select>
        <div class="flex gap-1">
          <Button
            v-for="opt in typeOptions"
            :key="opt.value"
            :variant="typeFilter === opt.value ? 'default' : 'outline'"
            size="sm"
            class="h-8 text-xs"
            @click="typeFilter = opt.value"
          >
            {{ opt.label }}
          </Button>
        </div>
      </div>
      <ScrollArea class="max-h-[400px]">
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 p-2">
          <HoverCard v-for="plugin in filteredPlugins" :key="plugin.id" :open-delay="400" :close-delay="150">
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
            v-if="filteredPlugins.length === 0"
            class="col-span-2 sm:col-span-3 lg:col-span-4 text-center text-sm text-muted-foreground py-8"
          >
            {{ searchQuery ? '没有匹配的插件' : '没有可用的工作流插件' }}
          </div>
        </div>
      </ScrollArea>
    </DialogContent>
  </Dialog>
</template>
