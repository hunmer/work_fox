<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import JsonEditorVue from 'json-editor-vue'
import { Copy, Check, Braces, FileText } from 'lucide-vue-next'
import { useThemeStore } from '@/stores/theme'

type JsonEditorMode = 'tree' | 'text' | 'table'

const props = withDefaults(defineProps<{
  modelValue?: any
  readonly?: boolean
  readOnly?: boolean
  mode?: JsonEditorMode
  height?: number | string
  mainMenuBar?: boolean
  navigationBar?: boolean
  statusBar?: boolean
}>(), {
  readonly: false,
  readOnly: false,
  mode: 'tree',
  height: '100%',
  mainMenuBar: false,
  navigationBar: false,
  statusBar: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: any]
  'update:mode': [value: JsonEditorMode]
}>()

const themeStore = useThemeStore()
const isDark = computed(() => themeStore.isDark)
const isReadonly = computed(() => props.readonly || props.readOnly)

const value = computed(() => props.modelValue)
const currentMode = ref<JsonEditorMode>(props.mode)
const copied = ref(false)

watch(() => props.mode, (mode) => {
  currentMode.value = mode
})

function handleChange(val: any) {
  if (!isReadonly.value) emit('update:modelValue', val)
}

function setMode(mode: 'tree' | 'text') {
  currentMode.value = mode
  emit('update:mode', mode)
}

async function handleCopy() {
  const text = typeof value.value === 'string' ? value.value : JSON.stringify(value.value, null, 2) ?? ''
  await navigator.clipboard.writeText(text)
  copied.value = true
  setTimeout(() => { copied.value = false }, 1500)
}
</script>

<template>
  <div class="json-editor-wrapper rounded-md border border-border overflow-hidden w-full relative"
    :class="{ 'jse-theme-dark': isDark, 'jse-readonly': isReadonly }"
    :style="{ height: typeof height === 'number' ? `${height}px` : height }">
    <div class="json-editor-host">
      <JsonEditorVue :model-value="value" :mode="currentMode" :read-only="isReadonly" :mainMenuBar="mainMenuBar"
        :navigationBar="navigationBar" :statusBar="statusBar" @update:model-value="handleChange" />
    </div>
    <div class="absolute top-2 right-2 z-10 inline-flex overflow-hidden rounded-md border border-border bg-muted/80 text-muted-foreground backdrop-blur-sm">
      <button type="button"
        class="inline-flex p-1.5 items-center justify-center transition-colors hover:bg-muted hover:text-foreground"
        :class="{ 'bg-background text-foreground': currentMode === 'tree' }" title="Tree mode"
        @click.stop="setMode('tree')">
        <Braces class="w-3.5 h-3.5" />
      </button>
      <button type="button"
        class="inline-flex p-1.5 items-center justify-center border-l border-border transition-colors hover:bg-muted hover:text-foreground"
        :class="{ 'bg-background text-foreground': currentMode === 'text' }" title="Text mode"
        @click.stop="setMode('text')">
        <FileText class="w-3.5 h-3.5" />
      </button>
    </div>
    <button v-if="isReadonly" type="button" @click.stop="handleCopy"
      class="absolute bottom-2 right-2 p-1.5 rounded-md border border-border bg-muted/80 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors backdrop-blur-sm z-10"
      title="复制">
      <component :is="copied ? Check : Copy" class="w-3.5 h-3.5" :class="{ 'text-green-500': copied }" />
    </button>
  </div>
</template>

<style>
.json-editor-host,
.json-editor-host>div,
.json-editor-host .jse-main {
  height: 100%;
}

.json-editor-wrapper {
  font-size: 8px;
}

.json-editor-wrapper .jse-json-node,
.json-editor-wrapper .jse-value,
.json-editor-wrapper .jse-key,
.json-editor-wrapper .jse-string,
.json-editor-wrapper .jse-number {
  font-size: 12px;
}

.json-editor-wrapper.jse-readonly .jse-context-menu,
.json-editor-wrapper.jse-readonly .jse-main-menu,
.json-editor-wrapper.jse-readonly .jse-selection,
.json-editor-wrapper.jse-readonly .jse-modal,
.json-editor-wrapper.jse-readonly .jse-tooltip {
  display: none !important;
}

.json-editor-wrapper.jse-readonly .jse-contents {
  pointer-events: none;
  user-select: text;
}

