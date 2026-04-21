import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { PluginMeta } from '@/types/plugin'
import { createPluginDomainApi } from '@/lib/backend-api/plugin-domain'
import { createWorkflowDomainApi } from '@/lib/backend-api/workflow-domain'

export const usePluginStore = defineStore('plugin', () => {
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
      plugins.value = await pluginApi().list()
    } finally {
      isLoading.value = false
    }
  }

  async function enablePlugin(pluginId: string): Promise<void> {
    await pluginApi().enable(pluginId)
    const plugin = plugins.value.find((p) => p.id === pluginId)
    if (plugin) plugin.enabled = true
  }

  async function disablePlugin(pluginId: string): Promise<void> {
    await pluginApi().disable(pluginId)
    const plugin = plugins.value.find((p) => p.id === pluginId)
    if (plugin) plugin.enabled = false
    if (activeViewPluginId.value === pluginId) {
      activeViewPluginId.value = null
    }
  }

  async function loadViewContent(pluginId: string): Promise<string | null> {
    if (viewContents.value[pluginId]) return viewContents.value[pluginId]
    const content = await pluginApi().getView(pluginId)
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
    }
    return result
  }

  async function openPluginsFolder(): Promise<void> {
    await pluginApi().openFolder()
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
    getWorkflowNodes,
    listWorkflowPlugins,
    getAgentTools,
    getPluginConfig,
    savePluginConfig,
    listPluginSchemes,
    createPluginScheme,
    deletePluginScheme,
    readPluginScheme,
    savePluginScheme
  }
})
