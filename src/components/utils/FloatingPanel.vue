<template>
  <Teleport to="body">
    <!-- 悬浮球模式 -->
    <div
      v-if="visible && minimized"
      class="float-ball"
      :class="{
        'float-ball--hidden': ballState.hidden,
        'float-ball--hidden-left': ballState.hidden && ballState.snapSide === 'left',
        'float-ball--hidden-right': ballState.hidden && ballState.snapSide === 'right'
      }"
      :style="ballStyle"
      @mousedown.stop="startBallDrag"
      @click.stop="restore"
    >
      <span class="ball-label">{{ ballLabel }}</span>
    </div>

    <!-- 面板模式 -->
    <div
      v-if="visible && !minimized"
      class="panel"
      :style="panelStyle"
      @mousedown="activate"
    >
      <div class="header" @mousedown.stop="startDrag">
        <div class="title">{{ title }}</div>

        <div class="actions">
          <button @click.stop="toggleCollapse">
            {{ collapsed ? "展开" : "折叠" }}
          </button>
          <button @click.stop="minimize" title="最小化为悬浮球">◯</button>
          <button @click.stop="close">×</button>
        </div>
      </div>

      <div v-show="!collapsed" class="body">
        <slot />
      </div>

      <div
        v-show="!collapsed"
        class="resize"
        @mousedown.stop="startResize"
      />
    </div>
  </Teleport>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue"

const BALL_SIZE = 44
const BALL_SNAP_THRESHOLD = 40 // 距边缘多少像素内触发吸附
const BALL_HIDE_RATIO = 0.6

const props = defineProps({
  title: { type: String, default: "悬浮面板" },
  visible: { type: Boolean, default: true },
  x: { type: Number, default: 100 },
  y: { type: Number, default: 100 },
  width: { type: Number, default: 320 },
  height: { type: Number, default: 220 },
  zIndex: { type: Number, default: 9999 },
  initialMinimized: { type: Boolean, default: false }
})

const emit = defineEmits([
  "update:visible",
  "update:x",
  "update:y",
  "update:width",
  "update:height",
  "update:zIndex"
])

const collapsed = ref(false)
const minimized = ref(props.initialMinimized)

// 悬浮球状态
const ballState = reactive({
  x: 0,
  y: 0,
  dragging: false,
  moved: false,
  snapX: 0,
  hidden: false,
  snapSide: 'right' // 'left' | 'right'
})

// 记录最小化前的面板位置
const savedPanelPos = reactive({ x: 0, y: 0 })

const ballLabel = computed(() => props.title.charAt(0))

const ballStyle = computed(() => ({
  left: ballState.snapX + "px",
  top: ballState.y + "px",
  width: BALL_SIZE + "px",
  height: BALL_SIZE + "px",
  zIndex: props.zIndex,
  '--ball-size': BALL_SIZE + 'px',
  '--ball-hide-ratio': BALL_HIDE_RATIO,
  transition: ballState.dragging
    ? 'none'
    : 'left 0.3s ease, opacity 0.3s ease, transform 0.3s ease'
}))

const panelStyle = computed(() => ({
  left: props.x + "px",
  top: props.y + "px",
  width: props.width + "px",
  height: collapsed.value ? "40px" : props.height + "px",
  zIndex: props.zIndex
}))

function activate() {
  emit("update:zIndex", props.zIndex)
}

// ——— 面板拖拽 ———

function startDrag(e) {
  drag.moving = true
  drag.startX = e.clientX
  drag.startY = e.clientY
  drag.startLeft = props.x
  drag.startTop = props.y

  document.addEventListener("mousemove", onDrag)
  document.addEventListener("mouseup", stopDrag)
}

function onDrag(e) {
  if (!drag.moving) return
  const dx = e.clientX - drag.startX
  const dy = e.clientY - drag.startY

  emit("update:x", drag.startLeft + dx)
  emit("update:y", drag.startTop + dy)
}

function stopDrag() {
  drag.moving = false
  document.removeEventListener("mousemove", onDrag)
  document.removeEventListener("mouseup", stopDrag)
}

// ——— 面板缩放 ———

const drag = reactive({
  moving: false,
  resizing: false,
  startX: 0,
  startY: 0,
  startLeft: 0,
  startTop: 0,
  startWidth: 0,
  startHeight: 0
})

function startResize(e) {
  drag.resizing = true
  drag.startX = e.clientX
  drag.startY = e.clientY
  drag.startWidth = props.width
  drag.startHeight = props.height

  document.addEventListener("mousemove", onResize)
  document.addEventListener("mouseup", stopResize)
}

function onResize(e) {
  if (!drag.resizing) return
  const dx = e.clientX - drag.startX
  const dy = e.clientY - drag.startY

  emit("update:width", Math.max(200, drag.startWidth + dx))
  emit("update:height", Math.max(120, drag.startHeight + dy))
}

function stopResize() {
  drag.resizing = false
  document.removeEventListener("mousemove", onResize)
  document.removeEventListener("mouseup", stopResize)
}

// ——— 最小化 / 恢复 ———

