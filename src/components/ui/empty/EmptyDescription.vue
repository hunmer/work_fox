<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <p
    data-slot="empty-description"
    :class="cn('text-sm text-muted-foreground max-w-[320px]', props.class)"
  >
    <slot />
  </p>
</template>
