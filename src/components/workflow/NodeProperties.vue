<script setup lang="ts">
import { computed, ref } from 'vue'
import { useWorkflowStore } from '@/stores/workflow'
import { getNodeDefinition } from '@/lib/workflow/nodeRegistry'
import type { OutputField } from '@/lib/workflow/types'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { CodeEditor } from '@/components/ui/code-editor'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { resolveLucideIcon } from '@/lib/lucide-resolver'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Bug, Loader2, CheckCircle2, XCircle, ChevronDown, ChevronRight, Import, FileDown, Info, Braces, Plus, Trash2, Pencil, Check } from 'lucide-vue-next'
import { JsonEditor } from '@/components/ui/json-editor'
import OutputFieldEditor from './OutputFieldEditor.vue'
import ConditionEditor from './ConditionEditor.vue'
import VariablePicker from './VariablePicker.vue'
import { LOOP_BODY_NODE_TYPE } from '@shared/workflow-composite'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'

const store = useWorkflowStore()

const props = defineProps<{ embedded?: boolean }>()
const selectedNodeId = computed(() => store.effectiveSelectedNodeId)

const definition = computed(() => {
  if (!store.selectedNode) return null
  return getNodeDefinition(store.selectedNode.type)
})

const visibleProperties = computed(() => {
  if (!definition.value || !store.selectedNode) return []
  return definition.value.properties.filter((prop) => {
    const rule = prop.visibleWhen
    if (!rule) return true
    const actual = store.selectedNode?.data?.[rule.key]
    if (rule.in?.length) return rule.in.includes(actual)
    if ('equals' in rule) return actual === rule.equals
    return true
  })
})

const IconComponent = computed(() => {
  if (!definition.value) return null
  return resolveLucideIcon(definition.value.icon)
})

const isDebugging = computed(() => store.debugNodeStatus === 'running')
const isLoopBodyNode = computed(() => store.selectedNode?.type === LOOP_BODY_NODE_TYPE)
const canDebugSelectedNode = computed(() => store.selectedNode?.type !== LOOP_BODY_NODE_TYPE)
const outputExpanded = ref(true)
const inputsExpanded = ref(true)
const outputsExpanded = ref(true)

type JsonPreset = {
  id: string
  name: string
  data: Record<string, any>
  inputs: Record<string, any>
}

const JSON_PRESETS_KEY = '__jsonPresets'
const SELECTED_JSON_PRESET_KEY = '__selectedJsonPresetId'

/** 追踪哪些字段处于"文本/变量模式" */
const textModeKeys = ref<Set<string>>(new Set())

/** 判断字段是否为纯文本类型（无需切换） */
function isTextType(type: string): boolean {
  return type === 'text'
}

function toggleTextMode(key: string) {
  const next = new Set(textModeKeys.value)
  next.has(key) ? next.delete(key) : next.add(key)
  textModeKeys.value = next
}

// 导入对话框
const importDialogOpen = ref(false)
const importJson = ref('')
const importError = ref('')
const presetDialogOpen = ref(false)
const presetEditingId = ref<string | null>(null)
const presetName = ref('')
const presetJson = ref('')
const presetError = ref('')

function getFieldValue(key: string): any {
  return store.selectedNode?.data[key] ?? ''
}

