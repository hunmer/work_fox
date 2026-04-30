<script setup lang="ts">
import { computed, ref } from 'vue'
import { useWorkflowStore } from '@/stores/workflow'
import { getNodeDefinition } from '@/lib/workflow/nodeRegistry'
import type { WorkflowNode } from '@/lib/workflow/types'
import { Input } from '@/components/ui/input'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { CodeEditor } from '@/components/ui/code-editor'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Braces, Info, Plus, Trash2, ChevronRight } from 'lucide-vue-next'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import JsonEditor from '@/components/ui/json-editor/JsonEditor.vue'
import ConditionEditor from './ConditionEditor.vue'
import OutputFieldEditor from './OutputFieldEditor.vue'
import VariablePicker from './VariablePicker.vue'

const props = defineProps<{
  node?: WorkflowNode | null
  nodeId?: string | null
  compact?: boolean
}>()

const store = useWorkflowStore()

function isVariableRef(value: any): boolean {
  return typeof value === 'string' && value.includes('{{')
}

const variableModeEnabledOverrides = ref<Set<string>>(new Set())
const variableModeDisabledOverrides = ref<Set<string>>(new Set())

const variableModeKeys = computed(() => {
  const keys = new Set<string>()
  if (!activeNode.value?.data) return keys
  for (const prop of visibleProperties.value) {
    if (isVariableModeActive(prop.key, activeNode.value.data[prop.key])) {
      keys.add(prop.key)
    }
    if (prop.type !== 'array') continue
    for (const [index, item] of getArrayItems(prop.key).entries()) {
      for (const field of prop.fields ?? []) {
        const fieldPath = getArrayFieldModeKey(prop.key, index, field.key)
        if (isVariableModeActive(fieldPath, item?.[field.key])) {
          keys.add(fieldPath)
        }
      }
    }
  }
  return keys
})
const collapsedKeys = ref<Set<string>>(new Set())

const activeNode = computed(() => props.node ?? store.selectedNode)
const activeNodeId = computed(() => props.nodeId ?? store.effectiveSelectedNodeId)

const definition = computed(() => {
  if (!activeNode.value) return null
  return getNodeDefinition(activeNode.value.type)
})

const visibleProperties = computed(() => {
  if (!definition.value || !activeNode.value) return []
  return definition.value.properties.filter((prop) => {
    const rule = prop.visibleWhen
    if (!rule) return true
    const actual = activeNode.value?.data?.[rule.key]
    if (rule.in?.length) return rule.in.includes(actual)
    if ('equals' in rule) return actual === rule.equals
    return true
  })
})

function getSelectOptions(options?: Array<{ label: string, value: string }>) {
  return (options || []).filter((option) => option.value !== '')
}

function isVariableModeActive(key: string, value: any): boolean {
  if (variableModeDisabledOverrides.value.has(key)) return false
  return isVariableRef(value) || variableModeEnabledOverrides.value.has(key)
}

function toggleVariableMode(key: string, value: any) {
  const nextEnabled = new Set(variableModeEnabledOverrides.value)
  const nextDisabled = new Set(variableModeDisabledOverrides.value)

  if (isVariableModeActive(key, value)) {
    nextEnabled.delete(key)
    nextDisabled.add(key)
  } else {
    nextDisabled.delete(key)
    nextEnabled.add(key)
  }

  variableModeEnabledOverrides.value = nextEnabled
  variableModeDisabledOverrides.value = nextDisabled
}

function getArrayFieldModeKey(propKey: string, index: number, fieldKey: string): string {
  return `${propKey}.${index}.${fieldKey}`
}

function clearVariableModeDisabledOverride(key: string) {
  if (!variableModeDisabledOverrides.value.has(key)) return
  const next = new Set(variableModeDisabledOverrides.value)
  next.delete(key)
  variableModeDisabledOverrides.value = next
}

function getFieldValue(key: string): any {
  return activeNode.value?.data[key] ?? ''
}

function toVariableInputValue(value: any): string | number {
  if (typeof value === 'string' || typeof value === 'number') return value
  if (typeof value === 'boolean') return String(value)
  return ''
}

function getVariableFieldValue(key: string): string | number {
  const value = getFieldValue(key)
  return toVariableInputValue(value)
}

function getArrayVariableFieldValue(propKey: string, index: number, fieldKey: string): string | number {
  return toVariableInputValue(getArrayItems(propKey)?.[index]?.[fieldKey])
}

