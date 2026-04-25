import { onMounted, onUnmounted, type Ref } from 'vue'
import { useShortcutStore } from '@/stores/shortcut'
import { useTabStore } from '@/stores/tab'

const isElectron = navigator.userAgent.includes('Electron')

function acceleratorMatches(accelerator: string, e: KeyboardEvent): boolean {
  if (!accelerator) return false
  const parts = accelerator.split('+')
  const requireCtrl = parts.includes('CmdOrCtrl')
  const requireShift = parts.includes('Shift')
  const requireAlt = parts.includes('Alt')
  const key = parts[parts.length - 1]

  const ctrlMatch = requireCtrl
    ? (e.ctrlKey || e.metaKey)
    : !e.ctrlKey && !e.metaKey
  const shiftMatch = requireShift ? e.shiftKey : !e.shiftKey
  const altMatch = requireAlt ? e.altKey : !e.altKey

  if (!ctrlMatch || !shiftMatch || !altMatch) return false

  let eventKey = e.key
  if (eventKey === ' ') eventKey = 'Space'
  else if (eventKey === 'ArrowUp') eventKey = 'Up'
  else if (eventKey === 'ArrowDown') eventKey = 'Down'
  else if (eventKey === 'ArrowLeft') eventKey = 'Left'
  else if (eventKey === 'ArrowRight') eventKey = 'Right'
  else if (eventKey === '+') eventKey = 'Plus'

  return eventKey.toLowerCase() === key.toLowerCase()
}

function isInputElement(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}

export function useShortcutActions(commandPaletteOpen?: Ref<boolean>) {
  const shortcutStore = useShortcutStore()
  const tabStore = useTabStore()

  function executeAction(id: string): void {
    switch (id) {
      case 'new-tab':
        tabStore.addTab()
        break
      case 'close-tab':
        if (tabStore.activeTabId) tabStore.closeTab(tabStore.activeTabId)
        break
      case 'next-tab': {
        const tabs = tabStore.tabs
        if (tabs.length < 2) break
        const idx = tabs.findIndex(t => t.id === tabStore.activeTabId)
        const nextIdx = (idx + 1) % tabs.length
        tabStore.switchTab(tabs[nextIdx].id)
        break
      }
      case 'prev-tab': {
        const tabs = tabStore.tabs
        if (tabs.length < 2) break
        const idx = tabs.findIndex(t => t.id === tabStore.activeTabId)
        const prevIdx = (idx - 1 + tabs.length) % tabs.length
        tabStore.switchTab(tabs[prevIdx].id)
        break
      }
      case 'toggle-fullscreen':
        if (document.fullscreenElement) document.exitFullscreen()
        else document.documentElement.requestFullscreen()
        break
      case 'command-palette':
        if (commandPaletteOpen) commandPaletteOpen.value = !commandPaletteOpen.value
        break
      case 'reload-tab':
        tabStore.activeStore?.loadData()
        break
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (isInputElement(e.target)) return

    const shortcuts = shortcutStore.shortcuts
    for (const s of shortcuts) {
      if (!s.enabled || !s.accelerator) continue
      if (s.electronOnly) continue

      // Electron 模式下 global 的由主进程处理，不重复拦截
      if (isElectron && s.global) continue

      if (acceleratorMatches(s.accelerator, e)) {
        e.preventDefault()
        e.stopPropagation()
        executeAction(s.id)
        return
      }
    }
  }

  onMounted(() => {
    window.addEventListener('keydown', handleKeyDown, true)
  })
  onUnmounted(() => {
    window.removeEventListener('keydown', handleKeyDown, true)
  })
}
