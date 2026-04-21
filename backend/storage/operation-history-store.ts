import { dirname } from 'node:path'
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import type { StoragePaths } from './paths'
import type { OperationEntry } from '../../shared/workflow-types'

export class BackendOperationHistoryStore {
  constructor(private paths: StoragePaths) {}

  load(workflowId: string): OperationEntry[] {
    const file = this.paths.operationHistoryPath(workflowId)
    if (!existsSync(file)) return []
    try {
      return JSON.parse(readFileSync(file, 'utf-8')) as OperationEntry[]
    } catch {
      return []
    }
  }

  save(workflowId: string, entries: OperationEntry[]): void {
    const file = this.paths.operationHistoryPath(workflowId)
    const dir = dirname(file)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(file, JSON.stringify(entries, null, 2), 'utf-8')
  }

  clear(workflowId: string): void {
    const file = this.paths.operationHistoryPath(workflowId)
    if (existsSync(file)) unlinkSync(file)
  }
}
