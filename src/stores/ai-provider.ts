import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { AIProvider, AIModel } from '@/types'
import { wsBridge } from '@/lib/ws-bridge'

const SELECTED_PROVIDER_KEY = 'workfox-selected-provider'
const SELECTED_MODEL_KEY = 'workfox-selected-model'

export const useAIProviderStore = defineStore('ai-provider', () => {
  const providers = ref<AIProvider[]>([])
  const selectedProviderId = ref<string | null>(localStorage.getItem(SELECTED_PROVIDER_KEY))
  const selectedModelId = ref<string | null>(localStorage.getItem(SELECTED_MODEL_KEY))

  const currentProvider = computed(() =>
    providers.value.find((p) => p.id === selectedProviderId.value) ?? null,
  )

  const currentModel = computed<AIModel | null>(() => {
    if (!currentProvider.value) return null
    return currentProvider.value.models.find((m) => m.id === selectedModelId.value) ?? null
  })

  const allModels = computed<{ model: AIModel; provider: AIProvider }[]>(() =>
    providers.value
      .filter((p) => p.enabled)
      .flatMap((p) => p.models.map((m) => ({ model: m, provider: p }))),
  )

  async function loadProviders() {
    providers.value = await wsBridge.invoke('aiProvider:list', undefined) as AIProvider[]
    if (!selectedProviderId.value || !providers.value.find((p) => p.id === selectedProviderId.value)) {
      const first = providers.value.find((p) => p.enabled)
      if (first) {
        selectProvider(first.id)
      }
      return
    }

    const provider = providers.value.find((p) => p.id === selectedProviderId.value)
    if (!provider) return

    if (!provider.models.length) {
      selectedModelId.value = null
      localStorage.removeItem(SELECTED_MODEL_KEY)
      return
    }

    const hasSelectedModel = selectedModelId.value
      ? provider.models.some((model) => model.id === selectedModelId.value)
      : false

    if (!hasSelectedModel) {
      selectModel(provider.models[0].id)
    }
  }

  function selectProvider(providerId: string) {
    selectedProviderId.value = providerId
    localStorage.setItem(SELECTED_PROVIDER_KEY, providerId)
    const provider = providers.value.find((p) => p.id === providerId)
    if (provider?.models.length) {
      selectModel(provider.models[0].id)
    } else {
      selectedModelId.value = null
      localStorage.removeItem(SELECTED_MODEL_KEY)
    }
  }

  function selectModel(modelId: string) {
    selectedModelId.value = modelId
    localStorage.setItem(SELECTED_MODEL_KEY, modelId)
  }

  async function createProvider(data: Omit<AIProvider, 'id' | 'createdAt'>) {
    const provider = await wsBridge.invoke('aiProvider:create', { data }) as AIProvider
    providers.value.push(provider)
    return provider
  }

  async function updateProvider(id: string, updates: Partial<AIProvider>) {
    const updated = await wsBridge.invoke('aiProvider:update', { id, data: updates }) as AIProvider
    const index = providers.value.findIndex((p) => p.id === id)
    if (index !== -1) {
      providers.value[index] = updated
    }
    return updated
  }

  async function deleteProvider(id: string) {
    const { success } = await wsBridge.invoke('aiProvider:delete', { id }) as { success: boolean }
    if (success) {
      providers.value = providers.value.filter((p) => p.id !== id)
      if (selectedProviderId.value === id) {
        selectedProviderId.value = null
        selectedModelId.value = null
        localStorage.removeItem(SELECTED_PROVIDER_KEY)
        localStorage.removeItem(SELECTED_MODEL_KEY)
      }
    }
    return success
  }

  async function testConnection(id: string) {
    return wsBridge.invoke('aiProvider:test', { id }) as Promise<{ success: boolean; error?: string }>
  }

  async function init() {
    await loadProviders()
  }

  return {
    providers,
    selectedProviderId,
    selectedModelId,
    currentProvider,
    currentModel,
    allModels,
    loadProviders,
    selectProvider,
    selectModel,
    createProvider,
    updateProvider,
    deleteProvider,
    testConnection,
    init,
  }
})
