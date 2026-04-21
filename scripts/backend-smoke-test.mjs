#!/usr/bin/env node

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import process from 'node:process'
import { WebSocket } from 'ws'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const repoRoot = resolve(__dirname, '..')
const backendEntry = resolve(repoRoot, 'out/backend/main.js')
const pluginDir = resolve(repoRoot, 'resources/plugins')

const tempRoot = mkdtempSync(join(tmpdir(), 'workfox-backend-smoke-'))
const userDataDir = join(tempRoot, 'user-data')
const backendToken = 'smoke-test-token'
const clientId = 'smoke-client'

let child = null
let socket = null
let currentExecutionId = null

try {
  const ready = await startBackend()
  await assertHttpOk(`${ready.healthUrl}`)
  await assertHttpOk(`${ready.versionUrl}`)

  socket = await connectWs(ready.url)

  const ping = await invoke('system:ping', { timestamp: Date.now() })
  assert(typeof ping.serverTime === 'number', 'system:ping should return serverTime')

  const plugins = await invoke('plugin:list-workflow-plugins', undefined)
  const pluginIds = new Set(plugins.map((plugin) => plugin.id))
  assert(pluginIds.has('workfox.file-system'), 'plugin:list-workflow-plugins should include workfox.file-system')
  assert(pluginIds.has('workfox.fetch'), 'plugin:list-workflow-plugins should include workfox.fetch')

  const workflowFile = join(tempRoot, 'workflow-output.txt')
  const workflow = await createSmokeWorkflow(workflowFile)

  const listed = await invoke('workflow:list', {})
  assert(listed.some((item) => item.id === workflow.id), 'workflow:list should include created workflow')

  const recoveryBefore = await invoke('workflow:get-execution-recovery', {
    workflowId: workflow.id,
    executionId: null,
  })
  assert(recoveryBefore.found === false, 'recovery should be empty before execute')

  const started = await invoke('workflow:execute', { workflowId: workflow.id })
  currentExecutionId = started.executionId
  assert(started.status === 'running', 'workflow:execute should start in running state')

  await waitForEvent('workflow:started', (event) => event.executionId === currentExecutionId)

  const paused = await invoke('workflow:pause', { executionId: currentExecutionId })
  assert(paused.executionId === currentExecutionId, 'workflow:pause should target current execution')
  await waitForEvent('workflow:paused', (event) => event.executionId === currentExecutionId)

  const recoveryActive = await invoke('workflow:get-execution-recovery', {
    workflowId: workflow.id,
    executionId: currentExecutionId,
  })
  assert(recoveryActive.found === true, 'recovery should find paused execution')
  assert(recoveryActive.execution?.status === 'paused', 'recovery should report paused status')

  const resumed = await invoke('workflow:resume', { executionId: currentExecutionId })
  assert(resumed.status === 'running', 'workflow:resume should return running status')
  const completedEvent = await waitForEvent('workflow:completed', (event) => event.executionId === currentExecutionId)
  assert(completedEvent.log?.status === 'completed', 'workflow:completed log should be completed')

  const recoveryFinished = await invoke('workflow:get-execution-recovery', {
    workflowId: workflow.id,
    executionId: currentExecutionId,
  })
  assert(recoveryFinished.found === true, 'finished recovery should be available')
  assert(recoveryFinished.execution?.status === 'completed', 'finished recovery should report completed')

  const logs = await invoke('executionLog:list', { workflowId: workflow.id })
  const persisted = logs.find((log) => log.id === currentExecutionId)
  assert(Boolean(persisted), 'executionLog:list should include persisted execution')
  assert(persisted?.steps.some((step) => step.nodeId === 'read-file'), 'persisted execution should contain read-file step')

  const loaded = await invoke('workflow:get', { id: workflow.id })
  assert(loaded?.pluginConfigSchemes?.['workfox.fetch'] === 'smoke-scheme', 'workflow:get should keep pluginConfigSchemes')

  await invoke('workflow:delete', { id: workflow.id })

  console.log('backend smoke test passed')
} catch (error) {
  console.error('backend smoke test failed')
  console.error(error instanceof Error ? error.stack || error.message : error)
  process.exitCode = 1
} finally {
  try {
    socket?.close()
  } catch {
    // ignore
  }
  try {
    child?.kill('SIGTERM')
  } catch {
    // ignore
  }
  if (child) {
    try {
      await once(child, 'exit')
    } catch {
      // ignore
    }
  }
  rmSync(tempRoot, { recursive: true, force: true })
}

