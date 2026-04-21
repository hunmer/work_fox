import { join } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'

export class PluginStorage {
  private filePath: string
  private data: Record<string, any>

  constructor(pluginId: string, userDataPath: string) {
    const dir = join(userDataPath, 'plugin-data', pluginId)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    this.filePath = join(dir, 'storage.json')
    try {
      this.data = existsSync(this.filePath) ? JSON.parse(readFileSync(this.filePath, 'utf-8')) : {}
    } catch {
      this.data = {}
    }
  }

  async get(key: string): Promise<any> {
    return this.data[key]
  }

  async set(key: string, value: any): Promise<void> {
    this.data[key] = value
    this.save()
  }

  async delete(key: string): Promise<void> {
    delete this.data[key]
    this.save()
  }

  async clear(): Promise<void> {
    this.data = {}
    this.save()
  }

  async keys(): Promise<string[]> {
    return Object.keys(this.data)
  }

  private save(): void {
    writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8')
  }
}

export class PluginConfigStorage {
  private filePath: string
  private data: Record<string, string>

  constructor(pluginId: string, userDataPath: string) {
    const dir = join(userDataPath, 'plugin-data', pluginId)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    this.filePath = join(dir, 'data.json')
    try {
      this.data = existsSync(this.filePath) ? JSON.parse(readFileSync(this.filePath, 'utf-8')) : {}
    } catch {
      this.data = {}
    }
  }

  async get(key: string): Promise<string | undefined> {
    return this.data[key]
  }

  async getAll(): Promise<Record<string, string>> {
    return { ...this.data }
  }

  async set(key: string, value: string): Promise<void> {
    this.data[key] = value
    this.save()
  }

  async setAll(data: Record<string, string>): Promise<void> {
    this.data = { ...data }
    this.save()
  }

  async clear(): Promise<void> {
    this.data = {}
    this.save()
  }

  /** 同步读取（供 Proxy trap 使用） */
  getSync(key: string): string | undefined {
    return this.data[key]
  }

  /** 同步获取所有键（供 Proxy trap 使用） */
  keysSync(): string[] {
    return Object.keys(this.data)
  }

  private save(): void {
    writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8')
  }
}
