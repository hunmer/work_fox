<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'

const props = defineProps<{
  variant?: 'icon' | 'image'
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <div
    data-slot="empty-media"
    :class="cn(
      'flex items-center justify-center text-muted-foreground',
      variant === 'icon' && 'size-12 mb-2',
      props.class,
    )"
  >
    <slot />
  </div>
</template>
