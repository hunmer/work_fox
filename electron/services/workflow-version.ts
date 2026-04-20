import { join } from 'path'
import { app } from 'electron'
import { randomUUID } from 'crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import type { WorkflowNode, WorkflowEdge } from './store'

export interface WorkflowVersion {
  id: string
  workflowId: string
  name: string
  snapshot: {
    nodes: WorkflowNode[]
    edges: WorkflowEdge[]
  }
  createdAt: number
}

const MAX_VERSIONS_PER_WORKFLOW = 100

export class WorkflowVersionStore {
  private baseDir: string

  constructor() {
    this.baseDir = join(app.getPath('userData'), 'agent-workflows')
  }

  private versionsDir(workflowId: string): string {
    return join(this.baseDir, workflowId, 'versions')
  }

  private ensureDir(workflowId: string): string {
    const dir = this.versionsDir(workflowId)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    return dir
  }

  list(workflowId: string): WorkflowVersion[] {
    const dir = this.versionsDir(workflowId)
    if (!existsSync(dir)) return []

    const files = readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => {
        try {
          return JSON.parse(readFileSync(join(dir, f), 'utf-8')) as WorkflowVersion
        } catch {
          return null
        }
      })
      .filter(Boolean) as WorkflowVersion[]

    files.sort((a, b) => b.createdAt - a.createdAt)
    return files
  }

  add(workflowId: string, name: string, nodes: WorkflowNode[], edges: WorkflowEdge[]): WorkflowVersion {
    this.ensureDir(workflowId)
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
    writeFileSync(join(this.versionsDir(workflowId), `${version.id}.json`), JSON.stringify(version), 'utf-8')
    this.enforceLimit(workflowId)
    return version
  }

  get(workflowId: string, versionId: string): WorkflowVersion | undefined {
    const file = join(this.versionsDir(workflowId), `${versionId}.json`)
    if (!existsSync(file)) return undefined
    try {
      return JSON.parse(readFileSync(file, 'utf-8'))
    } catch {
      return undefined
    }
  }

  delete(workflowId: string, versionId: string): void {
    const file = join(this.versionsDir(workflowId), `${versionId}.json`)
    if (existsSync(file)) unlinkSync(file)
  }

  clear(workflowId: string): void {
    const dir = this.versionsDir(workflowId)
    if (!existsSync(dir)) return
    readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .forEach((f) => unlinkSync(join(dir, f)))
  }

  nextVersionName(workflowId: string): string {
    return `v${this.list(workflowId).length + 1}`
  }

  private enforceLimit(workflowId: string): void {
    const versions = this.list(workflowId)
    if (versions.length <= MAX_VERSIONS_PER_WORKFLOW) return
    versions.slice(MAX_VERSIONS_PER_WORKFLOW).forEach((v) => this.delete(workflowId, v.id))
  }
}

export const workflowVersionStore = new WorkflowVersionStore()
