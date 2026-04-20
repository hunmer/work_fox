<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import * as monaco from 'monaco-editor'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Maximize2 } from 'lucide-vue-next'

self.MonacoEnvironment = {
  getWorker(_, label) {
    if (label === 'json') return new jsonWorker()
    if (label === 'typescript' || label === 'javascript') return new tsWorker()
    return new editorWorker()
  },
}

const props = withDefaults(defineProps<{
  modelValue?: string
  language?: string
  readonly?: boolean
  placeholder?: string
  minimap?: boolean
  lineNumbers?: boolean
  wordWrap?: boolean
  height?: number
  inline?: boolean
}>(), {
  modelValue: '',
  language: 'javascript',
  readonly: false,
  minimap: false,
  lineNumbers: true,
  wordWrap: true,
  height: 200,
  inline: true,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const inlineContainer = ref<HTMLDivElement>()
const fullContainer = ref<HTMLDivElement>()
let inlineEditor: monaco.editor.IStandaloneCodeEditor | null = null
let fullEditor: monaco.editor.IStandaloneCodeEditor | null = null
let ignoreNextUpdate = false
const dialogOpen = ref(false)

function createEditor(el: HTMLElement, options?: monaco.editor.IStandaloneEditorConstructionOptions) {
  return monaco.editor.create(el, {
    value: props.modelValue,
    language: props.language,
    readOnly: props.readonly,
    minimap: { enabled: props.minimap },
    lineNumbers: props.lineNumbers ? 'on' : 'off',
    wordWrap: props.wordWrap ? 'on' : 'off',
    theme: 'vs-dark',
    scrollBeyondLastLine: false,
    automaticLayout: true,
    padding: { top: 6, bottom: 6 },
    overviewRulerBorder: false,
    scrollbar: { verticalScrollbarSize: 6, horizontalScrollbarSize: 6 },
    renderLineHighlight: 'none',
    folding: false,
    glyphMargin: false,
    contextmenu: true,
    tabSize: 2,
    ...options,
  })
}

function bindEditorEvents(ed: monaco.editor.IStandaloneCodeEditor) {
  ed.onDidChangeModelContent(() => {
    ignoreNextUpdate = true
    emit('update:modelValue', ed.getValue())
  })
}

onMounted(() => {
  if (!inlineContainer.value) return
  inlineEditor = createEditor(inlineContainer.value, { fontSize: 12, lineHeight: 18 })
  bindEditorEvents(inlineEditor)
})

async function openFullscreen() {
  dialogOpen.value = true
  await nextTick()
  await nextTick()
  if (!fullContainer.value) return

  fullEditor?.dispose()
  fullEditor = createEditor(fullContainer.value, {
    fontSize: 14,
    lineHeight: 20,
    minimap: { enabled: true },
    folding: true,
  })
  fullEditor.focus()

  fullEditor.onDidChangeModelContent(() => {
    if (!fullEditor) return
    const val = fullEditor.getValue()
    ignoreNextUpdate = true
    emit('update:modelValue', val)
    if (inlineEditor && inlineEditor.getValue() !== val) {
      inlineEditor.setValue(val)
    }
  })
}

function closeFullscreen() {
  dialogOpen.value = false
  fullEditor?.dispose()
  fullEditor = null
}

watch(() => props.modelValue, (val) => {
  if (ignoreNextUpdate) {
    ignoreNextUpdate = false
    return
  }
  if (inlineEditor && inlineEditor.getValue() !== val) inlineEditor.setValue(val ?? '')
  if (fullEditor && fullEditor.getValue() !== val) fullEditor.setValue(val ?? '')
})

watch(() => props.language, (val) => {
  const m1 = inlineEditor?.getModel()
  const m2 = fullEditor?.getModel()
  if (m1 && val) monaco.editor.setModelLanguage(m1, val)
  if (m2 && val) monaco.editor.setModelLanguage(m2, val)
})

watch(() => props.readonly, (val) => {
  inlineEditor?.updateOptions({ readOnly: val })
  fullEditor?.updateOptions({ readOnly: val })
})

onBeforeUnmount(() => {
  inlineEditor?.dispose()
  fullEditor?.dispose()
  inlineEditor = null
  fullEditor = null
})
</script>

<template>
  <!-- 非内嵌：完整编辑器 -->
  <div
    v-if="!inline"
    ref="inlineContainer"
    class="nokey rounded-md border border-border overflow-hidden"
    :style="{ height: `${height}px` }"
  />

  <!-- 内嵌模式：迷你编辑器 + 全屏按钮 -->
  <div v-else class="nokey relative group">
    <div
      ref="inlineContainer"
      class="rounded-md border border-border overflow-hidden"
      :style="{ height: `${height}px` }"
    />
    <button
      type="button"
      class="absolute right-1.5 bottom-1.5 p-1 rounded bg-background/80 border border-border opacity-0 group-hover:opacity-100 transition-opacity hover:bg-accent"
      title="全屏编辑"
      @click="openFullscreen"
    >
      <Maximize2 class="w-3.5 h-3.5 text-muted-foreground" />
    </button>
  </div>

  <!-- 全屏对话框 -->
  <Dialog :open="dialogOpen" @update:open="($event) => { if (!$event) closeFullscreen() }">
    <DialogContent class="w-[80vw] max-w-none h-[80vh] flex flex-col p-0 gap-0">
      <DialogHeader class="px-4 py-2 border-b border-border flex-row items-center justify-between space-y-0">
        <DialogTitle class="text-sm">代码编辑器</DialogTitle>
        <Button variant="outline" size="sm" class="h-7 text-xs" @click="closeFullscreen">
          完成
        </Button>
      </DialogHeader>
      <div ref="fullContainer" class="nokey flex-1" />
    </DialogContent>
  </Dialog>
</template>
