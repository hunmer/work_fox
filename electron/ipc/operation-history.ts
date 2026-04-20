import { ipcMain } from 'electron'
import { operationHistoryStore } from '../services/operation-history'

export function registerOperationHistoryIpcHandlers(): void {
  ipcMain.handle('operationHistory:load', (_e, workflowId: string) => {
    return operationHistoryStore.load(workflowId)
  })

  ipcMain.handle('operationHistory:save', (_e, workflowId: string, entries: any[]) => {
    operationHistoryStore.save(workflowId, entries)
  })
}
