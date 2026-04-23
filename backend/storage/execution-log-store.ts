import { join } from 'node:path'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import type { ExecutionLog } from '../../shared/workflow-types'
import type { StoragePaths } from './paths'

const MAX_LOGS_PER_WORKFLOW = 100

export class BackendExecutionLogStore {
  constructor(private paths: StoragePaths) {}

  list(workflowId: string): ExecutionLog[] {
    const dir = this.paths.executionHistoryDir(workflowId)
    if (!existsSync(dir)) return []
    const files = readdirSync(dir)
      .filter((file) => file.endsWith('.json'))
      .map((file) => {
        const path = join(dir, file)
        try {
          return {
            log: JSON.parse(readFileSync(path, 'utf-8')) as ExecutionLog,
            mtime: statSync(path).mtimeMs,
          }
        } catch {
          return null
        }
      })
      .filter(Boolean) as { log: ExecutionLog; mtime: number }[]
    files.sort((a, b) => b.mtime - a.mtime)
    return files.map((file) => file.log)
  }

  add(workflowId: string, log: ExecutionLog): ExecutionLog {
    const dir = this.ensureDir(workflowId)
    writeFileSync(join(dir, `${log.id}.json`), JSON.stringify(log), 'utf-8')
    this.enforceLimit(workflowId)
    return log
  }

  getPath(workflowId: string, logId: string): string {
    return join(this.paths.executionHistoryDir(workflowId), `${logId}.json`)
  }

  delete(workflowId: string, logId: string): void {
    const file = this.getPath(workflowId, logId)
    if (existsSync(file)) unlinkSync(file)
  }

  clear(workflowId: string): void {
    const dir = this.paths.executionHistoryDir(workflowId)
    if (!existsSync(dir)) return
    readdirSync(dir).filter((file) => file.endsWith('.json')).forEach((file) => unlinkSync(join(dir, file)))
  }

  private ensureDir(workflowId: string): string {
    const dir = this.paths.executionHistoryDir(workflowId)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    return dir
  }

  private enforceLimit(workflowId: string): void {
    const dir = this.paths.executionHistoryDir(workflowId)
    if (!existsSync(dir)) return
    const files = readdirSync(dir)
      .filter((file) => file.endsWith('.json'))
      .map((file) => ({ file, path: join(dir, file), mtime: statSync(join(dir, file)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime)
    if (files.length > MAX_LOGS_PER_WORKFLOW) {
      files.slice(MAX_LOGS_PER_WORKFLOW).forEach((file) => {
        try { unlinkSync(file.path) } catch { /* ignore */ }
      })
    }
  }
}
