<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { useWorkflowStore } from '@/stores/workflow'
import { triggerApi } from '@/lib/backend-api/trigger-domain'
import type { WorkflowTrigger } from '@shared/workflow-types'
import { Plus, Trash2, Clock, Webhook, AlertCircle, CheckCircle2 } from 'lucide-vue-next'

const props = defineProps<{
  workflowId: string
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  saved: []
}>()

const workflowStore = useWorkflowStore()

// 本地触发器列表副本
const triggers = ref<WorkflowTrigger[]>([])
const saving = ref(false)

// 添加 Cron 表单
const showCronForm = ref(false)
const cronInput = ref('')
const cronValidating = ref(false)
const cronValidation = ref<{ valid: boolean; nextRuns: string[]; error?: string } | null>(null)

// 添加 Hook 表单
const showHookForm = ref(false)
const hookNameInput = ref('')
const hookValidating = ref(false)
const hookValidation = ref<{ conflictWorkflowIds: string[]; hookUrl: string } | null>(null)

// 打开时从 workflow 同步
watch(() => props.open, (val) => {
  if (val) {
    triggers.value = JSON.parse(JSON.stringify(workflowStore.currentWorkflow?.triggers ?? []))
    showCronForm.value = false
    showHookForm.value = false
    cronInput.value = ''
    cronValidation.value = null
    hookNameInput.value = ''
    hookValidation.value = null
  }
})

const canSave = computed(() => {
  if (saving.value) return false
  return true
})

