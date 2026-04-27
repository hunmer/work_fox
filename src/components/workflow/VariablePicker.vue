<script setup lang="ts">
import { computed } from 'vue'
import { useWorkflowStore } from '@/stores/workflow'
import { usePluginStore } from '@/stores/plugin'
import { getNodeDefinition } from '@/lib/workflow/nodeRegistry'
import { resolveLucideIcon } from '@/lib/lucide-resolver'
import type { EmbeddedWorkflow, OutputField } from '@/lib/workflow/types'
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

type LoopVariableField = OutputField & {
  expressionPath: string
  children?: LoopVariableField[]
}

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

const currentNode = computed(() => {
  if (store.selectedEmbeddedNode) return store.selectedEmbeddedNode.node
  return store.currentWorkflow?.nodes.find((node) => node.id === props.excludeNodeId) ?? null
})

const pickerWorkflow = computed<EmbeddedWorkflow | null>(() => {
  if (!store.currentWorkflow) return null

  if (store.selectedEmbeddedNode) {
    const hostNode = store.currentWorkflow.nodes.find((node) => node.id === store.selectedEmbeddedNode?.hostNodeId)
    const bodyWorkflow = hostNode?.data?.bodyWorkflow
    if (
      bodyWorkflow
      && typeof bodyWorkflow === 'object'
      && Array.isArray(bodyWorkflow.nodes)
      && Array.isArray(bodyWorkflow.edges)
    ) {
      return bodyWorkflow as EmbeddedWorkflow
    }
    return null
  }

  return store.currentWorkflow
})

const loopParentNode = computed(() => {
  if (!store.currentWorkflow || !currentNode.value) return null

  const parentId = getCompositeParentId(currentNode.value)
  if (parentId) {
    return store.currentWorkflow.nodes.find((node) => node.id === parentId && node.type === 'loop') ?? null
  }

  if (store.selectedEmbeddedNode) {
    const hostNode = store.currentWorkflow.nodes.find((node) => node.id === store.selectedEmbeddedNode?.hostNodeId)
    if (!hostNode) return null
    if (hostNode.type === 'loop') return hostNode

    const hostParentId = getCompositeParentId(hostNode)
    if (!hostParentId) return null
    return store.currentWorkflow.nodes.find((node) => node.id === hostParentId && node.type === 'loop') ?? null
  }

  return null
})

const isInLoopBody = computed(() => !!loopParentNode.value && (isGeneratedWorkflowNode(currentNode.value!) || !!store.selectedEmbeddedNode))

const loopBodyNodes = computed(() => {
  if (!isInLoopBody.value || !store.selectedEmbeddedNode || !store.currentWorkflow) return []

  const hostNode = store.currentWorkflow.nodes.find((node) => node.id === store.selectedEmbeddedNode?.hostNodeId)
  const bodyWorkflow = hostNode?.data?.bodyWorkflow
  const bodyNodes = Array.isArray(bodyWorkflow?.nodes)
    ? bodyWorkflow.nodes
    : []
  const bodyEdges = Array.isArray(bodyWorkflow?.edges)
    ? bodyWorkflow.edges
    : []
  const connectedNodeIds = getConnectedNodeIds(bodyEdges, props.excludeNodeId)

  return bodyNodes.filter((node: any) =>
    connectedNodeIds.has(node.id) && node.id !== props.excludeNodeId && node.type !== 'start',
  )
})

/** 获取与当前节点直接连线的可用节点 */
const otherNodes = computed(() => {
  if (!pickerWorkflow.value) return []
  const hiddenNodeIds = new Set([props.excludeNodeId])
  if (store.selectedEmbeddedNode?.hostNodeId) hiddenNodeIds.add(store.selectedEmbeddedNode.hostNodeId)
  if (isInLoopBody.value) {
    const parentId = loopParentNode.value?.id
    if (parentId) hiddenNodeIds.add(parentId)
    for (const node of store.currentWorkflow.nodes) {
      if (node.type === 'loop_body' && getCompositeParentId(node) === parentId) {
        hiddenNodeIds.add(node.id)
      }
    }
  }

  const connectedNodeIds = getConnectedNodeIds(pickerWorkflow.value.edges, props.excludeNodeId)

  return pickerWorkflow.value.nodes.filter((node) =>
    connectedNodeIds.has(node.id) && !hiddenNodeIds.has(node.id),
  )
})

