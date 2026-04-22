import { pluginBackendApi } from './plugin'

type LocalPluginApi = {
  listLocal: () => Promise<any[]>
  enableLocal: (pluginId: string) => Promise<void>
  disableLocal: (pluginId: string) => Promise<void>
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
    listLocal: notAvailable('plugin.listLocal is not available in current runtime', []),
    enableLocal: notAvailable('plugin.enableLocal is not available in current runtime', undefined),
    disableLocal: notAvailable('plugin.disableLocal is not available in current runtime', undefined),
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
    listLocal: localPluginApi.listLocal,
    enable: pluginBackendApi.enable,
    enableLocal: localPluginApi.enableLocal,
    disable: pluginBackendApi.disable,
    disableLocal: localPluginApi.disableLocal,
    getWorkflowNodes: pluginBackendApi.getWorkflowNodes,
    listWorkflowPlugins: pluginBackendApi.listWorkflowPlugins,
    getAgentTools: pluginBackendApi.getAgentTools,
    executeTool: pluginBackendApi.executeTool,
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
