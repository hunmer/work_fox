import { workflowBackendApi } from './workflow'
import { workflowFolderBackendApi } from './workflow-folder'
import { workflowVersionBackendApi } from './workflow-version'
import { executionLogBackendApi } from './execution-log'
import { operationHistoryBackendApi } from './operation-history'
import { stagingBackendApi } from './staging'

export function createWorkflowDomainApi() {
  return {
    workflow: workflowBackendApi,
    workflowFolder: workflowFolderBackendApi,
    workflowVersion: workflowVersionBackendApi,
    executionLog: executionLogBackendApi,
    operationHistory: operationHistoryBackendApi,
    staging: stagingBackendApi,
  }
}
