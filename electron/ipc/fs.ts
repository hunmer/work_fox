import { ipcMain } from 'electron'
import fs from 'fs/promises'
import path from 'path'

export interface DirEntry {
  name: string
  path: string
  type: 'file' | 'directory'
}

export function registerFsIpcHandlers(): void {
  ipcMain.handle('fs:listDir', async (_e, dirPath: string): Promise<DirEntry[]> => {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true })
      return entries
        .filter((entry) => !entry.name.startsWith('.'))
        .map((entry) => ({
          name: entry.name,
          path: path.join(dirPath, entry.name),
          type: entry.isDirectory() ? 'directory' as const : 'file' as const,
        }))
        .sort((a, b) => {
          if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
          return a.name.localeCompare(b.name)
        })
    } catch {
      return []
    }
  })
}
