import { wsBridge } from '../ws-bridge'
import type { Workflow, WorkflowNode } from '@shared/workflow-types'

export const workflowBackendApi = {
  list(folderId?: string | null) {
    return wsBridge.invoke('workflow:list', { folderId })
  },
  get(id: string) {
    return wsBridge.invoke('workflow:get', { id })
  },
  create(data: Omit<Workflow, 'id'>) {
    return wsBridge.invoke('workflow:create', { data })
  },
  update(id: string, data: Partial<Omit<Workflow, 'id'>>) {
    return wsBridge.invoke('workflow:update', { id, data })
  },
  delete(id: string) {
    return wsBridge.invoke('workflow:delete', { id })
  },
  listPluginSchemes(workflowId: string, pluginId: string) {
    return wsBridge.invoke('workflow:list-plugin-schemes', { workflowId, pluginId })
  },
  readPluginScheme(workflowId: string, pluginId: string, schemeName: string) {
    return wsBridge.invoke('workflow:read-plugin-scheme', { workflowId, pluginId, schemeName })
  },
  createPluginScheme(workflowId: string, pluginId: string, schemeName: string) {
    return wsBridge.invoke('workflow:create-plugin-scheme', { workflowId, pluginId, schemeName })
  },
  savePluginScheme(workflowId: string, pluginId: string, schemeName: string, data: Record<string, string>) {
    return wsBridge.invoke('workflow:save-plugin-scheme', { workflowId, pluginId, schemeName, data })
  },
  deletePluginScheme(workflowId: string, pluginId: string, schemeName: string) {
    return wsBridge.invoke('workflow:delete-plugin-scheme', { workflowId, pluginId, schemeName })
  },
  execute(
    workflowId: string,
    input?: Record<string, unknown>,
    snapshot?: { nodes: WorkflowNode[]; edges: Workflow['edges'] },
    startNodeId?: string,
  ) {
    return wsBridge.invoke('workflow:execute', { workflowId, input, snapshot, startNodeId })
  },
  debugNode(
    workflowId: string,
    nodeId: string,
    options?: {
      context?: Record<string, unknown>
      snapshot?: { nodes: WorkflowNode[]; edges: Workflow['edges'] }
      embeddedNode?: WorkflowNode
    },
  ) {
    return wsBridge.invoke('workflow:debug-node', {
      workflowId,
      nodeId,
      ...options,
    })
  },
  getExecutionRecovery(workflowId: string, executionId?: string | null) {
    return wsBridge.invoke('workflow:get-execution-recovery', { workflowId, executionId })
  },
  pause(executionId: string) {
    return wsBridge.invoke('workflow:pause', { executionId })
  },
  resume(executionId: string) {
    return wsBridge.invoke('workflow:resume', { executionId })
  },
  stop(executionId: string) {
    return wsBridge.invoke('workflow:stop', { executionId })
  },
}
