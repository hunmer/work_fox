import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import type { Workflow, WorkflowFolder } from '../../shared/workflow-types'
import { JsonStore } from './json-store'
import type { StoragePaths } from './paths'

interface WorkflowFolderStoreData {
  workflowFolders: WorkflowFolder[]
}

const folderDefaults: WorkflowFolderStoreData = {
  workflowFolders: [],
}

export class BackendWorkflowStore {
  private folderStore: JsonStore<WorkflowFolderStoreData>

  constructor(private paths: StoragePaths) {
    this.folderStore = new JsonStore(this.paths.workflowFoldersPath(), folderDefaults)
  }

  listPluginSchemes(workflowId: string, pluginId: string): string[] {
    const dir = join(this.paths.pluginConfigsDir(workflowId), pluginId)
    if (!existsSync(dir)) return []
    return readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace(/\.json$/, ''))
      .sort()
  }

  readPluginScheme(workflowId: string, pluginId: string, schemeName: string): Record<string, string> {
    const path = this.paths.pluginSchemePath(workflowId, pluginId, schemeName)
    if (!existsSync(path)) throw new Error(`配置方案 ${schemeName} 不存在`)
    return JSON.parse(readFileSync(path, 'utf-8'))
  }

  createPluginScheme(workflowId: string, pluginId: string, schemeName: string): void {
    if (/[\/\\:*?"<>|]/.test(schemeName)) {
      throw new Error('方案名称包含非法字符')
    }
    const path = this.paths.pluginSchemePath(workflowId, pluginId, schemeName)
    const dir = join(this.paths.pluginConfigsDir(workflowId), pluginId)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    if (existsSync(path)) throw new Error(`方案 ${schemeName} 已存在`)
    writeFileSync(path, JSON.stringify({}, null, 2), 'utf-8')
  }

  savePluginScheme(workflowId: string, pluginId: string, schemeName: string, data: Record<string, string>): void {
    const path = this.paths.pluginSchemePath(workflowId, pluginId, schemeName)
    const dir = join(this.paths.pluginConfigsDir(workflowId), pluginId)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(path, JSON.stringify(data, null, 2), 'utf-8')
  }

  deletePluginScheme(workflowId: string, pluginId: string, schemeName: string): void {
    const path = this.paths.pluginSchemePath(workflowId, pluginId, schemeName)
    if (existsSync(path)) unlinkSync(path)
  }

  listWorkflowFolders(): WorkflowFolder[] {
    const folders = this.folderStore.get('workflowFolders') ?? folderDefaults.workflowFolders
    return [...folders].sort((a, b) => a.order - b.order)
  }

  createWorkflowFolder(data: Omit<WorkflowFolder, 'id'>): WorkflowFolder {
    const folders = this.folderStore.get('workflowFolders') ?? []
    const folder: WorkflowFolder = { ...data, id: randomUUID() }
    folders.push(folder)
    this.folderStore.set('workflowFolders', folders)
    return folder
  }

  updateWorkflowFolder(id: string, data: Partial<Omit<WorkflowFolder, 'id'>>): void {
    const folders = this.folderStore.get('workflowFolders') ?? []
    const index = folders.findIndex((folder) => folder.id === id)
    if (index === -1) throw new Error(`工作流文件夹 ${id} 不存在`)
    folders[index] = { ...folders[index], ...data }
    this.folderStore.set('workflowFolders', folders)
  }

  deleteWorkflowFolder(id: string): void {
    const folders = this.folderStore.get('workflowFolders') ?? []
    const childIds = collectChildFolderIds(folders, id)
    const idsToDelete = new Set([id, ...childIds])
    this.folderStore.set('workflowFolders', folders.filter((f) => !idsToDelete.has(f.id)))
    for (const folderId of idsToDelete) {
      const workflows = this.readAllWorkflowFiles().filter((workflow) => workflow.folderId === folderId)
      for (const workflow of workflows) this.deleteWorkflow(workflow.id)
    }
  }

  listWorkflows(folderId?: string | null): Workflow[] {
    const items = this.readAllWorkflowFiles().sort((a, b) => a.updatedAt - b.updatedAt)
    if (folderId !== undefined) return items.filter((w) => w.folderId === folderId)
    return items
  }

  getWorkflow(id: string): Workflow | undefined {
    return this.readWorkflowFile(id)
  }

  createWorkflow(data: Omit<Workflow, 'id'>): Workflow {
    const workflow: Workflow = { ...data, id: randomUUID() }
    this.writeWorkflowFile(workflow)
    return workflow
  }

  updateWorkflow(id: string, data: Partial<Omit<Workflow, 'id'>>): void {
    const existing = this.readWorkflowFile(id)
    if (!existing) throw new Error(`工作流 ${id} 不存在`)
    this.writeWorkflowFile({ ...existing, ...data })
  }

  deleteWorkflow(id: string): void {
    const path = this.paths.workflowPath(id)
    if (existsSync(path)) unlinkSync(path)
    const workflowDir = this.paths.workflowDir(id)
    if (existsSync(workflowDir)) rmSync(workflowDir, { recursive: true, force: true })
  }

  private ensureWorkflowDir(id: string): string {
    const dir = this.paths.workflowDir(id)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    return dir
  }

  private readWorkflowFile(id: string): Workflow | undefined {
    const path = this.paths.workflowPath(id)
    if (!existsSync(path)) return undefined
    try {
      return JSON.parse(readFileSync(path, 'utf-8')) as Workflow
    } catch {
      return undefined
    }
  }

  private writeWorkflowFile(workflow: Workflow): void {
    this.ensureWorkflowDir(workflow.id)
    writeFileSync(this.paths.workflowPath(workflow.id), JSON.stringify(workflow, null, 2), 'utf-8')
  }

  private readAllWorkflowFiles(): Workflow[] {
    if (!existsSync(this.paths.workflowsDir)) return []
    const items: Workflow[] = []
    const dirs = readdirSync(this.paths.workflowsDir, { withFileTypes: true }).filter((d) => d.isDirectory())
    for (const dir of dirs) {
      const file = join(this.paths.workflowsDir, dir.name, 'workflow.json')
      if (!existsSync(file)) continue
      try {
        items.push(JSON.parse(readFileSync(file, 'utf-8')) as Workflow)
      } catch {
        // ignore broken workflow file
      }
    }
    return items
  }
}

function collectChildFolderIds(folders: WorkflowFolder[], parentId: string): string[] {
  const children = folders.filter((folder) => folder.parentId === parentId)
  return children.reduce<string[]>(
    (acc, child) => [...acc, child.id, ...collectChildFolderIds(folders, child.id)],
    [],
  )
}
