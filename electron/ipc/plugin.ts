import { ipcMain } from 'electron'
import { pluginManager } from '../services/plugin-manager'
import { workflowNodeRegistry } from '../services/workflow-node-registry'

export function registerPluginIpcHandlers(): void {
  ipcMain.handle('plugin:list', () => {
    return pluginManager.list()
  })

  ipcMain.handle('plugin:enable', (_e, pluginId: string) => {
    pluginManager.enable(pluginId)
  })

  ipcMain.handle('plugin:disable', (_e, pluginId: string) => {
    pluginManager.disable(pluginId)
  })

  ipcMain.handle('plugin:get-view', (_e, pluginId: string) => {
    return pluginManager.getViewContent(pluginId)
  })

  ipcMain.handle('plugin:get-icon', (_e, pluginId: string) => {
    return pluginManager.getIconBase64(pluginId)
  })

  ipcMain.handle('plugin:import-zip', async () => {
    return pluginManager.importFromZip()
  })

  ipcMain.handle('plugin:open-folder', () => {
    pluginManager.openPluginsFolder()
  })

  ipcMain.handle('plugin:install', async (_e, url: string) => {
    return pluginManager.installFromUrl(url)
  })

  ipcMain.handle('plugin:uninstall', async (_e, pluginId: string) => {
    return pluginManager.uninstallPlugin(pluginId)
  })

  ipcMain.handle('plugin:get-workflow-nodes', (_e, pluginId: string) => {
    return workflowNodeRegistry.getPluginNodes(pluginId)
  })

  ipcMain.handle('plugin:list-workflow-plugins', () => {
    const allPluginMeta = pluginManager.list()
    const workflowPlugins = allPluginMeta.filter((p) => {
      return workflowNodeRegistry.getPluginNodes(p.id).length > 0
    })
    return workflowPlugins.map((p) => ({
      ...p,
      nodeCount: workflowNodeRegistry.getPluginNodes(p.id).length,
    }))
  })

  ipcMain.handle('plugin:get-agent-tools', (_e, pluginIds: string[]) => {
    return workflowNodeRegistry.getAgentTools(pluginIds)
  })

  ipcMain.handle('plugin:get-config', async (_e, pluginId: string) => {
    const manifest = pluginManager.getManifest(pluginId)
    const instance = pluginManager.getPlugin(pluginId)
    const configFields = manifest?.info.config || instance?.info.config || []
    if (!configFields.length) return {}
    const userValues = instance?.configStorage ? await instance.configStorage.getAll() : {}
    // Merge: user values take priority, otherwise use info.json defaults
    const merged: Record<string, string> = {}
    for (const field of configFields) {
      merged[field.key] = userValues[field.key] ?? field.value
    }
    return merged
  })

  ipcMain.handle('plugin:save-config', async (_e, pluginId: string, data: Record<string, string>) => {
    const instance = pluginManager.getPlugin(pluginId)
    const manifest = pluginManager.getManifest(pluginId)
    if (!manifest) return { success: false, error: '插件未找到' }
    if (!instance) return { success: false, error: '插件未找到' }
    if (!instance.configStorage) return { success: false, error: '插件无配置定义' }
    await instance.configStorage.setAll(data)
    return { success: true }
  })
}
