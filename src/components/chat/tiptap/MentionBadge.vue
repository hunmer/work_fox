<script setup lang="ts">
import { computed } from 'vue'
import { NodeViewWrapper } from '@tiptap/vue-3'
import type { NodeViewProps } from '@tiptap/vue-3'
import { X, File, Zap, Server } from 'lucide-vue-next'

const props = defineProps<NodeViewProps>()

const mentionType = computed(() => {
  const type = props.node.type.name
  if (type === 'fileMention') return 'file'
  if (type === 'skillMention') return 'skill'
  if (type === 'mcpMention') return 'mcp'
  return 'file'
})

const label = computed(() => props.node.attrs.label || props.node.attrs.id || 'unknown')

const badgeClass = computed(() => `mention-badge--${mentionType.value}`)

function handleRemove(e: MouseEvent) {
  e.preventDefault()
  e.stopPropagation()
  props.deleteNode()
}
</script>

<template>
  <NodeViewWrapper as="span">
    <span
      class="mention-badge"
      :class="badgeClass"
      contenteditable="false"
    >
      <span class="mention-badge__icon">
        <File v-if="mentionType === 'file'" class="size-3" />
        <Zap v-else-if="mentionType === 'skill'" class="size-3" />
        <Server v-else class="size-3" />
      </span>
      <span class="mention-badge__label">{{ label }}</span>
      <button
        class="mention-badge__close"
        @mousedown="handleRemove"
      >
        <X class="size-2.5" />
      </button>
    </span>
  </NodeViewWrapper>
</template>

<style scoped>
.mention-badge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 1px 2px 1px 5px;
  border-radius: 4px;
  font-size: 0.8em;
  font-weight: 500;
  line-height: 1.6;
  white-space: nowrap;
  vertical-align: baseline;
  user-select: none;
  cursor: default;
}

.mention-badge__icon {
  display: flex;
  align-items: center;
  opacity: 0.7;
}

.mention-badge__label {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.mention-badge__close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  border-radius: 3px;
  border: none;
  background: transparent;
  color: inherit;
  opacity: 0.4;
  cursor: pointer;
  padding: 0;
  transition: opacity 0.15s, background-color 0.15s;
}

.mention-badge__close:hover {
  opacity: 1;
  background-color: oklch(0 0 0 / 0.15);
}

/* File — blue */
.mention-badge--file {
  background-color: oklch(0.65 0.2 250 / 0.15);
  color: oklch(0.5 0.2 250);
}
:root.dark .mention-badge--file {
  background-color: oklch(0.7 0.15 250 / 0.2);
  color: oklch(0.75 0.15 250);
}

/* Skill — green */
.mention-badge--skill {
  background-color: oklch(0.65 0.18 150 / 0.15);
  color: oklch(0.45 0.18 150);
}
:root.dark .mention-badge--skill {
  background-color: oklch(0.7 0.15 150 / 0.2);
  color: oklch(0.75 0.15 150);
}

/* MCP — orange */
.mention-badge--mcp {
  background-color: oklch(0.65 0.18 30 / 0.15);
  color: oklch(0.45 0.18 30);
}
:root.dark .mention-badge--mcp {
  background-color: oklch(0.7 0.15 30 / 0.2);
  color: oklch(0.75 0.15 30);
}
</style>
