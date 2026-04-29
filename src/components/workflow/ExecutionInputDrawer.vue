<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter, SheetDescription } from '@/components/ui/sheet'
import { Play } from 'lucide-vue-next'
import type { OutputField } from '@shared/workflow-types'

const props = defineProps<{
  open: boolean
  fields: OutputField[]
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  submit: [values: Record<string, unknown>]
}>()

const formValues = ref<Record<string, string>>({})

watch(() => props.open, (open) => {
  if (!open) return
  const defaults: Record<string, string> = {}
  for (const field of props.fields) {
    if (field.key) defaults[field.key] = field.value ?? ''
  }
  formValues.value = defaults
})

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
</script>

<template>
  <Sheet :open="open" @update:open="emit('update:open', $event)">
    <SheetContent side="right" class="w-[360px] sm:max-w-[400px] flex flex-col">
      <SheetHeader>
        <SheetTitle>工作流输入</SheetTitle>
        <SheetDescription>填写以下字段后开始执行</SheetDescription>
      </SheetHeader>
      <ScrollArea class="flex-1 -mx-6 px-6">
        <div class="space-y-4 p-2">
          <div
            v-for="field in fields"
            :key="field.key"
            class="space-y-1.5"
          >
            <label class="text-xs font-medium text-foreground">
              {{ field.key }}
              <span class="text-muted-foreground font-normal">({{ field.type }})</span>
            </label>
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
        <Button variant="outline" size="sm" class="flex-1" @click="emit('update:open', false)">
          取消
        </Button>
        <Button size="sm" class="flex-1" @click="handleSubmit">
          <Play class="w-3 h-3 mr-1" /> 开始执行
        </Button>
      </SheetFooter>
    </SheetContent>
  </Sheet>
</template>