async function startBackend() {
  child = spawn(process.execPath, [backendEntry], {
    cwd: repoRoot,
    env: {
      ...process.env,
      WORKFOX_USER_DATA_DIR: userDataDir,
      WORKFOX_PLUGIN_DIR: pluginDir,
      WORKFOX_BACKEND_HOST: '127.0.0.1',
      WORKFOX_BACKEND_PORT: '0',
      WORKFOX_BACKEND_TOKEN: backendToken,
      WORKFOX_APP_VERSION: 'smoke-test',
      WORKFOX_DEV: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  child.stderr.on('data', (chunk) => {
    process.stderr.write(String(chunk))
  })

  return await new Promise((resolvePromise, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Timed out waiting for backend ready signal'))
    }, 15000)

    child.on('exit', (code) => {
      clearTimeout(timeout)
      reject(new Error(`Backend exited before ready: ${code}`))
    })

    child.stdout.on('data', (chunk) => {
      const text = String(chunk)
      for (const line of text.split('\n')) {
        if (!line.startsWith('WORKFOX_BACKEND_READY ')) continue
        clearTimeout(timeout)
        resolvePromise(JSON.parse(line.slice('WORKFOX_BACKEND_READY '.length)))
      }
    })
  })
}

async function connectWs(url) {
  const wsUrl = new URL(url)
  wsUrl.searchParams.set('token', backendToken)
  wsUrl.searchParams.set('clientId', clientId)

  const ws = new WebSocket(wsUrl)
  const pending = new Map()
  const events = []
  let serverHello = null

  ws.on('message', (chunk) => {
    const message = JSON.parse(String(chunk))
    if (message && typeof message === 'object' && message.protocolVersion === 1 && message.serverId) {
      serverHello = message
      return
    }
    if (message.type === 'response') {
      pending.get(message.id)?.resolve(message.data)
      pending.delete(message.id)
      return
    }
    if (message.type === 'error') {
      const target = message.id ? pending.get(message.id) : null
      if (target) {
        target.reject(new Error(message.error?.message || 'Unknown WS error'))
        pending.delete(message.id)
        return
      }
      events.push(message)
      return
    }
    if (message.type === 'event') {
      events.push(message)
    }
  })

  await once(ws, 'open')
  ws.send(JSON.stringify({ protocolVersion: 1, clientId }))
  await waitUntil(() => Boolean(serverHello), 3000, 'Timed out waiting for WS server hello')

  ws.invoke = (channel, data) => {
    const id = crypto.randomUUID()
    ws.send(JSON.stringify({ id, channel, type: 'request', data }))
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id)
        reject(new Error(`Timed out waiting for response: ${channel}`))
      }, 15000)
      pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer)
          resolve(value)
        },
        reject: (error) => {
          clearTimeout(timer)
          reject(error)
        },
      })
    })
  }

  ws.waitForEvent = async (channel, predicate = () => true, timeoutMs = 15000) => {
    const startedAt = Date.now()
    for (;;) {
      const index = events.findIndex((event) => event.type === 'event' && event.channel === channel && predicate(event.data))
      if (index >= 0) {
        const [event] = events.splice(index, 1)
        return event.data
      }
      if (Date.now() - startedAt > timeoutMs) {
        throw new Error(`Timed out waiting for event: ${channel}`)
      }
      await sleep(50)
    }
  }

  return ws
}

async function createSmokeWorkflow(workflowFile) {
  const now = Date.now()
  const workflow = await invoke('workflow:create', {
    data: {
      name: 'backend-smoke',
      folderId: null,
      description: 'backend smoke workflow',
      createdAt: now,
      updatedAt: now,
      enabledPlugins: ['workfox.file-system', 'workfox.fetch'],
      pluginConfigSchemes: {
        'workfox.fetch': 'smoke-scheme',
      },
      nodes: [
        { id: 'start', type: 'start', label: '开始', position: { x: 0, y: 0 }, data: {} },
        {
          id: 'write-file',
          type: 'write_file',
          label: '写文件',
          position: { x: 180, y: 0 },
          data: {
            path: workflowFile,
            content: 'backend smoke',
            encoding: 'utf-8',
            _delay: 400,
          },
        },
        {
          id: 'read-file',
          type: 'read_file',
          label: '读文件',
          position: { x: 360, y: 0 },
          data: {
            path: '{{ __data__["write-file"].data.path }}',
            encoding: 'utf-8',
          },
        },
        { id: 'end', type: 'end', label: '结束', position: { x: 540, y: 0 }, data: {} },
      ],
      edges: [
        { id: 'e1', source: 'start', target: 'write-file' },
        { id: 'e2', source: 'write-file', target: 'read-file' },
        { id: 'e3', source: 'read-file', target: 'end' },
      ],
    },
  })

  await invoke('workflow:create-plugin-scheme', {
    workflowId: workflow.id,
    pluginId: 'workfox.fetch',
    schemeName: 'smoke-scheme',
  })
  await invoke('workflow:save-plugin-scheme', {
    workflowId: workflow.id,
    pluginId: 'workfox.fetch',
    schemeName: 'smoke-scheme',
    data: {
      defaultTimeout: '12345',
      userAgent: 'SmokeAgent/1.0',
    },
  })

  return workflow
}

async function invoke(channel, data) {
  return await socket.invoke(channel, data)
}

async function waitForEvent(channel, predicate) {
  return await socket.waitForEvent(channel, predicate)
}

async function assertHttpOk(url) {
  const response = await fetch(url)
  assert(response.ok, `HTTP request failed: ${url}`)
  return await response.json()
}

async function waitUntil(check, timeoutMs, message) {
  const startedAt = Date.now()
  for (;;) {
    if (check()) return
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(message)
    }
    await sleep(25)
  }
}

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms))
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}
