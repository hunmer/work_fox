import type { PluginInfo, PluginMeta, RemotePlugin } from '@/types/plugin'

const STORAGE_KEY = 'workfox.web-client-plugins'

interface InstalledWebClientPluginRef {
  id: string
  manifestUrl: string
  enabled: boolean
}

interface WebPluginEntry {
  url: string
  format?: 'esm' | 'cjs'
}

interface WebClientPluginManifest extends PluginInfo {
  runtimeTargets?: Array<'web' | 'electron'>
  iconUrl?: string
  entries?: PluginInfo['entries'] & {
    client?: string | WebPluginEntry
    view?: string | WebPluginEntry
  }
}

interface RuntimeInstance {
  manifest: WebClientPluginManifest
  module: any
  context: Record<string, unknown>
}

function isBrowserRuntime(): boolean {
  return typeof window !== 'undefined' && !navigator.userAgent.includes('Electron')
}

function normalizeEntry(entry?: string | WebPluginEntry): string | null {
  if (!entry) return null
  if (typeof entry === 'string') return entry
  return typeof entry.url === 'string' ? entry.url : null
}

function readInstalledRefs(): InstalledWebClientPluginRef[] {
  if (!isBrowserRuntime()) return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeInstalledRefs(refs: InstalledWebClientPluginRef[]): void {
  if (!isBrowserRuntime()) return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(refs))
}

function createStorage(pluginId: string) {
  return {
    async get(key: string) {
      const raw = window.localStorage.getItem(`workfox.web-plugin.${pluginId}.${key}`)
      return raw ? JSON.parse(raw) : null
    },
    async set(key: string, value: unknown) {
      window.localStorage.setItem(`workfox.web-plugin.${pluginId}.${key}`, JSON.stringify(value))
    },
    async delete(key: string) {
      window.localStorage.removeItem(`workfox.web-plugin.${pluginId}.${key}`)
    },
    async clear() {
      const prefix = `workfox.web-plugin.${pluginId}.`
      const keys = Object.keys(window.localStorage).filter((key) => key.startsWith(prefix))
      keys.forEach((key) => window.localStorage.removeItem(key))
    },
    async keys() {
      const prefix = `workfox.web-plugin.${pluginId}.`
      return Object.keys(window.localStorage)
        .filter((key) => key.startsWith(prefix))
        .map((key) => key.slice(prefix.length))
    },
  }
}

function createEventBus() {
  const listeners = new Map<string, Set<(...args: any[]) => void>>()

  return {
    on(event: string, handler: (...args: any[]) => void) {
      if (!listeners.has(event)) listeners.set(event, new Set())
      listeners.get(event)!.add(handler)
    },
    once(event: string, handler: (...args: any[]) => void) {
      const wrapped = (...args: any[]) => {
        listeners.get(event)?.delete(wrapped)
        handler(...args)
      }
      if (!listeners.has(event)) listeners.set(event, new Set())
      listeners.get(event)!.add(wrapped)
    },
    off(event: string, handler: (...args: any[]) => void) {
      listeners.get(event)?.delete(handler)
    },
    emit(event: string, ...args: any[]) {
      for (const handler of listeners.get(event) || []) {
        handler(...args)
      }
    },
  }
}

class WebClientPluginRuntime {
  private instances = new Map<string, RuntimeInstance>()

  async loadInstalledPlugins(): Promise<PluginMeta[]> {
    if (!isBrowserRuntime()) return []

    const refs = readInstalledRefs()
    const manifests = await Promise.all(refs.map(async (ref) => {
      try {
        const manifest = await this.fetchManifest(ref.manifestUrl)
        if (!this.supportsWeb(manifest)) return null
        return this.toPluginMeta(ref, manifest)
      } catch (error) {
        console.error('[WebClientPluginRuntime] manifest load failed', ref.manifestUrl, error)
        return null
      }
    }))

    return manifests.filter((plugin): plugin is PluginMeta => Boolean(plugin))
  }

  async install(plugin: RemotePlugin, manifestUrl: string): Promise<{ success: boolean; error?: string }> {
    if (!isBrowserRuntime()) {
      return { success: false, error: '仅支持在 Web 端安装 CDN client 插件' }
    }

    const manifest = await this.fetchManifest(manifestUrl)
    if (!this.supportsWeb(manifest)) {
      return { success: false, error: '该插件不支持在 Web 端运行' }
    }

    const refs = readInstalledRefs()
    const next = refs.filter((ref) => ref.id !== plugin.id)
    next.push({
      id: plugin.id,
      manifestUrl,
      enabled: true,
    })
    writeInstalledRefs(next)
    await this.enable(this.toPluginMeta({ id: plugin.id, manifestUrl, enabled: true }, manifest))
    return { success: true }
  }

