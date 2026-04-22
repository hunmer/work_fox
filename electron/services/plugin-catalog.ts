import { join, basename } from 'path'
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync, renameSync, rmSync } from 'node:fs'
import { app, shell, dialog } from 'electron'
import AdmZip from 'adm-zip'
import type { PluginInfo, PluginMeta } from './plugin-types'
import { resolvePluginEntryFile } from '../../shared/plugin-entry'

export interface PluginManifestRecord {
  id: string
  dir: string
  info: PluginInfo
  enabled: boolean
}

export class PluginCatalog {
  private disabledIds: Set<string> = new Set()
  private readonly userDataPath: string
  private readonly pluginsDir: string

  constructor() {
    this.userDataPath = app.getPath('userData')
    this.pluginsDir = app.isPackaged
      ? join(process.resourcesPath, 'plugins')
      : join(app.getAppPath(), 'resources/plugins')
    this.loadDisabledList()
  }

  getPluginsDir(): string {
    return this.pluginsDir
  }

  scan(): PluginManifestRecord[] {
    if (!existsSync(this.pluginsDir)) return []

    const manifests: PluginManifestRecord[] = []
    const entries = readdirSync(this.pluginsDir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const pluginDir = join(this.pluginsDir, entry.name)
      const manifest = this.readManifest(pluginDir)
      if (manifest) manifests.push(manifest)
    }
    return manifests
  }

  list(records: PluginManifestRecord[]): PluginMeta[] {
    return records.map((record) => this.toPluginMeta(record))
  }

  setEnabled(pluginId: string, enabled: boolean): void {
    if (enabled) this.disabledIds.delete(pluginId)
    else this.disabledIds.add(pluginId)
    this.saveDisabledList()
  }

  getViewContent(record: PluginManifestRecord): string | null {
    if (!record.info.hasView) return null
    const viewPath = join(record.dir, resolvePluginEntryFile(record.info, 'view'))
    if (!existsSync(viewPath)) return null
    try {
      return readFileSync(viewPath, 'utf-8')
    } catch {
      return null
    }
  }

  getIconBase64(record: PluginManifestRecord): string | null {
    const iconPath = join(record.dir, 'icon.png')
    if (!existsSync(iconPath)) return null
    try {
      const buffer = readFileSync(iconPath)
      return `data:image/png;base64,${buffer.toString('base64')}`
    } catch {
      return null
    }
  }

  openPluginsFolder(): void {
    if (!existsSync(this.pluginsDir)) mkdirSync(this.pluginsDir, { recursive: true })
    shell.openPath(this.pluginsDir)
  }

  async importFromZip(existing: PluginManifestRecord[]): Promise<{ success: boolean; pluginName?: string; error?: string; manifest?: PluginManifestRecord }> {
    const result = await dialog.showOpenDialog({
      title: '选择插件 ZIP 文件',
      filters: [{ name: 'ZIP', extensions: ['zip'] }],
      properties: ['openFile'],
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, error: '已取消' }
    }

    return this.installZipFile(result.filePaths[0], existing)
  }

  async installFromUrl(url: string, existing: PluginManifestRecord[]): Promise<{ success: boolean; pluginName?: string; error?: string; manifest?: PluginManifestRecord }> {
    try {
      const { net } = await import('electron')
      const response = await net.fetch(url)
      if (!response.ok) {
        return { success: false, error: `下载失败: HTTP ${response.status}` }
      }

      if (!existsSync(this.pluginsDir)) {
        mkdirSync(this.pluginsDir, { recursive: true })
      }

      const buffer = Buffer.from(await response.arrayBuffer())
      const tmpZipPath = join(this.pluginsDir, `_tmp_${Date.now()}.zip`)
      writeFileSync(tmpZipPath, buffer)

      try {
        return this.installZipFile(tmpZipPath, existing)
      } finally {
        if (existsSync(tmpZipPath)) rmSync(tmpZipPath, { force: true })
      }
    } catch (err: any) {
      return { success: false, error: `安装失败: ${err.message}` }
    }
  }

  uninstall(record: PluginManifestRecord): { success: boolean; error?: string } {
    try {
      rmSync(record.dir, { recursive: true, force: true })
      this.disabledIds.delete(record.id)
      this.saveDisabledList()
      return { success: true }
    } catch (err: any) {
      return { success: false, error: `卸载失败: ${err.message}` }
    }
  }

