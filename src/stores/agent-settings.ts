import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { AgentGlobalSettings, AgentResourceItem, WorkflowAgentConfig } from '@/types'
import { useTabStore } from './tab'

function cloneResources(items?: AgentResourceItem[]): AgentResourceItem[] {
  return Array.isArray(items) ? JSON.parse(JSON.stringify(items)) : []
}

function createEmptyGlobalSettings(): AgentGlobalSettings {
  return {
    workspaceDir: '',
    skills: [],
    mcps: [],
  }
}

export function createWorkflowAgentConfigFromGlobal(
  workflowId: string,
  globalSettings: AgentGlobalSettings,
): WorkflowAgentConfig {
  return {
    workspaceDir: globalSettings.workspaceDir || '',
    dataDir: '',
    skills: cloneResources(globalSettings.skills),
    mcps: cloneResources(globalSettings.mcps),
  }
}

export const useAgentSettingsStore = defineStore('agent-settings', () => {
  const globalSettings = ref<AgentGlobalSettings>(createEmptyGlobalSettings())
  const initialized = ref(false)
  const saving = ref(false)

  const tabStore = useTabStore()
  const activeWorkflow = computed(() => tabStore.activeStore?.currentWorkflow ?? null)
  const activeWorkflowAgentConfig = computed(() => activeWorkflow.value?.agentConfig ?? null)

  async function init() {
    if (initialized.value) return
    globalSettings.value = await window.api.agentSettings.get()
    initialized.value = true
  }

  async function saveGlobalSettings() {
    saving.value = true
    try {
      globalSettings.value = await window.api.agentSettings.set(JSON.parse(JSON.stringify(globalSettings.value)))
    } finally {
      saving.value = false
    }
  }

  function setGlobalWorkspaceDir(path: string) {
    globalSettings.value.workspaceDir = path
  }

  function upsertGlobalResource(kind: 'skills' | 'mcps', item: AgentResourceItem) {
    const list = globalSettings.value[kind]
    const index = list.findIndex((entry) => entry.id === item.id)
    if (index === -1) list.push(item)
    else list[index] = item
  }

  function removeGlobalResource(kind: 'skills' | 'mcps', id: string) {
    globalSettings.value[kind] = globalSettings.value[kind].filter((item) => item.id !== id)
  }

  function toggleGlobalResource(kind: 'skills' | 'mcps', id: string) {
    const item = globalSettings.value[kind].find((entry) => entry.id === id)
    if (item) item.enabled = !item.enabled
  }

  function ensureWorkflowConfig(): WorkflowAgentConfig | null {
    const workflow = activeWorkflow.value
    if (!workflow) return null
    if (!workflow.agentConfig) {
      workflow.agentConfig = createWorkflowAgentConfigFromGlobal(workflow.id, globalSettings.value)
    }
    return workflow.agentConfig
  }

  function setWorkflowWorkspaceDir(path: string) {
    const config = ensureWorkflowConfig()
    if (config) config.workspaceDir = path
  }

  function setWorkflowDataDir(path: string) {
    const config = ensureWorkflowConfig()
    if (config) config.dataDir = path
  }

  function upsertWorkflowResource(kind: 'skills' | 'mcps', item: AgentResourceItem) {
    const config = ensureWorkflowConfig()
    if (!config) return
    const list = config[kind]
    const index = list.findIndex((entry) => entry.id === item.id)
    if (index === -1) list.push(item)
    else list[index] = item
  }

  function removeWorkflowResource(kind: 'skills' | 'mcps', id: string) {
    const config = ensureWorkflowConfig()
    if (!config) return
    config[kind] = config[kind].filter((item) => item.id !== id)
  }

  function toggleWorkflowResource(kind: 'skills' | 'mcps', id: string) {
    const config = ensureWorkflowConfig()
    if (!config) return
    const item = config[kind].find((entry) => entry.id === id)
    if (item) item.enabled = !item.enabled
  }

  return {
    initialized,
    saving,
    globalSettings,
    activeWorkflowAgentConfig,
    init,
    saveGlobalSettings,
    setGlobalWorkspaceDir,
    upsertGlobalResource,
    removeGlobalResource,
    toggleGlobalResource,
    setWorkflowWorkspaceDir,
    setWorkflowDataDir,
    upsertWorkflowResource,
    removeWorkflowResource,
    toggleWorkflowResource,
  }
})
