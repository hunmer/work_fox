import { resolve } from 'node:path'

export interface BackendConfig {
  host: string
  port: number
  userDataDir: string
  pluginDir: string
  logLevel: 'debug' | 'info' | 'warn' | 'error'
  dev: boolean
  requestTimeoutMs: number
  interactionTimeoutMs: number
  heartbeatIntervalMs: number
  appVersion: string
  sessionToken?: string
}

function readNumber(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function loadBackendConfig(): BackendConfig {
  const defaultUserDataDir = resolve(process.cwd(), 'backend/data')

  return {
    host: process.env.WORKFOX_BACKEND_HOST || '127.0.0.1',
    port: readNumber('WORKFOX_BACKEND_PORT', 9123),
    userDataDir: process.env.WORKFOX_USER_DATA_DIR || defaultUserDataDir,
    pluginDir: process.env.WORKFOX_PLUGIN_DIR || resolve(process.env.WORKFOX_USER_DATA_DIR || defaultUserDataDir, 'plugins'),
    logLevel: (process.env.WORKFOX_LOG_LEVEL as BackendConfig['logLevel']) || (process.env.WORKFOX_DEV ? 'debug' : 'info'),
    dev: process.env.WORKFOX_DEV === '1' || process.env.NODE_ENV !== 'production',
    requestTimeoutMs: readNumber('WORKFOX_BACKEND_REQUEST_TIMEOUT_MS', 30_000),
    interactionTimeoutMs: readNumber('WORKFOX_BACKEND_INTERACTION_TIMEOUT_MS', 300_000),
    heartbeatIntervalMs: readNumber('WORKFOX_BACKEND_HEARTBEAT_MS', 15_000),
    appVersion: process.env.WORKFOX_APP_VERSION || '0.0.0',
    sessionToken: process.env.WORKFOX_BACKEND_TOKEN || undefined,
  }
}
