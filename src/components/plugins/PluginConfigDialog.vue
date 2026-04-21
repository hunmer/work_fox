<script setup lang="ts">
import { ref, watch } from 'vue'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSet,
} from '@/components/ui/field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { usePluginStore } from '@/stores/plugin'
import type { PluginConfigField } from '@/types/plugin'

const props = defineProps<{
  open: boolean
  pluginId: string
  pluginName: string
  config: PluginConfigField[]
}>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
}>()

const pluginStore = usePluginStore()
const formValues = ref<Record<string, string>>({})
const saving = ref(false)
const errorMessage = ref('')

watch(() => props.open, async (isOpen) => {
  if (!isOpen || !props.pluginId) return
  errorMessage.value = ''
  // IPC get-config 已返回合并后的值（默认值 + 用户值），直接使用
  formValues.value = await pluginStore.getPluginConfig(props.pluginId)
})

/** Validate object type fields are valid JSON */
function validateForm(): string | null {
  for (const field of props.config) {
    if (field.type === 'object') {
      const val = formValues.value[field.key]?.trim()
      if (val) {
        try {
          JSON.parse(val)
        } catch {
          return `"${field.label}" 不是合法的 JSON 格式`
        }
      }
    }
  }
  return null
}

async function handleSave() {
  const validationError = validateForm()
  if (validationError) {
    errorMessage.value = validationError
    return
  }
  saving.value = true
  errorMessage.value = ''
  try {
    const result = await pluginStore.savePluginConfig(props.pluginId, { ...formValues.value })
    if (!result.success) {
      errorMessage.value = result.error || '保存失败'
      return
    }
    emit('update:open', false)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{{ pluginName }} - 设置</DialogTitle>
        <DialogDescription>配置插件的参数</DialogDescription>
      </DialogHeader>

      <div v-if="errorMessage" class="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded">
        {{ errorMessage }}
      </div>

      <FieldSet>
        <FieldGroup>
          <Field v-for="field in config" :key="field.key">
            <FieldLabel :for="`config-${field.key}`">
              {{ field.label }}
              <span v-if="field.required" class="text-destructive">*</span>
            </FieldLabel>

            <!-- string / number -->
            <Input
              v-if="field.type === 'string' || field.type === 'number'"
              :id="`config-${field.key}`"
              :type="field.type === 'number' ? 'number' : 'text'"
              :placeholder="field.placeholder"
              v-model="formValues[field.key]"
            />

            <!-- boolean -->
            <div v-else-if="field.type === 'boolean'" class="flex items-center gap-2">
              <Switch
                :id="`config-${field.key}`"
                :checked="formValues[field.key] === 'true'"
                @update:checked="formValues[field.key] = $event ? 'true' : 'false'"
              />
              <span class="text-sm">{{ formValues[field.key] === 'true' ? '开启' : '关闭' }}</span>
            </div>

            <!-- select (use :model-value/@update:model-value, NOT v-model on Select) -->
            <Select
              v-else-if="field.type === 'select'"
              :model-value="formValues[field.key]"
              @update:model-value="formValues[field.key] = $event"
            >
              <SelectTrigger :id="`config-${field.key}`">
                <SelectValue placeholder="请选择..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  v-for="opt in field.options"
                  :key="opt.value"
                  :value="opt.value"
                >
                  {{ opt.label }}
                </SelectItem>
              </SelectContent>
            </Select>

            <!-- object (JSON editing) -->
            <Textarea
              v-else-if="field.type === 'object'"
              :id="`config-${field.key}`"
              :placeholder="field.placeholder || '{}'"
              v-model="formValues[field.key]"
              rows="4"
              class="font-mono text-xs"
            />

            <FieldDescription v-if="field.desc">
              {{ field.desc }}
            </FieldDescription>
          </Field>
        </FieldGroup>
      </FieldSet>

      <DialogFooter>
        <Button variant="outline" @click="emit('update:open', false)">
          取消
        </Button>
        <Button :disabled="saving" @click="handleSave">
          {{ saving ? '保存中...' : '保存' }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
