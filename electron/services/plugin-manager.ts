import type { BrowserWindow } from 'electron'
import type { PluginInstance, PluginMeta } from './plugin-types'
import { PluginCatalog, type PluginManifestRecord } from './plugin-catalog'
import { PluginRuntimeHost } from './plugin-runtime-host'
import { workflowNodeRegistry } from './workflow-node-registry'

class PluginManager {
  private readonly catalog = new PluginCatalog()
  private readonly runtimeHost = new PluginRuntimeHost()
  private manifests = new Map<string, PluginManifestRecord>()

  loadAll(): void {
    this.manifests.clear()
    for (const manifest of this.catalog.scan()) {
      this.manifests.set(manifest.id, manifest)
      this.runtimeHost.load(manifest)
    }
  }

  setMainWindow(win: BrowserWindow): void {
    this.runtimeHost.setMainWindow(win)
  }

  list(): PluginMeta[] {
    return this.catalog.list(Array.from(this.manifests.values()))
  }

  enable(pluginId: string): void {
    const manifest = this.manifests.get(pluginId)
    if (!manifest || manifest.enabled) return
    manifest.enabled = true
    this.catalog.setEnabled(pluginId, true)
    this.runtimeHost.enable(pluginId)
  }

  disable(pluginId: string): void {
    const manifest = this.manifests.get(pluginId)
    if (!manifest || !manifest.enabled) return
    manifest.enabled = false
    this.catalog.setEnabled(pluginId, false)
    this.runtimeHost.disable(pluginId)
  }

  getPlugin(pluginId: string): PluginInstance | undefined {
    return this.runtimeHost.getPlugin(pluginId)
  }

  getWorkflowNodes(pluginId: string): any[] {
    return workflowNodeRegistry.getPluginNodes(pluginId)
  }

  getAgentTools(pluginIds: string[]): any[] {
    return workflowNodeRegistry.getAgentTools(pluginIds)
  }

  getManifest(pluginId: string): PluginManifestRecord | undefined {
    return this.manifests.get(pluginId)
  }

  getViewContent(pluginId: string): string | null {
    const manifest = this.manifests.get(pluginId)
    if (!manifest) return null
    return this.catalog.getViewContent(manifest)
  }

  getIconBase64(pluginId: string): string | null {
    const manifest = this.manifests.get(pluginId)
    if (!manifest) return null
    return this.catalog.getIconBase64(manifest)
  }

  async importFromZip(): Promise<{ success: boolean; pluginName?: string; error?: string }> {
    const result = await this.catalog.importFromZip(Array.from(this.manifests.values()))
    if (!result.success || !result.manifest) return result

    this.manifests.set(result.manifest.id, result.manifest)
    this.runtimeHost.unload(result.manifest.id)
    this.runtimeHost.load(result.manifest)
    return { success: true, pluginName: result.pluginName }
  }

  openPluginsFolder(): void {
    this.catalog.openPluginsFolder()
  }

  async installFromUrl(url: string): Promise<{ success: boolean; pluginName?: string; error?: string }> {
    const result = await this.catalog.installFromUrl(url, Array.from(this.manifests.values()))
    if (!result.success || !result.manifest) return result

    this.manifests.set(result.manifest.id, result.manifest)
    this.runtimeHost.unload(result.manifest.id)
    this.runtimeHost.load(result.manifest)
    return { success: true, pluginName: result.pluginName }
  }

  async uninstallPlugin(pluginId: string): Promise<{ success: boolean; error?: string }> {
    const manifest = this.manifests.get(pluginId)
    if (!manifest) return { success: false, error: '插件未找到' }

    this.runtimeHost.unload(pluginId)
    const result = this.catalog.uninstall(manifest)
    if (result.success) {
      this.manifests.delete(pluginId)
    }
    return result
  }

  shutdown(): void {
    this.runtimeHost.shutdown()
  }
}

export const pluginManager = new PluginManager()
