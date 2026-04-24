import { ref } from 'vue'
import { defineStore } from 'pinia'
import { wsBridge } from '@/lib/ws-bridge'

export interface ShortcutItem {
  id: string
  label: string
  accelerator: string
  global: boolean
  enabled: boolean
  supportsGlobal: boolean
  defaultAccelerator: string
  group: string
}

export interface ShortcutGroup {
  key: string
  label: string
}

export const useShortcutStore = defineStore('shortcut', () => {
  const shortcuts = ref<ShortcutItem[]>([])
  const groups = ref<ShortcutGroup[]>([])
  const loading = ref(false)

  async function load() {
    loading.value = true
    try {
      const result = await wsBridge.invoke('shortcut:list', undefined) as { groups: ShortcutGroup[]; shortcuts: ShortcutItem[] }
      groups.value = result.groups
      shortcuts.value = result.shortcuts
    } finally {
      loading.value = false
    }
  }

  async function updateShortcut(id: string, accelerator: string, isGlobal: boolean, enabled?: boolean) {
    const result = await wsBridge.invoke('shortcut:update', { id, accelerator, isGlobal, enabled }) as any
    if (result.success) {
      const idx = shortcuts.value.findIndex(s => s.id === id)
      if (idx >= 0) {
        const updated = { ...shortcuts.value[idx], accelerator, global: isGlobal }
        if (enabled !== undefined) updated.enabled = enabled
        shortcuts.value.splice(idx, 1, updated)
      }
    }
    return result
  }

  async function toggleEnabled(id: string, enabled: boolean) {
    const result = await wsBridge.invoke('shortcut:toggle', { id, enabled }) as any
    if (result.success) {
      const idx = shortcuts.value.findIndex(s => s.id === id)
      if (idx >= 0) {
        shortcuts.value.splice(idx, 1, { ...shortcuts.value[idx], enabled })
      }
    }
    return result
  }

  async function clearShortcut(id: string) {
    await wsBridge.invoke('shortcut:clear', { id })
    const idx = shortcuts.value.findIndex(s => s.id === id)
    if (idx >= 0) {
      shortcuts.value.splice(idx, 1, { ...shortcuts.value[idx], accelerator: '', global: false })
    }
  }

  function getShortcutsByGroup(group: string): ShortcutItem[] {
    return shortcuts.value.filter(s => s.group === group)
  }

  return { shortcuts, groups, loading, load, updateShortcut, toggleEnabled, clearShortcut, getShortcutsByGroup }
})
