import { spawn } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { watch } from 'node:fs'
import { resolve } from 'node:path'

const cwd = process.cwd()
const backendEntry = resolve(cwd, 'out/backend/main.js')
const backendUserDataDir = resolve(cwd, 'backend/data')
const tscArgs = ['exec', 'tsc', '-p', 'tsconfig.backend.json', '--watch', '--preserveWatchOutput']

let backendProcess = null
let backendRestartTimer = null
let shuttingDown = false
let tscReady = false
let backendStarted = false

function log(scope, message) {
  process.stdout.write(`[backend-dev][${scope}] ${message}\n`)
}

function stopBackend() {
  if (!backendProcess) return
  backendProcess.kill('SIGINT')
  backendProcess = null
}

function startBackend() {
  if (shuttingDown) return
  if (!existsSync(backendEntry)) return

  stopBackend()
  backendStarted = true
  mkdirSync(backendUserDataDir, { recursive: true })
  backendProcess = spawn(process.execPath, ['--watch', backendEntry], {
    cwd,
    env: {
      ...process.env,
      WORKFOX_USER_DATA_DIR: backendUserDataDir,
    },
    stdio: ['inherit', 'pipe', 'pipe'],
  })

  backendProcess.stdout.on('data', (chunk) => {
    process.stdout.write(chunk.toString())
  })

  backendProcess.stderr.on('data', (chunk) => {
    process.stderr.write(chunk.toString())
  })

  backendProcess.on('exit', (code, signal) => {
    if (backendProcess?.exitCode === code) {
      backendProcess = null
    }
    if (!shuttingDown && signal !== 'SIGINT' && code && code !== 0) {
      log('node', `backend exited with code ${code}`)
    }
  })
}

function scheduleBackendStart() {
  if (backendRestartTimer) clearTimeout(backendRestartTimer)
  backendRestartTimer = setTimeout(() => {
    backendRestartTimer = null
    startBackend()
  }, 150)
}

const tscProcess = spawn('pnpm', tscArgs, {
  cwd,
  stdio: ['ignore', 'pipe', 'pipe'],
})

const handleTscOutput = (chunk, isError = false) => {
  const text = chunk.toString()
  const target = isError ? process.stderr : process.stdout
  target.write(text)

  if (text.includes('Found 0 errors. Watching for file changes.')) {
    tscReady = true
    scheduleBackendStart()
    return
  }

  if (tscReady && (text.includes('File change detected.') || text.includes('Found 0 errors.'))) {
    scheduleBackendStart()
  }
}

tscProcess.stdout.on('data', (chunk) => handleTscOutput(chunk, false))
tscProcess.stderr.on('data', (chunk) => handleTscOutput(chunk, true))
tscProcess.on('exit', (code) => {
  if (shuttingDown) return
  log('tsc', `watch process exited with code ${code ?? 0}`)
  shutdown(code ?? 0)
})

let entryWatcher = null
function ensureEntryWatcher() {
  if (entryWatcher) return
  const outDir = resolve(cwd, 'out/backend')
  entryWatcher = watch(outDir, { persistent: true }, (_eventType, filename) => {
    if (filename === 'main.js') {
      scheduleBackendStart()
    }
  })
  entryWatcher.on('error', () => {
    // Ignore watch errors before the first successful build creates the directory.
  })
}

function shutdown(code = 0) {
  if (shuttingDown) return
  shuttingDown = true
  if (backendRestartTimer) clearTimeout(backendRestartTimer)
  entryWatcher?.close()
  stopBackend()
  if (tscProcess.exitCode === null) {
    tscProcess.kill('SIGINT')
  }
  setTimeout(() => process.exit(code), 50)
}

ensureEntryWatcher()

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

if (existsSync(backendEntry)) {
  log('node', 'using existing compiled backend entry until watcher rebuilds')
  startBackend()
} else {
  log('node', 'waiting for initial backend build')
}
