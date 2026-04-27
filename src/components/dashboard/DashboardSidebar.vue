<script setup lang="ts">
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
import { LayoutDashboard, List } from 'lucide-vue-next'
import type { DashboardView } from '@/stores/dashboard'

defineProps<{
  activeView: DashboardView
}>()

const emit = defineEmits<{
  navigate: [view: DashboardView]
}>()

const menuItems: { view: DashboardView; label: string; icon: any }[] = [
  { view: 'overview', label: '全部概览', icon: LayoutDashboard },
  { view: 'workflow-list', label: '工作流列表', icon: List },
]
</script>

<template>
  <Sidebar collapsible="offcanvas" class="border-r">
    <SidebarHeader class="border-b px-4 py-3">
      <h2 class="text-lg font-semibold">Dashboard</h2>
    </SidebarHeader>
    <SidebarContent>
      <SidebarGroup>
        <SidebarGroupLabel>导航</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem v-for="item in menuItems" :key="item.view">
              <SidebarMenuButton
                :is-active="activeView === item.view"
                @click="emit('navigate', item.view)"
              >
                <component :is="item.icon" class="h-4 w-4" />
                {{ item.label }}
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </SidebarContent>
  </Sidebar>
</template>