  private installZipFile(zipPath: string, existing: PluginManifestRecord[]): { success: boolean; pluginName?: string; error?: string; manifest?: PluginManifestRecord } {
    const zipFileName = basename(zipPath, '.zip')

    try {
      const zip = new AdmZip(zipPath)
      const entries = zip.getEntries()
      const infoEntry = entries.find((entry) => !entry.isDirectory && entry.entryName.endsWith('info.json'))
      if (!infoEntry) {
        return { success: false, error: 'ZIP 中未找到 info.json，不是有效的插件包' }
      }

      const relativePath = infoEntry.entryName
      const topDir = relativePath.split('/')[0]
      const pluginDirName = relativePath.includes('/') ? topDir : zipFileName

      if (!existsSync(this.pluginsDir)) {
        mkdirSync(this.pluginsDir, { recursive: true })
      }

      const targetDir = join(this.pluginsDir, pluginDirName)
      const existingPlugin = existing.find((plugin) => plugin.dir === targetDir)
      if (existingPlugin) {
        rmSync(existingPlugin.dir, { recursive: true, force: true })
      }

      zip.extractAllTo(targetDir, true)

      const manifest = this.readManifest(targetDir)
      if (!manifest) {
        rmSync(targetDir, { recursive: true, force: true })
        return { success: false, error: '插件缺少有效的 info.json 或 main 入口，导入失败' }
      }

      const finalDir = this.resolveFinalDir(targetDir, manifest.info.id, existing)
      if (!finalDir) {
        rmSync(targetDir, { recursive: true, force: true })
        return { success: false, error: '插件的 info.json 缺少 id 字段' }
      }

      const finalManifest = this.readManifest(finalDir)
      if (!finalManifest) {
        return { success: false, error: '插件加载失败' }
      }

      return {
        success: true,
        pluginName: finalManifest.info.name,
        manifest: finalManifest,
      }
    } catch (err: any) {
      return { success: false, error: `导入失败: ${err.message}` }
    }
  }

  private resolveFinalDir(extractedDir: string, pluginId: string, existing: PluginManifestRecord[]): string | null {
    if (!pluginId) return null

    const finalDir = join(this.pluginsDir, pluginId)
    if (extractedDir === finalDir) return finalDir

    const existingPlugin = existing.find((plugin) => plugin.dir === finalDir)
    if (existingPlugin && existsSync(existingPlugin.dir)) {
      rmSync(existingPlugin.dir, { recursive: true, force: true })
    }

    if (existsSync(finalDir)) {
      rmSync(finalDir, { recursive: true, force: true })
    }

    renameSync(extractedDir, finalDir)
    return finalDir
  }

  private readManifest(pluginDir: string): PluginManifestRecord | null {
    const infoPath = join(pluginDir, 'info.json')
    if (!existsSync(infoPath)) return null

    const raw = readFileSync(infoPath, 'utf-8')
    const info = JSON.parse(raw) as PluginInfo
    if (info.type === 'server') return null

    const entryKind = info.entries?.client ? 'client' : 'main'
    const mainPath = join(pluginDir, resolvePluginEntryFile(info, entryKind))
    if (!existsSync(mainPath)) return null
    if (!info.id || !info.name || !info.version || !info.description || !info.author?.name) return null

    return {
      id: info.id,
      dir: pluginDir,
      info,
      enabled: !this.disabledIds.has(info.id),
    }
  }

  private toPluginMeta(record: PluginManifestRecord): PluginMeta {
    const iconPath = join(record.dir, 'icon.png')
    return {
      id: record.info.id,
      name: record.info.name,
      version: record.info.version,
      description: record.info.description,
      author: record.info.author,
      tags: record.info.tags || [],
      hasView: record.info.hasView || false,
      hasWorkflow: record.info.hasWorkflow || false,
      type: record.info.type,
      enabled: record.enabled,
      config: record.info.config,
      iconPath: existsSync(iconPath) ? iconPath : '',
    }
  }

  private loadDisabledList(): void {
    const filePath = join(this.userDataPath, 'plugin-data', 'disabled.json')
    try {
      if (existsSync(filePath)) {
        const ids: string[] = JSON.parse(readFileSync(filePath, 'utf-8'))
        this.disabledIds = new Set(ids)
      }
    } catch {
      this.disabledIds = new Set()
    }
  }

  private saveDisabledList(): void {
    const dir = join(this.userDataPath, 'plugin-data')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    const filePath = join(dir, 'disabled.json')
    writeFileSync(filePath, JSON.stringify([...this.disabledIds], null, 2), 'utf-8')
  }
}
