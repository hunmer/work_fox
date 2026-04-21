import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import type { WorkflowVersion, WorkflowEdge, WorkflowNode } from '../../shared/workflow-types'
import type { StoragePaths } from './paths'

const MAX_VERSIONS_PER_WORKFLOW = 100

export class BackendWorkflowVersionStore {
  constructor(private paths: StoragePaths) {}

  list(workflowId: string): WorkflowVersion[] {
    const dir = this.paths.versionsDir(workflowId)
    if (!existsSync(dir)) return []
    const versions = readdirSync(dir)
      .filter((file) => file.endsWith('.json'))
      .map((file) => {
        try {
          return JSON.parse(readFileSync(join(dir, file), 'utf-8')) as WorkflowVersion
        } catch {
          return null
        }
      })
      .filter(Boolean) as WorkflowVersion[]
    versions.sort((a, b) => b.createdAt - a.createdAt)
    return versions
  }

  add(workflowId: string, name: string, nodes: WorkflowNode[], edges: WorkflowEdge[]): WorkflowVersion {
    const dir = this.ensureDir(workflowId)
    const version: WorkflowVersion = {
      id: randomUUID(),
      workflowId,
      name,
      snapshot: {
        nodes: JSON.parse(JSON.stringify(nodes)),
        edges: JSON.parse(JSON.stringify(edges)),
      },
      createdAt: Date.now(),
    }
    writeFileSync(join(dir, `${version.id}.json`), JSON.stringify(version), 'utf-8')
    this.enforceLimit(workflowId)
    return version
  }

  get(workflowId: string, versionId: string): WorkflowVersion | undefined {
    const file = join(this.paths.versionsDir(workflowId), `${versionId}.json`)
    if (!existsSync(file)) return undefined
    try {
      return JSON.parse(readFileSync(file, 'utf-8')) as WorkflowVersion
    } catch {
      return undefined
    }
  }

  delete(workflowId: string, versionId: string): void {
    const file = join(this.paths.versionsDir(workflowId), `${versionId}.json`)
    if (existsSync(file)) unlinkSync(file)
  }

  clear(workflowId: string): void {
    const dir = this.paths.versionsDir(workflowId)
    if (!existsSync(dir)) return
    readdirSync(dir).filter((file) => file.endsWith('.json')).forEach((file) => unlinkSync(join(dir, file)))
  }

  nextVersionName(workflowId: string): string {
    return `v${this.list(workflowId).length + 1}`
  }

  private ensureDir(workflowId: string): string {
    const dir = this.paths.versionsDir(workflowId)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    return dir
  }

  private enforceLimit(workflowId: string): void {
    const versions = this.list(workflowId)
    if (versions.length <= MAX_VERSIONS_PER_WORKFLOW) return
    versions.slice(MAX_VERSIONS_PER_WORKFLOW).forEach((version) => this.delete(workflowId, version.id))
  }
}
