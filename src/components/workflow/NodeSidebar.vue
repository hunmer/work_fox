<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { allNodeDefinitions, searchNodeDefinitions, registerPluginNodeDefinitions, type NodeTypeDefinition } from '@/lib/workflow/nodeRegistry'
import { resolveLucideIcon } from '@/lib/lucide-resolver'
import { stringToHsl } from '@/lib/utils'
import { usePluginStore } from '@/stores/plugin'
import { useWorkflowStore } from '@/stores/workflow'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Search, Plus, Trash2, ChevronDown, Settings } from 'lucide-vue-next'
import PluginConfigDialog from '@/components/plugins/PluginConfigDialog.vue'

const props = defineProps<{
  enabledPlugins?: string[]
}>()

const emit = defineEmits<{
  (e: 'openPluginPicker'): void
}>()

const pluginStore = usePluginStore()
const workflowStore = useWorkflowStore()
const pluginNodes = ref<any[]>([])
const categoryPluginMap = ref<Record<string, string>>({})
const configPluginId = ref<string | null>(null)
const configPluginName = ref('')
const configFields = ref<any[]>([])
const configDialogOpen = ref(false)
const schemeMap = ref<Record<string, string[]>>({})
const newSchemeDialogOpen = ref(false)
const newSchemeName = ref('')
const newSchemePluginId = ref<string | null>(null)
const configSchemeName = ref<string | undefined>(undefined)
const configWorkflowId = ref<string | undefined>(undefined)

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
  configSchemeName.value = getSelectedScheme(pluginId) || undefined
  configWorkflowId.value = workflowStore.currentWorkflow?.id
  configDialogOpen.value = true
}

async function loadSchemes() {
  if (!workflowStore.currentWorkflow?.id) return
  const map: Record<string, string[]> = {}
  for (const pluginId of Object.values(categoryPluginMap.value)) {
    if (!map[pluginId]) {
      try {
        map[pluginId] = await pluginStore.listPluginSchemes(workflowStore.currentWorkflow.id, pluginId)
      } catch {
        map[pluginId] = []
      }
    }
  }
  schemeMap.value = map
}

function getSelectedScheme(pluginId: string): string {
  return workflowStore.currentWorkflow?.pluginConfigSchemes?.[pluginId] || ''
}

async function selectScheme(pluginId: string, schemeName: string) {
  if (!workflowStore.currentWorkflow) return
  const schemes = { ...(workflowStore.currentWorkflow.pluginConfigSchemes || {}) }
  schemes[pluginId] = schemeName
  await workflowStore.saveWorkflow({
    ...workflowStore.currentWorkflow,
    pluginConfigSchemes: schemes,
  })
}

function openNewSchemeDialog(pluginId: string) {
  newSchemePluginId.value = pluginId
  newSchemeName.value = ''
  newSchemeDialogOpen.value = true
}

async function createScheme() {
  if (!newSchemeName.value.trim() || !newSchemePluginId.value || !workflowStore.currentWorkflow?.id) return
  const name = newSchemeName.value.trim()
  try {
    await pluginStore.createPluginScheme(workflowStore.currentWorkflow.id, newSchemePluginId.value, name)
    await loadSchemes()
    await selectScheme(newSchemePluginId.value, name)
    newSchemeDialogOpen.value = false
  } catch (e: any) {
    console.error('[NodeSidebar] 创建方案失败:', e)
  }
}

async function deleteCurrentScheme(pluginId: string) {
  const schemeName = getSelectedScheme(pluginId)
  if (!schemeName || !workflowStore.currentWorkflow?.id) return
  try {
    await pluginStore.deletePluginScheme(workflowStore.currentWorkflow.id, pluginId, schemeName)
    await selectScheme(pluginId, '')
    await loadSchemes()
  } catch (e: any) {
    console.error('[NodeSidebar] 删除方案失败:', e)
  }
}