function setFieldValue(key: string, value: any) {
  if (store.selectedEmbeddedNode) {
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

  if (store.selectedNodeId) {
    store.updateNodeData(store.selectedNodeId, { [key]: value })
  }
}

const jsonPresets = computed<JsonPreset[]>(() => {
  const value = store.selectedNode?.data?.[JSON_PRESETS_KEY]
  return Array.isArray(value) ? value as JsonPreset[] : []
})

const selectedJsonPresetId = computed<string>({
  get: () => typeof store.selectedNode?.data?.[SELECTED_JSON_PRESET_KEY] === 'string'
    ? store.selectedNode.data[SELECTED_JSON_PRESET_KEY] as string
    : '',
  set: (id) => setFieldValue(SELECTED_JSON_PRESET_KEY, id),
})

const selectedJsonPreset = computed(() => {
  return jsonPresets.value.find((preset) => preset.id === selectedJsonPresetId.value) ?? null
})

function setJsonPresets(presets: JsonPreset[]) {
  setFieldValue(JSON_PRESETS_KEY, presets)
}

function selectJsonPreset(id: string) {
  selectedJsonPresetId.value = selectedJsonPresetId.value === id ? '' : id
}

function openAddPresetDialog() {
  presetEditingId.value = null
  presetName.value = ''
  presetJson.value = JSON.stringify({ data: {}, inputs: {} }, null, 2)
  presetError.value = ''
  presetDialogOpen.value = true
}

function openEditPresetDialog(preset: JsonPreset) {
  presetEditingId.value = preset.id
  presetName.value = preset.name
  presetJson.value = JSON.stringify({ data: preset.data, inputs: preset.inputs }, null, 2)
  presetError.value = ''
  presetDialogOpen.value = true
}

function deleteJsonPreset(id: string) {
  setJsonPresets(jsonPresets.value.filter((preset) => preset.id !== id))
  if (selectedJsonPresetId.value === id) {
    selectedJsonPresetId.value = ''
  }
}

function isPlainObject(value: unknown): value is Record<string, any> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function saveJsonPreset() {
  presetError.value = ''
  const name = presetName.value.trim()
  if (!name) {
    presetError.value = '请输入预设名称'
    return
  }

  try {
    const parsed = JSON.parse(presetJson.value)
    if (!isPlainObject(parsed) || !isPlainObject(parsed.data) || !isPlainObject(parsed.inputs)) {
      presetError.value = 'JSON 必须是 { "data": {}, "inputs": {} } 格式'
      return
    }

    const preset: JsonPreset = {
      id: presetEditingId.value || crypto.randomUUID(),
      name,
      data: parsed.data,
      inputs: parsed.inputs,
    }
    const next = presetEditingId.value
      ? jsonPresets.value.map((item) => item.id === preset.id ? preset : item)
      : [...jsonPresets.value, preset]
    setJsonPresets(next)
    if (!selectedJsonPresetId.value) selectedJsonPresetId.value = preset.id
    presetDialogOpen.value = false
  } catch {
    presetError.value = 'JSON 格式不正确，请检查输入'
  }
}

/** 插入变量引用到指定字段 */
function insertVariable(propKey: string, variablePath: string) {
  const current = getFieldValue(propKey) || ''
  setFieldValue(propKey, current + variablePath)
}

/** array 类型：获取数组 */
function getArrayItems(key: string): Record<string, any>[] {
  const value = getFieldValue(key)
  return Array.isArray(value) ? value : []
}

/** array 类型：添加项 */
function addArrayItem(prop: any) {
  const items = [...getArrayItems(prop.key)]
  const template = prop.itemTemplate || {}
  const newItem = { ...template, id: Date.now() }
  items.push(newItem)
  setFieldValue(prop.key, items)
}

/** array 类型：删除项 */
function removeArrayItem(propKey: string, index: number) {
  const items = [...getArrayItems(propKey)]
  items.splice(index, 1)
  setFieldValue(propKey, items)
}

/** array 类型：更新项字段 */
function updateArrayItemField(propKey: string, index: number, fieldKey: string, value: any) {
  const items = [...getArrayItems(propKey)]
  items[index] = { ...items[index], [fieldKey]: value }
  setFieldValue(propKey, items)
}

function insertArrayVariable(propKey: string, index: number, fieldKey: string, variablePath: string) {
  const current = getArrayItems(propKey)?.[index]?.[fieldKey] || ''
  updateArrayItemField(propKey, index, fieldKey, `${current}${variablePath}`)
}

/** 获取/设置节点输出字段 */
const nodeOutputs = computed<OutputField[]>({
  get: () => store.selectedNode?.data?.outputs ?? [],
  set: (val) => {
    if (store.selectedEmbeddedNode) {
      setFieldValue('outputs', val)
      return
    }
    if (store.selectedNodeId) {
      store.updateNodeData(store.selectedNodeId, { outputs: val })
    }
  },
})

/** 获取/设置节点输入字段（与 properties 配置互不冲突） */
const nodeInputFields = computed<OutputField[]>({
  get: () => store.selectedNode?.data?.inputFields ?? [],
  set: (val) => {
    if (store.selectedEmbeddedNode) {
      setFieldValue('inputFields', val)
      return
    }
    if (store.selectedNodeId) {
      store.updateNodeData(store.selectedNodeId, { inputFields: val })
    }
  },
})

const allowInputFields = computed(() => !!definition.value?.allowInputFields)
const inputFieldsTitle = computed(() => store.selectedNode?.type === 'sub_workflow' ? '开始节点输入' : '输入字段')

async function handleDebug() {
  const nodeId = store.effectiveSelectedNodeId
  if (!nodeId) return
  if (isDebugging.value) {
    store.cancelDebug()
    return
  }
  outputExpanded.value = true

  // embedded node：直接传入节点对象
  if (store.selectedEmbeddedNode) {
    await store.debugSingleNode(nodeId, store.selectedEmbeddedNode.node)
    return
  }

  await store.debugSingleNode(nodeId)
}

/** 将任意值推断为 OutputField 类型 */
function inferType(value: any): OutputField['type'] {
  if (value === null || value === undefined) return 'any'
  if (typeof value === 'string') return 'string'
  if (typeof value === 'number') return 'number'
  if (typeof value === 'boolean') return 'boolean'
  if (typeof value === 'object') return 'object'
  return 'any'
}

/** 将 JS 对象递归转换为 OutputField[] */
function toOutputFields(data: any): OutputField[] {
  if (typeof data !== 'object' || data === null) return []
  return Object.entries(data).map(([key, value]) => {
    const type = inferType(value)
    const field: OutputField = { key, type }
    if (type === 'object' && value !== null) {
      field.children = toOutputFields(value)
    } else {
      field.value = value !== undefined ? String(value) : ''
    }
    return field
  })
}

/** 从调试输出应用到输出字段 */
function applyDebugOutput() {
  const output = store.debugNodeResult?.output
  if (!output) return
  nodeOutputs.value = toOutputFields(output)
}

/** 打开导入对话框 */
function openImportDialog() {
  importJson.value = ''
  importError.value = ''
  importDialogOpen.value = true
}

/** 确认导入 */
function confirmImport() {
  importError.value = ''
  try {
    const parsed = JSON.parse(importJson.value)
    nodeOutputs.value = toOutputFields(parsed)
    importDialogOpen.value = false
  } catch {
    importError.value = 'JSON 格式不正确，请检查输入'
  }
}
</script>

<template>
  <div :class="[!props.embedded && 'border-l', 'border-border bg-background flex flex-col h-full']">
    <div
      v-if="!store.selectedNode || !definition"
      class="flex-1 flex items-center justify-center"
    >
      <p class="text-xs text-muted-foreground">
        点击节点查看属性
      </p>
    </div>

    <template v-else-if="isLoopBodyNode">
      <div class="flex-1 flex items-center justify-center p-4">
        <p class="text-xs text-muted-foreground text-center">
          循环体节点无需单独配置属性
        </p>
      </div>
    </template>

    <template v-else>
      <div class="flex items-center gap-2 p-3 border-b border-border">
        <component
          :is="IconComponent"
          v-if="IconComponent"
          class="w-4 h-4 text-muted-foreground"
        />
        <div class="min-w-0 flex-1">
          <div class="text-sm font-medium truncate">
            {{ definition.label }}
          </div>
          <div
            v-if="definition?.description"
            class="text-[10px] text-muted-foreground truncate"
          >
            {{ definition.description }}
          </div>
        </div>
        <Popover>
          <PopoverTrigger as-child>
            <Badge
              as="button"
              type="button"
              :variant="selectedJsonPreset ? 'default' : 'outline'"
              class="h-5 cursor-pointer px-2 text-[10px]"
            >
              {{ selectedJsonPreset ? selectedJsonPreset.name : 'JSON 预设' }}
            </Badge>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            class="w-80 p-2"
          >
            <div class="max-h-72 overflow-y-auto">
              <div
                v-if="jsonPresets.length === 0"
                class="px-2 py-6 text-center text-xs text-muted-foreground"
              >
                暂无预设
              </div>
              <div
                v-for="preset in jsonPresets"
                :key="preset.id"
                class="flex items-center gap-1 rounded px-2 py-1.5 hover:bg-accent"
              >
                <button
                  type="button"
                  class="flex min-w-0 flex-1 items-center gap-2 text-left"
                  @click="selectJsonPreset(preset.id)"
                >
                  <Check
                    class="h-3.5 w-3.5 shrink-0"
                    :class="selectedJsonPresetId === preset.id ? 'text-primary' : 'text-transparent'"
                  />
                  <span class="truncate text-xs">{{ preset.name }}</span>
                </button>
                <Button
                  variant="ghost"
                  size="sm"
                  class="h-6 w-6 p-0"
                  @click.stop="openEditPresetDialog(preset)"
                >
                  <Pencil class="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  class="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                  @click.stop="deleteJsonPreset(preset.id)"
                >
                  <Trash2 class="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            <div class="mt-2 border-t pt-2">
              <Button
                variant="outline"
                size="sm"
                class="h-7 w-full gap-1 text-xs"
                @click="openAddPresetDialog"
              >
                <Plus class="h-3.5 w-3.5" />
                添加
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <!-- 调试按钮 -->
      <div v-if="canDebugSelectedNode" class="px-3 py-2 border-b border-border">
        <Button
          size="sm"
          :variant="isDebugging ? 'destructive' : 'outline'"
          class="w-full h-7 text-xs gap-1.5"
          @click="handleDebug"
        >
          <Loader2
            v-if="isDebugging"
            class="w-3 h-3 animate-spin"
          />
          <Bug
            v-else
            class="w-3 h-3"
          />
          {{ isDebugging ? '取消调试' : '调试此节点' }}
        </Button>
      </div>

      <!-- 调试输出 -->
      <div
        v-if="store.debugNodeResult && selectedNodeId === store.debugNodeId"
        class="px-3 py-2 border-b border-border"
      >
        <!-- 状态 + 折叠 -->
        <button
          class="flex items-center gap-1.5 w-full text-left"
          @click="outputExpanded = !outputExpanded"
        >
          <component
            :is="outputExpanded ? ChevronDown : ChevronRight"
            class="w-3 h-3 text-muted-foreground shrink-0"
          />
          <CheckCircle2
            v-if="store.debugNodeResult.status === 'completed'"
            class="w-3 h-3 text-green-500 shrink-0"
          />
          <XCircle
            v-else
            class="w-3 h-3 text-red-500 shrink-0"
          />
          <span class="text-xs font-medium">
            {{ store.debugNodeResult.status === 'completed' ? '执行成功' : '执行失败' }}
          </span>
          <span class="text-[10px] text-muted-foreground ml-auto">
            {{ store.debugNodeResult.duration }}ms
          </span>
        </button>

        <div
          v-if="outputExpanded"
          class="mt-2 space-y-1.5"
        >
          <!-- 错误信息 -->
          <div
            v-if="store.debugNodeResult.error"
            class="rounded bg-red-500/10 p-2"
          >
            <p class="text-[11px] text-red-500 font-mono break-all">
              {{ store.debugNodeResult.error }}
            </p>
          </div>
          <!-- 输出结果 -->
          <div
            v-if="store.debugNodeResult.output !== undefined"
            class="mt-1 w-full"
          >
            <JsonEditor
              :model-value="store.debugNodeResult.output"
              :read-only="true"
              mode="tree"
              :height="240"
              class="w-full"
            />
          </div>
        </div>
      </div>

      <ScrollArea class="flex-1 min-h-0">
        <div class="p-3 space-y-3">
          <!-- 通用基础属性：延迟执行 -->
          <div
            v-if="store.selectedNode.type !== 'start' && store.selectedNode.type !== 'end'"
            class="space-y-1"
          >
            <label class="text-xs font-medium flex items-center gap-1">
              延迟执行
              <TooltipProvider :delay-duration="300">
                <Tooltip>
                  <TooltipTrigger as-child>
                    <Info class="w-3 h-3 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent
                    side="right"
                    class="max-w-[240px]"
                  >
                    <p>执行当前节点前等待的毫秒数，0 表示不延迟</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </label>
            <Input
              type="number"
              :model-value="getFieldValue('_delay') || 0"
              :min="0"
              :step="100"
              class="h-7 text-xs"
              placeholder="0"
              @update:model-value="setFieldValue('_delay', Number($event) || 0)"
            />
          </div>

          <div
            v-for="prop in visibleProperties"
            :key="prop.key"
            class="space-y-1"
          >
            <label class="text-xs font-medium flex items-center gap-1">
              <span class="flex-1 flex items-center gap-1">
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
              <button
                v-if="!isTextType(prop.type)"
                type="button"
                class="p-0.5 rounded hover:bg-accent transition-colors"
                :class="textModeKeys.has(prop.key) ? 'text-primary' : 'text-muted-foreground'"
                title="切换变量模式"
                @click="toggleTextMode(prop.key)"
              >
                <Braces class="w-3.5 h-3.5" />
              </button>
            </label>

            <!-- 文本/变量模式：所有类型统一 Input + VariablePicker -->
            <div
              v-if="textModeKeys.has(prop.key) || isTextType(prop.type)"
              class="flex gap-1"
            >
              <Input
                :model-value="getFieldValue(prop.key)"
                :readonly="prop.readonly"
                :placeholder="prop.label"
                class="h-7 text-xs flex-1"
                @update:model-value="setFieldValue(prop.key, $event)"
              />
              <VariablePicker
                v-if="selectedNodeId"
                :exclude-node-id="selectedNodeId"
                @select="insertVariable(prop.key, $event)"
              />
            </div>

            <!-- 原生类型模式 -->
            <template v-else>
              <CodeEditor
                v-if="prop.type === 'code'"
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
                <SelectTrigger class="h-7 text-xs w-full">
                  <SelectValue :placeholder="prop.label" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem
                    v-for="opt in (prop.options || [])"
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

              <!-- array 类型：动态表单列表 -->
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
                    <label class="text-[10px] text-muted-foreground">{{ field.label }}</label>
                    <div
                      v-if="field.type === 'text'"
                      class="flex gap-1"
                    >
                      <Input
                        type="text"
                        :model-value="item[field.key]"
                        :placeholder="field.placeholder || field.label"
                        class="h-6 text-[11px] flex-1"
                        @update:model-value="updateArrayItemField(prop.key, idx, field.key, $event)"
                      />
                      <VariablePicker
                        v-if="selectedNodeId"
                        :exclude-node-id="selectedNodeId"
                        @select="insertArrayVariable(prop.key, idx, field.key, $event)"
                      />
                    </div>
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
                          v-for="opt in (field.options || [])"
                          :key="opt.value"
                          :value="opt.value"
                          class="text-[11px]"
                        >
                          {{ opt.label }}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <OutputFieldEditor
                      v-else-if="field.type === 'output_fields'"
                      :model-value="Array.isArray(item[field.key]) ? item[field.key] : []"
                      :exclude-node-id="selectedNodeId"
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
                :exclude-node-id="selectedNodeId"
                @update:model-value="setFieldValue(prop.key, $event)"
              />
            </template>
          </div>

          <div
            v-if="visibleProperties.length === 0"
            class="text-xs text-muted-foreground text-center py-4"
          >
            该节点无配置参数
          </div>

          <!-- 条件编辑器（switch 节点） -->
          <ConditionEditor v-if="definition.type === 'switch'" />
        </div>
      </ScrollArea>

      <!-- 输入字段编辑区（可选，按节点定义开启） -->
      <div
        v-if="allowInputFields"
        class="border-t border-border shrink-0"
      >
        <div class="flex items-center gap-1.5 px-3 py-2">
          <button
            class="flex items-center gap-1.5 text-left flex-1"
            @click="inputsExpanded = !inputsExpanded"
          >
            <component
              :is="inputsExpanded ? ChevronDown : ChevronRight"
              class="w-3 h-3 text-muted-foreground shrink-0"
            />
            <span class="text-xs font-medium">输入字段</span>
          </button>
        </div>
        <div
          v-if="inputsExpanded"
          class="px-3 pb-3 max-h-[40vh] overflow-y-auto"
        >
          <OutputFieldEditor
            v-model="nodeInputFields"
            :exclude-node-id="selectedNodeId"
          />
        </div>
      </div>

      <!-- 输出字段编辑区（固定底部） -->
      <div class="border-t border-border shrink-0">
        <div class="flex items-center gap-1.5 px-3 py-2">
          <button
            class="flex items-center gap-1.5 text-left flex-1"
            @click="outputsExpanded = !outputsExpanded"
          >
            <component
              :is="outputsExpanded ? ChevronDown : ChevronRight"
              class="w-3 h-3 text-muted-foreground shrink-0"
            />
            <span class="text-xs font-medium">输出字段</span>
          </button>
          <div class="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="sm"
              class="h-5 px-1.5 text-[10px] gap-0.5 text-muted-foreground hover:text-foreground"
              @click="openImportDialog"
            >
              <Import class="w-3 h-3" />
              导入
            </Button>
            <Button
              variant="ghost"
              size="sm"
              class="h-5 px-1.5 text-[10px] gap-0.5 text-muted-foreground hover:text-foreground"
              :disabled="!store.debugNodeResult?.output"
              @click="applyDebugOutput"
            >
              <FileDown class="w-3 h-3" />
              应用输出
            </Button>
          </div>
        </div>
        <div
          v-if="outputsExpanded"
          class="px-3 pb-3 max-h-[40vh] overflow-y-auto"
        >
          <OutputFieldEditor
            v-model="nodeOutputs"
            :exclude-node-id="selectedNodeId"
          />
        </div>
      </div>
    </template>

    <!-- 导入 JSON 对话框 -->
    <Dialog
      :open="importDialogOpen"
      @update:open="importDialogOpen = $event"
    >
      <DialogContent class="max-w-md">
        <DialogHeader>
          <DialogTitle class="text-sm">
            导入输出字段
          </DialogTitle>
        </DialogHeader>
        <div class="space-y-2">
          <p class="text-[11px] text-muted-foreground">
            粘贴 JSON 对象，将自动解析为输出字段结构
          </p>
          <Textarea
            v-model="importJson"
            placeholder="{&quot;key1&quot;: &quot;value1&quot;, &quot;key2&quot;: 123}"
            class="text-xs font-mono min-h-[160px]"
            @keydown.ctrl.enter="confirmImport"
          />
          <p
            v-if="importError"
            class="text-[11px] text-red-500"
          >
            {{ importError }}
          </p>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            class="h-7 text-xs"
            @click="importDialogOpen = false"
          >
            取消
          </Button>
          <Button
            size="sm"
            class="h-7 text-xs"
            :disabled="!importJson.trim()"
            @click="confirmImport"
          >
            确认导入
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog
      :open="presetDialogOpen"
      @update:open="presetDialogOpen = $event"
    >
      <DialogContent class="max-w-lg">
        <DialogHeader>
          <DialogTitle class="text-sm">
            {{ presetEditingId ? '编辑 JSON 预设' : '添加 JSON 预设' }}
          </DialogTitle>
        </DialogHeader>
        <div class="space-y-2">
          <div class="space-y-1">
            <label class="text-xs font-medium">名称</label>
            <Input
              v-model="presetName"
              class="h-7 text-xs"
              placeholder="预设名称"
            />
          </div>
          <div class="space-y-1">
            <label class="text-xs font-medium">JSON</label>
            <Textarea
              v-model="presetJson"
              class="min-h-[220px] text-xs font-mono"
              placeholder="{&quot;data&quot;: {}, &quot;inputs&quot;: {}}"
              @keydown.ctrl.enter="saveJsonPreset"
            />
          </div>
          <p
            v-if="presetError"
            class="text-[11px] text-red-500"
          >
            {{ presetError }}
          </p>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            class="h-7 text-xs"
            @click="presetDialogOpen = false"
          >
            取消
          </Button>
          <Button
            size="sm"
            class="h-7 text-xs"
            @click="saveJsonPreset"
          >
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
