import type { WSRouter } from './router'
import type { BackendPluginRegistry } from '../plugins/plugin-registry'

export function registerPluginChannels(router: WSRouter, plugins: BackendPluginRegistry): void {
  router.register('plugin:list', () => plugins.list())
  router.register('plugin:enable', ({ id }) => {
    plugins.enable(id)
    return undefined
  })
  router.register('plugin:disable', ({ id }) => {
    plugins.disable(id)
    return undefined
  })
  router.register('plugin:get-workflow-nodes', ({ pluginId }) => plugins.getWorkflowNodes(pluginId))
  router.register('plugin:list-workflow-plugins', () => plugins.listWorkflowPlugins())
  router.register('plugin:get-agent-tools', ({ pluginIds }) => plugins.getAgentTools(pluginIds))
  router.register('plugin:get-config', ({ pluginId }) => plugins.getConfig(pluginId))
  router.register('plugin:save-config', ({ pluginId, data }) => plugins.saveConfig(pluginId, data))
}
