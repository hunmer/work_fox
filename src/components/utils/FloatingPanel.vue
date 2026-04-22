<template>
  <div
    v-if="visible"
    class="panel"
    :style="panelStyle"
    @mousedown="activate"
  >
    <!-- 标题栏：拖拽区域 -->
    <div class="header" @mousedown.stop="startDrag">
      <div class="title">{{ title }}</div>

      <div class="actions">
        <button @click.stop="toggleCollapse">
          {{ collapsed ? "展开" : "折叠" }}
        </button>
        <button @click.stop="close">×</button>
      </div>
    </div>

    <!-- 内容区 -->
    <div v-show="!collapsed" class="body">
      <slot />
    </div>

    <!-- 右下角缩放手柄 -->
    <div
      v-show="!collapsed"
      class="resize"
      @mousedown.stop="startResize"
    />
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, reactive, ref } from "vue"

const props = defineProps({
  title: { type: String, default: "悬浮面板" },
  visible: { type: Boolean, default: true },
  x: { type: Number, default: 100 },
  y: { type: Number, default: 100 },
  width: { type: Number, default: 320 },
  height: { type: Number, default: 220 },
  zIndex: { type: Number, default: 1 }
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

const panelStyle = computed(() => ({
  left: props.x + "px",
  top: props.y + "px",
  width: props.width + "px",
  height: collapsed.value ? "40px" : props.height + "px",
  zIndex: props.zIndex
}))

function activate() {
  emit("update:zIndex", Date.now())
}

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

function toggleCollapse() {
  collapsed.value = !collapsed.value
}

function close() {
  emit("update:visible", false)
}

onBeforeUnmount(() => {
  stopDrag()
  stopResize()
})
</script>

<style scoped>
.panel {
  position: absolute;
  background: #fff;
  border: 1px solid #d9d9d9;
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  overflow: hidden;
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
</style>
