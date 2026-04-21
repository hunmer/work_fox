import type { BackendConfig } from './config'

type LogLevel = BackendConfig['logLevel']

const levels: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}

export interface Logger {
  debug(message: string, meta?: unknown): void
  info(message: string, meta?: unknown): void
  warn(message: string, meta?: unknown): void
  error(message: string, meta?: unknown): void
}

export function createLogger(level: LogLevel): Logger {
  function write(target: LogLevel, message: string, meta?: unknown): void {
    if (levels[target] < levels[level]) return
    const prefix = `[backend][${target}] ${message}`
    if (meta === undefined) {
      console[target === 'debug' ? 'log' : target](prefix)
      return
    }
    console[target === 'debug' ? 'log' : target](prefix, meta)
  }

  return {
    debug: (message, meta) => write('debug', message, meta),
    info: (message, meta) => write('info', message, meta),
    warn: (message, meta) => write('warn', message, meta),
    error: (message, meta) => write('error', message, meta),
  }
}
