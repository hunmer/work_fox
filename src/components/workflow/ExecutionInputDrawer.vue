<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter, SheetDescription } from '@/components/ui/sheet'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Play, BookmarkPlus, Trash2, Bookmark, Pin, X } from 'lucide-vue-next'
import type { OutputField } from '@shared/workflow-types'
import type { ExecutionInputPreset } from '@shared/channel-contracts'
import { executionPresetApi } from '@/lib/backend-api/execution-preset'

const props = defineProps<{
  open: boolean
  fields: OutputField[]
  workflowId: string
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  submit: [values: Record<string, unknown>]
}>()

const formValues = ref<Record<string, string>>({})
const presets = ref<ExecutionInputPreset[]>([])
const presetName = ref('')
const presetPopoverOpen = ref(false)
const defaultPresetId = ref<string | null>(null)

watch(() => props.open, async (open) => {
  if (!open) return
  const defaults: Record<string, string> = {}
  for (const field of props.fields) {
    if (field.key) defaults[field.key] = field.value ?? ''
  }
  formValues.value = defaults
  presetName.value = ''
  await loadPresets()
  // auto-apply default preset
  const savedDefault = await executionPresetApi.getDefault(props.workflowId)
  defaultPresetId.value = savedDefault
  if (savedDefault) {
    const preset = presets.value.find(p => p.id === savedDefault)
    if (preset) applyPreset(preset, true)
  }
})

async function loadPresets() {
  if (!props.workflowId) return
  try {
    presets.value = await executionPresetApi.list(props.workflowId)
  } catch {
    presets.value = []
  }
}

function applyPreset(preset: ExecutionInputPreset, silent = false) {
  const filled: Record<string, string> = {}
  for (const field of props.fields) {
    if (!field.key) continue
    const v = preset.values[field.key]
    filled[field.key] = v !== undefined ? String(v) : (formValues.value[field.key] ?? '')
  }
  formValues.value = filled
  defaultPresetId.value = preset.id
  if (!silent) presetPopoverOpen.value = false
  executionPresetApi.setDefault(props.workflowId, preset.id)
}

async function clearDefault() {
  defaultPresetId.value = null
  await executionPresetApi.setDefault(props.workflowId, null)
}

async function savePreset() {
  if (!props.workflowId || !presetName.value.trim()) return
  const values: Record<string, unknown> = {}
  for (const field of props.fields) {
    if (!field.key) continue
    const raw = formValues.value[field.key] ?? ''
    if (field.type === 'number') {
      values[field.key] = raw === '' ? 0 : Number(raw)
    } else if (field.type === 'boolean') {
      values[field.key] = raw === 'true'
    } else {
      values[field.key] = raw
    }
  }
  const preset: ExecutionInputPreset = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name: presetName.value.trim(),
    values,
    createdAt: Date.now(),
  }
  await executionPresetApi.save(props.workflowId, preset)
  presetName.value = ''
  await loadPresets()
}

async function deletePreset(presetId: string) {
  if (!props.workflowId) return
  await executionPresetApi.delete(props.workflowId, presetId)
  if (defaultPresetId.value === presetId) {
    defaultPresetId.value = null
  }
  await loadPresets()
}

function handleSubmit() {
  emit('update:open', false)
  const values: Record<string, unknown> = {}
  for (const field of props.fields) {
    if (!field.key) continue
    const raw = formValues.value[field.key] ?? ''
    if (field.type === 'number') {
      values[field.key] = raw === '' ? 0 : Number(raw)
    } else if (field.type === 'boolean') {
      values[field.key] = raw === 'true'
    } else {
      values[field.key] = raw
    }
  }
  emit('submit', values)
}

const hasFormValues = computed(() => {
  return props.fields.some(f => f.key && formValues.value[f.key]?.trim())
})
</script>

