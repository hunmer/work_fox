<script setup lang="ts">
import { computed } from 'vue'
import WorkflowDetailPanel from './WorkflowDetailPanel.vue'
import { useDashboardStore } from '@/stores/dashboard'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ChevronRight } from 'lucide-vue-next'
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
                    class="w-full rounded-md px-3 py-1.5 text-sm text-left transition-colors"
                    :class="store.selectedWorkflowId === wf.id
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-muted'"
                    @click="handleSelectWorkflow(wf.id)"
                  >
                    {{ wf.name }}
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
                class="w-full rounded-md px-3 py-1.5 text-sm text-left transition-colors"
                :class="store.selectedWorkflowId === wf.id
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-muted'"
                @click="handleSelectWorkflow(wf.id)"
              >
                {{ wf.name }}
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
        </div>
      </template>
      <div v-else class="flex h-full items-center justify-center text-sm text-muted-foreground">
        请从左侧选择一个工作流查看详情
      </div>
    </div>
  </div>
</template>
