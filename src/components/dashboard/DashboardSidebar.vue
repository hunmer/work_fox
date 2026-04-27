<script setup lang="ts">
import { computed } from 'vue'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ChevronRight } from 'lucide-vue-next'
import type { Workflow, WorkflowFolder } from '@shared/workflow-types'

const props = defineProps<{
  folders: WorkflowFolder[]
  workflows: Workflow[]
  selectedWorkflowId: string | null
}>()

const emit = defineEmits<{
  select: [workflowId: string | null]
}>()

const groupedWorkflows = computed(() => {
  const groups = new Map<string | null, Workflow[]>()
  groups.set(null, [])
  for (const folder of props.folders) {
    groups.set(folder.id, [])
  }
  for (const wf of props.workflows) {
    const key = wf.folderId ?? null
    const group = groups.get(key)
    if (group) group.push(wf)
    else groups.set(key, [wf])
  }
  return groups
})

const foldersWithWorkflows = computed(() =>
  props.folders.filter(f => (groupedWorkflows.value.get(f.id)?.length ?? 0) > 0)
)

const uncategorizedWorkflows = computed(() =>
  groupedWorkflows.value.get(null) ?? []
)
</script>

<template>
  <Sidebar collapsible="offcanvas" class="border-r">
    <SidebarHeader class="border-b px-4 py-3">
      <h2 class="text-lg font-semibold">Dashboard</h2>
    </SidebarHeader>
    <SidebarContent>
      <SidebarGroup>
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                :is-active="selectedWorkflowId === null"
                @click="emit('select', null)"
              >
                全部概览
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      <SidebarGroup v-for="folder in foldersWithWorkflows" :key="folder.id">
        <Collapsible default-open>
          <SidebarGroupLabel as-child>
            <CollapsibleTrigger class="flex w-full items-center justify-between">
              {{ folder.name }}
              <ChevronRight class="h-4 w-4 transition-transform group-data-[state=open]:rotate-90" />
            </CollapsibleTrigger>
          </SidebarGroupLabel>
          <CollapsibleContent>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem v-for="wf in groupedWorkflows.get(folder.id)" :key="wf.id">
                  <SidebarMenuButton
                    :is-active="selectedWorkflowId === wf.id"
                    @click="emit('select', wf.id)"
                  >
                    {{ wf.name }}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </CollapsibleContent>
        </Collapsible>
      </SidebarGroup>

      <SidebarGroup v-if="uncategorizedWorkflows.length">
        <SidebarGroupLabel>未分类</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem v-for="wf in uncategorizedWorkflows" :key="wf.id">
              <SidebarMenuButton
                :is-active="selectedWorkflowId === wf.id"
                @click="emit('select', wf.id)"
              >
                {{ wf.name }}
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </SidebarContent>
  </Sidebar>
</template>
