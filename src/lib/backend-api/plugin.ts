import { wsBridge } from '../ws-bridge'

export const pluginBackendApi = {
  list() {
    return wsBridge.invoke('plugin:list', undefined)
  },
  enable(id: string) {
    return wsBridge.invoke('plugin:enable', { id })
  },
  disable(id: string) {
    return wsBridge.invoke('plugin:disable', { id })
  },
  getWorkflowNodes(pluginId: string) {
    return wsBridge.invoke('plugin:get-workflow-nodes', { pluginId })
  },
  listWorkflowPlugins() {
    return wsBridge.invoke('plugin:list-workflow-plugins', undefined)
  },
  getAgentTools(pluginIds: string[]) {
    return wsBridge.invoke('plugin:get-agent-tools', { pluginIds })
  },
  executeTool(toolType: string, params: Record<string, any>) {
    return wsBridge.invoke('agent:execTool', { toolType, params })
  },
  getConfig(pluginId: string) {
    return wsBridge.invoke('plugin:get-config', { pluginId })
  },
  saveConfig(pluginId: string, data: Record<string, string>) {
    return wsBridge.invoke('plugin:save-config', { pluginId, data })
  },
}
