import { ref, type Ref } from 'vue'
import type { Workflow, WorkflowFolder } from '@/lib/workflow/types'
import type { createDirtyTracker } from './dirty-tracker'
import type { createVersionManager } from './version'

export function createCrudActions(
  workflows: Ref<Workflow[]>,
  workflowFolders: Ref<WorkflowFolder[]>,
  currentWorkflow: Ref<Workflow | null>,
  api: () => any,
  dirtyTracker: ReturnType<typeof createDirtyTracker>,
  versionMgr: ReturnType<typeof createVersionManager>,
) {
  async function loadData() {
    workflows.value = await api().workflow.list()
    workflowFolders.value = await api().workflowFolder.list()
  }

  async function saveWorkflow(workflow: Workflow): Promise<void> {
    const plain = JSON.parse(JSON.stringify(workflow)) as Workflow
    const existing = workflows.value.find((w) => w.id === plain.id)
    const now = Date.now()
    if (existing) {
      await api().workflow.update(plain.id, { ...plain, updatedAt: now })
      Object.assign(existing, { ...plain, updatedAt: now })
      if (currentWorkflow.value?.id === plain.id) currentWorkflow.value.updatedAt = now
    } else {
      const created = await api().workflow.create({ ...plain, createdAt: now, updatedAt: now })
      workflows.value.push(created)
      currentWorkflow.value = created
    }
    dirtyTracker.markClean()
  }

  async function deleteWorkflow(id: string): Promise<void> {
    await api().workflow.delete(id)
    workflows.value = workflows.value.filter((w) => w.id !== id)
    if (currentWorkflow.value?.id === id) {
      currentWorkflow.value = null
      dirtyTracker.markClean()
    }
  }

  async function createFolder(name: string, parentId: string | null = null): Promise<void> {
    const folder = await api().workflowFolder.create({
      name, parentId,
      order: workflowFolders.value.filter((f) => f.parentId === parentId).length,
      createdAt: Date.now(),
    })
    workflowFolders.value.push(folder)
  }

  async function deleteFolder(id: string): Promise<void> {
    await api().workflowFolder.delete(id)
    workflowFolders.value = workflowFolders.value.filter((f) => f.id !== id)
  }

  async function updateFolder(id: string, data: Partial<WorkflowFolder>): Promise<void> {
    await api().workflowFolder.update(id, data)
    const idx = workflowFolders.value.findIndex((f) => f.id === id)
    if (idx !== -1) Object.assign(workflowFolders.value[idx], data)
  }

  return { loadData, saveWorkflow, deleteWorkflow, createFolder, deleteFolder, updateFolder }
}
