<script setup lang="ts">
import { computed } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import type { NodeProps } from '@vue-flow/core'
import { getNodeDefinition } from '@/lib/workflow/nodeRegistry'
import { resolveLucideIcon } from '@/lib/lucide-resolver'

const props = defineProps<NodeProps>()

const definition = computed(() => getNodeDefinition(props.data?.nodeType || props.type))
const icon = computed(() => resolveLucideIcon(definition.value?.icon || 'Circle'))
const title = computed(() => props.data?.label || definition.value?.label || props.type)
const isStart = computed(() => props.data?.nodeType === 'start')
const isEnd = computed(() => props.data?.nodeType === 'end')
</script>

<template>
  <div
    class="embedded-node rounded-xl border shadow-sm min-w-[140px] max-w-[220px] bg-white/95"
    :class="{
      'embedded-node-start': isStart,
      'embedded-node-end': isEnd,
      'ring-2 ring-primary': selected,
    }"
  >
    <Handle
      v-if="!isStart"
      id="target"
      type="target"
      :position="Position.Left"
      :connectable="true"
      class="!w-3 !h-3 !bg-sky-500 !border-2 !border-sky-200"
    />

    <div class="embedded-node-body flex items-center gap-2 px-3 py-2">
      <component :is="icon" v-if="icon" class="w-4 h-4 text-slate-600 shrink-0" />
      <div class="min-w-0">
        <div class="text-xs font-medium truncate text-slate-800">{{ title }}</div>
        <div class="text-[10px] text-slate-500 truncate">{{ definition?.label || type }}</div>
      </div>
    </div>

    <Handle
      v-if="!isEnd"
      id="source"
      type="source"
      :position="Position.Right"
      :connectable="true"
      class="!w-3 !h-3 !bg-emerald-500 !border-2 !border-emerald-200"
    />
  </div>
</template>

<style scoped>
.embedded-node {
  border-color: rgba(148, 163, 184, 0.38);
}

.embedded-node-body {
  cursor: grab;
}

.embedded-node-body:active {
  cursor: grabbing;
}

.embedded-node-start {
  background: linear-gradient(180deg, rgba(236, 253, 245, 0.98), rgba(220, 252, 231, 0.96));
  border-color: rgba(34, 197, 94, 0.35);
}

.embedded-node-end {
  background: linear-gradient(180deg, rgba(248, 250, 252, 0.98), rgba(226, 232, 240, 0.96));
  border-color: rgba(100, 116, 139, 0.35);
}
</style>
