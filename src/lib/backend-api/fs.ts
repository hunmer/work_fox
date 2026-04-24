import { wsBridge } from '@/lib/ws-bridge'

export interface FsEntry {
  name: string
  path: string
  type: 'file' | 'directory'
  modifiedAt: string
}

export const fsApi = {
  listDir(dirPath: string): Promise<FsEntry[]> {
    return wsBridge.invoke('fs:listDir', { dirPath })
  },

  delete(targetPath: string): Promise<{ success: boolean; error?: string }> {
    return wsBridge.invoke('fs:delete', { targetPath })
  },

  createFile(filePath: string): Promise<{ success: boolean; error?: string }> {
    return wsBridge.invoke('fs:createFile', { filePath })
  },

  createDir(dirPath: string): Promise<{ success: boolean; error?: string }> {
    return wsBridge.invoke('fs:createDir', { dirPath })
  },

  rename(oldPath: string, newName: string): Promise<{ success: boolean; newPath?: string; error?: string }> {
    return wsBridge.invoke('fs:rename', { oldPath, newName })
  },
}
