const fs = require('fs/promises')
const path = require('path')

module.exports = {
  createApi: () => ({
    writeFile: (filePath, content, encoding = 'utf-8') =>
      fs.writeFile(filePath, content, encoding),

    readFile: (filePath, encoding = 'utf-8') =>
      fs.readFile(filePath, encoding),

    editFile: async (filePath, oldContent, newContent) => {
      const content = await fs.readFile(filePath, 'utf-8')
      if (!content.includes(oldContent)) {
        throw new Error(`文件中未找到要替换的内容`)
      }
      const updated = content.replace(oldContent, newContent)
      await fs.writeFile(filePath, updated, 'utf-8')
      return { replaced: true }
    },

    deleteFile: (filePath) =>
      fs.unlink(filePath),

    listFiles: async (dirPath, options = {}) => {
      const recursive = options.recursive ?? false
      const pattern = options.pattern || null

      if (recursive) {
        const results = []
        const walk = async (dir) => {
          const entries = await fs.readdir(dir, { withFileTypes: true })
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name)
            if (entry.isDirectory()) {
              results.push({ name: entry.name, path: fullPath, type: 'directory' })
              await walk(fullPath)
            } else {
              if (!pattern || matchPattern(entry.name, pattern)) {
                results.push({ name: entry.name, path: fullPath, type: 'file' })
              }
            }
          }
        }
        await walk(dirPath)
        return results
      }

      const entries = await fs.readdir(dirPath, { withFileTypes: true })
      return entries
        .filter(e => !pattern || matchPattern(e.name, pattern))
        .map(e => ({
          name: e.name,
          path: path.join(dirPath, e.name),
          type: e.isDirectory() ? 'directory' : 'file',
        }))
    },

    createDir: (dirPath, options = {}) =>
      fs.mkdir(dirPath, { recursive: options.recursive ?? true }),

    removeDir: (dirPath, options = {}) =>
      fs.rm(dirPath, { recursive: options.recursive ?? false, force: options.force ?? false }),

    stat: async (filePath) => {
      const stat = await fs.stat(filePath)
      return {
        isFile: stat.isFile(),
        isDirectory: stat.isDirectory(),
        size: stat.size,
        createdAt: stat.birthtime.toISOString(),
        modifiedAt: stat.mtime.toISOString(),
      }
    },

    exists: (filePath) =>
      fs.access(filePath).then(() => true).catch(() => false),

    rename: (oldPath, newPath) =>
      fs.rename(oldPath, newPath),

    copyFile: (src, dest) =>
      fs.copyFile(src, dest),
  }),
}

function matchPattern(name, pattern) {
  if (!pattern) return true
  const re = new RegExp(pattern.replace(/\*/g, '.*').replace(/\?/g, '.'))
  return re.test(name)
}
