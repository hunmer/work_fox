import type { WSRouter } from './router'
import { BackendAIProviderStore } from '../storage/ai-provider-store'
import { BackendChatHistoryStore } from '../storage/chat-history-store'
import { BackendSettingsStore } from '../storage/settings-store'

export interface AppServices {
  aiProviderStore: BackendAIProviderStore
  chatHistoryStore: BackendChatHistoryStore
  agentSettingsStore: BackendSettingsStore
  shortcutStore: BackendSettingsStore
  tabStore: BackendSettingsStore
  appVersion: string
}

export function registerAppChannels(router: WSRouter, services: AppServices): void {
  const {
    aiProviderStore,
    chatHistoryStore,
    agentSettingsStore,
    shortcutStore,
    tabStore,
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
  router.register('chatHistory:listSessions', ({ workflowId }) =>
    chatHistoryStore.listSessions(workflowId),
  )
  router.register('chatHistory:createSession', ({ workflowId, session }) =>
    chatHistoryStore.createSession(workflowId, session),
  )
  router.register('chatHistory:updateSession', async ({ workflowId, sessionId, updates }) => {
    await chatHistoryStore.updateSession(workflowId, sessionId, updates)
    return undefined
  })
  router.register('chatHistory:deleteSession', async ({ workflowId, sessionId }) => {
    await chatHistoryStore.deleteSession(workflowId, sessionId)
    return undefined
  })
  router.register('chatHistory:listMessages', ({ workflowId, sessionId }) =>
    chatHistoryStore.listMessages(workflowId, sessionId),
  )
  router.register('chatHistory:addMessage', ({ workflowId, sessionId, message }) =>
    chatHistoryStore.addMessage(workflowId, sessionId, message),
  )
  router.register('chatHistory:updateMessage', async ({ workflowId, sessionId, messageId, updates }) => {
    await chatHistoryStore.updateMessage(workflowId, sessionId, messageId, updates)
    return undefined
  })
  router.register('chatHistory:deleteMessage', async ({ workflowId, sessionId, messageId }) => {
    await chatHistoryStore.deleteMessage(workflowId, sessionId, messageId)
    return undefined
  })
  router.register('chatHistory:deleteMessages', async ({ workflowId, sessionId, messageIds }) => {
    await chatHistoryStore.deleteMessages(workflowId, sessionId, messageIds)
    return undefined
  })
  router.register('chatHistory:clearMessages', async ({ workflowId, sessionId }) => {
    await chatHistoryStore.clearMessages(workflowId, sessionId)
    return undefined
  })

  // --- Agent Settings ---
  router.register('agentSettings:get', () => agentSettingsStore.get())
  router.register('agentSettings:set', ({ settings }) => agentSettingsStore.set(settings))

  // --- Shortcuts ---
  router.register('shortcut:list', async () => {
    const data: any = await shortcutStore.get()
    if (!data || typeof data !== 'object') {
      return { groups: [], shortcuts: [] }
    }
    return data
  })
  router.register('shortcut:update', async ({ id, accelerator, isGlobal, enabled }) => {
    const data: any = await shortcutStore.get()
    const shortcuts: any[] = data?.shortcuts ?? []
    const idx = shortcuts.findIndex((s: any) => s.id === id)
    if (idx !== -1) {
      shortcuts[idx] = { ...shortcuts[idx], accelerator, isGlobal, ...(enabled !== undefined ? { enabled } : {}) }
    }
    await shortcutStore.set(data)
    return undefined
  })
  router.register('shortcut:toggle', async ({ id, enabled }) => {
    const data: any = await shortcutStore.get()
    const shortcuts: any[] = data?.shortcuts ?? []
    const idx = shortcuts.findIndex((s: any) => s.id === id)
    if (idx !== -1) {
      shortcuts[idx] = { ...shortcuts[idx], enabled }
    }
    await shortcutStore.set(data)
    return undefined
  })
  router.register('shortcut:clear', async ({ id }) => {
    const data: any = await shortcutStore.get()
    const shortcuts: any[] = data?.shortcuts ?? []
    const idx = shortcuts.findIndex((s: any) => s.id === id)
    if (idx !== -1) {
      shortcuts[idx] = { ...shortcuts[idx], accelerator: '' }
    }
    await shortcutStore.set(data)
    return undefined
  })
  router.register('shortcut:reset', async () => {
    await shortcutStore.set({ groups: [], shortcuts: [] })
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
}