function minimize() {
  savedPanelPos.x = props.x
  savedPanelPos.y = props.y
  // 悬浮球初始位置：面板右上角附近
  ballState.x = props.x + props.width - BALL_SIZE - 10
  ballState.y = props.y + 10
  snapBallToEdge()
  minimized.value = true
}

function restore() {
  // 如果拖拽中移动了就不恢复（防止点击穿透）
  if (ballState.moved) return
  minimized.value = false
  emit("update:x", savedPanelPos.x)
  emit("update:y", savedPanelPos.y)
}

// ——— 悬浮球拖拽 ———

function startBallDrag(e) {
  ballState.dragging = true
  ballState.moved = false

  const startX = e.clientX
  const startY = e.clientY
  // 用 snapX（视觉位置）而非 x（吸附前位置）作为起点，避免跳动
  const originX = ballState.snapX
  const originY = ballState.y

  function onMove(ev) {
    ballState.x = originX + (ev.clientX - startX)
    ballState.y = originY + (ev.clientY - startY)
    ballState.snapX = ballState.x
    ballState.hidden = false
    ballState.moved = true
  }

  function onUp() {
    ballState.dragging = false
    document.removeEventListener("mousemove", onMove)
    document.removeEventListener("mouseup", onUp)

    if (ballState.moved) {
      setTimeout(() => { ballState.moved = false }, 50)
    }

    snapBallToEdge()
    clampBallY()
  }

  document.addEventListener("mousemove", onMove)
  document.addEventListener("mouseup", onUp)
}

// ——— 悬浮球吸附 ———

function snapBallToEdge() {
  const vw = window.innerWidth
  const distLeft = ballState.x
  const distRight = vw - (ballState.x + BALL_SIZE)

  if (distLeft <= BALL_SNAP_THRESHOLD) {
    ballState.snapX = -BALL_SIZE * BALL_HIDE_RATIO
    ballState.snapSide = 'left'
    ballState.hidden = true
  } else if (distRight <= BALL_SNAP_THRESHOLD) {
    ballState.snapX = vw - BALL_SIZE * (1 - BALL_HIDE_RATIO)
    ballState.snapSide = 'right'
    ballState.hidden = true
  } else {
    ballState.snapX = ballState.x
    ballState.hidden = false
  }
}

function clampBallY() {
  const vh = window.innerHeight
  ballState.y = Math.max(0, Math.min(ballState.y, vh - BALL_SIZE))
}

function toggleCollapse() {
  collapsed.value = !collapsed.value
}

function close() {
  emit("update:visible", false)
}

// 窗口 resize 时重新吸附
function onWindowResize() {
  if (minimized.value) {
    snapBallToEdge()
    clampBallY()
  }
}

onMounted(() => {
  window.addEventListener("resize", onWindowResize)

  // 如果初始就是悬浮球模式，设置初始位置并吸附
  if (props.initialMinimized) {
    ballState.x = props.x + props.width - BALL_SIZE - 10
    ballState.y = props.y + 10
    snapBallToEdge()
    clampBallY()
    savedPanelPos.x = props.x
    savedPanelPos.y = props.y
  }
})

onBeforeUnmount(() => {
  stopDrag()
  stopResize()
  window.removeEventListener("resize", onWindowResize)
})
</script>

<style scoped>
.panel {
  position: fixed;
  background: #fff;
  border: 1px solid #d9d9d9;
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  overflow: visible;
  user-select: none;
}

.header {
  height: 40px;
  background: #1677ff;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 10px;
  cursor: move;
}

.title {
  font-size: 14px;
  font-weight: 600;
}

.actions button {
  margin-left: 8px;
  border: none;
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
  padding: 4px 8px;
  border-radius: 4px;
  cursor: pointer;
}

.actions button:hover {
  background: rgba(255, 255, 255, 0.35);
}

.body {
  height: calc(100% - 40px);
  padding: 12px;
  overflow: auto;
  background: #fafafa;
}

.resize {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 16px;
  height: 16px;
  cursor: se-resize;
  background: linear-gradient(135deg, transparent 50%, #1677ff 50%);
}

/* 悬浮球 */
.float-ball {
  position: fixed;
  border-radius: 50%;
  background: linear-gradient(135deg, #1677ff, #4096ff);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: grab;
  box-shadow: 0 4px 12px rgba(22, 119, 255, 0.4);
  user-select: none;
}

.float-ball:hover {
  box-shadow: 0 4px 20px rgba(22, 119, 255, 0.6);
}

/* 隐藏态：悬浮时展开完整球体 */
.float-ball--hidden {
  opacity: 0.85;
  transition: left 0.3s ease, opacity 0.3s ease, transform 0.3s ease;
}

.float-ball--hidden:hover {
  opacity: 1;
}

/* 靠左隐藏时 hover 向右展开 */
.float-ball--hidden-left:hover {
  transform: translateX(calc(var(--ball-size) * var(--ball-hide-ratio)));
}

/* 靠右隐藏时 hover 向左展开 */
.float-ball--hidden-right:hover {
  transform: translateX(calc(var(--ball-size) * var(--ball-hide-ratio) * -1));
}

.float-ball:active {
  cursor: grabbing;
}

.ball-label {
  font-size: 16px;
  font-weight: 700;
  pointer-events: none;
}
</style>
