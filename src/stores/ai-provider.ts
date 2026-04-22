import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { AIProvider, AIModel } from '@/types'

const SELECTED_PROVIDER_KEY = 'workfox-selected-provider'
const SELECTED_MODEL_KEY = 'workfox-selected-model'

export const useAIProviderStore = defineStore('ai-provider', () => {
  const api = (window as any).api?.aiProvider
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
    if (!api) {
      providers.value = []
      return
    }
    providers.value = await api.list()
    if (!selectedProviderId.value || !providers.value.find((p) => p.id === selectedProviderId.value)) {
      const first = providers.value.find((p) => p.enabled)
      if (first) {
        selectProvider(first.id)
      }
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
    if (!api) {
      throw new Error('AI provider API is not available in current runtime')
    }
    const provider = await api.create(data)
    providers.value.push(provider)
    return provider
  }

  async function updateProvider(id: string, updates: Partial<AIProvider>) {
    if (!api) {
      throw new Error('AI provider API is not available in current runtime')
    }
    const updated = await api.update({ id, ...updates })
    const index = providers.value.findIndex((p) => p.id === id)
    if (index !== -1) {
      providers.value[index] = updated
    }
    return updated
  }

  async function deleteProvider(id: string) {
    if (!api) {
      throw new Error('AI provider API is not available in current runtime')
    }
    const success = await api.delete(id)
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
    if (!api) {
      throw new Error('AI provider API is not available in current runtime')
    }
    return api.test(id)
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
