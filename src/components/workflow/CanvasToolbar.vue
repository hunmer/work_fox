<script setup lang="ts">
import { ref } from 'vue'
import { RotateCcw, RotateCw, LayoutGrid, EyeOff, Map, Download, Image, FileImage } from 'lucide-vue-next'
import { toPng, toJpeg } from 'html-to-image'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useWorkflowStore } from '@/stores/workflow'
import { useAgentSettingsStore } from '@/stores/agent-settings'
import dagre from '@dagrejs/dagre'

const store = useWorkflowStore()
const agentSettings = useAgentSettingsStore()
const isExporting = ref(false)

function handleAutoLayout() {
  const wf = store.currentWorkflow
  if (!wf) return

  store.pushUndo('智能布局')

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

function getVueFlowElement(): HTMLElement | null {
  return document.querySelector('.vue-flow')
}

async function exportCanvas(format: 'png' | 'jpeg') {
  const el = getVueFlowElement()
  if (!el || isExporting.value) return

  isExporting.value = true
  try {
    const workflowName = store.currentWorkflow?.label || 'workflow'
    const fileName = `${workflowName}-${Date.now()}`

    const dataUrl = format === 'jpeg'
      ? await toJpeg(el, { quality: 0.95, backgroundColor: '#ffffff' })
      : await toPng(el)

    const link = document.createElement('a')
    link.download = `${fileName}.${format}`
    link.href = dataUrl
    link.click()
  } catch (error) {
    console.error('Export canvas failed:', error)
  } finally {
    isExporting.value = false
  }
}
</script>

<template>
  <div v-if="store" class="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 rounded-lg border border-border bg-background/90 backdrop-blur-sm px-2 py-1 shadow-sm">
    <TooltipProvider :delay-duration="400">
      <Tooltip v-if="store.isPreview">
        <TooltipTrigger as-child>
          <Button
            variant="ghost"
            size="sm"
            class="h-7 gap-1 px-2 text-orange-500 hover:text-orange-600"
            @click="store.exitPreview()"
          >
            <EyeOff class="w-3.5 h-3.5" />
            <span class="text-xs">退出预览</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top" class="text-xs">退出执行记录预览</TooltipContent>
      </Tooltip>
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
      <Tooltip>
        <TooltipTrigger as-child>
          <Button
            variant="ghost"
            size="sm"
            class="h-7 w-7 p-0"
            :disabled="!store.currentWorkflow?.nodes.length"
            @click="handleAutoLayout"
          >
            <LayoutGrid class="w-3.5 h-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          class="text-xs"
        >
          智能布局
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger as-child>
          <Button
            variant="ghost"
            size="sm"
            class="h-7 w-7 p-0"
            :class="{ 'text-blue-500': agentSettings.minimapVisible }"
            @click="agentSettings.toggleMinimap()"
          >
            <Map class="w-3.5 h-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top" class="text-xs">
          {{ agentSettings.minimapVisible ? '隐藏' : '显示' }}小地图
        </TooltipContent>
      </Tooltip>
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger as-child>
            <DropdownMenuTrigger as-child>
              <Button
                variant="ghost"
                size="sm"
                class="h-7 w-7 p-0"
                :disabled="!store.currentWorkflow?.nodes.length || isExporting"
              >
                <Download class="w-3.5 h-3.5" />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="top" class="text-xs">导出画布</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="center" side="top">
          <DropdownMenuItem @click="exportCanvas('png')">
            <FileImage class="w-4 h-4 mr-2" />
            导出 PNG
          </DropdownMenuItem>
          <DropdownMenuItem @click="exportCanvas('jpeg')">
            <Image class="w-4 h-4 mr-2" />
            导出 JPEG
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </TooltipProvider>
  </div>
</template>
