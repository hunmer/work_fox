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

watch(
  () => node.value?.data?.content,
  (v) => {
    if (v !== undefined && v !== content.value) content.value = v
  },
)

function onInput() {
  store.updateNodeData(props.nodeId, { content: content.value })
}
</script>

<template>
  <div
    class="rounded border p-2 text-sm leading-relaxed w-full h-full nodrag nopan"
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
