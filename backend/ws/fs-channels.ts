import { readdir, stat, rm, mkdir, writeFile, rename as fsRename } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { WSRouter } from './router'

export function registerFsChannels(router: WSRouter): void {
  router.register('fs:listDir', async ({ dirPath }) => {
    const entries = await readdir(dirPath)
    const results: Array<{ name: string; path: string; type: 'file' | 'directory'; modifiedAt: string }> = []
    for (const name of entries) {
      const fullPath = join(dirPath, name)
      let s: Awaited<ReturnType<typeof stat>>
      try {
        s = await stat(fullPath)
      } catch {
        continue
      }
      results.push({
        name,
        path: fullPath,
        type: s.isDirectory() ? 'directory' : 'file',
        modifiedAt: s.mtime.toISOString(),
      })
    }
    return results
  })

  router.register('fs:delete', async ({ targetPath }) => {
    try {
      await rm(targetPath, { recursive: true, force: true })
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err?.message ?? String(err) }
    }
  })

  router.register('fs:createFile', async ({ filePath }) => {
    try {
      await mkdir(dirname(filePath), { recursive: true })
      await writeFile(filePath, '', 'utf-8')
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err?.message ?? String(err) }
    }
  })

  router.register('fs:createDir', async ({ dirPath }) => {
    try {
      await mkdir(dirPath, { recursive: true })
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err?.message ?? String(err) }
    }
  })

  router.register('fs:rename', async ({ oldPath, newName }) => {
    try {
      const newPath = join(dirname(oldPath), newName)
      await fsRename(oldPath, newPath)
      return { success: true, newPath }
    } catch (err: any) {
      return { success: false, error: err?.message ?? String(err) }
    }
  })
}
