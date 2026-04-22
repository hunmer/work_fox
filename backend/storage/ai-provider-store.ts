import { join } from 'node:path'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import type { AIProviderEntry } from '../../shared/channel-contracts'

export class BackendAIProviderStore {
  private filePath: string
  private cache: AIProviderEntry[] | null = null

  constructor(userDataDir: string) {
    this.filePath = join(userDataDir, 'ai-providers.json')
  }

  async list(): Promise<AIProviderEntry[]> {
    return this.load()
  }

  async create(data: Omit<AIProviderEntry, 'id'>): Promise<AIProviderEntry> {
    const providers = await this.load()
    const entry: AIProviderEntry = { ...data, id: crypto.randomUUID() }
    providers.push(entry)
    await this.save(providers)
    return entry
  }

  async update(id: string, data: Partial<Omit<AIProviderEntry, 'id'>>): Promise<void> {
    const providers = await this.load()
    const idx = providers.findIndex((p) => p.id === id)
    if (idx === -1) throw new Error(`Provider not found: ${id}`)
    providers[idx] = { ...providers[idx], ...data }
    await this.save(providers)
  }

  async delete(id: string): Promise<boolean> {
    const providers = await this.load()
    const idx = providers.findIndex((p) => p.id === id)
    if (idx === -1) return false
    providers.splice(idx, 1)
    await this.save(providers)
    return true
  }

  async get(id: string): Promise<AIProviderEntry | undefined> {
    const providers = await this.load()
    return providers.find((p) => p.id === id)
  }

  private async load(): Promise<AIProviderEntry[]> {
    if (this.cache) return this.cache
    try {
      const raw = await readFile(this.filePath, 'utf-8')
      this.cache = JSON.parse(raw)
      return this.cache!
    } catch {
      this.cache = []
      return []
    }
  }

  private async save(providers: AIProviderEntry[]): Promise<void> {
    await mkdir(join(this.filePath, '..'), { recursive: true })
    await writeFile(this.filePath, JSON.stringify(providers, null, 2), 'utf-8')
    this.cache = providers
  }
}
