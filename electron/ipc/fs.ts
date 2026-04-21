import { ipcMain, shell } from 'electron'
import fs from 'fs/promises'
import path from 'path'

export interface DirEntry {
  name: string
  path: string
  type: 'file' | 'directory'
  modifiedAt: string
}

export function registerFsIpcHandlers(): void {
  ipcMain.handle('fs:listDir', async (_e, dirPath: string): Promise<DirEntry[]> => {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true })
      const results: DirEntry[] = []
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue
        const fullPath = path.join(dirPath, entry.name)
        let modifiedAt = ''
        try {
          const stat = await fs.stat(fullPath)
          modifiedAt = stat.mtime.toISOString()
        } catch { /* ignore */ }
        results.push({
          name: entry.name,
          path: fullPath,
          type: entry.isDirectory() ? 'directory' : 'file',
          modifiedAt,
        })
      }
      return results.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
        return a.name.localeCompare(b.name)
      })
    } catch {
      return []
    }
  })

  ipcMain.handle('fs:delete', async (_e, targetPath: string): Promise<{ success: boolean; error?: string }> => {
    try {
      await fs.rm(targetPath, { recursive: true, force: true })
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('fs:createFile', async (_e, filePath: string): Promise<{ success: boolean; error?: string }> => {
    try {
      await fs.writeFile(filePath, '', 'utf-8')
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('fs:createDir', async (_e, dirPath: string): Promise<{ success: boolean; error?: string }> => {
    try {
      await fs.mkdir(dirPath, { recursive: true })
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('fs:openInExplorer', async (_e, targetPath: string): Promise<void> => {
    shell.showItemInFolder(targetPath)
  })

  ipcMain.handle('fs:rename', async (_e, oldPath: string, newName: string): Promise<{ success: boolean; newPath?: string; error?: string }> => {
    try {
      const dir = path.dirname(oldPath)
      const newPath = path.join(dir, newName)
      await fs.rename(oldPath, newPath)
      return { success: true, newPath }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })
}
