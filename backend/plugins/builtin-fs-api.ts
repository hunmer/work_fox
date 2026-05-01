import fs from 'node:fs/promises'
import path from 'node:path'

function matchPattern(name: string, pattern: string): boolean {
  const re = new RegExp(pattern.replace(/\*/g, '.*').replace(/\?/g, '.'))
  return re.test(name)
}

export function createBuiltinFsApi() {
  return {
    async writeFile(filePath: string, content: string, encoding = 'utf-8') {
      await fs.mkdir(path.dirname(filePath), { recursive: true })
      return fs.writeFile(filePath, content, encoding as BufferEncoding)
    },

    async writeBinaryFile(filePath: string, data: Buffer) {
      await fs.mkdir(path.dirname(filePath), { recursive: true })
      const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data)
      return fs.writeFile(filePath, buffer)
    },

    readFile(filePath: string, encoding = 'utf-8') {
      return fs.readFile(filePath, encoding as BufferEncoding)
    },

    async editFile(filePath: string, oldContent: string, newContent: string) {
      const content = await fs.readFile(filePath, 'utf-8')
      if (!content.includes(oldContent)) {
        throw new Error('文件中未找到要替换的内容')
      }
      await fs.writeFile(filePath, content.replace(oldContent, newContent), 'utf-8')
      return { replaced: true }
    },

    deleteFile(filePath: string) {
      return fs.unlink(filePath)
    },

    async listFiles(dirPath: string, options: { recursive?: boolean; pattern?: string } = {}) {
      const recursive = options.recursive ?? false
      const pattern = options.pattern || null
      if (recursive) {
        const results: Array<{ name: string; path: string; type: 'file' | 'directory' }> = []
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
        .filter((entry) => !pattern || matchPattern(entry.name, pattern))
        .map((entry) => ({
          name: entry.name,
          path: path.join(dirPath, entry.name),
          type: (entry.isDirectory() ? 'directory' : 'file') as 'file' | 'directory',
        }))
    },

    createDir(dirPath: string, options: { recursive?: boolean } = {}) {
      return fs.mkdir(dirPath, { recursive: options.recursive ?? true })
    },

    removeDir(dirPath: string, options: { recursive?: boolean; force?: boolean } = {}) {
      return fs.rm(dirPath, {
        recursive: options.recursive ?? false,
        force: options.force ?? false,
      })
    },

    async stat(filePath: string) {
      const result = await fs.stat(filePath)
      return {
        isFile: result.isFile(),
        isDirectory: result.isDirectory(),
        size: result.size,
        createdAt: result.birthtime.toISOString(),
        modifiedAt: result.mtime.toISOString(),
      }
    },

    exists(filePath: string) {
      return fs.access(filePath).then(() => true).catch(() => false)
    },

    rename(oldPath: string, newPath: string) {
      return fs.rename(oldPath, newPath)
    },

    async copyFile(src: string, dest: string) {
      await fs.mkdir(path.dirname(dest), { recursive: true })
      return fs.copyFile(src, dest)
    },
  }
}
