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
import { WorkflowTriggerService } from './workflow/trigger-service'
import { BackendInteractionManager } from './workflow/interaction-manager'
import { registerExecutionChannels } from './ws/execution-channels'
import { BackendAIProviderStore } from './storage/ai-provider-store'
import { BackendChatHistoryStore } from './storage/chat-history-store'
import { BackendSettingsStore } from './storage/settings-store'
import { registerAppChannels, type AppServices } from './ws/app-channels'
import { registerFsChannels } from './ws/fs-channels'
import { ChatRuntime } from './chat/chat-runtime'
import { registerChatChannels } from './ws/chat-channels'
import { ClientNodeCache } from './chat/client-node-cache'
import { DashboardStatsStore } from './dashboard/stats-store'
import { registerDashboardChannels } from './ws/dashboard-channels'
import { registerTriggerChannels } from './ws/trigger-channels'
import { BackendStagingStore } from './storage/staging-store'
import { registerStagingChannels } from './ws/staging-channels'

async function main(): Promise<void> {
  const config = loadBackendConfig()
  const logger = createLogger(config.logLevel)
  const backend = createBackendServer(config, logger)
  const paths = createStoragePaths(config)
  const workflowStore = new BackendWorkflowStore(paths)
  const workflowVersionStore = new BackendWorkflowVersionStore(paths)
  const executionLogStore = new BackendExecutionLogStore(paths)
  const operationHistoryStore = new BackendOperationHistoryStore(paths)
  const stagingStore = new BackendStagingStore(paths)
  const aiProviderStore = new BackendAIProviderStore(paths.userDataDir)
  const chatHistoryStore = new BackendChatHistoryStore(paths.userDataDir)
  const agentSettingsStore = new BackendSettingsStore(paths.userDataDir, 'agent-settings.json')
  const executionPresetStore = new BackendSettingsStore(paths.userDataDir, 'execution-input-presets.json')
  const shortcutStore = new BackendSettingsStore(paths.userDataDir, 'shortcuts.json')
  const tabStore = new BackendSettingsStore(paths.userDataDir, 'tabs.json')
  const plugins = new BackendPluginRegistry(config, logger)
  plugins.loadAll()
  const clientNodeCache = new ClientNodeCache()
  const interactionManager = new BackendInteractionManager({
    connectionManager: backend.connections,
    logger,
    defaultTimeoutMs: config.interactionTimeoutMs,
  })
  const executionManager = new BackendWorkflowExecutionManager({
    workflowStore,
    executionLogStore,
    pluginRegistry: plugins,
    clientNodeCache,
    interactionManager,
    emit: (channel, payload) => backend.connections.emit(channel, payload),
    logger,
  })
  const triggerService = new WorkflowTriggerService(workflowStore, executionManager, config, logger)
  await triggerService.start()
  backend.registerHookHandler(triggerService)
  registerStorageChannels(backend.router, {
    workflowStore,
    workflowVersionStore,
    executionLogStore,
    operationHistoryStore,
  }, triggerService)
  registerPluginChannels(backend.router, plugins)
  registerExecutionChannels(backend.router, executionManager)
  registerAppChannels(backend.router, {
    aiProviderStore,
    chatHistoryStore,
    agentSettingsStore,
    executionPresetStore,
    shortcutStore,
    tabStore,
    pluginRegistry: plugins,
    appVersion: '0.0.12',
  })
  registerFsChannels(backend.router)
  // Dashboard
  const dashboardStatsStore = new DashboardStatsStore(
    paths,
    () => workflowStore.listWorkflows(),
    (id: string) => workflowStore.getWorkflow(id),
    () => executionManager.getRunningSessionCount(),
    () => plugins.list().length,
  )
  registerDashboardChannels(backend.router, { dashboardStatsStore })
  registerTriggerChannels(backend.router, triggerService)
  registerStagingChannels(backend.router, { stagingStore })
  backend.connections.onClientDisconnected((clientId) => {
    clientNodeCache.unregisterClient(clientId)
  })
  const chatRuntime = new ChatRuntime(
    aiProviderStore,
    logger,
    workflowStore,
    executionManager,
    executionLogStore,
    plugins,
    interactionManager,
    clientNodeCache,
    backend.connections,
  )
  registerChatChannels(backend.router, {
    chatRuntime,
    connectionManager: backend.connections,
    clientNodeCache,
  })
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
