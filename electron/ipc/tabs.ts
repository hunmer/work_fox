import { ipcMain } from 'electron'
import { getAppTabs, setAppTabs } from '../services/store'

export function registerTabsIpcHandlers(): void {
  ipcMain.handle('tabs:load', () => getAppTabs())
  ipcMain.handle('tabs:save', (_e, data) => setAppTabs(data))
}