function generateId() {
  return `trigger_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function removeTrigger(id: string) {
  triggers.value = triggers.value.filter(t => t.id !== id)
}

function toggleTrigger(id: string, enabled: boolean) {
  const trigger = triggers.value.find(t => t.id === id)
  if (trigger) trigger.enabled = enabled
}

async function validateCron() {
  if (!cronInput.value.trim()) return
  cronValidating.value = true
  try {
    cronValidation.value = await triggerApi.validateCron(cronInput.value.trim())
  } catch {
    cronValidation.value = { valid: false, nextRuns: [], error: '验证请求失败' }
  } finally {
    cronValidating.value = false
  }
}

function addCron() {
  if (!cronValidation.value?.valid || !cronInput.value.trim()) return
  triggers.value.push({
    id: generateId(),
    type: 'cron',
    enabled: true,
    cron: cronInput.value.trim(),
  })
  cronInput.value = ''
  cronValidation.value = null
  showCronForm.value = false
}

async function validateHookName() {
  if (!hookNameInput.value.trim()) return
  hookValidating.value = true
  try {
    hookValidation.value = await triggerApi.checkHookName(hookNameInput.value.trim(), props.workflowId)
  } catch {
    hookValidation.value = { conflictWorkflowIds: [], hookUrl: '' }
  } finally {
    hookValidating.value = false
  }
}

function addHook() {
  if (!hookNameInput.value.trim()) return
  triggers.value.push({
    id: generateId(),
    type: 'hook',
    enabled: true,
    hookName: hookNameInput.value.trim(),
  })
  hookNameInput.value = ''
  hookValidation.value = null
  showHookForm.value = false
}

async function handleSave() {
  if (!workflowStore.currentWorkflow) return
  saving.value = true
  try {
    const updated = { ...workflowStore.currentWorkflow, triggers: triggers.value }
    await workflowStore.saveWorkflow(updated)
    emit('saved')
    emit('update:open', false)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>触发器设置</DialogTitle>
      </DialogHeader>

      <!-- 触发器列表 -->
      <div class="space-y-2 max-h-60 overflow-y-auto">
        <div
          v-for="trigger in triggers"
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
            <p v-if="trigger.type === 'hook' && workflowStore.currentWorkflow" class="text-xs text-muted-foreground mt-0.5 truncate">
              /hook/{{ trigger.hookName }}
            </p>
          </div>
          <Switch
            :checked="trigger.enabled"
            @update:checked="toggleTrigger(trigger.id, $event)"
          />
          <button
            class="shrink-0 p-1 rounded hover:bg-destructive/20 hover:text-destructive transition-colors"
            title="删除触发器"
            @click="removeTrigger(trigger.id)"
          >
            <Trash2 class="w-3.5 h-3.5" />
          </button>
        </div>

        <div v-if="triggers.length === 0" class="text-sm text-muted-foreground text-center py-4">
          暂无触发器，点击下方按钮添加
        </div>
      </div>

      <Separator />

      <!-- 添加触发器区域 -->
      <div class="space-y-3">
        <div class="flex gap-2">
          <Button variant="outline" size="sm" @click="showCronForm = !showCronForm; showHookForm = false">
            <Plus class="w-3.5 h-3.5 mr-1" />
            添加 Cron
          </Button>
          <Button variant="outline" size="sm" @click="showHookForm = !showHookForm; showCronForm = false">
            <Plus class="w-3.5 h-3.5 mr-1" />
            添加 Hook
          </Button>
        </div>

        <!-- Cron 表单 -->
        <div v-if="showCronForm" class="space-y-2 p-3 rounded-md border border-border bg-muted/20">
          <label class="text-xs font-medium text-muted-foreground">Cron 表达式</label>
          <div class="flex gap-2">
            <Input
              v-model="cronInput"
              placeholder="*/5 * * * *"
              class="flex-1 text-sm"
              @keydown.enter="validateCron"
            />
            <Button size="sm" :disabled="cronValidating || !cronInput.trim()" @click="validateCron">
              {{ cronValidating ? '验证中...' : '验证' }}
            </Button>
          </div>
          <div v-if="cronValidation" class="space-y-1">
            <div v-if="cronValidation.valid" class="flex items-start gap-1.5 text-xs text-green-600">
              <CheckCircle2 class="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <div>
                <span>表达式有效</span>
                <div v-if="cronValidation.nextRuns.length > 0" class="mt-1 text-muted-foreground">
                  下次运行：
                  <span v-for="(run, i) in cronValidation.nextRuns.slice(0, 3)" :key="i">
                    {{ new Date(run).toLocaleString() }}<span v-if="i < Math.min(cronValidation.nextRuns.length, 3) - 1">、</span>
                  </span>
                </div>
              </div>
            </div>
            <div v-else class="flex items-center gap-1.5 text-xs text-destructive">
              <AlertCircle class="w-3.5 h-3.5 shrink-0" />
              <span>{{ cronValidation.error || '表达式无效' }}</span>
            </div>
          </div>
          <Button
            v-if="cronValidation?.valid"
            size="sm"
            class="w-full"
            @click="addCron"
          >
            确认添加
          </Button>
        </div>

        <!-- Hook 表单 -->
        <div v-if="showHookForm" class="space-y-2 p-3 rounded-md border border-border bg-muted/20">
          <label class="text-xs font-medium text-muted-foreground">Hook 名称</label>
          <div class="flex gap-2">
            <Input
              v-model="hookNameInput"
              placeholder="my-hook"
              class="flex-1 text-sm"
              @keydown.enter="validateHookName"
            />
            <Button size="sm" :disabled="hookValidating || !hookNameInput.trim()" @click="validateHookName">
              {{ hookValidating ? '检查中...' : '检查' }}
            </Button>
          </div>
          <div v-if="hookValidation" class="space-y-1">
            <div v-if="hookValidation.conflictWorkflowIds.length === 0" class="flex items-start gap-1.5 text-xs text-green-600">
              <CheckCircle2 class="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <div>
                <span>名称可用</span>
                <p class="mt-1 text-muted-foreground break-all">Hook URL: {{ hookValidation.hookUrl }}</p>
              </div>
            </div>
            <div v-else class="flex items-center gap-1.5 text-xs text-destructive">
              <AlertCircle class="w-3.5 h-3.5 shrink-0" />
              <span>名称已被其他工作流使用</span>
            </div>
          </div>
          <Button
            v-if="hookValidation && hookValidation.conflictWorkflowIds.length === 0"
            size="sm"
            class="w-full"
            @click="addHook"
          >
            确认添加
          </Button>
        </div>
      </div>

      <DialogFooter class="gap-2">
        <Button variant="outline" size="sm" @click="emit('update:open', false)">
          取消
        </Button>
        <Button size="sm" :disabled="!canSave" @click="handleSave">
          {{ saving ? '保存中...' : '保存' }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