.jse-theme-dark {
  --jse-theme: dark;
  --jse-theme-color: #2f6dd0;
  --jse-theme-color-highlight: #467cd2;
  --jse-background-color: #1e1e1e;
  --jse-text-color: #d4d4d4;
  --jse-text-color-inverse: #4d4d4d;
  --jse-main-border: 1px solid #4f4f4f;
  --jse-menu-color: #fff;
  --jse-modal-background: #2f2f2f;
  --jse-modal-overlay-background: rgba(0, 0, 0, 0.5);
  --jse-modal-code-background: #2f2f2f;
  --jse-tooltip-color: var(--jse-text-color);
  --jse-tooltip-background: #4b4b4b;
  --jse-tooltip-border: 1px solid #737373;
  --jse-tooltip-action-button-color: inherit;
  --jse-tooltip-action-button-background: #737373;
  --jse-panel-background: #333333;
  --jse-panel-background-border: 1px solid #464646;
  --jse-panel-color: var(--jse-text-color);
  --jse-panel-color-readonly: #737373;
  --jse-panel-border: 1px solid #3c3c3c;
  --jse-panel-button-color-highlight: #e5e5e5;
  --jse-panel-button-background-highlight: #464646;
  --jse-navigation-bar-background: #656565;
  --jse-navigation-bar-background-highlight: #7e7e7e;
  --jse-navigation-bar-dropdown-color: var(--jse-text-color);
  --jse-context-menu-background: #4b4b4b;
  --jse-context-menu-background-highlight: #595959;
  --jse-context-menu-separator-color: #595959;
  --jse-context-menu-color: var(--jse-text-color);
  --jse-context-menu-pointer-background: #737373;
  --jse-context-menu-pointer-background-highlight: #818181;
  --jse-context-menu-pointer-color: var(--jse-context-menu-color);
  --jse-key-color: #9cdcfe;
  --jse-value-color: var(--jse-text-color);
  --jse-value-color-number: #b5cea8;
  --jse-value-color-boolean: #569cd6;
  --jse-value-color-null: #569cd6;
  --jse-value-color-string: #ce9178;
  --jse-value-color-url: #ce9178;
  --jse-delimiter-color: #949494;
  --jse-edit-outline: 2px solid var(--jse-text-color);
  --jse-selection-background-color: #464646;
  --jse-selection-background-inactive-color: #333333;
  --jse-hover-background-color: #343434;
  --jse-active-line-background-color: rgba(255, 255, 255, 0.06);
  --jse-search-match-background-color: #343434;
  --jse-collapsed-items-background-color: #333333;
  --jse-collapsed-items-selected-background-color: #565656;
  --jse-collapsed-items-link-color: #b2b2b2;
  --jse-collapsed-items-link-color-highlight: #ec8477;
  --jse-search-match-color: #724c27;
  --jse-search-match-outline: 1px solid #966535;
  --jse-search-match-active-color: #9f6c39;
  --jse-search-match-active-outline: 1px solid #bb7f43;
  --jse-tag-background: #444444;
  --jse-tag-color: #bdbdbd;
  --jse-table-header-background: #333333;
  --jse-table-header-background-highlight: #424242;
  --jse-table-row-odd-background: rgba(255, 255, 255, 0.1);
  --jse-input-background: #3d3d3d;
  --jse-input-border: var(--jse-main-border);
  --jse-button-background: #808080;
  --jse-button-background-highlight: #7a7a7a;
  --jse-button-color: #e0e0e0;
  --jse-button-secondary-background: #494949;
  --jse-button-secondary-background-highlight: #5d5d5d;
  --jse-button-secondary-background-disabled: #9d9d9d;
  --jse-button-secondary-color: var(--jse-text-color);
  --jse-a-color: #55abff;
  --jse-a-color-highlight: #4387c9;
  --jse-svelte-select-background: #3d3d3d;
  --jse-svelte-select-border: 1px solid #4f4f4f;
  --list-background: #3d3d3d;
  --item-hover-bg: #505050;
  --multi-item-bg: #5b5b5b;
  --input-color: #d4d4d4;
  --multi-clear-bg: #8a8a8a;
  --multi-item-clear-icon-color: #d4d4d4;
  --multi-item-outline: 1px solid #696969;
  --list-shadow: 0 2px 8px 0 rgba(0, 0, 0, 0.4);
  --jse-color-picker-background: #656565;
  --jse-color-picker-border-box-shadow: #8c8c8c 0 0 0 1px;
}
</style>