function setFieldValue(key: string, value: any) {
  clearVariableModeDisabledOverride(key)
  if (!props.node && store.selectedEmbeddedNode) {
    const embedded = store.selectedEmbeddedNode
    const hostNode = store.currentWorkflow?.nodes.find((node) => node.id === embedded.hostNodeId)
    const bodyWorkflow = hostNode?.data?.bodyWorkflow
    if (!hostNode || !bodyWorkflow) return

    const nextWorkflow = JSON.parse(JSON.stringify(bodyWorkflow))
    const node = nextWorkflow.nodes?.find((item: any) => item.id === embedded.nodeId)
    if (!node) return
    node.data = { ...node.data, [key]: value }
    embedded.node = node
    store.updateEmbeddedWorkflow(embedded.hostNodeId, nextWorkflow, { pushUndo: false })
    return
  }

  if (activeNodeId.value) {
    store.updateNodeData(activeNodeId.value, { [key]: value })
  }
}

function insertVariable(propKey: string, variablePath: string) {
  setFieldValue(propKey, variablePath)
}

function getArrayItems(key: string): Record<string, any>[] {
  const value = getFieldValue(key)
  return Array.isArray(value) ? value : []
}

function getConditionItems(key: string) {
  const value = getFieldValue(key)
  return Array.isArray(value) ? value : []
}

function addArrayItem(prop: any) {
  const items = [...getArrayItems(prop.key)]
  const template = prop.itemTemplate || {}
  const newItem = { ...template, id: Date.now() }
  items.push(newItem)
  setFieldValue(prop.key, items)
}

function removeArrayItem(propKey: string, index: number) {
  const items = [...getArrayItems(propKey)]
  items.splice(index, 1)
  setFieldValue(propKey, items)
}

function updateArrayItemField(propKey: string, index: number, fieldKey: string, value: any) {
  clearVariableModeDisabledOverride(getArrayFieldModeKey(propKey, index, fieldKey))
  const items = [...getArrayItems(propKey)]
  items[index] = { ...items[index], [fieldKey]: value }
  setFieldValue(propKey, items)
}

function insertArrayVariable(propKey: string, index: number, fieldKey: string, variablePath: string) {
  const current = toVariableInputValue(getArrayItems(propKey)?.[index]?.[fieldKey])
  updateArrayItemField(propKey, index, fieldKey, `${current}${variablePath}`)
}
</script>

