import { pluginBackendApi } from './plugin'

type LocalPluginApi = {
  getView: (pluginId: string) => Promise<string | null>
  getIcon: (pluginId: string) => Promise<string | null>
  importZip: () => Promise<{ success: boolean; pluginName?: string; error?: string }>
  openFolder: () => Promise<void>
  install: (url: string) => Promise<{ success: boolean; error?: string }>
  uninstall: (pluginId: string) => Promise<{ success: boolean; error?: string }>
}

function notAvailable<T>(message: string, fallback: T): () => Promise<T> {
  return async () => {
    console.warn(message)
    return fallback
  }
}

export function createPluginDomainApi() {
  const localPluginApi: LocalPluginApi = (window as any).api?.plugin ?? {
    getView: notAvailable('plugin.getView is not available in current runtime', null),
    getIcon: notAvailable('plugin.getIcon is not available in current runtime', null),
    importZip: notAvailable('plugin.importZip is not available in current runtime', {
      success: false,
      error: 'Plugin import is not available in current runtime',
    }),
    openFolder: notAvailable('plugin.openFolder is not available in current runtime', undefined),
    install: notAvailable('plugin.install is not available in current runtime', {
      success: false,
      error: 'Plugin install is not available in current runtime',
    }),
    uninstall: notAvailable('plugin.uninstall is not available in current runtime', {
      success: false,
      error: 'Plugin uninstall is not available in current runtime',
    }),
  }

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
