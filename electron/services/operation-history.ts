import { join } from 'path'
import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs'

export interface OperationEntry {
  description: string
  timestamp: number
}

export class OperationHistoryStore {
  private baseDir: string

  constructor() {
    this.baseDir = join(app.getPath('userData'), 'agent-workflows')
  }

  private filePath(workflowId: string): string {
    return join(this.baseDir, workflowId, 'operation_history.json')
  }

  private ensureDir(workflowId: string): string {
    const dir = join(this.baseDir, workflowId)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    return dir
  }

  load(workflowId: string): OperationEntry[] {
    const file = this.filePath(workflowId)
    if (!existsSync(file)) return []
    try {
      return JSON.parse(readFileSync(file, 'utf-8'))
    } catch {
      return []
    }
  }

  save(workflowId: string, entries: OperationEntry[]): void {
    this.ensureDir(workflowId)
    writeFileSync(this.filePath(workflowId), JSON.stringify(entries, null, 2), 'utf-8')
  }

  clear(workflowId: string): void {
    const file = this.filePath(workflowId)
    if (existsSync(file)) unlinkSync(file)
  }
}

export const operationHistoryStore = new OperationHistoryStore()
