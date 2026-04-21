<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useAgentSettingsStore } from '@/stores/agent-settings'
import { useTabStore } from '@/stores/tab'
import { ScrollArea } from '@/components/ui/scroll-area'
import FileTreeNode from './FileTreeNode.vue'

interface FileEntry {
  name: string
  path: string
  type: 'file' | 'directory'
}

const agentSettingsStore = useAgentSettingsStore()
const tabStore = useTabStore()

const rootEntries = ref<FileEntry[]>([])

const workspacePath = computed(() => {
  const workflowAgent = tabStore.activeStore?.currentWorkflow?.agentConfig
  if (workflowAgent?.workspaceDir) return workflowAgent.workspaceDir
  return agentSettingsStore.globalSettings.workspaceDir || ''
})

async function loadRoot() {
  if (!workspacePath.value) {
    rootEntries.value = []
    return
  }
  try {
    rootEntries.value = await window.api.fs.listDir(workspacePath.value)
  } catch {
    rootEntries.value = []
  }
}

watch(workspacePath, () => loadRoot(), { immediate: true })
</script>

<template>
  <div class="h-full flex flex-col">
    <div
      v-if="!workspacePath"
      class="flex-1 flex items-center justify-center text-sm text-muted-foreground p-4"
    >
      未设置工作目录，请在 Agent 设置中配置
    </div>
    <ScrollArea
      v-else
      class="flex-1"
    >
      <div class="p-2">
        <FileTreeNode
          v-for="entry in rootEntries"
          :key="entry.path"
          :entry="entry"
          :depth="0"
        />
        <div
          v-if="rootEntries.length === 0"
          class="text-xs text-muted-foreground text-center py-4"
        >
          空目录
        </div>
      </div>
    </ScrollArea>
  </div>
</template>