  async uninstall(pluginId: string): Promise<{ success: boolean; error?: string }> {
    if (!isBrowserRuntime()) {
      return { success: false, error: '仅支持在 Web 端卸载 CDN client 插件' }
    }

    await this.disable(pluginId)
    writeInstalledRefs(readInstalledRefs().filter((ref) => ref.id !== pluginId))
    return { success: true }
  }

  async sync(plugins: PluginMeta[]): Promise<void> {
    if (!isBrowserRuntime()) return

    const desiredIds = new Set(
      plugins
        .filter((plugin) => plugin.runtimeSource === 'client' && plugin.runtimeTransport === 'cdn')
        .map((plugin) => plugin.id),
    )

    for (const plugin of plugins) {
      if (plugin.runtimeSource !== 'client' || plugin.runtimeTransport !== 'cdn') continue
      if (plugin.enabled) await this.enable(plugin)
      else await this.disable(plugin.id)
    }

    for (const [pluginId] of this.instances) {
      if (!desiredIds.has(pluginId)) {
        await this.disable(pluginId)
      }
    }
  }

  async enable(plugin: PluginMeta): Promise<void> {
    if (!isBrowserRuntime()) return
    if (!plugin.manifestUrl) return
    if (this.instances.has(plugin.id)) return

    const manifest = await this.fetchManifest(plugin.manifestUrl)
    const clientUrl = normalizeEntry(manifest.entries?.client)
    if (!clientUrl) return

    const module = await import(/* @vite-ignore */ clientUrl)
    const eventBus = createEventBus()
    const context = {
      plugin: manifest,
      storage: createStorage(plugin.id),
      events: eventBus,
      logger: {
        info: (...args: any[]) => console.log(`[WebPlugin:${plugin.id}]`, ...args),
        warn: (...args: any[]) => console.warn(`[WebPlugin:${plugin.id}]`, ...args),
        error: (...args: any[]) => console.error(`[WebPlugin:${plugin.id}]`, ...args),
      },
      config: {},
    }

    if (typeof module.activate === 'function') {
      await module.activate(context)
    }

    this.instances.set(plugin.id, { manifest, module, context })
    this.updateInstalledEnabled(plugin.id, true)
  }

  async disable(pluginId: string): Promise<void> {
    const instance = this.instances.get(pluginId)
    if (instance?.module && typeof instance.module.deactivate === 'function') {
      await instance.module.deactivate(instance.context)
    }
    this.instances.delete(pluginId)
    this.updateInstalledEnabled(pluginId, false)
  }

  async getViewContent(plugin: PluginMeta): Promise<string | null> {
    if (!plugin.manifestUrl) return null

    const manifest = await this.fetchManifest(plugin.manifestUrl)
    const viewUrl = normalizeEntry(manifest.entries?.view)
    if (!viewUrl) return null

    const response = await fetch(viewUrl)
    if (!response.ok) {
      throw new Error(`Failed to load plugin view: HTTP ${response.status}`)
    }
    return response.text()
  }

  private async fetchManifest(manifestUrl: string): Promise<WebClientPluginManifest> {
    const response = await fetch(manifestUrl)
    if (!response.ok) {
      throw new Error(`Failed to load manifest: HTTP ${response.status}`)
    }

    const manifest = await response.json() as WebClientPluginManifest
    if (!manifest.id || !manifest.name) {
      throw new Error('Invalid web client plugin manifest')
    }
    return manifest
  }

  private supportsWeb(manifest: WebClientPluginManifest): boolean {
    return !manifest.runtimeTargets || manifest.runtimeTargets.includes('web')
  }

  private toPluginMeta(ref: InstalledWebClientPluginRef, manifest: WebClientPluginManifest): PluginMeta {
    return {
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      description: manifest.description,
      author: manifest.author,
      tags: manifest.tags || [],
      hasView: Boolean(normalizeEntry(manifest.entries?.view) || manifest.hasView),
      hasWorkflow: manifest.hasWorkflow || false,
      type: manifest.type,
      enabled: ref.enabled,
      config: manifest.config,
      iconPath: manifest.iconUrl || '',
      runtimeSource: 'client',
      runtimeTransport: 'cdn',
      manifestUrl: ref.manifestUrl,
      clientUrl: normalizeEntry(manifest.entries?.client) || undefined,
      viewUrl: normalizeEntry(manifest.entries?.view) || undefined,
      runtimeTargets: manifest.runtimeTargets,
    }
  }

  private updateInstalledEnabled(pluginId: string, enabled: boolean): void {
    const refs = readInstalledRefs().map((ref) => ref.id === pluginId ? { ...ref, enabled } : ref)
    writeInstalledRefs(refs)
  }
}

export const webClientPluginRuntime = new WebClientPluginRuntime()
