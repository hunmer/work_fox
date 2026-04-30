import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { dirname } from 'node:path'
import type { StoragePaths } from './paths'
import type { StagedNode } from '../../shared/workflow-types'

export class BackendStagingStore {
  constructor(private paths: StoragePaths) {}

  load(workflowId: string): StagedNode[] {
    const file = this.paths.stagingPath(workflowId)
    if (!existsSync(file)) return []
    try {
      return JSON.parse(readFileSync(file, 'utf-8')) as StagedNode[]
    } catch {
      return []
    }
  }

  save(workflowId: string, nodes: StagedNode[]): void {
    const file = this.paths.stagingPath(workflowId)
    const dir = dirname(file)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(file, JSON.stringify(nodes, null, 2), 'utf-8')
  }

  clear(workflowId: string): void {
    const file = this.paths.stagingPath(workflowId)
    if (existsSync(file)) unlinkSync(file)
  }
}
