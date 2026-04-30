<script setup lang="ts">
import { computed } from 'vue'
import { useWorkflowStore } from '@/stores/workflow'
import { getCompositeParentId } from '@shared/workflow-composite'

const props = defineProps<{
  nodeId?: string
  outputLabel?: string
  isDropTarget?: boolean
}>()

const store = useWorkflowStore()
const childCount = computed(() => {
  if (!props.nodeId) return 0
  return (store.currentWorkflow?.nodes || [])
    .filter((node) => getCompositeParentId(node) === props.nodeId)
    .length
})

function selectLoopBodyNode() {
  if (!props.nodeId) return
  store.selectedNodeIds = [props.nodeId]
  store.selectedEmbeddedNode = null
  store.rightPanelTab = 'properties'
}
</script>

<template>
  <div class="loop-body-shell" :class="{ 'is-drop-target': props.isDropTarget }" @click="selectLoopBodyNode">
    <div class="loop-body-header">
      <div class="flex flex-col gap-0.5">
        <span class="loop-body-title">循环体</span>
        <span class="loop-body-subtitle">当前画布内执行，节点会随循环体一起移动</span>
      </div>
      <div class="loop-body-meta">
        <span>{{ childCount }} 个节点</span>
        <span v-if="props.outputLabel">输出: {{ props.outputLabel }}</span>
      </div>
    </div>
    <div v-if="props.isDropTarget" class="loop-body-drop-placeholder">
      拖拽添加到循环体
    </div>
  </div>
</template>

<style scoped>
.loop-body-shell {
  display: flex;
  flex-direction: column;
  min-height: 220px;
  height: 100%;
  border-radius: 8px;
  background:
    linear-gradient(180deg, rgba(232, 245, 249, 0.72), rgba(248, 251, 252, 0.42));
  box-sizing: border-box;
  pointer-events: none;
}

.loop-body-shell.is-drop-target {
  background:
    linear-gradient(180deg, rgba(224, 247, 250, 0.84), rgba(240, 253, 250, 0.58));
  outline: 2px dashed rgba(20, 184, 166, 0.78);
  outline-offset: -10px;
}

.loop-body-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border-bottom: 1px solid rgba(86, 160, 184, 0.18);
  border-radius: 6px 6px 0 0;
  background: rgba(255, 255, 255, 0.62);
  backdrop-filter: blur(4px);
  cursor: move;
  user-select: none;
  pointer-events: auto;
}

.loop-body-title {
  font-size: 13px;
  font-weight: 600;
  color: rgb(23, 92, 112);
}

.loop-body-subtitle {
  font-size: 11px;
  color: rgba(23, 92, 112, 0.76);
}

.loop-body-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
  font-size: 11px;
  color: rgba(23, 92, 112, 0.88);
}

.loop-body-drop-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  min-height: 120px;
  margin: 14px;
  border: 1px dashed rgba(20, 184, 166, 0.68);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.58);
  color: rgb(15, 118, 110);
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0;
}
</style>
