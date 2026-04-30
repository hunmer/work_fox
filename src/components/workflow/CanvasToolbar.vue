<script setup lang="ts">
import { ref, inject, nextTick } from 'vue'
import { RotateCcw, RotateCw, LayoutGrid, EyeOff, Map as MapIcon, Download, Image, FileImage } from 'lucide-vue-next'
import { domToPng, domToJpeg } from 'modern-screenshot'
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
import { WORKFLOW_CANVAS_CONTEXT_KEY } from './workflowCanvasContext'
import {
  getCompositeParentId,
  isHiddenWorkflowEdge,
  isHiddenWorkflowNode,
  isScopeBoundaryWorkflowNode,
} from '@shared/workflow-composite'
import dagre from '@dagrejs/dagre'

const canvas = inject(WORKFLOW_CANVAS_CONTEXT_KEY)
const store = useWorkflowStore()
const agentSettings = useAgentSettingsStore()
const isExporting = ref(false)

function applyDagreLayout(direction: 'LR' | 'TB') {
  const wf = store.currentWorkflow
  if (!wf) return

  store.pushUndo('智能布局')

  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: direction, nodesep: 60, ranksep: 80 })

  const layoutNodes = wf.nodes.filter((node) =>
    !isHiddenWorkflowNode(node)
    && !getCompositeParentId(node)
  )
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

  dagre.layout(g)

  for (const node of layoutNodes) {
    const pos = g.node(node.id)
    const size = nodeSizes.get(node.id)
    if (pos) {
      const nextPosition = {
        x: pos.x - (size?.width ?? 220) / 2,
        y: pos.y - (size?.height ?? 120) / 2,
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
  }
}

function getVueFlowElement(): HTMLElement | null {
  return document.querySelector('.vue-flow')
}

async function exportCanvas(format: 'png' | 'jpeg') {
  const el = getVueFlowElement()
  if (!el || isExporting.value || !canvas) return

  isExporting.value = true
  try {
    // 保存当前视口状态
    const savedViewport = canvas.getViewport()

    // 适配到所有节点可见
    canvas.fitView()
    await nextTick()
    await new Promise(r => setTimeout(r, 150))

    const workflowName = store.currentWorkflow?.label || 'workflow'
    const fileName = `${workflowName}-${Date.now()}`

    const dataUrl = format === 'jpeg'
      ? await domToJpeg(el, { quality: 0.95, backgroundColor: '#ffffff', scale: 2 })
      : await domToPng(el, { backgroundColor: null, scale: 2 })

    // 恢复原始视口
    canvas.setViewport(savedViewport)

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
      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <Button
            variant="ghost"
            size="sm"
            class="h-7 w-7 p-0"
            :disabled="!store.currentWorkflow?.nodes.length"
          >
            <LayoutGrid class="w-3.5 h-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" side="top">
          <DropdownMenuItem @click="applyDagreLayout('LR')">
            横向布局
          </DropdownMenuItem>
          <DropdownMenuItem @click="applyDagreLayout('TB')">
            垂直布局
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Tooltip>
        <TooltipTrigger as-child>
          <Button
            variant="ghost"
            size="sm"
            class="h-7 w-7 p-0"
            :class="{ 'text-blue-500': agentSettings.minimapVisible }"
            @click="agentSettings.toggleMinimap()"
          >
            <MapIcon class="w-3.5 h-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top" class="text-xs">
          {{ agentSettings.minimapVisible ? '隐藏' : '显示' }}小地图
        </TooltipContent>
      </Tooltip>
      <DropdownMenu>
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
