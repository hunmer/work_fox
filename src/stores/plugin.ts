import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { PluginMeta } from '@/types/plugin'
import { createPluginDomainApi } from '@/lib/backend-api/plugin-domain'
import { createWorkflowDomainApi } from '@/lib/backend-api/workflow-domain'
import { webClientPluginRuntime } from '@/lib/plugins/web-client-runtime'
import { wsBridge } from '@/lib/ws-bridge'

export const usePluginStore = defineStore('plugin', () => {
  const isElectronRuntime = navigator.userAgent.includes('Electron')
  const pluginApi = () => createPluginDomainApi()
  const workflowApi = () => createWorkflowDomainApi()
  const plugins = ref<PluginMeta[]>([])
  const isLoading = ref(false)
  const activeViewPluginId = ref<string | null>(null)
  const viewContents = ref<Record<string, string>>({})

  const enabledPlugins = computed(() => plugins.value.filter((p) => p.enabled))
  const disabledPlugins = computed(() => plugins.value.filter((p) => !p.enabled))

  async function init(): Promise<void> {
    isLoading.value = true
    try {
      const api = pluginApi()
      const [serverPlugins, clientPlugins] = await Promise.all([
        api.list(),
        isElectronRuntime ? api.listLocal() : webClientPluginRuntime.loadInstalledPlugins(),
      ])

      const merged = new Map<string, PluginMeta>()

      for (const plugin of serverPlugins as PluginMeta[]) {
        merged.set(plugin.id, {
          ...plugin,
          iconPath: plugin.iconPath || '',
          runtimeSource: 'server',
          runtimeTransport: 'local',
        })
      }

      for (const plugin of clientPlugins as PluginMeta[]) {
        const existing = merged.get(plugin.id)
        if (!existing) {
          merged.set(plugin.id, {
            ...plugin,
            iconPath: plugin.iconPath || '',
            runtimeSource: 'client',
            runtimeTransport: plugin.runtimeTransport || (isElectronRuntime ? 'local' : 'cdn'),
          })
          continue
        }

        merged.set(plugin.id, {
          ...existing,
          ...plugin,
          tags: Array.from(new Set([...(existing.tags || []), ...(plugin.tags || [])])),
          hasView: existing.hasView || plugin.hasView,
          hasWorkflow: existing.hasWorkflow || plugin.hasWorkflow,
          enabled: existing.enabled && plugin.enabled,
          config: existing.config?.length ? existing.config : plugin.config,
          iconPath: plugin.iconPath || existing.iconPath || '',
          runtimeSource: 'hybrid',
          runtimeTransport: existing.runtimeTransport || plugin.runtimeTransport || 'local',
        })
      }

      plugins.value = Array.from(merged.values())
      if (!isElectronRuntime) {
        await webClientPluginRuntime.sync(plugins.value)
      }
      await registerClientCapabilities()
    } finally {
      isLoading.value = false
    }
  }

  async function registerClientCapabilities(): Promise<void> {
    if (!wsBridge.isConnected()) return
    const clientPlugins = plugins.value.filter((plugin) => plugin.enabled && (plugin.runtimeSource === 'client' || plugin.runtimeSource === 'hybrid'))
    const nodeGroups = await Promise.all(clientPlugins.map(async (plugin) => {
      try {
        return await getWorkflowNodes(plugin.id)
      } catch {
        return []
      }
    }))
    const toolGroups = await Promise.all(clientPlugins.map(async (plugin) => {
      try {
        return await getAgentTools([plugin.id])
      } catch {
        return []
      }
    }))
    await wsBridge.invoke('chat:register-client-nodes', { nodes: nodeGroups.flat() as any[] })
    await wsBridge.invoke('chat:register-client-agent-tools', { tools: toolGroups.flat() as any[] })
  }

  async function enablePlugin(pluginId: string): Promise<void> {
    const plugin = plugins.value.find((p) => p.id === pluginId)
    if (!plugin) return

    const api = pluginApi()
    if (plugin.runtimeSource === 'server' || plugin.runtimeSource === 'hybrid') {
      await api.enable(pluginId)
    }
    if (plugin.runtimeSource === 'client' || plugin.runtimeSource === 'hybrid') {
      if (!isElectronRuntime && plugin.runtimeTransport === 'cdn') {
        await webClientPluginRuntime.enable(plugin)
      }
      else {
      await api.enableLocal(pluginId)
      }
    }
    plugin.enabled = true
    await registerClientCapabilities()
  }

  async function disablePlugin(pluginId: string): Promise<void> {
    const plugin = plugins.value.find((p) => p.id === pluginId)
    if (!plugin) return

    const api = pluginApi()
    if (plugin.runtimeSource === 'server' || plugin.runtimeSource === 'hybrid') {
      await api.disable(pluginId)
    }
    if (plugin.runtimeSource === 'client' || plugin.runtimeSource === 'hybrid') {
      if (!isElectronRuntime && plugin.runtimeTransport === 'cdn') {
        await webClientPluginRuntime.disable(pluginId)
      }
      else {
      await api.disableLocal(pluginId)
      }
    }
    plugin.enabled = false
    if (activeViewPluginId.value === pluginId) {
      activeViewPluginId.value = null
    }
    await registerClientCapabilities()
  }

  async function loadViewContent(pluginId: string): Promise<string | null> {
    if (viewContents.value[pluginId]) return viewContents.value[pluginId]
    const plugin = plugins.value.find((p) => p.id === pluginId)
    if (!plugin) return null

    const content = (!isElectronRuntime && plugin.runtimeTransport === 'cdn')
      ? await webClientPluginRuntime.getViewContent(plugin)
      : await pluginApi().getView(pluginId)
    if (content) {
      viewContents.value[pluginId] = content
    }
    return content
  }

  async function loadIcon(pluginId: string): Promise<string | null> {
    return pluginApi().getIcon(pluginId)
  }

  function openView(pluginId: string): void {
    activeViewPluginId.value = pluginId
  }

  function closeView(): void {
    activeViewPluginId.value = null
  }

  async function importPlugin(): Promise<{ success: boolean; pluginName?: string; error?: string }> {
    const result = await pluginApi().importZip()
    if (result.success) {
      await init()
      await registerClientCapabilities()
    }
    return result
  }

  async function openPluginsFolder(): Promise<void> {
    await pluginApi().openFolder()
  }

  async function installRemotePlugin(plugin: any, manifestUrl?: string): Promise<{ success: boolean; pluginName?: string; error?: string }> {
    if (!isElectronRuntime && plugin.type === 'client') {
      if (!manifestUrl) {
        return { success: false, error: '缺少 Web client plugin manifestUrl' }
      }
      const result = await webClientPluginRuntime.install(plugin, manifestUrl)
      if (result.success) {
        await init()
        await registerClientCapabilities()
      }
      return {
        ...result,
        pluginName: plugin.name,
      }
    }

    const result = await pluginApi().install(plugin.downloadUrl)
    if (result.success) {
      await init()
      await registerClientCapabilities()
    }
    return result
  }

  async function uninstallRemotePlugin(pluginId: string, runtimeTransport?: PluginMeta['runtimeTransport']): Promise<{ success: boolean; error?: string }> {
    const result = (!isElectronRuntime && runtimeTransport === 'cdn')
      ? await webClientPluginRuntime.uninstall(pluginId)
      : await pluginApi().uninstall(pluginId)
    if (result.success) {
      await init()
      await registerClientCapabilities()
    }
    return result
  }

  async function getWorkflowNodes(pluginId: string): Promise<any[]> {
    const result = await pluginApi().getWorkflowNodes(pluginId)
    return Array.isArray(result?.nodes) ? result.nodes : []
  }

  async function listWorkflowPlugins(): Promise<any[]> {
    return pluginApi().listWorkflowPlugins()
  }

  async function getAgentTools(pluginIds: string[]): Promise<any[]> {
    return pluginApi().getAgentTools(pluginIds)
  }

  async function getPluginConfig(pluginId: string): Promise<Record<string, string>> {
    return pluginApi().getConfig(pluginId)
  }

  async function savePluginConfig(pluginId: string, data: Record<string, string>): Promise<{ success: boolean; error?: string }> {
    return pluginApi().saveConfig(pluginId, data)
  }

  async function listPluginSchemes(workflowId: string, pluginId: string): Promise<string[]> {
    return workflowApi().workflow.listPluginSchemes(workflowId, pluginId)
  }

  async function createPluginScheme(workflowId: string, pluginId: string, schemeName: string): Promise<void> {
    return workflowApi().workflow.createPluginScheme(workflowId, pluginId, schemeName)
  }

  async function deletePluginScheme(workflowId: string, pluginId: string, schemeName: string): Promise<void> {
    return workflowApi().workflow.deletePluginScheme(workflowId, pluginId, schemeName)
  }

  async function readPluginScheme(workflowId: string, pluginId: string, schemeName: string): Promise<Record<string, string>> {
    return workflowApi().workflow.readPluginScheme(workflowId, pluginId, schemeName)
  }

  async function savePluginScheme(workflowId: string, pluginId: string, schemeName: string, data: Record<string, string>): Promise<void> {
    return workflowApi().workflow.savePluginScheme(workflowId, pluginId, schemeName, data)
  }

  return {
    plugins,
    isLoading,
    activeViewPluginId,
    viewContents,
    enabledPlugins,
    disabledPlugins,
    init,
    enablePlugin,
    disablePlugin,
    loadViewContent,
    loadIcon,
    openView,
    closeView,
    importPlugin,
    openPluginsFolder,
    installRemotePlugin,
    uninstallRemotePlugin,
    getWorkflowNodes,
    listWorkflowPlugins,
    getAgentTools,
    getPluginConfig,
    savePluginConfig,
    listPluginSchemes,
    createPluginScheme,
    deletePluginScheme,
    readPluginScheme,
    savePluginScheme,
    registerClientCapabilities,
  }
})
