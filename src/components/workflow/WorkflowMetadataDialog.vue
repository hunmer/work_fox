<script setup lang="ts">
import { ref, watch } from 'vue'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { X } from 'lucide-vue-next'
import EmojiPicker from 'vue3-emoji-picker'
import 'vue3-emoji-picker/css'

const props = defineProps<{
  open: boolean
  name?: string
  icon?: string
  description?: string
  tags?: string[]
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  confirm: [data: { name: string; icon: string; description: string; tags: string[] }]
}>()

const formName = ref('')
const formIcon = ref('')
const formDescription = ref('')
const formTags = ref<string[]>([])
const newTag = ref('')
const emojiPickerOpen = ref(false)

watch(() => props.open, (val) => {
  if (val) {
    formName.value = props.name ?? ''
    formIcon.value = props.icon ?? ''
    formDescription.value = props.description ?? ''
    formTags.value = props.tags ? [...props.tags] : []
    newTag.value = ''
    emojiPickerOpen.value = false
  }
})

function toggleEmojiPicker() {
  emojiPickerOpen.value = !emojiPickerOpen.value
}

function onSelectEmoji(emoji: { i: string }) {
  formIcon.value = emoji.i
  emojiPickerOpen.value = false
}

function clearIcon() {
  formIcon.value = ''
}

function addTag() {
  const tag = newTag.value.trim()
  if (tag && !formTags.value.includes(tag)) {
    formTags.value.push(tag)
  }
  newTag.value = ''
}

function removeTag(tag: string) {
  formTags.value = formTags.value.filter(t => t !== tag)
}

function confirm() {
  const name = formName.value.trim()
  if (!name) return
  emit('confirm', {
    name,
    icon: formIcon.value,
    description: formDescription.value,
    tags: formTags.value,
  })
  emit('update:open', false)
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>工作流信息</DialogTitle>
      </DialogHeader>

      <div class="space-y-4">
        <!-- Icon + Name -->
        <div class="flex items-start gap-3">
          <div class="relative shrink-0">
            <button
              class="w-12 h-12 rounded-lg border border-border flex items-center justify-center text-2xl hover:bg-accent transition-colors"
              :class="formIcon ? 'bg-muted' : 'bg-muted/50'"
              @click="toggleEmojiPicker"
            >
              {{ formIcon || '📋' }}
            </button>
            <button
              v-if="formIcon"
              class="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
              @click.stop="clearIcon"
            >
              <X class="w-2.5 h-2.5" />
            </button>
            <!-- Emoji Picker -->
            <div
              v-if="emojiPickerOpen"
              class="absolute top-14 left-0 z-50"
            >
              <EmojiPicker
                :native="true"
                :hide-search="false"
                :disable-skin-tones="true"
                :display-recent="true"
                :static-texts="{ placeholder: '搜索 emoji...' }"
                @select="onSelectEmoji"
              />
            </div>
          </div>
          <div class="flex-1 space-y-1">
            <Input
              v-model="formName"
              class="h-8 text-sm"
              placeholder="工作流名称"
            />
          </div>
        </div>

        <!-- Description -->
        <textarea
          v-model="formDescription"
          rows="2"
          class="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm resize-none outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
          placeholder="工作流描述（可选）"
        />

        <!-- Tags -->
        <div class="space-y-2">
          <div class="flex flex-wrap gap-1.5">
            <Badge
              v-for="tag in formTags"
              :key="tag"
              variant="secondary"
              class="gap-1 text-xs"
            >
              {{ tag }}
              <button
                class="hover:text-destructive transition-colors"
                @click="removeTag(tag)"
              >
                <X class="w-3 h-3" />
              </button>
            </Badge>
          </div>
          <div class="flex gap-2">
            <Input
              v-model="newTag"
              class="h-7 text-xs flex-1"
              placeholder="添加标签，回车确认"
              @keydown.enter.prevent="addTag"
            />
            <Button
              variant="outline"
              size="sm"
              class="h-7 text-xs"
              :disabled="!newTag.trim()"
              @click="addTag"
            >
              添加
            </Button>
          </div>
        </div>
      </div>

      <DialogFooter class="gap-2">
        <Button
          variant="outline"
          size="sm"
          class="text-xs"
          @click="emit('update:open', false)"
        >
          取消
        </Button>
        <Button
          size="sm"
          class="text-xs"
          :disabled="!formName.trim()"
          @click="confirm"
        >
          确定
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
