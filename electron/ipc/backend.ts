import { ipcMain } from 'electron'
import { backendProcessManager } from '../services/backend-process'

export function registerBackendIpcHandlers(): void {
  ipcMain.handle('backend:get-status', () => backendProcessManager.getStatus())
  ipcMain.handle('backend:get-endpoint', async () => {
    const status = backendProcessManager.getStatus()
    if (!status.running) {
      await backendProcessManager.start()
    }
    return backendProcessManager.getEndpoint()
  })
}
