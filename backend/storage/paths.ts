import { join } from 'node:path'
import type { BackendConfig } from '../app/config'

export function createStoragePaths(config: BackendConfig) {
  const baseDir = join(config.userDataDir, 'agent-workflows')

  return {
    userDataDir: config.userDataDir,
    workflowsDir: baseDir,
    workflowDir(workflowId: string) {
      return join(baseDir, workflowId)
    },
    workflowPath(workflowId: string) {
      return join(baseDir, workflowId, 'workflow.json')
    },
    workflowFoldersPath() {
      return join(config.userDataDir, 'workflow-folders.json')
    },
    pluginConfigsDir(workflowId: string) {
      return join(baseDir, workflowId, 'plugin_configs')
    },
    pluginSchemePath(workflowId: string, pluginId: string, schemeName: string) {
      return join(baseDir, workflowId, 'plugin_configs', pluginId, `${schemeName}.json`)
    },
    versionsDir(workflowId: string) {
      return join(baseDir, workflowId, 'versions')
    },
    executionHistoryDir(workflowId: string) {
      return join(baseDir, workflowId, 'execution_history')
    },
    operationHistoryPath(workflowId: string) {
      return join(baseDir, workflowId, 'operation_history.json')
    },
  }
}

export type StoragePaths = ReturnType<typeof createStoragePaths>
