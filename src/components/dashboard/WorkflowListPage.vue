<script setup lang="ts">
import { computed, ref } from 'vue'
import WorkflowDetailPanel from './WorkflowDetailPanel.vue'
import TriggerSettingsDialog from '@/components/workflow/TriggerSettingsDialog.vue'
import { useDashboardStore } from '@/stores/dashboard'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { ChevronRight, Clock, Webhook, Zap } from 'lucide-vue-next'
import type { Workflow } from '@shared/workflow-types'

const store = useDashboardStore()

const groupedWorkflows = computed(() => {
  const groups = new Map<string | null, Workflow[]>()
  groups.set(null, [])
  for (const folder of store.folders) {
    groups.set(folder.id, [])
  }
  for (const wf of store.workflows) {
    const key = wf.folderId ?? null
    const group = groups.get(key)
    if (group) group.push(wf)
    else groups.set(key, [wf])
  }
  return groups
})

const foldersWithWorkflows = computed(() =>
  store.folders.filter(f => (groupedWorkflows.value.get(f.id)?.length ?? 0) > 0)
)

const uncategorizedWorkflows = computed(() =>
  groupedWorkflows.value.get(null) ?? []
)

function handleSelectWorkflow(wfId: string) {
  store.selectWorkflow(wfId)
}

function hasEnabledCronTrigger(wf: Workflow): boolean {
  return wf.triggers?.some(t => t.type === 'cron' && t.enabled) ?? false
}

function hasEnabledHookTrigger(wf: Workflow): boolean {
  return wf.triggers?.some(t => t.type === 'hook' && t.enabled) ?? false
}

// TriggerSettingsDialog 状态
const triggerDialogOpen = ref(false)

const selectedWorkflow = computed(() =>
  store.workflows.find(wf => wf.id === store.selectedWorkflowId) ?? null
)

function openTriggerDialog() {
  triggerDialogOpen.value = true
}
</script>

<template>
  <div class="flex h-full">
    <!-- Left: Workflow List -->
    <div class="w-72 shrink-0 border-r flex flex-col">
      <div class="p-4 border-b">
        <h2 class="font-semibold">工作流列表</h2>
      </div>
      <ScrollArea class="flex-1">
        <div class="p-2">
          <div v-for="folder in foldersWithWorkflows" :key="folder.id" class="mb-2">
            <Collapsible default-open>
              <CollapsibleTrigger class="group flex w-full items-center justify-between px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
                {{ folder.name }}
                <ChevronRight class="h-4 w-4 transition-transform group-data-[state=open]:rotate-90" />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div class="mt-1 space-y-0.5">
                  <button
                    v-for="wf in groupedWorkflows.get(folder.id)"
                    :key="wf.id"
                    class="w-full rounded-md px-3 py-1.5 text-sm text-left transition-colors flex items-center gap-1.5"
                    :class="store.selectedWorkflowId === wf.id
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-muted'"
                    @click="handleSelectWorkflow(wf.id)"
                  >
                    <span class="truncate flex-1 min-w-0">{{ wf.name }}</span>
                    <span v-if="hasEnabledCronTrigger(wf)" class="shrink-0 text-xs" title="Cron 触发器">&#x23F0;</span>
                    <span v-if="hasEnabledHookTrigger(wf)" class="shrink-0 text-xs" title="Hook 触发器">&#x1F517;</span>
                  </button>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>

          <div v-if="uncategorizedWorkflows.length" class="mb-2">
            <div class="px-3 py-1.5 text-sm font-medium text-muted-foreground">未分类</div>
            <div class="space-y-0.5">
              <button
                v-for="wf in uncategorizedWorkflows"
                :key="wf.id"
                class="w-full rounded-md px-3 py-1.5 text-sm text-left transition-colors flex items-center gap-1.5"
                :class="store.selectedWorkflowId === wf.id
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-muted'"
                @click="handleSelectWorkflow(wf.id)"
              >
                <span class="truncate flex-1 min-w-0">{{ wf.name }}</span>
                <span v-if="hasEnabledCronTrigger(wf)" class="shrink-0 text-xs" title="Cron 触发器">&#x23F0;</span>
                <span v-if="hasEnabledHookTrigger(wf)" class="shrink-0 text-xs" title="Hook 触发器">&#x1F517;</span>
              </button>
            </div>
          </div>

          <div v-if="store.workflows.length === 0 && !store.sidebarLoading" class="px-3 py-8 text-center text-sm text-muted-foreground">
            暂无工作流
          </div>
          <div v-if="store.sidebarLoading" class="px-3 py-4 text-center text-sm text-muted-foreground">
            加载中...
          </div>
        </div>
      </ScrollArea>
    </div>

    <!-- Right: Workflow Detail or Placeholder -->
    <div class="flex-1 overflow-auto">
      <template v-if="store.selectedWorkflowId">
        <div class="px-4 lg:px-6">
          <WorkflowDetailPanel
            :detail="store.workflowDetail"
            :loading="store.workflowDetailLoading"
          />

          <!-- 触发器信息区块 -->
          <Card v-if="selectedWorkflow && selectedWorkflow.triggers?.length" class="mt-4">
            <CardHeader class="flex flex-row items-center justify-between pb-2">
              <CardTitle class="text-sm font-medium">触发器</CardTitle>
              <Button variant="ghost" size="sm" class="h-7 gap-1 text-xs" @click="openTriggerDialog">
                <Zap class="w-3.5 h-3.5" />
                编辑触发器
              </Button>
            </CardHeader>
            <CardContent class="space-y-2">
              <div
                v-for="trigger in selectedWorkflow.triggers"
                :key="trigger.id"
                class="flex items-center gap-3 px-3 py-2 rounded-md border border-border bg-muted/30"
              >
                <component :is="trigger.type === 'cron' ? Clock : Webhook" class="w-4 h-4 shrink-0 text-muted-foreground" />
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2">
                    <Badge variant="secondary" class="text-[10px] px-1.5 py-0">
                      {{ trigger.type === 'cron' ? 'Cron' : 'Hook' }}
                    </Badge>
                    <span class="text-sm truncate">
                      {{ trigger.type === 'cron' ? trigger.cron : trigger.hookName }}
                    </span>
                  </div>
                </div>
                <Badge :variant="trigger.enabled ? 'default' : 'outline'" class="text-[10px]">
                  {{ trigger.enabled ? '已启用' : '已禁用' }}
                </Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      </template>
      <div v-else class="flex h-full items-center justify-center text-sm text-muted-foreground">
        请从左侧选择一个工作流查看详情
      </div>
    </div>
  </div>

  <TriggerSettingsDialog
    v-if="selectedWorkflow"
    :workflow-id="selectedWorkflow.id"
    :open="triggerDialogOpen"
    @update:open="triggerDialogOpen = $event"
    @saved="store.selectWorkflow(selectedWorkflow.id)"
  />
</template>
