import { ipcMain } from 'electron'
import {
  SHORTCUT_ACTIONS,
  SHORTCUT_GROUPS,
  getMergedBindings,
  updateShortcutBinding,
  clearShortcutBinding,
  registerGlobalShortcuts,
  unregisterGlobalShortcuts
} from '../services/shortcut-manager'

export function registerShortcutIpcHandlers(): void {
  ipcMain.handle('shortcut:list', () => {
    const bindings = getMergedBindings()
    return {
      groups: SHORTCUT_GROUPS,
      shortcuts: SHORTCUT_ACTIONS.map(action => {
        const binding = bindings.find(b => b.id === action.id)
        return {
          id: action.id,
          label: action.label,
          accelerator: binding?.accelerator ?? action.defaultAccelerator,
          global: binding?.global ?? false,
          enabled: binding?.enabled ?? true,
          supportsGlobal: action.supportsGlobal,
          defaultAccelerator: action.defaultAccelerator,
          group: action.group
        }
      })
    }
  })

  ipcMain.handle('shortcut:update', (_e, id: string, accelerator: string, isGlobal: boolean, enabled?: boolean) => {
    if (enabled === undefined) {
      const bindings = getMergedBindings()
      const current = bindings.find(b => b.id === id)
      enabled = current?.enabled ?? true
    }
    return updateShortcutBinding(id, accelerator, isGlobal, enabled)
  })

  ipcMain.handle('shortcut:toggle', (_e, id: string, enabled: boolean) => {
    const bindings = getMergedBindings()
    const current = bindings.find(b => b.id === id)
    if (!current) return { success: false, error: '快捷键不存在' }
    return updateShortcutBinding(id, current.accelerator, current.global, enabled)
  })

  ipcMain.handle('shortcut:clear', (_e, id: string) => {
    clearShortcutBinding(id)
    return { success: true }
  })

  ipcMain.handle('shortcut:reset', () => {
    registerGlobalShortcuts()
    return { success: true }
  })
}

export { registerGlobalShortcuts, unregisterGlobalShortcuts }
