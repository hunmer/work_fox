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

async function main(): Promise<void> {
  const config = loadBackendConfig()
  const logger = createLogger(config.logLevel)
  const backend = createBackendServer(config, logger)
  const paths = createStoragePaths(config)
  const plugins = new BackendPluginRegistry(config, logger)
  plugins.loadAll()
  registerStorageChannels(backend.router, {
    workflowStore: new BackendWorkflowStore(paths),
    workflowVersionStore: new BackendWorkflowVersionStore(paths),
    executionLogStore: new BackendExecutionLogStore(paths),
    operationHistoryStore: new BackendOperationHistoryStore(paths),
  })
  registerPluginChannels(backend.router, plugins)
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
