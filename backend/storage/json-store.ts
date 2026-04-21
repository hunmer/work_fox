import { dirname } from 'node:path'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'

export class JsonStore<T extends Record<string, any> = Record<string, any>> {
  private data: T

  constructor(
    private filePath: string,
    defaultData: T,
  ) {
    const dir = dirname(filePath)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    try {
      this.data = existsSync(filePath)
        ? JSON.parse(readFileSync(filePath, 'utf-8')) as T
        : { ...defaultData }
    } catch {
      this.data = { ...defaultData }
    }
  }

  get<K extends keyof T>(key: K): T[K] | undefined {
    return this.data[key]
  }

  set<K extends keyof T>(key: K, value: T[K]): void {
    this.data[key] = value
    this.save()
  }

  private save(): void {
    writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8')
  }
}
