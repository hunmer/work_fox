import { ipcMain } from 'electron'
import { getAgentSettings, setAgentSettings } from '../services/store'

export function registerAgentSettingsIpcHandlers(): void {
  ipcMain.handle('agentSettings:get', () => {
    return getAgentSettings()
  })

  ipcMain.handle('agentSettings:set', (_e, settings) => {
    return setAgentSettings(settings)
  })
}