watch(() => props.enabledPlugins, async () => {
  await loadPluginNodes()
  await loadSchemes()
}, { immediate: true, deep: true })

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
              <span class="truncate">{{ category }}</span>
              <span class="ml-auto flex items-center gap-1">
                <template v-if="categoryPluginMap[category as string]">
                  <Popover>
                    <PopoverTrigger as-child>
                      <Button variant="ghost" size="sm" class="h-5 px-1.5 text-[10px] gap-0.5">
                        <span class="truncate max-w-[60px]">
                          {{ getSelectedScheme(categoryPluginMap[category as string]) || '默认配置' }}
                        </span>
                        <ChevronDown class="h-2.5 w-2.5 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent class="w-44 p-0" align="end">
                      <Command>
                        <CommandList>
                          <CommandGroup>
                            <CommandItem
                              value="__default__"
                              @select="selectScheme(categoryPluginMap[category as string], '')"
                              class="text-xs"
                            >
                              默认配置
                            </CommandItem>
                            <CommandItem
                              v-for="name in (schemeMap[categoryPluginMap[category as string]] || [])"
                              :key="name"
                              :value="name"
                              @select="selectScheme(categoryPluginMap[category as string], name)"
                              class="text-xs"
                            >
                              {{ name }}
                            </CommandItem>
                          </CommandGroup>
                          <CommandGroup>
                            <CommandItem
                              @select="openNewSchemeDialog(categoryPluginMap[category as string])"
                              class="text-xs text-primary"
                            >
                              <Plus class="h-3 w-3 mr-1" /> 新增方案
                            </CommandItem>
                            <CommandItem
                              v-if="getSelectedScheme(categoryPluginMap[category as string])"
                              @select="deleteCurrentScheme(categoryPluginMap[category as string])"
                              class="text-xs text-destructive"
                            >
                              <Trash2 class="h-3 w-3 mr-1" /> 删除当前方案
                            </CommandItem>
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  <Button
                    variant="ghost"
                    size="icon"
                    class="h-4 w-4"
                    @click.stop="openPluginConfig(categoryPluginMap[category as string])"
                  >
                    <Settings class="h-3 w-3" />
                  </Button>
                </template>
                <span class="text-[10px]">{{ nodes.length }}</span>
              </span>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div class="space-y-0.5 mt-0.5">
                <HoverCard
                  v-for="node in nodes"
                  :key="node.type"
                  :open-delay="400"
                  :close-delay="100"
                >
                  <HoverCardTrigger as-child>
                    <div
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
                  </HoverCardTrigger>
                  <HoverCardContent class="w-72 p-3" side="right">
                    <div class="space-y-2">
                      <div class="flex items-center gap-2">
                        <component
                          :is="getIcon(node.icon)"
                          v-if="getIcon(node.icon)"
                          class="w-4 h-4 text-muted-foreground shrink-0"
                        />
                        <span class="text-sm font-semibold">{{ node.label }}</span>
                        <span class="text-[10px] text-muted-foreground font-mono ml-auto">{{ node.type }}</span>
                      </div>
                      <p v-if="node.description" class="text-xs text-muted-foreground">
                        {{ node.description }}
                      </p>
                      <div v-if="node.properties?.length" class="space-y-1">
                        <div class="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                          参数
                        </div>
                        <div class="space-y-0.5">
                          <div
                            v-for="prop in node.properties"
                            :key="prop.key"
                            class="flex items-center gap-1.5 text-xs"
                          >
                            <span class="font-mono text-muted-foreground">{{ prop.key }}</span>
                            <span
                              class="text-[10px] px-1 rounded font-medium"
                              :style="{
                                backgroundColor: stringToHsl(prop.type, 45, 90),
                                color: stringToHsl(prop.type, 55, 35),
                              }"
                            >{{ prop.type }}</span>
                            <span v-if="prop.required" class="text-[10px] text-destructive">*</span>
                            <span v-if="prop.tooltip" class="text-[10px] text-muted-foreground truncate">
                              {{ prop.tooltip }}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div v-if="node.outputs?.length" class="space-y-1">
                        <div class="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                          输出
                        </div>
                        <div class="flex flex-wrap gap-1">
                          <span
                            v-for="output in node.outputs"
                            :key="output.key"
                            class="text-[10px] px-1.5 py-0.5 rounded font-mono"
                            :style="{
                              backgroundColor: stringToHsl(output.key, 45, 90),
                              color: stringToHsl(output.key, 55, 35),
                            }"
                          >
                            {{ output.key }}<span v-if="output.type !== 'any'" class="opacity-60">: {{ output.type }}</span>
                          </span>
                        </div>
                      </div>
                    </div>
                  </HoverCardContent>
                </HoverCard>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </ScrollArea>
    </div>
  </div>

  <!-- New Scheme Dialog -->
  <AlertDialog :open="newSchemeDialogOpen" @update:open="newSchemeDialogOpen = $event">
    <AlertDialogContent class="sm:max-w-sm">
      <AlertDialogHeader>
        <AlertDialogTitle>新增配置方案</AlertDialogTitle>
        <AlertDialogDescription>输入方案名称，将基于插件默认配置创建新方案。</AlertDialogDescription>
      </AlertDialogHeader>
      <Input v-model="newSchemeName" placeholder="方案名称" class="text-sm" />
      <AlertDialogFooter>
        <AlertDialogCancel @click="newSchemeDialogOpen = false">取消</AlertDialogCancel>
        <AlertDialogAction :disabled="!newSchemeName.trim()" @click="createScheme">创建</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>

  <PluginConfigDialog
    v-if="configPluginId"
    v-model:open="configDialogOpen"
    :plugin-id="configPluginId"
    :plugin-name="configPluginName"
    :config="configFields"
    :scheme-name="configSchemeName"
    :workflow-id="configWorkflowId"
  />
</template>
