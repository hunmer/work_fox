import { app } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { fork, type ChildProcess } from 'node:child_process'

export interface BackendStatus {
  running: boolean
  url?: string
  pid?: number
  error?: string
}

export interface BackendLogEntry {
  stream: 'stdout' | 'stderr'
  level: 'info' | 'error'
  message: string
}

type BackendLogListener = (entry: BackendLogEntry) => void

class BackendProcessManager {
  private child: ChildProcess | null = null
  private status: BackendStatus = { running: false }
  private sessionToken = randomUUID()
  private startupPromise: Promise<BackendStatus> | null = null
  private logListeners = new Set<BackendLogListener>()

  async start(): Promise<BackendStatus> {
    if (this.startupPromise) return this.startupPromise
    if (this.status.running) return this.status

    const entry = resolveBackendEntry()
    if (!entry) {
      this.status = {
        running: false,
        error: 'Backend entry not found. Run `pnpm build:backend` first.',
      }
      return this.status
    }

    this.startupPromise = new Promise<BackendStatus>((resolve) => {
      const child = fork(entry, [], {
        env: {
          ...process.env,
          WORKFOX_BACKEND_PORT: process.env.WORKFOX_BACKEND_PORT || '0',
          WORKFOX_BACKEND_HOST: '127.0.0.1',
          WORKFOX_USER_DATA_DIR: resolveUserDataDir(),
          WORKFOX_PLUGIN_DIR: resolvePluginDir(),
          WORKFOX_LOG_LEVEL: process.env.WORKFOX_LOG_LEVEL || 'info',
          WORKFOX_DEV: app.isPackaged ? '0' : '1',
          WORKFOX_APP_VERSION: app.getVersion(),
          WORKFOX_BACKEND_TOKEN: this.sessionToken,
        },
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      })

      this.child = child
      let settled = false
      const timer = setTimeout(() => {
        if (settled) return
        settled = true
        this.status = { running: false, error: 'Backend startup timed out' }
        resolve(this.status)
      }, 15_000)

      child.stdout?.on('data', (chunk) => {
        const text = chunk.toString()
        this.emitLog({ stream: 'stdout', level: 'info', message: text })
        const line = text.trim().split('\n').find((lineText: string) => lineText.startsWith('WORKFOX_BACKEND_READY '))
        if (!line || settled) return
        clearTimeout(timer)
        settled = true
        const payload = JSON.parse(line.slice('WORKFOX_BACKEND_READY '.length))
        this.status = {
          running: true,
          url: payload.url,
          pid: child.pid,
        }
        resolve(this.status)
      })

      child.stderr?.on('data', (chunk) => {
        const text = chunk.toString()
        this.emitLog({ stream: 'stderr', level: 'error', message: text })
        console.error('[backend-process]', text)
      })

      child.on('exit', (code, signal) => {
        if (!settled) {
          clearTimeout(timer)
          settled = true
          this.status = {
            running: false,
            error: `Backend exited before ready (code=${code}, signal=${signal})`,
          }
          resolve(this.status)
        } else {
          this.status = {
            running: false,
            error: `Backend exited (code=${code}, signal=${signal})`,
          }
        }
        this.child = null
        this.startupPromise = null
      })
    })

    return this.startupPromise
  }

  async stop(): Promise<void> {
    this.startupPromise = null
    if (!this.child) return
    const current = this.child
    this.child = null
    current.kill('SIGTERM')
    this.status = { running: false }
  }

  getStatus(): BackendStatus {
    return { ...this.status }
  }

  getEndpoint(): { url: string; token: string } {
    if (!this.status.running || !this.status.url) {
      throw new Error(this.status.error || 'Backend is not running')
    }
    return {
      url: this.status.url,
      token: this.sessionToken,
    }
  }

  onLog(listener: BackendLogListener): () => void {
    this.logListeners.add(listener)
    return () => this.logListeners.delete(listener)
  }

  private emitLog(entry: BackendLogEntry): void {
    for (const listener of this.logListeners) {
      listener(entry)
    }
  }
}

function resolveBackendEntry(): string | null {
  const entry = join(app.getAppPath(), 'out', 'backend', 'main.js')
  return existsSync(entry) ? entry : null
}

function resolveUserDataDir(): string {
  if (process.env.WORKFOX_USER_DATA_DIR) {
    return process.env.WORKFOX_USER_DATA_DIR
  }

  return app.isPackaged
    ? app.getPath('userData')
    : join(app.getAppPath(), 'backend', 'data')
}

function resolvePluginDir(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'plugins')
    : join(app.getAppPath(), 'resources', 'plugins')
}

export const backendProcessManager = new BackendProcessManager()
