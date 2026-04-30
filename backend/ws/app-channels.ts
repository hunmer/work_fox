import type { WSRouter } from './router'
import { BackendAIProviderStore } from '../storage/ai-provider-store'
import { BackendChatHistoryStore } from '../storage/chat-history-store'
import { BackendSettingsStore } from '../storage/settings-store'
import type { BackendPluginRegistry } from '../plugins/plugin-registry'
import {
  SHORTCUT_GROUPS,
  SHORTCUT_ACTIONS,
  getMergedBindings,
  type ShortcutBinding,
} from '../../shared/shortcut-types'

export interface AppServices {
  aiProviderStore: BackendAIProviderStore
  chatHistoryStore: BackendChatHistoryStore
  agentSettingsStore: BackendSettingsStore
  executionPresetStore: BackendSettingsStore
  shortcutStore: BackendSettingsStore
  tabStore: BackendSettingsStore
  pluginRegistry: BackendPluginRegistry
  appVersion: string
}

export function registerAppChannels(router: WSRouter, services: AppServices): void {
  const {
    aiProviderStore,
    chatHistoryStore,
    agentSettingsStore,
    executionPresetStore,
    shortcutStore,
    tabStore,
    pluginRegistry,
    appVersion,
  } = services

  // --- AI Provider ---
  router.register('aiProvider:list', () => aiProviderStore.list())
  router.register('aiProvider:create', ({ data }) => aiProviderStore.create(data))
  router.register('aiProvider:update', async ({ id, data }) => {
    await aiProviderStore.update(id, data)
    const updated = await aiProviderStore.get(id)
    if (!updated) throw new Error(`Provider not found after update: ${id}`)
    return updated
  })
  router.register('aiProvider:delete', async ({ id }) => {
    const success = await aiProviderStore.delete(id)
    return { success }
  })
  router.register('aiProvider:test', async ({ id }) => {
    const provider = await aiProviderStore.get(id)
    if (!provider) {
      return { success: false, error: `Provider not found: ${id}` }
    }
    try {
      const url = `${provider.apiBase}/models`
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${provider.apiKey}` },
        signal: AbortSignal.timeout(10_000),
      })
      if (!res.ok) {
        return { success: false, error: `HTTP ${res.status}: ${res.statusText}` }
      }
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err?.message ?? String(err) }
    }
  })

  // --- Chat History ---
  router.register('chatHistory:listSessions', ({ scopeKey }) =>
    chatHistoryStore.listSessions(scopeKey),
  )
  router.register('chatHistory:createSession', ({ scopeKey, session }) =>
    chatHistoryStore.createSession(scopeKey, session),
  )
  router.register('chatHistory:updateSession', async ({ scopeKey, sessionId, updates }) => {
    await chatHistoryStore.updateSession(scopeKey, sessionId, updates)
    return undefined
  })
  router.register('chatHistory:deleteSession', async ({ scopeKey, sessionId }) => {
    await chatHistoryStore.deleteSession(scopeKey, sessionId)
    return undefined
  })
  router.register('chatHistory:listMessages', ({ scopeKey, sessionId }) =>
    chatHistoryStore.listMessages(scopeKey, sessionId),
  )
  router.register('chatHistory:addMessage', ({ scopeKey, sessionId, message }) =>
    chatHistoryStore.addMessage(scopeKey, sessionId, message),
  )
  router.register('chatHistory:updateMessage', async ({ scopeKey, sessionId, messageId, updates }) => {
    await chatHistoryStore.updateMessage(scopeKey, sessionId, messageId, updates)
    return undefined
  })
  router.register('chatHistory:deleteMessage', async ({ scopeKey, sessionId, messageId }) => {
    await chatHistoryStore.deleteMessage(scopeKey, sessionId, messageId)
    return undefined
  })
  router.register('chatHistory:deleteMessages', async ({ scopeKey, sessionId, messageIds }) => {
    await chatHistoryStore.deleteMessages(scopeKey, sessionId, messageIds)
    return undefined
  })
  router.register('chatHistory:clearMessages', async ({ scopeKey, sessionId }) => {
    await chatHistoryStore.clearMessages(scopeKey, sessionId)
    return undefined
  })
  router.register('chatHistory:importData', async ({ scopeKey, data }) => {
    await chatHistoryStore.importData(scopeKey, data)
    return undefined
  })
  router.register('chatHistory:listAllScopeKeys', () =>
    chatHistoryStore.listAllScopeKeys(),
  )
  router.register('chatHistory:getPath', ({ scopeKey }) =>
    chatHistoryStore.getPath(scopeKey),
  )

  // --- Agent Settings ---
  router.register('agentSettings:get', () => agentSettingsStore.get())
  router.register('agentSettings:set', ({ settings }) => agentSettingsStore.set(settings))

  // --- Execution Input Presets ---
  async function getPresetMap(): Promise<Record<string, any[]>> {
    const data: any = await executionPresetStore.get()
    return data && typeof data === 'object' ? data : {}
  }

  router.register('executionPreset:list', async ({ workflowId }) => {
    const map = await getPresetMap()
    return map[workflowId] ?? []
  })
  router.register('executionPreset:save', async ({ workflowId, preset }) => {
    const map = await getPresetMap()
    const list = map[workflowId] ?? []
    const idx = list.findIndex((p: any) => p.id === preset.id)
    if (idx !== -1) {
      list[idx] = preset
    } else {
      list.push(preset)
    }
    map[workflowId] = list
    await executionPresetStore.set(map)
    return undefined
  })
  router.register('executionPreset:delete', async ({ workflowId, presetId }) => {
    const map = await getPresetMap()
    const list = map[workflowId] ?? []
    map[workflowId] = list.filter((p: any) => p.id !== presetId)
    // clear default if the deleted preset was the default
    const defaults = map._defaults ?? {}
    if (defaults[workflowId] === presetId) {
      delete defaults[workflowId]
      map._defaults = defaults
    }
    await executionPresetStore.set(map)
    return undefined
  })
  router.register('executionPreset:get-default', async ({ workflowId }) => {
    const map = await getPresetMap()
    const defaults = map._defaults ?? {}
    return { presetId: defaults[workflowId] ?? null }
  })
  router.register('executionPreset:set-default', async ({ workflowId, presetId }) => {
    const map = await getPresetMap()
    const defaults = map._defaults ?? {}
    if (presetId) {
      defaults[workflowId] = presetId
    } else {
      delete defaults[workflowId]
    }
    map._defaults = defaults
    await executionPresetStore.set(map)
    return undefined
  })

  // --- Shortcuts ---
  async function getStoredBindings(): Promise<ShortcutBinding[]> {
    const data: any = await shortcutStore.get()
    return Array.isArray(data?.shortcuts) ? data.shortcuts : []
  }

  async function setStoredBindings(bindings: ShortcutBinding[]): Promise<void> {
    await shortcutStore.set({ shortcuts: bindings })
  }

  router.register('shortcut:list', async () => {
    const stored = await getStoredBindings()
    const bindings = getMergedBindings(stored)
    const shortcuts = bindings.map(b => {
      const action = SHORTCUT_ACTIONS.find(a => a.id === b.id)
      return {
        ...b,
        label: action?.label ?? b.id,
        supportsGlobal: action?.supportsGlobal ?? false,
        defaultAccelerator: action?.defaultAccelerator ?? '',
        group: action?.group ?? '',
        electronOnly: action?.electronOnly ?? false,
      }
    })
    return { groups: SHORTCUT_GROUPS, shortcuts }
  })
  router.register('shortcut:update', async ({ id, accelerator, isGlobal, enabled }) => {
    let stored = await getStoredBindings()
    const idx = stored.findIndex(s => s.id === id)
    const binding: ShortcutBinding = {
      id,
      accelerator,
      global: isGlobal,
      enabled: enabled ?? (idx !== -1 ? stored[idx].enabled : true),
    }
    if (idx !== -1) {
      stored[idx] = { ...stored[idx], ...binding }
    } else {
      stored.push(binding)
    }
    await setStoredBindings(stored)

    // conflict check
    const merged = getMergedBindings(stored)
    const conflict = merged.find(b => b.id !== id && b.accelerator === accelerator && b.enabled)
    if (conflict) {
      const conflictAction = SHORTCUT_ACTIONS.find(a => a.id === conflict.id)
      return { success: false, error: `快捷键已被「${conflictAction?.label}」占用`, conflictId: conflict.id }
    }
    return { success: true }
  })
  router.register('shortcut:toggle', async ({ id, enabled }) => {
    const stored = await getStoredBindings()
    const idx = stored.findIndex(s => s.id === id)
    if (idx !== -1) {
      stored[idx] = { ...stored[idx], enabled }
    } else {
      const action = SHORTCUT_ACTIONS.find(a => a.id === id)
      if (action) stored.push({ id, accelerator: action.defaultAccelerator, global: false, enabled })
    }
    await setStoredBindings(stored)
    return { success: true }
  })
  router.register('shortcut:clear', async ({ id }) => {
    const stored = await getStoredBindings()
    const idx = stored.findIndex(s => s.id === id)
    if (idx !== -1) {
      stored[idx] = { ...stored[idx], accelerator: '' }
    }
    await setStoredBindings(stored)
    return undefined
  })
  router.register('shortcut:reset', async () => {
    await setStoredBindings([])
    return undefined
  })

  // --- Tabs ---
  router.register('tabs:load', async () => {
    const data: any = await tabStore.get()
    if (!data || typeof data !== 'object') {
      return { tabs: [], activeTabId: null }
    }
    return data
  })
  router.register('tabs:save', async ({ tabs, activeTabId }) => {
    await tabStore.set({ tabs, activeTabId })
    return undefined
  })

  // --- App ---
  router.register('app:getVersion', () => ({ version: appVersion }))

  // --- Agent / Tool Execution ---
  router.register('agent:execTool', async ({ toolType, params }) => {
    if (!toolType) {
      throw new Error('缺少工具类型')
    }

    if (!pluginRegistry.canExecuteNode(toolType)) {
      throw new Error(`Tool not available: ${toolType}`)
    }

    return pluginRegistry.executeWorkflowNode(toolType, params || {}, {
      logger: {
        info: () => undefined,
        warning: () => undefined,
        error: () => undefined,
      },
    })
  })
}
