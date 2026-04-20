import { join } from 'path'
import { app } from 'electron'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, unlinkSync, statSync } from 'node:fs'

export interface ExecutionStep {
  nodeId: string
  nodeLabel: string
  startedAt: number
  finishedAt?: number
  status: 'running' | 'completed' | 'error'
  input?: any
  output?: any
  error?: string
  logs?: ExecutionLogEntry[]
}

export interface ExecutionLogEntry {
  level: 'info' | 'warning' | 'error'
  message: string
  timestamp: number
}

export interface ExecutionLog {
  id: string
  workflowId: string
  startedAt: number
  finishedAt?: number
  status: 'running' | 'completed' | 'paused' | 'error'
  steps: ExecutionStep[]
  snapshot?: {
    nodes: any[]
    edges: any[]
  }
}

const MAX_LOGS_PER_WORKFLOW = 100

export class ExecutionLogStore {
  private baseDir: string

  constructor() {
    this.baseDir = join(app.getPath('userData'), 'agent-workflows')
  }

  private historyDir(workflowId: string): string {
    return join(this.baseDir, workflowId, 'execution_history')
  }

  private ensureDir(workflowId: string): string {
    const dir = this.historyDir(workflowId)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    return dir
  }

  list(workflowId: string): ExecutionLog[] {
    const dir = this.historyDir(workflowId)
    if (!existsSync(dir)) return []

    const files = readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => {
        const filePath = join(dir, f)
        try {
          const log: ExecutionLog = JSON.parse(readFileSync(filePath, 'utf-8'))
          return { log, mtime: statSync(filePath).mtimeMs }
        } catch {
          return null
        }
      })
      .filter(Boolean) as { log: ExecutionLog; mtime: number }[]

    // 按 mtime 降序（最新在前）
    files.sort((a, b) => b.mtime - a.mtime)
    return files.map((f) => f.log)
  }

  add(workflowId: string, log: ExecutionLog): ExecutionLog {
    const dir = this.ensureDir(workflowId)
    const filePath = join(dir, `${log.id}.json`)
    writeFileSync(filePath, JSON.stringify(log), 'utf-8')

    // 清理超出限制的旧文件
    this.enforceLimit(workflowId)

    return log
  }

  delete(workflowId: string, logId: string): void {
    const filePath = join(this.historyDir(workflowId), `${logId}.json`)
    if (existsSync(filePath)) unlinkSync(filePath)
  }

  clear(workflowId: string): void {
    const dir = this.historyDir(workflowId)
    if (!existsSync(dir)) return
    readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .forEach((f) => unlinkSync(join(dir, f)))
  }

  private enforceLimit(workflowId: string): void {
    const dir = this.historyDir(workflowId)
    if (!existsSync(dir)) return

    const files = readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => ({ name: f, path: join(dir, f), mtime: statSync(join(dir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime)

    if (files.length > MAX_LOGS_PER_WORKFLOW) {
      files.slice(MAX_LOGS_PER_WORKFLOW).forEach((f) => {
        try { unlinkSync(f.path) } catch { /* ignore */ }
      })
    }
  }
}

export const executionLogStore = new ExecutionLogStore()
