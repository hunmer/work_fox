<script setup lang="ts">
import { ref, watch } from 'vue'
import { normalizeEmbeddedWorkflow } from '@shared/embedded-workflow'
import { useWorkflowStore } from '@/stores/workflow'
import EmbeddedWorkflowEditor from './EmbeddedWorkflowEditor.vue'

const props = defineProps<{
  nodeId?: string
  bodyWorkflow?: unknown
  outputLabel?: string
}>()

const store = useWorkflowStore()
const embeddedWorkflow = ref(normalizeEmbeddedWorkflow(props.bodyWorkflow, () => crypto.randomUUID()))

watch(
  () => props.bodyWorkflow,
  (value) => {
    embeddedWorkflow.value = normalizeEmbeddedWorkflow(value, () => crypto.randomUUID())
  },
  { deep: true },
)

function handleUpdateBodyWorkflow(value: ReturnType<typeof normalizeEmbeddedWorkflow>) {
  if (!props.nodeId) return
  embeddedWorkflow.value = value
  store.updateEmbeddedWorkflow(props.nodeId, value, {
    pushUndo: false,
  })
}

function selectLoopBodyNode() {
  if (!props.nodeId) return
  store.selectedNodeIds = [props.nodeId]
  store.selectedEmbeddedNode = null
  store.rightPanelTab = 'properties'
}
</script>

<template>
  <div class="loop-body-shell" @click="selectLoopBodyNode">
    <div class="loop-body-header">
      <div class="flex flex-col gap-0.5">
        <span class="loop-body-title">循环体</span>
        <span class="loop-body-subtitle">内部是独立子工作流，执行结果取最后一个有效节点输出</span>
      </div>
      <span v-if="props.outputLabel" class="loop-body-output">输出: {{ props.outputLabel }}</span>
    </div>

    <div class="loop-body-canvas" @click.stop @dragover.stop @drop.stop>
      <EmbeddedWorkflowEditor
        :flow-id="`loop-body-${props.nodeId || 'unknown'}`"
        :host-node-id="props.nodeId"
        :model-value="embeddedWorkflow"
        @update:model-value="handleUpdateBodyWorkflow"
      />
    </div>
  </div>
</template>

<style scoped>
.loop-body-shell {
  display: flex;
  flex-direction: column;
  min-height: 220px;
  height: 100%;
  border-radius: 12px;
  background:
    linear-gradient(180deg, rgba(232, 245, 249, 0.96), rgba(248, 251, 252, 0.98));
}

.loop-body-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border-bottom: 1px solid rgba(86, 160, 184, 0.18);
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

.loop-body-canvas {
  flex: 1;
  margin: 10px;
  min-height: 180px;
  border: 1px solid rgba(86, 160, 184, 0.2);
  border-radius: 10px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(246, 249, 250, 0.98));
  overflow: hidden;
}

.loop-body-output {
  font-size: 11px;
  color: rgba(23, 92, 112, 0.88);
}
</style>