<template>
  <div
    v-if="activeNode && definition"
    class="space-y-3"
    :class="props.compact ? 'text-[11px]' : ''"
  >
    <Collapsible
      v-for="prop in visibleProperties"
      :key="prop.key"
      :open="!collapsedKeys.has(prop.key)"
      class="space-y-1"
      @update:open="(v: boolean) => { const s = new Set(collapsedKeys); v ? s.delete(prop.key) : s.add(prop.key); collapsedKeys = s }"
    >
      <div class="text-xs font-medium flex items-center gap-1">
        <CollapsibleTrigger
          as-child
        >
          <button
            type="button"
            class="flex-1 flex items-center gap-1 text-left hover:bg-accent/50 rounded px-0.5 -ml-0.5 transition-colors"
          >
            <ChevronRight
              class="w-3 h-3 shrink-0 text-muted-foreground transition-transform"
              :class="!collapsedKeys.has(prop.key) ? 'rotate-90' : ''"
            />
            <span class="flex items-center gap-1">
              {{ prop.label }}
              <span
                v-if="prop.required"
                class="text-red-500"
              >*</span>
              <TooltipProvider
                v-if="prop.tooltip"
                :delay-duration="300"
              >
                <Tooltip>
                  <TooltipTrigger as-child>
                    <Info class="w-3 h-3 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent
                    side="right"
                    class="max-w-[240px]"
                  >
                    <p>{{ prop.tooltip }}</p>
                    <p class="text-[10px] opacity-60 mt-0.5">类型: {{ prop.type }}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </span>
          </button>
        </CollapsibleTrigger>
        <button
          type="button"
          class="p-0.5 rounded hover:bg-accent transition-colors"
          :class="variableModeKeys.has(prop.key) ? 'text-primary' : 'text-muted-foreground'"
          title="切换变量模式"
          @click="toggleVariableMode(prop.key, getFieldValue(prop.key))"
        >
          <Braces class="w-3.5 h-3.5" />
        </button>
      </div>

      <CollapsibleContent>
      <InputGroup
        v-if="variableModeKeys.has(prop.key)"
        class="h-7"
      >
        <InputGroupInput
          :model-value="getVariableFieldValue(prop.key)"
          :readonly="prop.readonly"
          :placeholder="prop.label"
          class="text-xs"
          @update:model-value="setFieldValue(prop.key, $event)"
        />
        <InputGroupAddon
          v-if="activeNodeId"
          align="inline-end"
        >
          <VariablePicker
            :exclude-node-id="activeNodeId"
            @select="insertVariable(prop.key, $event)"
          />
        </InputGroupAddon>
      </InputGroup>

      <template v-else>
        <Input
          v-if="prop.type === 'text'"
          type="text"
          :model-value="getFieldValue(prop.key)"
          :readonly="prop.readonly"
          :placeholder="prop.label"
          class="h-7 text-xs"
          @update:model-value="setFieldValue(prop.key, $event)"
        />

        <ConditionEditor
          v-else-if="prop.type === 'conditions'"
          :model-value="getConditionItems(prop.key)"
          :exclude-node-id="activeNodeId"
          @update:model-value="setFieldValue(prop.key, $event)"
        />

        <CodeEditor
          v-else-if="prop.type === 'code'"
          :model-value="getFieldValue(prop.key)"
          :language="prop.codeLanguage || 'javascript'"
          :readonly="prop.readonly"
          :height="prop.codeHeight || 200"
          @update:model-value="setFieldValue(prop.key, $event)"
        />

        <Input
          v-else-if="prop.type === 'number'"
          type="number"
          :model-value="getFieldValue(prop.key)"
          :readonly="prop.readonly"
          class="h-7 text-xs"
          @update:model-value="setFieldValue(prop.key, Number($event))"
        />

        <Select
          v-else-if="prop.type === 'select'"
          :model-value="getFieldValue(prop.key)"
          @update:model-value="setFieldValue(prop.key, $event)"
        >
          <SelectTrigger class="h-7 text-xs">
            <SelectValue :placeholder="prop.label" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem
              v-for="opt in getSelectOptions(prop.options)"
              :key="opt.value"
              :value="opt.value"
              class="text-xs"
            >
              {{ opt.label }}
            </SelectItem>
          </SelectContent>
        </Select>

        <div
          v-else-if="prop.type === 'checkbox'"
          class="flex items-center gap-2"
        >
          <Switch
            :model-value="getFieldValue(prop.key)"
            :disabled="prop.readonly"
            @update:model-value="setFieldValue(prop.key, $event)"
          />
          <span class="text-xs text-muted-foreground">{{ prop.readonly ? '(只读)' : '' }}</span>
        </div>

        <Textarea
          v-else-if="prop.type === 'textarea'"
          :model-value="getFieldValue(prop.key)"
          :rows="prop.rows || 3"
          :readonly="prop.readonly"
          class="text-xs min-h-[60px]"
          :placeholder="prop.label"
          @update:model-value="setFieldValue(prop.key, $event)"
        />

        <div
          v-else-if="prop.type === 'range'"
          class="space-y-0.5"
        >
          <input
            type="range"
            :value="getFieldValue(prop.key) ?? prop.default ?? 0"
            :min="prop.min ?? 0"
            :max="prop.max ?? 1"
            :step="prop.step ?? 1"
            class="w-full h-2 accent-primary"
            :disabled="prop.readonly"
            @input="setFieldValue(prop.key, Number(($event.target as HTMLInputElement).value))"
          />
          <div class="text-[10px] text-muted-foreground text-right">{{ getFieldValue(prop.key) ?? prop.default ?? 0 }}</div>
        </div>

        <div
          v-else-if="prop.type === 'array'"
          class="space-y-2"
        >
          <div
            v-for="(item, idx) in getArrayItems(prop.key)"
            :key="idx"
            class="relative rounded border border-border bg-muted/30 p-2 space-y-1.5"
          >
            <button
              class="absolute top-1 right-1 p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
              @click="removeArrayItem(prop.key, idx)"
            >
              <Trash2 class="w-3 h-3" />
            </button>
            <div
              v-for="field in prop.fields"
              :key="field.key"
              class="space-y-0.5"
            >
              <div class="flex items-center gap-1">
                <label class="text-[10px] text-muted-foreground flex-1">{{ field.label }}</label>
                <button
                  type="button"
                  class="p-0.5 rounded hover:bg-accent transition-colors"
                  :class="variableModeKeys.has(getArrayFieldModeKey(prop.key, idx, field.key)) ? 'text-primary' : 'text-muted-foreground'"
                  title="切换变量模式"
                  @click="toggleVariableMode(getArrayFieldModeKey(prop.key, idx, field.key), item[field.key])"
                >
                  <Braces class="w-3 h-3" />
                </button>
              </div>
              <InputGroup
                v-if="variableModeKeys.has(getArrayFieldModeKey(prop.key, idx, field.key))"
                class="h-6"
              >
                <InputGroupInput
                  :model-value="getArrayVariableFieldValue(prop.key, idx, field.key)"
                  :placeholder="field.placeholder || field.label"
                  class="text-[11px]"
                  @update:model-value="updateArrayItemField(prop.key, idx, field.key, $event)"
                />
                <InputGroupAddon
                  v-if="activeNodeId"
                  align="inline-end"
                >
                  <VariablePicker
                    :exclude-node-id="activeNodeId"
                    @select="insertArrayVariable(prop.key, idx, field.key, $event)"
                  />
                </InputGroupAddon>
              </InputGroup>
              <Input
                v-else-if="field.type === 'text'"
                type="text"
                :model-value="item[field.key]"
                :placeholder="field.placeholder || field.label"
                class="h-6 text-[11px] flex-1"
                @update:model-value="updateArrayItemField(prop.key, idx, field.key, $event)"
              />
              <Textarea
                v-else-if="field.type === 'textarea'"
                :model-value="item[field.key]"
                :rows="field.rows || 2"
                :placeholder="field.placeholder || field.label"
                class="text-[11px] min-h-[40px]"
                @update:model-value="updateArrayItemField(prop.key, idx, field.key, $event)"
              />
              <Input
                v-else-if="field.type === 'number'"
                type="number"
                :model-value="item[field.key]"
                :placeholder="field.placeholder || field.label"
                class="h-6 text-[11px]"
                @update:model-value="updateArrayItemField(prop.key, idx, field.key, Number($event))"
              />
              <Select
                v-else-if="field.type === 'select'"
                :model-value="item[field.key] || field.default"
                @update:model-value="updateArrayItemField(prop.key, idx, field.key, $event)"
              >
                <SelectTrigger class="h-6 text-[11px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem
                    v-for="opt in getSelectOptions(field.options)"
                    :key="opt.value"
                    :value="opt.value"
                    class="text-[11px]"
                  >
                    {{ opt.label }}
                  </SelectItem>
                </SelectContent>
              </Select>
              <div
                v-else-if="field.type === 'checkbox'"
                class="flex items-center gap-2"
              >
                <Switch
                  :model-value="item[field.key] ?? field.default ?? false"
                  @update:model-value="updateArrayItemField(prop.key, idx, field.key, $event)"
                />
              </div>
              <OutputFieldEditor
                v-else-if="field.type === 'output_fields'"
                :model-value="Array.isArray(item[field.key]) ? item[field.key] : []"
                :exclude-node-id="activeNodeId"
                @update:model-value="updateArrayItemField(prop.key, idx, field.key, $event)"
              />
              <JsonEditor
                v-else-if="field.type === 'object'"
                :model-value="item[field.key] || {}"
                :height="100"
                @update:model-value="updateArrayItemField(prop.key, idx, field.key, $event)"
              />
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            class="w-full h-6 text-[11px] gap-1"
            @click="addArrayItem(prop)"
          >
            <Plus class="w-3 h-3" />
            添加资源
          </Button>
        </div>

        <OutputFieldEditor
          v-else-if="prop.type === 'output_fields'"
          :model-value="getFieldValue(prop.key) || []"
          :exclude-node-id="activeNodeId"
          @update:model-value="setFieldValue(prop.key, $event)"
        />

        <JsonEditor
          v-else-if="prop.type === 'object'"
          :model-value="getFieldValue(prop.key) || {}"
          :height="prop.height || 140"
          @update:model-value="setFieldValue(prop.key, $event)"
        />
      </template>
      </CollapsibleContent>
    </Collapsible>

    <div
      v-if="visibleProperties.length === 0"
      class="text-xs text-muted-foreground text-center py-4"
    >
      该节点无配置参数
    </div>
  </div>
</template>
