import { join, basename } from 'path'
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync, renameSync, rmSync } from 'node:fs'
import { app, BrowserWindow, shell, dialog } from 'electron'
import AdmZip from 'adm-zip'
import { pluginEventBus } from './plugin-event-bus'
import { PluginStorage } from './plugin-storage'
import { createPluginContext } from './plugin-context'
import type { PluginInfo, PluginMeta, PluginInstance } from './plugin-types'

class PluginManager {
  private plugins: Map<string, PluginInstance> = new Map()
  private disabledIds: Set<string> = new Set()
  private userDataPath: string
  private pluginsDir: string
  private mainWindow: BrowserWindow | null = null

  constructor() {
    this.userDataPath = app.getPath('userData')
    this.pluginsDir = app.isPackaged
      ? join(this.userDataPath, 'plugins')
      : join(__dirname, '../../resources/plugins')
    this.loadDisabledList()
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

  loadAll(): void {
    if (!existsSync(this.pluginsDir)) return
    const entries = readdirSync(this.pluginsDir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const pluginDir = join(this.pluginsDir, entry.name)
      try {
        this.load(pluginDir)
      } catch (err) {
        console.error(`[PluginManager] 加载插件失败: ${pluginDir}`, err)
      }
    }
  }

  setMainWindow(win: BrowserWindow): void {
    this.mainWindow = win
  }

  load(pluginDir: string): void {
    const infoPath = join(pluginDir, 'info.json')
    const mainPath = join(pluginDir, 'main.js')
    if (!existsSync(infoPath) || !existsSync(mainPath)) return

    const raw = readFileSync(infoPath, 'utf-8')
    const info: PluginInfo = JSON.parse(raw)

    if (!info.id || !info.name || !info.version || !info.description || !info.author?.name) {
      throw new Error(`插件 ${pluginDir} 的 info.json 缺少必需字段`)
    }

    if (this.plugins.has(info.id)) {
      console.warn(`[PluginManager] 插件 ${info.id} 已加载，跳过`)
      return
    }

    if (info.minAppVersion) {
      const appVersion = app.getVersion()
      if (appVersion < info.minAppVersion) {
        console.warn(
          `[PluginManager] 插件 ${info.name} 要求最低版本 ${info.minAppVersion}，当前 ${appVersion}`
        )
        return
      }
    }

    const storage = new PluginStorage(info.id, this.userDataPath)
    const { context, cleanupEvents } = createPluginContext(info, storage, pluginEventBus, () => this.mainWindow, !!info.hasWorkflow)
    const isDisabled = this.disabledIds.has(info.id)
    const pluginModule = require(mainPath)

    const instance: PluginInstance = {
      id: info.id,
      dir: pluginDir,
      info,
      enabled: !isDisabled,
      module: pluginModule,
      context,
      storage,
      cleanupEvents
    }

    // 加载 workflow.js（如果有）
    if (info.hasWorkflow) {
      const workflowPath = join(pluginDir, 'workflow.js')
      if (existsSync(workflowPath)) {
        try {
          const workflowModule = require(workflowPath)
          if (workflowModule?.nodes) {
            const { workflowNodeRegistry } = require('./workflow-node-registry')
            workflowNodeRegistry.register(info.id, workflowModule)
          }
        } catch (err) {
          console.error(`[PluginManager] 插件 ${info.name} 的 workflow.js 加载失败:`, err)
        }
      }
    }

    this.plugins.set(info.id, instance)

    if (!isDisabled && typeof pluginModule.activate === 'function') {
      try {
        pluginModule.activate(context)
        console.log(`[PluginManager] 插件已激活: ${info.name} v${info.version}`)
      } catch (err) {
        console.error(`[PluginManager] 插件激活失败: ${info.name}`, err)
      }
    }
  }

  unload(pluginId: string): void {
    const instance = this.plugins.get(pluginId)
    if (!instance) return
    if (instance.enabled && typeof instance.module.deactivate === 'function') {
      try {
        instance.module.deactivate(instance.context)
      } catch (err) {
        console.error(`[PluginManager] 插件停用失败: ${instance.info.name}`, err)
      }
    }
    // 注销工作流节点
    if (instance.info.hasWorkflow) {
      const { workflowNodeRegistry } = require('./workflow-node-registry')
      workflowNodeRegistry.unregister(pluginId)
    }
    instance.cleanupEvents()
    this.plugins.delete(pluginId)
    console.log(`[PluginManager] 插件已卸载: ${instance.info.name}`)
  }

  enable(pluginId: string): void {
    const instance = this.plugins.get(pluginId)
    if (!instance || instance.enabled) return
    if (typeof instance.module.activate === 'function') {
      try {
        instance.module.activate(instance.context)
      } catch (err) {
        console.error(`[PluginManager] 插件激活失败: ${instance.info.name}`, err)
        return
      }
    }
    instance.enabled = true
    this.disabledIds.delete(pluginId)
    this.saveDisabledList()
  }

  disable(pluginId: string): void {
    const instance = this.plugins.get(pluginId)
    if (!instance || !instance.enabled) return
    if (typeof instance.module.deactivate === 'function') {
      try {
        instance.module.deactivate(instance.context)
      } catch (err) {
        console.error(`[PluginManager] 插件停用失败: ${instance.info.name}`, err)
      }
    }
    instance.cleanupEvents()
    instance.enabled = false
    this.disabledIds.add(pluginId)
    this.saveDisabledList()
  }

  list(): PluginMeta[] {
    return Array.from(this.plugins.values()).map((instance) => ({
      id: instance.info.id,
      name: instance.info.name,
      version: instance.info.version,
      description: instance.info.description,
      author: instance.info.author,
      tags: instance.info.tags || [],
      hasView: instance.info.hasView || false,
      enabled: instance.enabled,
      iconPath: this.getIconPath(instance)
    }))
  }

  private getIconPath(instance: PluginInstance): string {
    const iconPath = join(instance.dir, 'icon.png')
    return existsSync(iconPath) ? iconPath : ''
  }

  getViewContent(pluginId: string): string | null {
    const instance = this.plugins.get(pluginId)
    if (!instance || !instance.info.hasView) return null
    const viewPath = join(instance.dir, 'view.js')
    if (!existsSync(viewPath)) return null
    try {
      return readFileSync(viewPath, 'utf-8')
    } catch {
      return null
    }
  }

  getIconBase64(pluginId: string): string | null {
    const instance = this.plugins.get(pluginId)
    if (!instance) return null
    const iconPath = join(instance.dir, 'icon.png')
    if (!existsSync(iconPath)) return null
    try {
      const buffer = readFileSync(iconPath)
      return `data:image/png;base64,${buffer.toString('base64')}`
    } catch {
      return null
    }
  }

  private resolveFinalDir(extractedDir: string, infoPath: string): string | null {
    const raw = readFileSync(infoPath, 'utf-8')
    const info = JSON.parse(raw)
    if (!info.id) return null

    const finalDir = join(this.pluginsDir, info.id)
    if (extractedDir === finalDir) return finalDir

    const existing = Array.from(this.plugins.values()).find((p) => p.dir === finalDir)
    if (existing) this.unload(existing.id)

    if (existsSync(finalDir)) rmSync(finalDir, { recursive: true, force: true })
    renameSync(extractedDir, finalDir)
    return finalDir
  }

  async importFromZip(): Promise<{ success: boolean; pluginName?: string; error?: string }> {
    const result = await dialog.showOpenDialog({
      title: '选择插件 ZIP 文件',
      filters: [{ name: 'ZIP', extensions: ['zip'] }],
      properties: ['openFile']
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, error: '已取消' }
    }

    const zipPath = result.filePaths[0]
    const zipFileName = basename(zipPath, '.zip')

    try {
      const zip = new AdmZip(zipPath)
      const entries = zip.getEntries()

      const infoEntry = entries.find((e) => !e.isDirectory && e.entryName.endsWith('info.json'))
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

      const existingPlugin = Array.from(this.plugins.values()).find((p) => p.dir === targetDir)
      if (existingPlugin) {
        this.unload(existingPlugin.id)
      }

      zip.extractAllTo(targetDir, true)

      const infoPath = join(targetDir, 'info.json')
      const mainPath = join(targetDir, 'main.js')
      if (!existsSync(infoPath) || !existsSync(mainPath)) {
        rmSync(targetDir, { recursive: true, force: true })
        return { success: false, error: '插件缺少 info.json 或 main.js，导入失败' }
      }

      const finalDir = this.resolveFinalDir(targetDir, infoPath)
      if (!finalDir) {
        rmSync(targetDir, { recursive: true, force: true })
        return { success: false, error: '插件的 info.json 缺少 id 字段' }
      }

      this.load(finalDir)

      const instance = Array.from(this.plugins.values()).find((p) => p.dir === finalDir)
      if (!instance) {
        return { success: false, error: '插件加载失败' }
      }

      return { success: true, pluginName: instance.info.name }
    } catch (err: any) {
      return { success: false, error: `导入失败: ${err.message}` }
    }
  }

  openPluginsFolder(): void {
    const dir = this.pluginsDir
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    shell.openPath(dir)
  }

  async installFromUrl(url: string): Promise<{ success: boolean; pluginName?: string; error?: string }> {
    try {
      const { net } = await import('electron')
      const response = await net.fetch(url)
      if (!response.ok) {
        return { success: false, error: `下载失败: HTTP ${response.status}` }
      }
      const arrayBuffer = await response.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)

      if (!existsSync(this.pluginsDir)) {
        mkdirSync(this.pluginsDir, { recursive: true })
      }

      const tmpZipPath = join(this.pluginsDir, `_tmp_${Date.now()}.zip`)
      writeFileSync(tmpZipPath, buffer)

      try {
        const zip = new AdmZip(tmpZipPath)
        const entries = zip.getEntries()
        const infoEntry = entries.find((e) => !e.isDirectory && e.entryName.endsWith('info.json'))
        if (!infoEntry) {
          return { success: false, error: 'ZIP 中未找到 info.json，不是有效的插件包' }
        }

        const relativePath = infoEntry.entryName
        const topDir = relativePath.split('/')[0]
        const pluginDirName = relativePath.includes('/') ? topDir : `plugin-${Date.now()}`

        const targetDir = join(this.pluginsDir, pluginDirName)

        const existingPlugin = Array.from(this.plugins.values()).find((p) => p.dir === targetDir)
        if (existingPlugin) {
          this.unload(existingPlugin.id)
        }

        zip.extractAllTo(targetDir, true)

        const infoPath = join(targetDir, 'info.json')
        const mainPath = join(targetDir, 'main.js')
        if (!existsSync(infoPath) || !existsSync(mainPath)) {
          rmSync(targetDir, { recursive: true, force: true })
          return { success: false, error: '插件缺少 info.json 或 main.js，安装失败' }
        }

        const finalDir = this.resolveFinalDir(targetDir, infoPath)
        if (!finalDir) {
          rmSync(targetDir, { recursive: true, force: true })
          return { success: false, error: '插件的 info.json 缺少 id 字段' }
        }

        this.load(finalDir)
        const instance = Array.from(this.plugins.values()).find((p) => p.dir === finalDir)
        if (!instance) {
          return { success: false, error: '插件加载失败' }
        }

        return { success: true, pluginName: instance.info.name }
      } finally {
        if (existsSync(tmpZipPath)) {
          rmSync(tmpZipPath, { force: true })
        }
      }
    } catch (err: any) {
      return { success: false, error: `安装失败: ${err.message}` }
    }
  }

  async uninstallPlugin(pluginId: string): Promise<{ success: boolean; error?: string }> {
    const instance = this.plugins.get(pluginId)
    if (!instance) {
      return { success: false, error: '插件未找到' }
    }
    try {
      this.unload(pluginId)
      rmSync(instance.dir, { recursive: true, force: true })
      return { success: true }
    } catch (err: any) {
      return { success: false, error: `卸载失败: ${err.message}` }
    }
  }

  shutdown(): void {
    for (const [id] of this.plugins) {
      this.unload(id)
    }
  }
}

export const pluginManager = new PluginManager()
