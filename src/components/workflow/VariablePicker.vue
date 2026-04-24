<script setup lang="ts">
import { computed } from 'vue'
import { useWorkflowStore } from '@/stores/workflow'
import { usePluginStore } from '@/stores/plugin'
import { getNodeDefinition } from '@/lib/workflow/nodeRegistry'
import { resolveLucideIcon } from '@/lib/lucide-resolver'
import type { OutputField } from '@/lib/workflow/types'
import { Braces } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import VariableFieldMenu from './VariableFieldMenu.vue'
import { getCompositeParentId, isGeneratedWorkflowNode } from '@shared/workflow-composite'

const props = defineProps<{
  excludeNodeId: string
}>()

const emit = defineEmits<{
  select: [path: string]
}>()

const store = useWorkflowStore()
const pluginStore = usePluginStore()

/** Get config fields for enabled plugins */
const configPlugins = computed(() => {
  if (!store.currentWorkflow?.enabledPlugins?.length) return []
  return store.currentWorkflow.enabledPlugins
    .map(pluginId => {
      const plugin = pluginStore.plugins.find(p => p.id === pluginId)
      if (!plugin?.config?.length) return null
      return { id: pluginId, name: plugin.name, config: plugin.config }
    })
    .filter(Boolean) as Array<{ id: string; name: string; config: any[] }>
})

/** Build config variable path */
function buildConfigPath(pluginId: string, key: string): string {
  return `{{ __config__["${pluginId}"]["${key}"] }}`
}

/** Handle config field selection */
function handleSelectConfigField(pluginId: string, key: string) {
  emit('select', buildConfigPath(pluginId, key))
}

/** 获取画布上除当前节点外的所有节点 */
const otherNodes = computed(() => {
  if (!store.currentWorkflow) return []
  const scopedParentId = scopedParentVariableNode.value?.id
  return store.currentWorkflow.nodes.filter((n) => n.id !== props.excludeNodeId && n.id !== scopedParentId)
})

const scopedParentVariableNode = computed(() => {
  if (!store.currentWorkflow) return null
  const currentNode = store.currentWorkflow.nodes.find((node) => node.id === props.excludeNodeId)
  if (!currentNode) return null

  const parentId = getCompositeParentId(currentNode)
  if (!parentId) return null

  const parentNode = store.currentWorkflow.nodes.find((node) => node.id === parentId)
  if (!parentNode || !isGeneratedWorkflowNode(currentNode)) return null

  const fields = Array.isArray(parentNode.data?.sharedVariables)
    ? parentNode.data.sharedVariables as OutputField[]
    : []
  if (!fields.length) return null

  return {
    id: parentNode.id,
    label: `${getNodeLabel(parentNode)} / 中间变量`,
    fields,
  }
})

/** 获取节点图标组件 */
function getNodeIcon(type: string) {
  const def = getNodeDefinition(type)
  if (!def) return null
  return resolveLucideIcon(def.icon)
}

/** 获取节点标签 */
function getNodeLabel(node: { type: string; label: string }) {
  const def = getNodeDefinition(node.type)
  return node.label || def?.label || node.type
}

/** 获取节点的输出字段 */
function getNodeOutputs(node: { data: Record<string, any> }): OutputField[] {
  return node.data?.outputs ?? []
}

/** 生成变量引用字符串 */
function buildVariablePath(nodeId: string, fieldPath: string): string {
  return `{{ __data__["${nodeId}"].${fieldPath} }}`
}

/** 点击字段 */
function handleSelectField(nodeId: string, fieldPath: string) {
  emit('select', buildVariablePath(nodeId, fieldPath))
}
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button
        variant="ghost"
        size="sm"
        class="h-7 w-7 p-0 shrink-0 text-muted-foreground hover:text-foreground"
        title="插入变量"
      >
        <Braces class="w-3.5 h-3.5" />
      </Button>
    </DropdownMenuTrigger>

    <DropdownMenuContent
      align="end"
      class="w-56"
    >
      <!-- 节点属性 sub-menu -->
      <DropdownMenuSub>
        <DropdownMenuSubTrigger class="text-xs font-medium">
          <span>节点属性</span>
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent class="w-56">
          <DropdownMenuSub v-if="scopedParentVariableNode">
            <DropdownMenuSubTrigger class="text-xs">
              <span class="truncate">{{ scopedParentVariableNode.label }}</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent class="min-w-[180px]">
              <VariableFieldMenu
                :fields="scopedParentVariableNode.fields"
                :node-id="scopedParentVariableNode.id"
                @select="handleSelectField"
              />
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <template v-if="otherNodes.length === 0">
            <div class="px-2 py-1.5 text-xs text-muted-foreground">
              画布上没有其他节点
            </div>
          </template>
          <template v-for="node in otherNodes" :key="node.id">
            <DropdownMenuSub>
              <DropdownMenuSubTrigger class="text-xs">
                <component
                  :is="getNodeIcon(node.type)"
                  v-if="getNodeIcon(node.type)"
                  class="w-3.5 h-3.5 mr-1.5 shrink-0 text-muted-foreground"
                />
                <span class="truncate">{{ getNodeLabel(node) }}</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent class="min-w-[180px]">
                <template v-if="getNodeOutputs(node).length > 0">
                  <VariableFieldMenu
                    :fields="getNodeOutputs(node)"
                    :node-id="node.id"
                    @select="handleSelectField"
                  />
                </template>
                <div v-else class="px-2 py-1.5 text-xs text-muted-foreground">
                  无输出字段
                </div>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </template>
        </DropdownMenuSubContent>
      </DropdownMenuSub>

      <!-- 配置属性 sub-menu -->
      <DropdownMenuSub v-if="configPlugins.length > 0">
        <DropdownMenuSubTrigger class="text-xs font-medium">
          <span>配置属性</span>
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent class="w-56">
          <DropdownMenuSub v-for="plugin in configPlugins" :key="plugin.id">
            <DropdownMenuSubTrigger class="text-xs">
              <span class="truncate">{{ plugin.name }}</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent class="min-w-[180px]">
              <DropdownMenuItem
                v-for="field in plugin.config"
                :key="field.key"
                class="text-xs"
                @click="handleSelectConfigField(plugin.id, field.key)"
              >
                <span class="font-mono text-[10px] text-muted-foreground mr-1">{{ field.type }}</span>
                <span>{{ field.label }}</span>
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
