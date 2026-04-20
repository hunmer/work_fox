import { globalShortcut, BrowserWindow } from 'electron'
import { getShortcutBindings, setShortcutBindings } from './store'

export type ShortcutGroup = 'tab' | 'navigation' | 'view' | 'tools' | 'window'

export interface ShortcutAction {
  id: string
  label: string
  defaultAccelerator: string
  supportsGlobal: boolean
  group: ShortcutGroup
}

export const SHORTCUT_GROUPS: { key: ShortcutGroup; label: string }[] = [
  { key: 'tab', label: '标签页' },
  { key: 'navigation', label: '导航' },
  { key: 'view', label: '视图' },
  { key: 'tools', label: '工具' },
  { key: 'window', label: '窗口' }
]

export const SHORTCUT_ACTIONS: ShortcutAction[] = [
  { id: 'new-tab', label: '新建标签页', defaultAccelerator: 'CmdOrCtrl+T', supportsGlobal: true, group: 'tab' },
  { id: 'close-tab', label: '关闭当前标签页', defaultAccelerator: 'CmdOrCtrl+W', supportsGlobal: true, group: 'tab' },
  { id: 'next-tab', label: '下一个标签页', defaultAccelerator: 'CmdOrCtrl+Tab', supportsGlobal: true, group: 'tab' },
  { id: 'prev-tab', label: '上一个标签页', defaultAccelerator: 'CmdOrCtrl+Shift+Tab', supportsGlobal: true, group: 'tab' },
  { id: 'restore-tab', label: '恢复关闭的标签页', defaultAccelerator: 'CmdOrCtrl+Shift+T', supportsGlobal: true, group: 'tab' },
  // 导航
  { id: 'reload-tab', label: '刷新当前页', defaultAccelerator: 'CmdOrCtrl+R', supportsGlobal: true, group: 'navigation' },
  { id: 'force-reload', label: '强制刷新', defaultAccelerator: 'CmdOrCtrl+Shift+R', supportsGlobal: true, group: 'navigation' },
  // 视图
  { id: 'toggle-fullscreen', label: '切换全屏', defaultAccelerator: 'F11', supportsGlobal: true, group: 'view' },
  { id: 'zoom-in', label: '放大页面', defaultAccelerator: 'CmdOrCtrl+Plus', supportsGlobal: true, group: 'view' },
  { id: 'zoom-out', label: '缩小页面', defaultAccelerator: 'CmdOrCtrl+-', supportsGlobal: true, group: 'view' },
  { id: 'zoom-reset', label: '重置页面缩放', defaultAccelerator: 'CmdOrCtrl+0', supportsGlobal: true, group: 'view' },
  // 工具
  { id: 'open-devtools', label: '打开开发者工具', defaultAccelerator: 'F12', supportsGlobal: true, group: 'tools' },
  { id: 'open-devtools-alt', label: '打开开发者工具 (备用)', defaultAccelerator: 'CmdOrCtrl+Shift+I', supportsGlobal: true, group: 'tools' },
  // 窗口
  { id: 'toggle-window', label: '唤起/最小化主窗口', defaultAccelerator: '', supportsGlobal: true, group: 'window' }
]

export interface ShortcutBinding {
  id: string
  accelerator: string
  global: boolean
  enabled: boolean
}

export function getMergedBindings(): ShortcutBinding[] {
  const bindings = getShortcutBindings()
  return SHORTCUT_ACTIONS.map(action => {
    const custom = bindings.find(b => b.id === action.id)
    return {
      id: action.id,
      accelerator: custom?.accelerator ?? action.defaultAccelerator,
      global: custom?.global ?? false,
      enabled: custom?.enabled ?? true
    }
  })
}

export function registerGlobalShortcuts(): void {
  globalShortcut.unregisterAll()
  const bindings = getMergedBindings()
  for (const binding of bindings) {
    if (!binding.enabled || !binding.global || !binding.accelerator) continue
    try {
      globalShortcut.register(binding.accelerator, () => {
        const win = BrowserWindow.getAllWindows()[0]
        if (!win) return
        if (binding.id === 'toggle-window') {
          if (win.isMinimized()) {
            win.restore()
            win.focus()
          } else {
            win.minimize()
          }
        } else {
          if (win.isMinimized()) win.restore()
          win.focus()
          win.webContents.send('shortcut', binding.id)
        }
      })
    } catch {
      console.warn(`[ShortcutManager] 注册全局快捷键失败: ${binding.accelerator} (${binding.id})`)
    }
  }
}

export function unregisterGlobalShortcuts(): void {
  globalShortcut.unregisterAll()
}

export function updateShortcutBinding(id: string, accelerator: string, isGlobal: boolean, enabled = true): { success: boolean; error?: string; conflictId?: string } {
  const action = SHORTCUT_ACTIONS.find(a => a.id === id)
  if (!action) return { success: false, error: '功能不存在' }

  if (accelerator && enabled) {
    const mergedBindings = getMergedBindings()
    const conflict = mergedBindings.find(b => b.id !== id && b.accelerator === accelerator && b.enabled)
    if (conflict) {
      const conflictAction = SHORTCUT_ACTIONS.find(a => a.id === conflict.id)
      return { success: false, error: `快捷键已被「${conflictAction?.label}」占用`, conflictId: conflict.id }
    }
  }

  const bindings = getShortcutBindings()
  const idx = bindings.findIndex(b => b.id === id)
  const binding: ShortcutBinding = { id, accelerator, global: isGlobal, enabled }
  if (idx >= 0) {
    bindings[idx] = binding
  } else {
    bindings.push(binding)
  }
  setShortcutBindings(bindings)
  registerGlobalShortcuts()
  return { success: true }
}

export function clearShortcutBinding(id: string): void {
  updateShortcutBinding(id, '', false, true)
}
