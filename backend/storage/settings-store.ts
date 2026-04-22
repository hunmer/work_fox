import { join } from 'node:path'
import { readFile, writeFile, mkdir } from 'node:fs/promises'

export class BackendSettingsStore<T = unknown> {
  private filePath: string
  private cache: T | null = null

  constructor(userDataDir: string, filename: string) {
    this.filePath = join(userDataDir, filename)
  }

  async get(): Promise<T> {
    if (this.cache !== null) return this.cache
    try {
      const raw = await readFile(this.filePath, 'utf-8')
      this.cache = JSON.parse(raw) as T
      return this.cache!
    } catch {
      return {} as T
    }
  }

  async set(data: T): Promise<T> {
    await mkdir(join(this.filePath, '..'), { recursive: true })
    await writeFile(this.filePath, JSON.stringify(data, null, 2), 'utf-8')
    this.cache = data
    return data
  }
}
