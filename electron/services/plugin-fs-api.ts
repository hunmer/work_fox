import fs from 'fs/promises'
import path from 'path'
import type { FsApi, ListFilesItem, FileStatResult } from './plugin-types'

function matchPattern(name: string, pattern: string): boolean {
  const re = new RegExp(pattern.replace(/\*/g, '.*').replace(/\?/g, '.'))
  return re.test(name)
}

export function createBuiltinFsApi(): FsApi {
  return {
    writeFile: (filePath, content, encoding = 'utf-8') =>
      fs.writeFile(filePath, content, encoding),

    readFile: (filePath, encoding = 'utf-8') =>
      fs.readFile(filePath, encoding),

    async editFile(filePath, oldContent, newContent) {
      const content = await fs.readFile(filePath, 'utf-8')
      if (!content.includes(oldContent)) {
        throw new Error('文件中未找到要替换的内容')
      }
      await fs.writeFile(filePath, content.replace(oldContent, newContent), 'utf-8')
      return { replaced: true }
    },

    deleteFile: (filePath) => fs.unlink(filePath),

    async listFiles(dirPath, options = {}): Promise<ListFilesItem[]> {
      const recursive = options.recursive ?? false
      const pattern = options.pattern || null
      if (recursive) {
        const results: ListFilesItem[] = []
        const walk = async (dir: string) => {
          const entries = await fs.readdir(dir, { withFileTypes: true })
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name)
            if (entry.isDirectory()) {
              results.push({ name: entry.name, path: fullPath, type: 'directory' })
              await walk(fullPath)
            } else if (!pattern || matchPattern(entry.name, pattern)) {
              results.push({ name: entry.name, path: fullPath, type: 'file' })
            }
          }
        }
        await walk(dirPath)
        return results
      }
      const entries = await fs.readdir(dirPath, { withFileTypes: true })
      return entries
        .filter(e => !pattern || matchPattern(e.name, pattern))
        .map(e => ({ name: e.name, path: path.join(dirPath, e.name), type: (e.isDirectory() ? 'directory' : 'file') as 'file' | 'directory' }))
    },

    createDir: (dirPath, options = {}) =>
      fs.mkdir(dirPath, { recursive: options.recursive ?? true }),

    removeDir: (dirPath, options = {}) =>
      fs.rm(dirPath, { recursive: options.recursive ?? false, force: options.force ?? false }),

    async stat(filePath): Promise<FileStatResult> {
      const s = await fs.stat(filePath)
      return {
        isFile: s.isFile(),
        isDirectory: s.isDirectory(),
        size: s.size,
        createdAt: s.birthtime.toISOString(),
        modifiedAt: s.mtime.toISOString(),
      }
    },

    exists: (filePath) => fs.access(filePath).then(() => true).catch(() => false),

    rename: (oldPath, newPath) => fs.rename(oldPath, newPath),

    copyFile: (src, dest) => fs.copyFile(src, dest),
  }
}
