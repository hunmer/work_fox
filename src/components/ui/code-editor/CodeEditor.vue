<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, toRaw } from 'vue'
import * as monaco from 'monaco-editor'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'

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
}>(), {
  modelValue: '',
  language: 'javascript',
  readonly: false,
  minimap: false,
  lineNumbers: true,
  wordWrap: true,
  height: 200,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const container = ref<HTMLDivElement>()
let editor: monaco.editor.IStandaloneCodeEditor | null = null
let ignoreNextUpdate = false

onMounted(() => {
  if (!container.value) return

  editor = monaco.editor.create(container.value, {
    value: props.modelValue,
    language: props.language,
    readOnly: props.readonly,
    minimap: { enabled: props.minimap },
    lineNumbers: props.lineNumbers ? 'on' : 'off',
    wordWrap: props.wordWrap ? 'on' : 'off',
    theme: 'vs-dark',
    fontSize: 12,
    lineHeight: 18,
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
  })

  editor.onDidChangeModelContent(() => {
    if (!editor) return
    ignoreNextUpdate = true
    emit('update:modelValue', editor.getValue())
  })
})

watch(() => props.modelValue, (val) => {
  if (ignoreNextUpdate) {
    ignoreNextUpdate = false
    return
  }
  if (editor && editor.getValue() !== val) {
    editor.setValue(val ?? '')
  }
})

watch(() => props.language, (val) => {
  const model = editor?.getModel()
  if (model && val) {
    monaco.editor.setModelLanguage(model, val)
  }
})

watch(() => props.readonly, (val) => {
  editor?.updateOptions({ readOnly: val })
})

onBeforeUnmount(() => {
  editor?.dispose()
  editor = null
})
</script>

<template>
  <div
    ref="container"
    class="rounded-md border border-border overflow-hidden"
    :style="{ height: `${height}px` }"
  />
</template>
