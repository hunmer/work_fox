<script setup lang="ts">
import { computed } from 'vue'
import { BaseEdge, EdgeLabelRenderer, getBezierPath } from '@vue-flow/core'
import type { EdgeProps } from '@vue-flow/core'
import { useWorkflowStore } from '@/stores/workflow'

const props = defineProps<EdgeProps>()

const store = useWorkflowStore()

const isRunning = computed(() => store.executionStatus === 'running')
const isLocked = computed(() => !!props.data?.composite?.locked)
const isGenerated = computed(() => !!props.data?.composite?.generated)

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

const emit = defineEmits<{
  'insert-node': [edgeId: string, sourceId: string, targetId: string, sourceHandle: string | null]
}>()

function onPlusClick(event: MouseEvent) {
  if (isLocked.value) return
  event.stopPropagation()
  emit('insert-node', props.id, props.source, props.target, props.sourceHandle ?? null)
}
</script>

<template>
  <path
    :d="path"
    fill="none"
    stroke="transparent"
    stroke-width="16"
    style="cursor: pointer"
  />

  <BaseEdge
    :path="path"
    :style="{
      stroke: isLocked ? 'rgba(74, 144, 164, 0.9)' : 'var(--primary)',
      strokeWidth: isGenerated ? 2 : 2.5,
      strokeDasharray: isRunning ? '6 3' : (isLocked ? '4 2' : 'none'),
      transition: 'stroke-dasharray 0.3s ease',
    }"
  />

  <EdgeLabelRenderer v-if="!isRunning && !isLocked">
    <div
      :style="{
        position: 'absolute',
        transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
        pointerEvents: 'all',
      }"
      class="nodrag nopan"
    >
      <button
        class="w-5 h-5 rounded-full border border-border bg-background text-muted-foreground
               flex items-center justify-center text-xs font-bold leading-none
               opacity-40 hover:opacity-100 transition-all
               hover:border-primary hover:text-primary hover:bg-primary/10
               hover:w-6 hover:h-6 hover:scale-110
               cursor-pointer shadow-sm"
        style="pointer-events: all"
        @click="onPlusClick"
      >
        +
      </button>
    </div>
  </EdgeLabelRenderer>
</template>
