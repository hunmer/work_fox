<script setup lang="ts">
import { watch, onBeforeUnmount } from 'vue'
import { useEditor, EditorContent, VueNodeViewRenderer } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Mention from '@tiptap/extension-mention'
import { PluginKey } from '@tiptap/pm/state'
import { useMentionConfig } from './useMentionConfig'
import MentionBadge from './MentionBadge.vue'
import './editor.css'

const props = defineProps<{
  disabled?: boolean
}>()

const emit = defineEmits<{
  send: []
}>()

const { suggestionState, selectItem, fileConfig, skillConfig, mcpConfig } = useMentionConfig()

const editor = useEditor({
  content: '',
  extensions: [
    StarterKit.configure({
      heading: false,
      codeBlock: false,
      blockquote: false,
      bulletList: false,
      orderedList: false,
      horizontalRule: false,
    }),
    // @ 工作区文件
    Mention.extend({
      name: 'fileMention',
      renderText({ node }) {
        return `@${node.attrs.label || node.attrs.id}`
      },
      addNodeView() {
        return VueNodeViewRenderer(MentionBadge)
      },
    }).configure({
      suggestion: {
        pluginKey: new PluginKey('fileMention'),
        char: '@',
        items: fileConfig.items,
        render: fileConfig.render,
      },
      HTMLAttributes: {
        class: 'mention-node mention--file',
      },
    }),
    // / Skills
    Mention.extend({
      name: 'skillMention',
      renderText({ node }) {
        return `/${node.attrs.label || node.attrs.id}`
      },
      addNodeView() {
        return VueNodeViewRenderer(MentionBadge)
      },
    }).configure({
      suggestion: {
        pluginKey: new PluginKey('skillMention'),
        char: '/',
        items: skillConfig.items,
        render: skillConfig.render,
      },
      HTMLAttributes: {
        class: 'mention-node mention--skill',
      },
    }),
    // # MCP
    Mention.extend({
      name: 'mcpMention',
      renderText({ node }) {
        return `#${node.attrs.label || node.attrs.id}`
      },
      addNodeView() {
        return VueNodeViewRenderer(MentionBadge)
      },
    }).configure({
      suggestion: {
        pluginKey: new PluginKey('mcpMention'),
        char: '#',
        items: mcpConfig.items,
        render: mcpConfig.render,
      },
      HTMLAttributes: {
        class: 'mention-node mention--mcp',
      },
    }),
  ],
  editorProps: {
    attributes: {
      'data-slot': 'input-group-control',
      'data-placeholder': '输入消息... (Enter 发送, Shift+Enter 换行, @文件 /skill #mcp)',
      class: 'tiptap-editor-content',
    },
    handleKeyDown(view, event) {
      // Enter 发送（无修饰键、非 IME 组合中、非 suggestion 活跃时）
      if (
        event.key === 'Enter' &&
        !event.shiftKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.isComposing &&
        !suggestionState.active
      ) {
        event.preventDefault()
        emit('send')
        return true
      }
      return false
    },
  },
})

// 响应 disabled 变化
watch(
  () => props.disabled,
  (disabled) => {
    editor.value?.setEditable(!disabled)
  },
)

onBeforeUnmount(() => {
  editor.value?.destroy()
})

defineExpose({
  editor,
  suggestionState,
  selectItem,
})
</script>

<template>
  <div class="w-full">
    <EditorContent :editor="editor" />
  </div>
</template>
