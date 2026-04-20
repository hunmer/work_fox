<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useAgentSettingsStore } from '@/stores/agent-settings'

type ResourceKind = 'skills' | 'mcps'

const store = useAgentSettingsStore()
const form = ref({
  kind: 'skills' as ResourceKind,
  id: '',
  name: '',
  description: '',
  command: '',
  source: '',
})

const globalSettings = computed(() => store.globalSettings)

function resetForm() {
  form.value.id = ''
  form.value.name = ''
  form.value.description = ''
  form.value.command = ''
  form.value.source = ''
}

function startEdit(kind: ResourceKind, item: any) {
  form.value.kind = kind
  form.value.id = item.id
  form.value.name = item.name
  form.value.description = item.description || ''
  form.value.command = item.command || ''
  form.value.source = item.source || ''
}

function submitResource() {
  const name = form.value.name.trim()
  if (!name) return
  store.upsertGlobalResource(form.value.kind, {
    id: form.value.id || crypto.randomUUID(),
    name,
    enabled: true,
    description: form.value.description.trim() || undefined,
    command: form.value.command.trim() || undefined,
    source: form.value.source.trim() || undefined,
  })
  store.saveGlobalSettings()
  resetForm()
}

function toggleResource(kind: ResourceKind, id: string) {
  store.toggleGlobalResource(kind, id)
  store.saveGlobalSettings()
}

function removeResource(kind: ResourceKind, id: string) {
  store.removeGlobalResource(kind, id)
  store.saveGlobalSettings()
}

function saveGlobalWorkspaceDir(value: string) {
  store.setGlobalWorkspaceDir(value)
  store.saveGlobalSettings()
}

onMounted(() => {
  store.init()
})
</script>

<template>
  <div class="space-y-6">
    <div class="space-y-2">
      <div class="flex items-center justify-between">
        <div>
          <h3 class="text-sm font-medium">工作目录</h3>
          <p class="text-xs text-muted-foreground">全局工作目录用于新建 workflow 默认继承。</p>
        </div>
        <Badge variant="secondary">Agent</Badge>
      </div>
      <Input
        :model-value="globalSettings.workspaceDir"
        placeholder="全局工作目录绝对路径"
        @update:model-value="saveGlobalWorkspaceDir(String($event))"
      />
    </div>

    <div class="grid gap-4 md:grid-cols-2">
      <section class="space-y-3">
        <div class="text-sm font-medium">全局 Skills</div>
        <div v-for="item in globalSettings.skills" :key="item.id" class="rounded-md border p-3 space-y-2">
          <div class="flex items-center justify-between gap-3">
            <div class="min-w-0">
              <div class="font-medium text-sm truncate">{{ item.name }}</div>
              <div class="text-xs text-muted-foreground break-all">{{ item.source || item.command || item.description }}</div>
            </div>
            <Switch :model-value="item.enabled" @update:model-value="toggleResource('skills', item.id)" />
          </div>
          <div class="flex gap-2">
            <Button size="sm" variant="outline" @click="startEdit('skills', item)">编辑</Button>
            <Button size="sm" variant="ghost" @click="removeResource('skills', item.id)">删除</Button>
          </div>
        </div>
      </section>

      <section class="space-y-3">
        <div class="text-sm font-medium">全局 MCP</div>
        <div v-for="item in globalSettings.mcps" :key="item.id" class="rounded-md border p-3 space-y-2">
          <div class="flex items-center justify-between gap-3">
            <div class="min-w-0">
              <div class="font-medium text-sm truncate">{{ item.name }}</div>
              <div class="text-xs text-muted-foreground break-all">{{ item.source || item.command || item.description }}</div>
            </div>
            <Switch :model-value="item.enabled" @update:model-value="toggleResource('mcps', item.id)" />
          </div>
          <div class="flex gap-2">
            <Button size="sm" variant="outline" @click="startEdit('mcps', item)">编辑</Button>
            <Button size="sm" variant="ghost" @click="removeResource('mcps', item.id)">删除</Button>
          </div>
        </div>
      </section>
    </div>

    <div class="rounded-md border p-4 space-y-3">
      <div class="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          :class="form.kind === 'skills' ? 'border-primary text-primary' : ''"
          @click="form.kind = 'skills'"
        >
          Skill
        </Button>
        <Button
          size="sm"
          variant="outline"
          :class="form.kind === 'mcps' ? 'border-primary text-primary' : ''"
          @click="form.kind = 'mcps'"
        >
          MCP
        </Button>
        <Badge variant="outline">全局</Badge>
      </div>
      <Input v-model="form.name" placeholder="名称" />
      <Input v-model="form.source" placeholder="来源路径 / 包名 / URL" />
      <Input v-model="form.command" placeholder="启动命令（MCP 可选）" />
      <Textarea v-model="form.description" placeholder="说明" class="min-h-20" />
      <div class="flex gap-2">
        <Button size="sm" @click="submitResource">保存</Button>
        <Button size="sm" variant="ghost" @click="resetForm">清空</Button>
      </div>
    </div>
  </div>
</template>
