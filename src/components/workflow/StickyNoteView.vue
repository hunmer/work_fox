<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useWorkflowStore } from '@/stores/workflow'

const props = defineProps<{
  nodeId: string
}>()

const store = useWorkflowStore()
const node = computed(() =>
  store.currentWorkflow?.nodes.find((n) => n.id === props.nodeId),
)
const content = ref(node.value?.data?.content ?? '')
const color = computed(() => node.value?.data?.color ?? 'yellow')

watch(
  () => node.value?.data?.content,
  (v) => {
    if (v !== undefined && v !== content.value) content.value = v
  },
)

const colorMap: Record<string, string> = {
  yellow: 'bg-yellow-100 dark:bg-yellow-900/40 border-yellow-300 dark:border-yellow-700',
  blue: 'bg-blue-100 dark:bg-blue-900/40 border-blue-300 dark:border-blue-700',
  green: 'bg-green-100 dark:bg-green-900/40 border-green-300 dark:border-green-700',
  pink: 'bg-pink-100 dark:bg-pink-900/40 border-pink-300 dark:border-pink-700',
  purple: 'bg-purple-100 dark:bg-purple-900/40 border-purple-300 dark:border-purple-700',
}

function onInput() {
  store.updateNodeData(props.nodeId, { content: content.value })
}

const colorClass = computed(() => colorMap[color.value] ?? colorMap.yellow)
</script>

<template>
  <div
    class="rounded border p-2 text-sm leading-relaxed w-full h-full nodrag nopan"
    :class="colorClass"
    @click.stop
    @mousedown.stop
  >
    <textarea
      v-model="content"
      class="w-full h-full bg-transparent resize-none outline-none text-foreground/90 placeholder:text-foreground/30 text-sm"
      placeholder="输入备注..."
      @input="onInput"
    />
  </div>
</template>
