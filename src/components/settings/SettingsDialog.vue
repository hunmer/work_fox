<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  Settings, Palette, Keyboard, Info, Bot, Wrench
} from 'lucide-vue-next'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import SettingsShortcut from './SettingsShortcut.vue'
import SettingsTheme from './SettingsTheme.vue'
import SettingsAbout from './SettingsAbout.vue'
import SettingsModels from './SettingsModels.vue'
import SettingsAgent from './SettingsAgent.vue'

const props = defineProps<{ open: boolean; initialTab?: string; workflowOnly?: boolean }>()
const emit = defineEmits<{ 'update:open': [value: boolean] }>()

const allTabs = [
  { key: 'models', label: '模型', icon: Bot },
  { key: 'agent', label: 'Agent', icon: Wrench },
  { key: 'theme', label: '主题', icon: Palette },
  { key: 'shortcuts', label: '快捷键', icon: Keyboard },
  { key: 'about', label: '关于', icon: Info }
]
const tabs = computed(() => props.workflowOnly
  ? allTabs.filter((tab) => tab.key === 'agent')
  : allTabs)
const activeTab = ref('models')

watch(() => props.open, (open) => {
  if (open && props.initialTab) {
    activeTab.value = props.initialTab
  }
})
</script>

<template>
  <Dialog
    :open="open"
    @update:open="emit('update:open', $event)"
  >
    <DialogContent class="sm:max-w-2xl max-h-[70vh] flex flex-col p-0 gap-0">
      <DialogHeader class="px-6 pt-6 pb-4 border-b">
        <DialogTitle class="flex items-center gap-2">
          <Settings class="w-4 h-4" />
          设置
        </DialogTitle>
      </DialogHeader>

      <div class="flex flex-1 min-h-0">
        <nav class="w-[140px] shrink-0 border-r p-2 flex flex-col gap-0.5">
          <button
            v-for="tab in tabs"
            :key="tab.key"
            class="w-full text-left text-sm px-3 py-2 rounded-md transition-colors flex items-center gap-2"
            :class="activeTab === tab.key
              ? 'bg-primary/10 text-primary font-medium'
              : 'text-muted-foreground hover:bg-muted/50'"
            @click="activeTab = tab.key"
          >
            <component
              :is="tab.icon"
              class="w-4 h-4 shrink-0"
            />
            {{ tab.label }}
          </button>
        </nav>

        <div class="flex-1 p-6 overflow-y-auto">
          <SettingsModels v-if="activeTab === 'models'" />
          <SettingsAgent v-else-if="activeTab === 'agent'" :workflow-only="workflowOnly" />
          <SettingsTheme v-else-if="activeTab === 'theme'" />
          <SettingsShortcut v-else-if="activeTab === 'shortcuts'" />
          <SettingsAbout v-else-if="activeTab === 'about'" />
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
