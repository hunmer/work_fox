<!-- src/components/command-palette/CommandPaletteDialog.vue -->
<!-- 核心框架版本 - 无内置 providers，通过 registerProviders 注入 -->

<script setup lang="ts">
import { ref, watch, computed, nextTick, onBeforeUnmount } from 'vue'
import CommandDialog from '@/components/ui/command/CommandDialog.vue'
import CommandList from '@/components/ui/command/CommandList.vue'
import CommandEmpty from '@/components/ui/command/CommandEmpty.vue'
import CommandGroup from '@/components/ui/command/CommandGroup.vue'
import CommandItem from '@/components/ui/command/CommandItem.vue'
import { Search, X } from 'lucide-vue-next'
import { useCommandPalette } from '@/composables/useCommandPalette'
import type { CommandItem as CommandItemType, CommandProvider } from '@/types/command'

const props = defineProps<{
  open: boolean
  providers?: CommandProvider[]
}>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'run'): void
}>()

const inputRef = ref<HTMLInputElement | null>(null)
const listRef = ref<InstanceType<typeof CommandList> | null>(null)
const localInput = ref('')

const {
  providers: registeredProviders,
  results,
  loading,
  activeProvider,
  search,
  searchWithProvider,
  registerProviders,
  activateProvider,
  deactivateProvider,
} = useCommandPalette()

// 注入外部 providers
watch(() => props.providers, (list) => {
  if (list && list.length) {
    registerProviders(list)
  }
}, { immediate: true })

let skipNextWatch = false
let focusTimer: ReturnType<typeof setTimeout> | null = null

function focusInput() {
  if (focusTimer) clearTimeout(focusTimer)
  nextTick(() => {
    focusTimer = setTimeout(() => {
      focusTimer = null
      if (!props.open) return
      inputRef.value?.focus()
    }, 1)
  })
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null
watch(localInput, (val) => {
  if (skipNextWatch) {
    skipNextWatch = false
    return
  }
  if (debounceTimer) clearTimeout(debounceTimer)

  if (activeProvider.value) {
    debounceTimer = setTimeout(() => {
      searchWithProvider(activeProvider.value!, val)
    }, 150)
  } else {
    search(val).then(() => {
      if (activeProvider.value) {
        skipNextWatch = true
        localInput.value = ''
        focusInput()
      }
    })
  }
})

watch(() => props.open, (val) => {
  if (val) {
    skipNextWatch = true
    localInput.value = ''
    search('')
    focusInput()
  } else if (focusTimer) {
    clearTimeout(focusTimer)
    focusTimer = null
  }
})

function handleOpenAutoFocus(e: Event) {
  e.preventDefault()
  focusInput()
}

function handleSelect(item: CommandItemType) {
  emit('update:open', false)
  item.run()
  emit('run')
}

function handleProviderSelect(item: CommandItemType) {
  const target = registeredProviders.value.find(
    (p) => `provider-${p.id}` === item.id
  )
  if (target) {
    activateProvider(target)
    skipNextWatch = true
    localInput.value = ''
    focusInput()
  }
}

function findMatchingProviders(query: string) {
  const q = query.trim().toLowerCase()
  if (!q) return []
  return registeredProviders.value.filter(
    (p) =>
      p.prefix !== '' &&
      (p.prefix.toLowerCase().includes(q) ||
        (p.prefixShort && p.prefixShort.toLowerCase().includes(q)) ||
        p.label.toLowerCase().includes(q))
  )
}

function getVisibleItems(): HTMLElement[] {
  const listEl = listRef.value?.$el as HTMLElement | undefined
  if (!listEl) return []
  return Array.from(listEl.querySelectorAll('[role="option"]:not([hidden])')) as HTMLElement[]
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    const items = getVisibleItems()
    if (items.length === 0) return

    e.preventDefault()

    const currentHighlight = document.activeElement as HTMLElement
    const currentIndex = items.indexOf(currentHighlight)

    let nextIndex: number
    if (e.key === 'ArrowDown') {
      nextIndex = currentIndex < items.length - 1 ? currentIndex + 1 : 0
    } else {
      nextIndex = currentIndex > 0 ? currentIndex - 1 : items.length - 1
    }

    items[nextIndex]?.focus()
    return
  }

  if (document.activeElement !== inputRef.value && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
    inputRef.value?.focus()
    return
  }

  if ((e.key === 'Escape' || e.key === 'Backspace') && document.activeElement !== inputRef.value) {
    e.preventDefault()
    inputRef.value?.focus()
    return
  }

  if (e.key === 'Backspace' && activeProvider.value && !localInput.value) {
    e.preventDefault()
    deactivateProvider()
    skipNextWatch = true
    localInput.value = ''
    focusInput()
    return
  }

  if (e.key === ' ' && !activeProvider.value && localInput.value.trim()) {
    const matches = findMatchingProviders(localInput.value)
    if (matches.length === 1) {
      e.preventDefault()
      activateProvider(matches[0])
      skipNextWatch = true
      localInput.value = ''
      focusInput()
    }
  }
}

