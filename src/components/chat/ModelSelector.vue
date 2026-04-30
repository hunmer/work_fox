<script setup lang="ts">
import { computed, ref } from 'vue'
import { Check, ChevronDown, Sparkles } from 'lucide-vue-next'
import { useAIProviderStore } from '@/stores/ai-provider'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'

const providerStore = useAIProviderStore()
const open = ref(false)

const enabledProviders = computed(() => providerStore.providers.filter((provider) => provider.enabled))

const currentModelLabel = computed(() => {
  const provider = providerStore.providers.find((item) => item.id === providerStore.selectedProviderId)
  const model = provider?.models.find((item) => item.id === providerStore.selectedModelId)
  return model?.name || '选择模型'
})

function handleModelChange(value: string) {
  const [providerId, modelId] = value.split(':')
  if (!providerId || !modelId) return
  providerStore.selectProvider(providerId)
  providerStore.selectModel(modelId)
  open.value = false
}

function isCurrentModel(providerId: string, modelId: string) {
  return providerStore.selectedProviderId === providerId && providerStore.selectedModelId === modelId
}
</script>

<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <Button variant="ghost" size="sm" class="h-7 w-[180px] justify-between px-2 text-xs">
        <span class="truncate">{{ currentModelLabel }}</span>
        <ChevronDown class="ml-2 size-3.5 shrink-0 opacity-70" />
      </Button>
    </PopoverTrigger>
    <PopoverContent
      align="end"
      side="top"
      :side-offset="8"
      class="z-[20000] w-[280px] p-0"
    >
      <Command>
        <CommandInput placeholder="搜索模型..." />
        <CommandList>
          <CommandEmpty>没有可用模型</CommandEmpty>
          <CommandGroup
            v-for="provider in enabledProviders"
            :key="provider.id"
            :heading="provider.name"
          >
            <CommandItem
              v-for="model in provider.models"
              :key="model.id"
              :value="`${provider.name} ${model.name} ${model.id}`"
              class="flex items-center justify-between gap-2 text-xs"
              @select="handleModelChange(`${provider.id}:${model.id}`)"
            >
              <div class="min-w-0">
                <div class="truncate">{{ model.name }}</div>
                <div class="truncate text-[10px] text-muted-foreground">
                  {{ model.id }}
                </div>
              </div>
              <div class="flex items-center gap-1 shrink-0">
                <Sparkles
                  v-if="model.supportsThinking"
                  class="size-3 text-muted-foreground"
                />
                <Check
                  v-if="isCurrentModel(provider.id, model.id)"
                  class="size-3.5"
                />
              </div>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    </PopoverContent>
  </Popover>
</template>
