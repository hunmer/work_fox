import { loadBackendConfig } from './app/config'
import { createLogger } from './app/logger'
import { createBackendServer } from './app/create-server'
import { createStoragePaths } from './storage/paths'
import { BackendWorkflowStore } from './storage/workflow-store'
import { BackendWorkflowVersionStore } from './storage/workflow-version-store'
import { BackendExecutionLogStore } from './storage/execution-log-store'
import { BackendOperationHistoryStore } from './storage/operation-history-store'
import { registerStorageChannels } from './ws/storage-channels'
import { BackendPluginRegistry } from './plugins/plugin-registry'
import { registerPluginChannels } from './ws/plugin-channels'
import { BackendWorkflowExecutionManager } from './workflow/execution-manager'
import { BackendInteractionManager } from './workflow/interaction-manager'
import { registerExecutionChannels } from './ws/execution-channels'

async function main(): Promise<void> {
  const config = loadBackendConfig()
  const logger = createLogger(config.logLevel)
  const backend = createBackendServer(config, logger)
  const paths = createStoragePaths(config)
  const workflowStore = new BackendWorkflowStore(paths)
  const workflowVersionStore = new BackendWorkflowVersionStore(paths)
  const executionLogStore = new BackendExecutionLogStore(paths)
  const operationHistoryStore = new BackendOperationHistoryStore(paths)
  const plugins = new BackendPluginRegistry(config, logger)
  plugins.loadAll()
  const interactionManager = new BackendInteractionManager({
    connectionManager: backend.connections,
    logger,
    defaultTimeoutMs: config.interactionTimeoutMs,
  })
  const executionManager = new BackendWorkflowExecutionManager({
    workflowStore,
    executionLogStore,
    pluginRegistry: plugins,
    interactionManager,
    emit: (channel, payload) => backend.connections.emit(channel, payload),
    logger,
  })
  registerStorageChannels(backend.router, {
    workflowStore,
    workflowVersionStore,
    executionLogStore,
    operationHistoryStore,
  })
  registerPluginChannels(backend.router, plugins)
  registerExecutionChannels(backend.router, executionManager)
  const { port } = await backend.start()

  const ready = {
    url: `ws://${config.host}:${port}/ws`,
    healthUrl: `http://${config.host}:${port}/health`,
    versionUrl: `http://${config.host}:${port}/version`,
    port,
    pid: process.pid,
  }
  process.stdout.write(`WORKFOX_BACKEND_READY ${JSON.stringify(ready)}\n`)

  const shutdown = async () => {
    logger.info('Backend shutdown requested')
    await backend.stop()
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((error) => {
  console.error('[backend][fatal]', error)
  process.exit(1)
})
