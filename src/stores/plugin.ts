import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { PluginMeta } from '@/types/plugin'

export const usePluginStore = defineStore('plugin', () => {
  const plugins = ref<PluginMeta[]>([])
  const isLoading = ref(false)
  const activeViewPluginId = ref<string | null>(null)
  const viewContents = ref<Record<string, string>>({})

  const enabledPlugins = computed(() => plugins.value.filter((p) => p.enabled))
  const disabledPlugins = computed(() => plugins.value.filter((p) => !p.enabled))

  async function init(): Promise<void> {
    isLoading.value = true
    try {
      plugins.value = await window.api.plugin.list()
    } finally {
      isLoading.value = false
    }
  }

  async function enablePlugin(pluginId: string): Promise<void> {
    await window.api.plugin.enable(pluginId)
    const plugin = plugins.value.find((p) => p.id === pluginId)
    if (plugin) plugin.enabled = true
  }

  async function disablePlugin(pluginId: string): Promise<void> {
    await window.api.plugin.disable(pluginId)
    const plugin = plugins.value.find((p) => p.id === pluginId)
    if (plugin) plugin.enabled = false
    if (activeViewPluginId.value === pluginId) {
      activeViewPluginId.value = null
    }
  }

  async function loadViewContent(pluginId: string): Promise<string | null> {
    if (viewContents.value[pluginId]) return viewContents.value[pluginId]
    const content = await window.api.plugin.getView(pluginId)
    if (content) {
      viewContents.value[pluginId] = content
    }
    return content
  }

  async function loadIcon(pluginId: string): Promise<string | null> {
    return window.api.plugin.getIcon(pluginId)
  }

  function openView(pluginId: string): void {
    activeViewPluginId.value = pluginId
  }

  function closeView(): void {
    activeViewPluginId.value = null
  }

  async function importPlugin(): Promise<{ success: boolean; pluginName?: string; error?: string }> {
    const result = await window.api.plugin.importZip()
    if (result.success) {
      await init()
    }
    return result
  }

  async function openPluginsFolder(): Promise<void> {
    await window.api.plugin.openFolder()
  }

  async function getWorkflowNodes(pluginId: string): Promise<any[]> {
    return window.api.plugin.getWorkflowNodes(pluginId)
  }

  async function listWorkflowPlugins(): Promise<any[]> {
    return window.api.plugin.listWorkflowPlugins()
  }

  async function getPluginConfig(pluginId: string): Promise<Record<string, string>> {
    return window.api.plugin.getConfig(pluginId)
  }

  async function savePluginConfig(pluginId: string, data: Record<string, string>): Promise<{ success: boolean; error?: string }> {
    return window.api.plugin.saveConfig(pluginId, data)
  }

  async function listPluginSchemes(workflowId: string, pluginId: string): Promise<string[]> {
    return window.api.workflow.listPluginSchemes(workflowId, pluginId)
  }

  async function createPluginScheme(workflowId: string, pluginId: string, schemeName: string): Promise<void> {
    return window.api.workflow.createPluginScheme(workflowId, pluginId, schemeName)
  }

  async function deletePluginScheme(workflowId: string, pluginId: string, schemeName: string): Promise<void> {
    return window.api.workflow.deletePluginScheme(workflowId, pluginId, schemeName)
  }

  async function readPluginScheme(workflowId: string, pluginId: string, schemeName: string): Promise<Record<string, string>> {
    return window.api.workflow.readPluginScheme(workflowId, pluginId, schemeName)
  }

  async function savePluginScheme(workflowId: string, pluginId: string, schemeName: string, data: Record<string, string>): Promise<void> {
    return window.api.workflow.savePluginScheme(workflowId, pluginId, schemeName, data)
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
    getPluginConfig,
    savePluginConfig,
    listPluginSchemes,
    createPluginScheme,
    deletePluginScheme,
    readPluginScheme,
    savePluginScheme
  }
})