function getConnectedNodeIds(edges: EmbeddedWorkflow['edges'], nodeId: string): Set<string> {
  const connectedNodeIds = new Set<string>()
  for (const edge of edges) {
    if (edge.source === nodeId) connectedNodeIds.add(edge.target)
    if (edge.target === nodeId) connectedNodeIds.add(edge.source)
  }
  return connectedNodeIds
}

const loopVariableFields = computed<LoopVariableField[]>(() => {
  if (!isInLoopBody.value || !loopParentNode.value) return []

  const fields: LoopVariableField[] = [
    { key: 'index', type: 'number', expressionPath: 'index' },
  ]

  if (loopParentNode.value.data?.loopType === 'array') {
    fields.push({ key: 'item', type: 'any', expressionPath: 'item' })
  }

  const sharedVariables = Array.isArray(loopParentNode.value.data?.sharedVariables)
    ? loopParentNode.value.data.sharedVariables as OutputField[]
    : []

  fields.push(...mapLoopSharedVariables(sharedVariables))
  return fields
})

function mapLoopSharedVariables(fields: OutputField[], parentPath = 'vars'): LoopVariableField[] {
  return fields.map((field) => {
    const expressionPath = `${parentPath}.${field.key}`
    return {
      ...field,
      expressionPath,
      children: field.children ? mapLoopSharedVariables(field.children, expressionPath) : undefined,
    }
  })
}

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

/** 获取节点的输入字段 */
function getNodeInputFields(node: { data: Record<string, any> }): OutputField[] {
  return node.data?.inputFields ?? []
}

/** 生成变量引用字符串 */
function buildVariablePath(nodeId: string, fieldPath: string): string {
  return `{{ __data__["${nodeId}"].${fieldPath} }}`
}

function buildInputFieldPath(nodeId: string, fieldPath: string): string {
  return `{{ __inputs__["${nodeId}"].${fieldPath} }}`
}

function buildLoopVariablePath(fieldPath: string): string {
  return `{{ __loop__.${fieldPath} }}`
}

/** 点击字段 */
function handleSelectField(nodeId: string, fieldPath: string) {
  emit('select', buildVariablePath(nodeId, fieldPath))
}

function handleSelectInputField(nodeId: string, fieldPath: string) {
  emit('select', buildInputFieldPath(nodeId, fieldPath))
}

function handleSelectLoopVariable(fieldPath: string) {
  emit('select', buildLoopVariablePath(fieldPath))
}

function handleSelectLoopField(_nodeId: string, fieldPath: string) {
  handleSelectLoopVariable(fieldPath)
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

    <!-- 节点输入 sub-menu -->
      <DropdownMenuSub>
        <DropdownMenuSubTrigger class="text-xs font-medium">
          <span>节点输入</span>
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent class="w-56">
          <template v-if="otherNodes.length === 0">
            <div class="px-2 py-1.5 text-xs text-muted-foreground">
              没有直接相连的节点
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
                <template v-if="getNodeInputFields(node).length > 0">
                  <VariableFieldMenu
                    :fields="getNodeInputFields(node)"
                    :node-id="node.id"
                    @select="handleSelectInputField"
                  />
                </template>
                <div v-else class="px-2 py-1.5 text-xs text-muted-foreground">
                  无输入字段
                </div>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </template>
        </DropdownMenuSubContent>
      </DropdownMenuSub>

      <!-- 节点输出 sub-menu -->
      <DropdownMenuSub>
        <DropdownMenuSubTrigger class="text-xs font-medium">
          <span>节点输出</span>
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent class="w-56">
          <template v-if="otherNodes.length === 0">
            <div class="px-2 py-1.5 text-xs text-muted-foreground">
              没有直接相连的节点
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

      
      <!-- 循环体变量 sub-menu -->
      <DropdownMenuSub v-if="loopBodyNodes.length > 0">
        <DropdownMenuSubTrigger class="text-xs font-medium">
          <span>循环体变量</span>
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent class="w-56">
          <template v-for="node in loopBodyNodes" :key="node.id">
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

      <!-- 循环中间变量 sub-menu -->
      <DropdownMenuSub v-if="loopVariableFields.length > 0">
        <DropdownMenuSubTrigger class="text-xs font-medium">
          <span>中间变量</span>
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent class="w-56">
          <VariableFieldMenu
            :fields="loopVariableFields"
            node-id="__loop__"
            @select="handleSelectLoopField"
          />
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
