<script setup lang="ts">
import { computed, ref } from 'vue'
import type { OutputField } from '@/lib/workflow/types'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { InputGroup, InputGroupInput, InputGroupAddon } from '@/components/ui/input-group'
import { Checkbox } from '@/components/ui/checkbox'
import { Plus, Trash2, ChevronRight } from 'lucide-vue-next'
import VariablePicker from './VariablePicker.vue'

const props = defineProps<{
  modelValue: OutputField[]
  depth?: number
  excludeNodeId?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: OutputField[]]
}>()

const fields = computed({
  get: () => props.modelValue ?? [],
  set: (val) => emit('update:modelValue', val),
})

const indent = computed(() => (props.depth ?? 0) * 16)

const expandedFields = ref<Set<number>>(new Set())

function toggleExpand(index: number) {
  const next = new Set(expandedFields.value)
  if (next.has(index)) next.delete(index)
  else next.add(index)
  expandedFields.value = next
}

const TYPE_OPTIONS = [
  { label: 'String', value: 'string' },
  { label: 'Number', value: 'number' },
  { label: 'Boolean', value: 'boolean' },
  { label: 'Object', value: 'object' },
  { label: 'Any', value: 'any' },
]

function createEmptyField(): OutputField {
  return { key: '', type: 'string', value: '' }
}

function updateField(index: number, patch: Partial<OutputField>) {
  const updated = [...fields.value]
  updated[index] = { ...updated[index], ...patch }
  // type 变更为非 object 时清空 children
  if (patch.type && patch.type !== 'object') {
    updated[index].children = undefined
  }
  // type 变更为 object 时初始化 children
  if (patch.type === 'object' && !updated[index].children) {
    updated[index].children = []
    updated[index].value = undefined
  }
  fields.value = updated
}

function updateChildren(index: number, children: OutputField[]) {
  const updated = [...fields.value]
  updated[index] = { ...updated[index], children }
  fields.value = updated
}

function removeField(index: number) {
  fields.value = fields.value.filter((_, i) => i !== index)
}

function addField() {
  fields.value = [...fields.value, createEmptyField()]
}

function addChildField(index: number) {
  const field = fields.value[index]
  const children = [...(field.children ?? []), createEmptyField()]
  updateChildren(index, children)
}

function insertVariable(index: number, variablePath: string) {
  const current = fields.value[index]?.value ?? ''
  updateField(index, { value: `${current}${variablePath}` })
}
</script>

<template>
  <div class="space-y-1">
    <!-- 表头 -->
    <div
      v-if="depth === 0"
      class="grid gap-1 text-[10px] text-muted-foreground font-medium"
      style="grid-template-columns: 1fr 80px"
    >
      <span>名称</span>
      <span>类型</span>
    </div>

    <!-- 字段行 -->
    <div
      v-for="(field, index) in fields"
      :key="index"
      class="space-y-0.5"
    >
      <!-- 主行：展开按钮 + 字段名 + 类型 + 删除 -->
      <div
        class="flex items-center gap-1 group/field"
        :style="{ paddingLeft: `${indent}px` }"
      >
        <Button
          variant="ghost"
          size="sm"
          class="h-5 w-5 p-0 shrink-0"
          :class="expandedFields.has(index) ? '' : '-rotate-90'"
          @click="toggleExpand(index)"
        >
          <ChevronRight class="w-3 h-3" />
        </Button>
        <Checkbox
          :checked="field.required"
          class="shrink-0 [&_span]:h-3.5 [&_span]:w-3.5 [&_svg]:!w-2.5 [&_svg]:!h-2.5"
          @update:checked="updateField(index, { required: $event || undefined })"
        />
        <Input
          :model-value="field.key"
          placeholder="字段名"
          class="h-6 text-[11px] flex-1 min-w-0"
          @update:model-value="updateField(index, { key: $event })"
        />
        <Select
          :model-value="field.type"
          @update:model-value="updateField(index, { type: $event as OutputField['type'] })"
        >
          <SelectTrigger class="!h-6 !px-2 !py-0 w-20 shrink-0 text-[11px] !gap-0.5 [&_svg]:!size-3">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem
              v-for="opt in TYPE_OPTIONS"
              :key="opt.value"
              :value="opt.value"
              class="text-[11px]"
            >
              {{ opt.label }}
            </SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="ghost"
          size="sm"
          class="h-5 w-5 p-0 text-muted-foreground hover:text-destructive opacity-0 group-hover/field:opacity-100 transition-opacity shrink-0"
          @click="removeField(index)"
        >
          <Trash2 class="w-2.5 h-2.5" />
        </Button>
      </div>

      <!-- 展开详情 -->
      <div
        v-if="expandedFields.has(index) && field.type !== 'object'"
        class="space-y-0.5"
        :style="{ paddingLeft: `${indent + 20}px` }"
      >
        <InputGroup class="h-6 !min-h-0">
          <InputGroupInput
            :model-value="field.value ?? ''"
            placeholder="默认值"
            class="!h-6 text-[11px]"
            @update:model-value="updateField(index, { value: $event })"
          />
          <InputGroupAddon
            v-if="excludeNodeId"
            align="inline-end"
            class="!py-0 !pr-0.5"
          >
            <VariablePicker
              :exclude-node-id="excludeNodeId"
              @select="insertVariable(index, $event)"
            />
          </InputGroupAddon>
        </InputGroup>
        <Input
          :model-value="field.description ?? ''"
          placeholder="描述（可选）"
          class="h-6 text-[11px]"
          @update:model-value="updateField(index, { description: $event || undefined })"
        />
      </div>

      <!-- 递归子字段 -->
      <OutputFieldEditor
        v-if="field.type === 'object'"
        :model-value="field.children ?? []"
        :depth="(depth ?? 0) + 1"
        :exclude-node-id="excludeNodeId"
        @update:model-value="updateChildren(index, $event)"
      />
    </div>

    <!-- 添加按钮 -->
    <Button
      variant="ghost"
      size="sm"
      class="h-5 text-[10px] gap-0.5 w-full text-muted-foreground hover:text-foreground"
      :style="{ paddingLeft: `${indent}px` }"
      @click="addField"
    >
      <Plus class="w-2.5 h-2.5" />
      添加字段
    </Button>
  </div>
</template>
