<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { usePluginStore } from '@/stores/plugin'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Checkbox } from '@/components/ui/checkbox'

const props = defineProps<{
  enabledPlugins: string[]
  open: boolean
}>()

const emit = defineEmits<{
  (e: 'update:enabledPlugins', value: string[]): void
  (e: 'update:open', value: boolean): void
}>()

const pluginStore = usePluginStore()
const workflowPlugins = ref<Array<{ id: string; name: string; description: string; nodeCount: number; enabled: boolean }>>([])

onMounted(async () => {
  const list = await pluginStore.listWorkflowPlugins()
  const enabledSet = new Set(props.enabledPlugins)
  workflowPlugins.value = list.map((p: any) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    nodeCount: p.nodeCount,
    enabled: enabledSet.has(p.id),
  }))
})

function togglePlugin(pluginId: string) {
  const updated = workflowPlugins.value.map((p) =>
    p.id === pluginId ? { ...p, enabled: !p.enabled } : p,
  )
  workflowPlugins.value = updated
  emit('update:enabledPlugins', updated.filter((p) => p.enabled).map((p) => p.id))
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:max-w-[400px]">
      <DialogHeader>
        <DialogTitle>工作流插件</DialogTitle>
      </DialogHeader>
      <ScrollArea class="max-h-[400px]">
        <div class="space-y-2 p-2">
          <div
            v-for="plugin in workflowPlugins"
            :key="plugin.id"
            class="flex items-start gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/50"
            @click="togglePlugin(plugin.id)"
          >
            <Checkbox
              :model-value="plugin.enabled"
              class="mt-0.5"
              @update:model-value="togglePlugin(plugin.id)"
              @click.stop
            />
            <div class="flex-1 min-w-0">
              <div class="font-medium text-sm">{{ plugin.name }}</div>
              <div class="text-xs text-muted-foreground mt-0.5">{{ plugin.description }}</div>
              <div class="text-xs text-muted-foreground mt-1">{{ plugin.nodeCount }} 个节点</div>
            </div>
          </div>
          <div
            v-if="workflowPlugins.length === 0"
            class="text-center text-sm text-muted-foreground py-8"
          >
            没有可用的工作流插件
          </div>
        </div>
      </ScrollArea>
    </DialogContent>
  </Dialog>
</template>