function clearProvider() {
  deactivateProvider()
  skipNextWatch = true
  localInput.value = ''
  focusInput()
}

const visibleGroups = computed(() => {
  return registeredProviders.value.filter((p) => results.value.has(p.id))
})

const providerItems = computed(() => results.value.get('__providers__') || [])

const placeholder = computed(() =>
  activeProvider.value ? `搜索${activeProvider.value.label}...` : '输入命令或搜索...'
)

onBeforeUnmount(() => {
  if (debounceTimer) clearTimeout(debounceTimer)
  if (focusTimer) clearTimeout(focusTimer)
})
</script>

<template>
  <CommandDialog
    :open="open"
    title="命令面板"
    description="输入命令或搜索..."
    @update:open="emit('update:open', $event)"
    @open-auto-focus="handleOpenAutoFocus"
  >
    <!-- 自定义搜索输入区域 -->
    <div class="flex h-9 items-center gap-2 border-b px-3">
      <div
        v-if="activeProvider"
        class="flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-xs text-primary whitespace-nowrap"
      >
        <component
          :is="activeProvider.icon"
          class="size-3.5 shrink-0"
        />
        <span>{{ activeProvider.label }}</span>
        <button
          class="ml-0.5 rounded-sm hover:bg-primary/20 hover:text-destructive"
          @click="clearProvider"
        >
          <X class="size-3" />
        </button>
      </div>
      <Search
        v-else
        class="size-4 shrink-0 opacity-50"
      />
      <input
        ref="inputRef"
        v-model="localInput"
        :placeholder="placeholder"
        class="flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
        @keydown="handleKeydown"
      >
    </div>
    <CommandList
      ref="listRef"
      @keydown="handleKeydown"
    >
      <CommandEmpty v-if="!loading && localInput.trim() && visibleGroups.length === 0 && providerItems.length === 0">
        未找到结果
      </CommandEmpty>
      <CommandGroup
        v-if="providerItems.length"
        heading="搜索工具"
      >
        <CommandItem
          v-for="item in providerItems"
          :key="item.id"
          :value="item.label + ' ' + (item.description || '') + ' ' + (item.keywords?.join(' ') || '')"
          @select="handleProviderSelect(item)"
        >
          <component
            :is="item.icon"
            class="mr-2 h-4 w-4 shrink-0"
          />
          <div class="flex flex-1 flex-col overflow-hidden">
            <span class="truncate text-sm">{{ item.label }}</span>
            <span
              v-if="item.description"
              class="truncate text-xs text-muted-foreground"
            >
              {{ item.description }}
            </span>
          </div>
        </CommandItem>
      </CommandGroup>
      <CommandGroup
        v-for="provider in visibleGroups"
        :key="provider.id"
        :heading="provider.label"
      >
        <CommandItem
          v-for="item in results.get(provider.id)"
          :key="item.id"
          :value="item.label + ' ' + (item.description || '') + ' ' + (item.keywords?.join(' ') || '')"
          @select="handleSelect(item)"
        >
          <component
            :is="item.icon"
            class="mr-2 h-4 w-4 shrink-0"
          />
          <div class="flex flex-1 flex-col overflow-hidden">
            <span class="truncate text-sm">{{ item.label }}</span>
            <span
              v-if="item.description"
              class="truncate text-xs text-muted-foreground"
            >
              {{ item.description }}
            </span>
          </div>
          <span
            v-if="item.shortcut"
            class="ml-2 text-xs text-muted-foreground"
          >
            {{ item.shortcut }}
          </span>
        </CommandItem>
      </CommandGroup>
    </CommandList>
  </CommandDialog>
</template>
