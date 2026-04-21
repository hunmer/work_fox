<script setup lang="ts">
import { computed } from 'vue'
import type { SuggestionState } from './types'

const props = defineProps<{
  state: SuggestionState
}>()

const emit = defineEmits<{
  select: [index: number]
}>()

const popupStyle = computed(() => {
  const rectFn = props.state.clientRect
  if (!rectFn) return { display: 'none' }
  const rect = rectFn()
  if (!rect) return { display: 'none' }
  return {
    position: 'fixed' as const,
    left: `${rect.left}px`,
    bottom: `${window.innerHeight - rect.top + 4}px`,
    minWidth: '220px',
  }
})

const typeLabel = computed(() => {
  switch (props.state.type) {
    case 'file':
      return '文件'
    case 'skill':
      return 'Skills'
    case 'mcp':
      return 'MCP'
    default:
      return ''
  }
})

function handleSelect(index: number) {
  emit('select', index)
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="state.active && state.clientRect"
      class="suggestion-popup"
      :style="popupStyle"
    >
      <div class="suggestion-popup__header">
        {{ typeLabel }}
        <span v-if="state.query" class="ml-1 opacity-60">"{{ state.query }}"</span>
      </div>
      <template v-if="state.items.length">
        <div
          v-for="(item, i) in state.items"
          :key="item.id"
          class="suggestion-item"
          :class="{ 'suggestion-item--selected': i === state.selectedIndex }"
          @click="handleSelect(i)"
          @mouseenter="state.selectedIndex = i"
        >
          <span class="suggestion-item__label">{{ item.label }}</span>
          <span v-if="item.description" class="suggestion-item__desc">
            {{ item.description }}
          </span>
        </div>
      </template>
      <div v-else class="suggestion-empty">无匹配结果</div>
    </div>
  </Teleport>
</template>
