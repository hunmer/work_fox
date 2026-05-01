<script setup lang="ts">
import { computed, inject } from 'vue'
import { LayoutGrid } from 'lucide-vue-next'
import dagre from '@dagrejs/dagre'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useWorkflowStore } from '@/stores/workflow'
import { WORKFLOW_CANVAS_CONTEXT_KEY } from './workflowCanvasContext'
import {
  getCompositeParentId,
  isHiddenWorkflowEdge,
  isHiddenWorkflowNode,
  isScopeBoundaryWorkflowNode,
} from '@shared/workflow-composite'

const props = defineProps<{
  nodeId?: string
  outputLabel?: string
  isDropTarget?: boolean
}>()

const store = useWorkflowStore()
const canvas = inject(WORKFLOW_CANVAS_CONTEXT_KEY)
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

function applyLoopBodyDagreLayout(direction: 'LR' | 'TB') {
  const wf = store.currentWorkflow
  if (!wf || !props.nodeId) return

  const layoutNodes = wf.nodes.filter((node) =>
    getCompositeParentId(node) === props.nodeId
    && !isHiddenWorkflowNode(node)
  )
  if (!layoutNodes.length) return

  store.pushUndo('循环体自动布局')

  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: direction, nodesep: 60, ranksep: 80 })

  const layoutNodeIds = new Set(layoutNodes.map((node) => node.id))
  const nodeSizes = new Map<string, { width: number; height: number }>()

  for (const node of layoutNodes) {
    const size = canvas?.getRenderedNodeSize(node.id, node.data)
      ?? {
        width: typeof node.data?.width === 'number' ? node.data.width : 220,
        height: typeof node.data?.height === 'number' ? node.data.height : 120,
      }
    nodeSizes.set(node.id, size)
    g.setNode(node.id, size)
  }

  for (const edge of wf.edges.filter((edge) =>
    !isHiddenWorkflowEdge(edge)
    && layoutNodeIds.has(edge.source)
    && layoutNodeIds.has(edge.target)
  )) {
    g.setEdge(edge.source, edge.target)
  }

  const anchorX = Math.min(...layoutNodes.map((node) => node.position.x))
  const anchorY = Math.min(...layoutNodes.map((node) => node.position.y))

  dagre.layout(g)

  const nextPositions = new Map<string, { x: number; y: number }>()
  for (const node of layoutNodes) {
    const pos = g.node(node.id)
    const size = nodeSizes.get(node.id)
    if (!pos) continue
    nextPositions.set(node.id, {
      x: pos.x - (size?.width ?? 220) / 2,
      y: pos.y - (size?.height ?? 120) / 2,
    })
  }

  if (!nextPositions.size) return

  const layoutMinX = Math.min(...Array.from(nextPositions.values()).map((position) => position.x))
  const layoutMinY = Math.min(...Array.from(nextPositions.values()).map((position) => position.y))
  const offsetX = anchorX - layoutMinX
  const offsetY = anchorY - layoutMinY

  for (const node of layoutNodes) {
    const position = nextPositions.get(node.id)
    if (!position) continue
    const nextPosition = {
      x: position.x + offsetX,
      y: position.y + offsetY,
    }
    if (isScopeBoundaryWorkflowNode(node)) {
      const dx = nextPosition.x - node.position.x
      const dy = nextPosition.y - node.position.y
      for (const child of wf.nodes.filter((item) => getCompositeParentId(item) === node.id)) {
        child.position = {
          x: child.position.x + dx,
          y: child.position.y + dy,
        }
      }
    }
    node.position = nextPosition
  }
  canvas?.syncScopeBoundaryLayout(props.nodeId)
}
</script>

<template>
  <div class="loop-body-shell" :class="{ 'is-drop-target': props.isDropTarget }" @click="selectLoopBodyNode">
    <div class="loop-body-header">
      <div class="flex flex-col gap-0.5">
        <span class="loop-body-title">循环体</span>
        <span class="loop-body-subtitle">当前画布内执行，节点会随循环体一起移动</span>
      </div>
      <div class="loop-body-actions">
        <div class="loop-body-meta">
          <span v-if="props.outputLabel">输出: {{ props.outputLabel }}</span>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <Button
              variant="ghost"
              size="sm"
              class="h-7 w-7 p-0 nodrag nopan"
              :disabled="childCount === 0"
              @click.stop
            >
              <LayoutGrid class="w-3.5 h-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="bottom">
            <DropdownMenuItem @click="applyLoopBodyDagreLayout('LR')">
              横向布局
            </DropdownMenuItem>
            <DropdownMenuItem @click="applyLoopBodyDagreLayout('TB')">
              垂直布局
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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

.loop-body-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.loop-body-actions :deep(button) {
  cursor: pointer;
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
