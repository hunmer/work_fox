<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { allNodeDefinitions, searchNodeDefinitions, registerPluginNodeDefinitions, type NodeTypeDefinition } from '@/lib/workflow/nodeRegistry'
import { resolveLucideIcon } from '@/lib/lucide-resolver'
import { usePluginStore } from '@/stores/plugin'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Search, Plus, Settings } from 'lucide-vue-next'
import PluginConfigDialog from '@/components/plugins/PluginConfigDialog.vue'

const props = defineProps<{
  enabledPlugins?: string[]
}>()

const emit = defineEmits<{
  (e: 'openPluginPicker'): void
}>()

const pluginStore = usePluginStore()
const pluginNodes = ref<any[]>([])
const categoryPluginMap = ref<Record<string, string>>({})
const configPluginId = ref<string | null>(null)
const configPluginName = ref('')
const configFields = ref<any[]>([])
const configDialogOpen = ref(false)

const searchQuery = ref('')
const openCategories = ref<Record<string, boolean>>({})

let pluginLoadSeq = 0

async function loadPluginNodes() {
  const seq = ++pluginLoadSeq
  if (!props.enabledPlugins?.length) {
    pluginNodes.value = []
    categoryPluginMap.value = {}
    registerPluginNodeDefinitions([])
    return
  }
  try {
    const allNodes: any[] = []
    const catMap: Record<string, string> = {}
    for (const pluginId of props.enabledPlugins) {
      const nodes = await pluginStore.getWorkflowNodes(pluginId)
      if (seq !== pluginLoadSeq) return
      allNodes.push(...nodes)
      for (const node of nodes) {
        if (node.category) catMap[node.category] = pluginId
      }
    }
    pluginNodes.value = allNodes
    categoryPluginMap.value = catMap
    registerPluginNodeDefinitions(allNodes)
  } catch (e) {
    console.error('[NodeSidebar] 加载插件节点失败:', e)
  }
}

function openPluginConfig(pluginId: string) {
  const plugin = pluginStore.plugins.find(p => p.id === pluginId)
  if (!plugin?.config?.length) return
  configPluginId.value = plugin.id
  configPluginName.value = plugin.name
  configFields.value = plugin.config
  configDialogOpen.value = true
}

watch(() => props.enabledPlugins, loadPluginNodes, { immediate: true, deep: true })

const categories = computed(() => {
  const base = searchQuery.value.trim()
    ? searchNodeDefinitions(searchQuery.value)
    : allNodeDefinitions
  const merged = [...base, ...pluginNodes.value]
  const grouped: Record<string, any[]> = {}
  for (const def of merged) {
    if (!grouped[def.category]) grouped[def.category] = []
    grouped[def.category].push(def)
  }
  return grouped
})

function onDragStart(event: DragEvent, nodeType: string) {
  if (event.dataTransfer) {
    event.dataTransfer.setData('application/vueflow', nodeType)
    event.dataTransfer.effectAllowed = 'move'
  }
}

function getIcon(name: string) {
  return resolveLucideIcon(name)
}
</script>

<template>
  <div class="border-r border-border bg-background flex flex-col h-full">
    <div class="p-2 border-b border-border">
      <div class="relative flex items-center gap-1">
        <div class="relative flex-1">
          <Search class="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input v-model="searchQuery" placeholder="搜索节点..." class="pl-7 h-7 text-xs" />
        </div>
        <Button variant="ghost" size="icon" class="h-7 w-7 shrink-0" @click="emit('openPluginPicker')">
          <Plus class="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>

    <div class="flex-1 min-h-0 overflow-hidden">
      <ScrollArea class="h-full">
        <div class="p-2 space-y-1">
          <Collapsible
            v-for="(nodes, category) in categories"
            :key="category"
            :open="openCategories[category] ?? true"
            @update:open="openCategories[category] = $event"
          >
            <CollapsibleTrigger class="flex items-center w-full px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground rounded hover:bg-muted/50">
              <span>{{ category }}</span>
              <span class="ml-auto flex items-center gap-1">
                <Button
                  v-if="categoryPluginMap[category as string]"
                  variant="ghost"
                  size="icon"
                  class="h-4 w-4"
                  @click.stop="openPluginConfig(categoryPluginMap[category as string])"
                >
                  <Settings class="h-3 w-3" />
                </Button>
                <span class="text-[10px]">{{ nodes.length }}</span>
              </span>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div class="space-y-0.5 mt-0.5">
                <div
                  v-for="node in nodes"
                  :key="node.type"
                  draggable="true"
                  class="flex items-center gap-2 px-2 py-1.5 text-xs rounded cursor-grab hover:bg-muted/50 active:cursor-grabbing"
                  @dragstart="onDragStart($event, node.type)"
                >
                  <component
                    :is="getIcon(node.icon)"
                    v-if="getIcon(node.icon)"
                    class="w-3.5 h-3.5 text-muted-foreground shrink-0"
                  />
                  <div class="min-w-0">
                    <div class="truncate">
                      {{ node.label }}
                    </div>
                    <div
                      v-if="node.description"
                      class="text-[10px] text-muted-foreground truncate"
                    >
                      {{ node.description }}
                    </div>
                  </div>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </ScrollArea>
    </div>
  </div>

  <PluginConfigDialog
    v-if="configPluginId"
    v-model:open="configDialogOpen"
    :plugin-id="configPluginId"
    :plugin-name="configPluginName"
    :config="configFields"
  />
</template>
