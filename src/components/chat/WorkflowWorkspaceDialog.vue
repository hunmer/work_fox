<script setup lang="ts">
import { computed } from 'vue'
import { FolderTree } from 'lucide-vue-next'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAgentSettingsStore } from '@/stores/agent-settings'
import { useTabStore } from '@/stores/tab'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const agentSettingsStore = useAgentSettingsStore()
const tabStore = useTabStore()

const workflow = computed(() => tabStore.activeStore?.currentWorkflow ?? null)
const workflowAgentConfig = computed(() => workflow.value?.agentConfig ?? null)

function syncFromGlobalWorkspace() {
  agentSettingsStore.setWorkflowWorkspaceDir(agentSettingsStore.globalSettings.workspaceDir || '')
}
</script>

<template>
  <Dialog
    :open="open"
    @update:open="emit('update:open', $event)"
  >
    <DialogContent class="sm:max-w-xl">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <FolderTree class="size-4" />
          当前工作流工作区设置
        </DialogTitle>
      </DialogHeader>

      <div v-if="workflow && workflowAgentConfig" class="space-y-4">
        <div class="space-y-2">
          <div class="text-sm font-medium">工作流</div>
          <div class="text-sm text-muted-foreground">{{ workflow.name }}</div>
        </div>

        <div class="space-y-2">
          <div class="text-sm font-medium">工作目录</div>
          <Input
            :model-value="workflowAgentConfig.workspaceDir"
            placeholder="当前 workflow 工作目录"
            @update:model-value="agentSettingsStore.setWorkflowWorkspaceDir(String($event))"
          />
          <div class="flex items-center justify-between text-xs text-muted-foreground">
            <span>全局默认目录：{{ agentSettingsStore.globalSettings.workspaceDir || '未设置' }}</span>
            <Button size="sm" variant="ghost" @click="syncFromGlobalWorkspace">
              使用全局目录
            </Button>
          </div>
        </div>

        <div class="space-y-2">
          <div class="text-sm font-medium">数据目录</div>
          <Input
            :model-value="workflowAgentConfig.dataDir"
            placeholder="当前 workflow 数据目录"
            @update:model-value="agentSettingsStore.setWorkflowDataDir(String($event))"
          />
          <p class="text-xs text-muted-foreground">当前 workflow 的专属目录，用于隔离运行时数据。</p>
        </div>
      </div>

      <div v-else class="text-sm text-muted-foreground">
        当前没有激活的工作流。
      </div>
    </DialogContent>
  </Dialog>
</template>
