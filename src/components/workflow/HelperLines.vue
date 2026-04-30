<script setup lang="ts">
import { useVueFlow } from '@vue-flow/core'
import { computed, ref, watch } from 'vue'

interface HelperLinesProps {
  horizontal?: number
  vertical?: number
}

const props = defineProps<HelperLinesProps>()

const { viewport, dimensions } = useVueFlow()

const canvasRef = ref<HTMLCanvasElement | null>(null)

const width = computed(() => dimensions.value.width)
const height = computed(() => dimensions.value.height)
const x = computed(() => viewport.value.x)
const y = computed(() => viewport.value.y)
const zoom = computed(() => viewport.value.zoom)

function drawHelperLines() {
  const canvas = canvasRef.value
  const ctx = canvas?.getContext('2d')
  if (!ctx || !canvas) return

  const dpi = window.devicePixelRatio
  canvas.width = width.value * dpi
  canvas.height = height.value * dpi

  ctx.scale(dpi, dpi)
  ctx.clearRect(0, 0, width.value, height.value)
  ctx.strokeStyle = '#00AF79'

  if (typeof props.vertical === 'number') {
    const vx = props.vertical * zoom.value + x.value
    ctx.beginPath()
    ctx.moveTo(vx, 0)
    ctx.lineTo(vx, height.value)
    ctx.stroke()
  }

  if (typeof props.horizontal === 'number') {
    const hy = props.horizontal * zoom.value + y.value
    ctx.beginPath()
    ctx.moveTo(0, hy)
    ctx.lineTo(width.value, hy)
    ctx.stroke()
  }
}

watch(
  [width, height, x, y, zoom, () => props.horizontal, () => props.vertical],
  () => drawHelperLines(),
  { immediate: true },
)
</script>

<template>
  <canvas ref="canvasRef" class="helper-lines-canvas" />
</template>

<style scoped>
.helper-lines-canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 10;
  pointer-events: none;
}
</style>