<template>
  <Sheet :open="open" @update:open="emit('update:open', $event)">
    <SheetContent side="right" class="w-[360px] sm:max-w-[400px] flex flex-col">
      <SheetHeader class="flex flex-row items-center space-y-0 gap-2">
        <SheetTitle class="text-base">工作流输入</SheetTitle>
        <SheetDescription class="text-xs text-muted-foreground">填写以下字段后开始执行</SheetDescription>
        <div class="flex-1" />
        <Popover v-model:open="presetPopoverOpen">
          <PopoverTrigger as-child>
            <Button variant="ghost" size="icon" class="h-7 w-7 shrink-0 mr-6" title="预设">
              <Bookmark class="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" class="w-64 p-2">
            <div class="text-xs font-medium text-muted-foreground px-1 pb-2">输入预设</div>
            <ScrollArea v-if="presets.length" class="max-h-52">
              <div class="space-y-0.5">
                <div
                  v-for="preset in presets"
                  :key="preset.id"
                  class="group flex items-center gap-1 rounded px-2 py-1.5 hover:bg-accent cursor-pointer text-sm"
                  :class="{ 'bg-accent/50': defaultPresetId === preset.id }"
                  @click="applyPreset(preset)"
                >
                  <Bookmark class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span class="flex-1 truncate">{{ preset.name }}</span>
                  <Pin v-if="defaultPresetId === preset.id" class="h-3 w-3 shrink-0 text-primary" />
                  <Button
                    v-if="defaultPresetId === preset.id"
                    variant="ghost"
                    size="icon"
                    class="h-5 w-5 shrink-0"
                    @click.stop="clearDefault"
                  >
                    <X class="h-3 w-3 text-muted-foreground" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    class="h-5 w-5 shrink-0 opacity-0 group-hover:opacity-100"
                    @click.stop="deletePreset(preset.id)"
                  >
                    <Trash2 class="h-3 w-3 text-destructive" />
                  </Button>
                </div>
              </div>
            </ScrollArea>
            <div v-else class="px-2 py-3 text-xs text-muted-foreground text-center">暂无预设</div>
            <div class="border-t pt-2 mt-2 flex gap-1.5">
              <Input
                v-model="presetName"
                placeholder="预设名称"
                class="h-7 text-xs flex-1"
                @keydown.enter="savePreset"
              />
              <Button
                size="sm"
                variant="outline"
                class="h-7 px-2"
                :disabled="!presetName.trim() || !hasFormValues"
                @click="savePreset"
              >
                <BookmarkPlus class="h-3.5 w-3.5" />
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </SheetHeader>
      <ScrollArea class="flex-1 -mx-6 px-6">
        <div class="space-y-4 p-2">
          <div
            v-for="field in fields"
            :key="field.key"
            class="space-y-1.5"
          >
            <label class="text-xs font-medium text-foreground">
              <span v-if="field.required" class="text-red-500 mr-0.5">*</span>
              {{ field.key }}
              <span class="text-muted-foreground font-normal">({{ field.type }})</span>
            </label>
            <p v-if="field.description" class="text-xs text-muted-foreground">{{ field.description }}</p>
            <Input
              v-if="field.type === 'boolean'"
              :model-value="String(formValues[field.key] ?? '')"
              placeholder="true / false"
              class="h-7 text-xs"
              @update:model-value="formValues[field.key] = $event"
            />
            <Input
              v-else-if="field.type === 'number'"
              :model-value="formValues[field.key] ?? ''"
              type="number"
              :placeholder="field.key"
              class="h-7 text-xs"
              @update:model-value="formValues[field.key] = $event"
            />
            <Input
              v-else
              :model-value="formValues[field.key] ?? ''"
              :placeholder="field.key"
              class="h-7 text-xs"
              @update:model-value="formValues[field.key] = $event"
            />
          </div>
        </div>
      </ScrollArea>
      <SheetFooter class="flex-row gap-2 border-t pt-4">
        <Button size="sm" class="flex-1" @click="handleSubmit">
          <Play class="w-3 h-3 mr-1" /> 开始执行
        </Button>
      </SheetFooter>
    </SheetContent>
  </Sheet>
</template>
