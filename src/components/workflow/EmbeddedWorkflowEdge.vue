<script setup lang="ts">
import { BaseEdge, EdgeLabelRenderer, getBezierPath } from '@vue-flow/core'
import type { EdgeProps } from '@vue-flow/core'
import { computed } from 'vue'

const props = defineProps<EdgeProps>()

const emit = defineEmits<{
  insertNode: [edgeId: string, sourceId: string, targetId: string]
}>()

const pathData = computed(() =>
  getBezierPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    targetX: props.targetX,
    targetY: props.targetY,
    sourcePosition: props.sourcePosition,
    targetPosition: props.targetPosition,
  }),
)

const path = computed(() => pathData.value[0])
const labelX = computed(() => pathData.value[1])
const labelY = computed(() => pathData.value[2])

function onInsert(event: MouseEvent) {
  event.stopPropagation()
  emit('insertNode', props.id, props.source, props.target)
}
</script>

<template>
  <BaseEdge
    :path="path"
    :style="{
      stroke: 'rgba(37, 99, 235, 0.78)',
      strokeWidth: 2,
    }"
  />

  <EdgeLabelRenderer>
    <div
      :style="{
        position: 'absolute',
        transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
        pointerEvents: 'all',
      }"
      class="nodrag nopan"
    >
      <button
        class="w-5 h-5 rounded-full border border-slate-200 bg-white text-slate-500 text-xs leading-none shadow-sm hover:text-primary hover:border-primary"
        @click="onInsert"
      >
        +
      </button>
    </div>
  </EdgeLabelRenderer>
</template>
