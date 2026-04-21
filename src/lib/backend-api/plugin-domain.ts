import { pluginBackendApi } from './plugin'

export function createPluginDomainApi() {
  const localPluginApi = (window as any).api.plugin

  return {
    list: pluginBackendApi.list,
    enable: pluginBackendApi.enable,
    disable: pluginBackendApi.disable,
    getWorkflowNodes: pluginBackendApi.getWorkflowNodes,
    listWorkflowPlugins: pluginBackendApi.listWorkflowPlugins,
    getAgentTools: pluginBackendApi.getAgentTools,
    getConfig: pluginBackendApi.getConfig,
    saveConfig: pluginBackendApi.saveConfig,
    getView: localPluginApi.getView,
    getIcon: localPluginApi.getIcon,
    importZip: localPluginApi.importZip,
    openFolder: localPluginApi.openFolder,
    install: localPluginApi.install,
    uninstall: localPluginApi.uninstall,
  }
}
