<script setup lang="ts">
import { RotateCcw, RotateCw, LayoutGrid } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useWorkflowStore } from '@/stores/workflow'
import dagre from '@dagrejs/dagre'

const store = useWorkflowStore()

function handleAutoLayout() {
  const wf = store.currentWorkflow
  if (!wf) return

  store.undoRedo.pushUndo('智能布局')

  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'LR', nodesep: 60, ranksep: 80 })

  for (const node of wf.nodes) {
    g.setNode(node.id, { width: 200, height: 80 })
  }
  for (const edge of wf.edges) {
    g.setEdge(edge.source, edge.target)
  }

  dagre.layout(g)

  for (const node of wf.nodes) {
    const pos = g.node(node.id)
    if (pos) {
      node.position = { x: pos.x - 100, y: pos.y - 40 }
    }
  }
}
</script>

<template>
  <div class="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 rounded-lg border border-border bg-background/90 backdrop-blur-sm px-2 py-1 shadow-sm">
    <TooltipProvider :delay-duration="400">
      <Tooltip>
        <TooltipTrigger as-child>
          <Button
            variant="ghost"
            size="sm"
            class="h-7 w-7 p-0"
            :disabled="!store.canUndo"
            @click="store.undo()"
          >
            <RotateCcw class="w-3.5 h-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          class="text-xs"
        >
          撤销 (Ctrl+Z)
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger as-child>
          <Button
            variant="ghost"
            size="sm"
            class="h-7 w-7 p-0"
            :disabled="!store.canRedo"
            @click="store.redo()"
          >
            <RotateCw class="w-3.5 h-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          class="text-xs"
        >
          重做 (Ctrl+Shift+Z)
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
    <span class="text-[10px] text-muted-foreground ml-0.5 select-none">
      {{ store.canUndo ? `${store.undoStack.length} 步可撤销` : '' }}
    </span>
  </div>
</template>
