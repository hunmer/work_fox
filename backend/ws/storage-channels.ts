import type { WSRouter } from './router'
import { BackendWorkflowStore } from '../storage/workflow-store'
import { BackendWorkflowVersionStore } from '../storage/workflow-version-store'
import { BackendExecutionLogStore } from '../storage/execution-log-store'
import { BackendOperationHistoryStore } from '../storage/operation-history-store'

export interface StorageServices {
  workflowStore: BackendWorkflowStore
  workflowVersionStore: BackendWorkflowVersionStore
  executionLogStore: BackendExecutionLogStore
  operationHistoryStore: BackendOperationHistoryStore
}

export function registerStorageChannels(router: WSRouter, services: StorageServices, triggerService?: import('../workflow/trigger-service').WorkflowTriggerService): void {
  const { workflowStore, workflowVersionStore, executionLogStore, operationHistoryStore } = services

  router.register('workflow:list', ({ folderId }) => workflowStore.listWorkflows(folderId))
  router.register('workflow:get', ({ id }) => workflowStore.getWorkflow(id))
  router.register('workflow:create', ({ data }) => {
    const wf = workflowStore.createWorkflow(data)
    triggerService?.reloadWorkflow(wf.id)
    return wf
  })
  router.register('workflow:update', ({ id, data }) => {
    workflowStore.updateWorkflow(id, data)
    triggerService?.reloadWorkflow(id)
    return undefined
  })
  router.register('workflow:delete', ({ id }) => {
    workflowStore.deleteWorkflow(id)
    triggerService?.removeWorkflow(id)
    return undefined
  })
  router.register('workflow:list-plugin-schemes', ({ workflowId, pluginId }) => workflowStore.listPluginSchemes(workflowId, pluginId))
  router.register('workflow:read-plugin-scheme', ({ workflowId, pluginId, schemeName }) => workflowStore.readPluginScheme(workflowId, pluginId, schemeName))
  router.register('workflow:create-plugin-scheme', ({ workflowId, pluginId, schemeName }) => {
    workflowStore.createPluginScheme(workflowId, pluginId, schemeName)
    return undefined
  })
  router.register('workflow:save-plugin-scheme', ({ workflowId, pluginId, schemeName, data }) => {
    workflowStore.savePluginScheme(workflowId, pluginId, schemeName, data)
    return undefined
  })
  router.register('workflow:delete-plugin-scheme', ({ workflowId, pluginId, schemeName }) => {
    workflowStore.deletePluginScheme(workflowId, pluginId, schemeName)
    return undefined
  })

  router.register('workflowFolder:list', () => workflowStore.listWorkflowFolders())
  router.register('workflowFolder:create', ({ data }) => workflowStore.createWorkflowFolder(data))
  router.register('workflowFolder:update', ({ id, data }) => {
    workflowStore.updateWorkflowFolder(id, data)
    return undefined
  })
  router.register('workflowFolder:delete', ({ id }) => {
    workflowStore.deleteWorkflowFolder(id)
    return undefined
  })

  router.register('workflowVersion:list', ({ workflowId }) => workflowVersionStore.list(workflowId))
  router.register('workflowVersion:add', ({ workflowId, name, nodes, edges }) => workflowVersionStore.add(workflowId, name, nodes, edges))
  router.register('workflowVersion:get', ({ workflowId, versionId }) => workflowVersionStore.get(workflowId, versionId))
  router.register('workflowVersion:delete', ({ workflowId, versionId }) => {
    workflowVersionStore.delete(workflowId, versionId)
    return undefined
  })
  router.register('workflowVersion:clear', ({ workflowId }) => {
    workflowVersionStore.clear(workflowId)
    return undefined
  })
  router.register('workflowVersion:nextName', ({ workflowId }) => workflowVersionStore.nextVersionName(workflowId))

  router.register('executionLog:list', ({ workflowId }) => executionLogStore.list(workflowId))
  router.register('executionLog:save', ({ workflowId, log }) => executionLogStore.add(workflowId, log))
  router.register('executionLog:delete', ({ workflowId, id }) => {
    executionLogStore.delete(workflowId, id)
    return undefined
  })
  router.register('executionLog:clear', ({ workflowId }) => {
    executionLogStore.clear(workflowId)
    return undefined
  })
  router.register('executionLog:getPath', ({ workflowId, id }) => executionLogStore.getPath(workflowId, id))

  router.register('operationHistory:load', ({ workflowId }) => operationHistoryStore.load(workflowId))
  router.register('operationHistory:save', ({ workflowId, entries }) => {
    operationHistoryStore.save(workflowId, entries)
    return undefined
  })
  router.register('operationHistory:clear', ({ workflowId }) => {
    operationHistoryStore.clear(workflowId)
    return undefined
  })
}
