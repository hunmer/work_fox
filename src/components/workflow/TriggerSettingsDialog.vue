<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
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

// Cron 表单状态
const showCronForm = ref(false)
const cronFrequency = ref<'minute' | 'hour' | 'day' | 'week' | 'month'>('minute')
const cronInterval = ref(1)
const cronMinute = ref(0)
const cronHour = ref(0)
const cronWeekday = ref(1) // 0=Sun..6=Sat
const cronMonthDay = ref(1)
const cronValidating = ref(false)
const cronValidation = ref<{ valid: boolean; nextRuns: string[]; error?: string } | null>(null)

const weekdayOptions = [
  { label: '周日', value: 0 },
  { label: '周一', value: 1 },
  { label: '周二', value: 2 },
  { label: '周三', value: 3 },
  { label: '周四', value: 4 },
  { label: '周五', value: 5 },
  { label: '周六', value: 6 },
]

const cronDescription = computed(() => {
  const v = cronInterval.value
  switch (cronFrequency.value) {
    case 'minute': return v === 1 ? '每分钟执行一次' : `每 ${v} 分钟执行一次`
    case 'hour': return v === 1 ? '每小时执行一次' : `每 ${v} 小时执行一次`
    case 'day': return v === 1 ? '每天执行一次' : `每 ${v} 天执行一次`
    case 'week': return `每${weekdayOptions.find(o => o.value === cronWeekday.value)?.label}执行一次`
    case 'month': return `每月 ${cronMonthDay.value} 号执行一次`
  }
})

function buildCronExpression(): string {
  const interval = Math.max(1, cronInterval.value)
  const step = interval <= 1 ? '*' : `*/${interval}`
  switch (cronFrequency.value) {
    case 'minute': return `${step} * * * *`
    case 'hour': return `${cronMinute.value} ${step} * * *`
    case 'day': return `${cronMinute.value} ${cronHour.value} ${step} *`
    case 'week': return `${cronMinute.value} ${cronHour.value} * * ${cronWeekday.value}`
    case 'month': return `${cronMinute.value} ${cronHour.value} ${cronMonthDay.value} * *`
  }
}

// 表单变化时自动验证
let cronValidateTimer: ReturnType<typeof setTimeout> | null = null
watch(
  [cronFrequency, cronInterval, cronMinute, cronHour, cronWeekday, cronMonthDay, showCronForm],
  () => {
    cronValidation.value = null
    if (!showCronForm.value) return
    if (cronValidateTimer) clearTimeout(cronValidateTimer)
    cronValidateTimer = setTimeout(() => {
      validateCron()
    }, 300)
  },
)

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
    resetCronForm()
    hookNameInput.value = ''
    hookValidation.value = null
  }
}, { immediate: true })

function resetCronForm() {
  cronFrequency.value = 'minute'
  cronInterval.value = 1
  cronMinute.value = 0
  cronHour.value = 0
  cronWeekday.value = 1
  cronMonthDay.value = 1
  cronValidation.value = null
}

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
  cronValidating.value = true
  cronValidation.value = null
  try {
    const expr = buildCronExpression()
    cronValidation.value = await triggerApi.validateCron(expr)
  } catch {
    cronValidation.value = { valid: false, nextRuns: [], error: '验证请求失败' }
  } finally {
    cronValidating.value = false
  }
}

function addCron() {
  if (!cronValidation.value?.valid) return
  const expr = buildCronExpression()
  triggers.value.push({
    id: generateId(),
    type: 'cron',
    enabled: true,
    cron: expr,
  })
  resetCronForm()
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

function cronHumanLabel(cron: string): string {
  const parts = cron.trim().split(/\s+/)
  if (parts.length !== 5) return cron
  const [min, hour, dom, mon, dow] = parts
  if (dow !== '*' && hour !== '*' && min !== '*') {
    const day = weekdayOptions.find(o => o.value === Number(dow))
    return `${day?.label ?? dow} ${hour}:${min.padStart(2, '0')}`
  }
  if (dom !== '*' && hour !== '*' && min !== '*') {
    return `每月${dom}号 ${hour}:${min.padStart(2, '0')}`
  }
  if (dom.startsWith('*/') && hour !== '*') {
    return `每${dom.slice(2)}天 ${hour}:${min.padStart(2, '0')}`
  }
  if (hour.startsWith('*/')) {
    return `每${hour.slice(2)}小时 ${min.padStart(2, '0')}分`
  }
  if (min.startsWith('*/')) {
    return `每${min.slice(2)}分钟`
  }
  return cron
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
                {{ trigger.type === 'cron' ? cronHumanLabel(trigger.cron!) : `/hook/${trigger.hookName}` }}
              </span>
            </div>
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
            添加定时触发
          </Button>
          <Button variant="outline" size="sm" @click="showHookForm = !showHookForm; showCronForm = false">
            <Plus class="w-3.5 h-3.5 mr-1" />
            添加 Hook
          </Button>
        </div>

        <!-- Cron 表单 -->
        <div v-if="showCronForm" class="space-y-3 p-3 rounded-md border border-border bg-muted/20">
          <div class="space-y-1.5">
            <Label class="text-xs">执行频率</Label>
            <Select v-model="cronFrequency">
              <SelectTrigger class="w-full">
                <SelectValue placeholder="选择频率" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="minute">按分钟</SelectItem>
                <SelectItem value="hour">按小时</SelectItem>
                <SelectItem value="day">按天</SelectItem>
                <SelectItem value="week">按周</SelectItem>
                <SelectItem value="month">按月</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div v-if="cronFrequency === 'minute' || cronFrequency === 'hour' || cronFrequency === 'day'" class="space-y-1.5">
            <Label class="text-xs">间隔</Label>
            <Input
              v-model.number="cronInterval"
              type="number"
              :min="1"
              :max="cronFrequency === 'minute' ? 59 : cronFrequency === 'hour' ? 23 : 31"
              class="w-full text-sm"
            />
          </div>

          <div v-if="cronFrequency !== 'minute'" class="flex gap-2">
            <div class="flex-1 space-y-1.5">
              <Label class="text-xs">时</Label>
              <Input
                v-model.number="cronHour"
                type="number"
                :min="0"
                :max="23"
                class="w-full text-sm"
              />
            </div>
            <div class="flex-1 space-y-1.5">
              <Label class="text-xs">分</Label>
              <Input
                v-model.number="cronMinute"
                type="number"
                :min="0"
                :max="59"
                class="w-full text-sm"
              />
            </div>
          </div>

          <div v-if="cronFrequency === 'week'" class="space-y-1.5">
            <Label class="text-xs">星期</Label>
            <Select v-model="cronWeekday">
              <SelectTrigger class="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="d in weekdayOptions" :key="d.value" :value="d.value">
                  {{ d.label }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div v-if="cronFrequency === 'month'" class="space-y-1.5">
            <Label class="text-xs">每月第几天</Label>
            <Input
              v-model.number="cronMonthDay"
              type="number"
              :min="1"
              :max="31"
              class="w-full text-sm"
            />
          </div>

          <div class="text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1.5">
            {{ cronDescription }}
          </div>

          <div v-if="cronValidating" class="text-xs text-muted-foreground">验证中...</div>

          <div v-if="cronValidation" class="space-y-1">
            <div v-if="cronValidation.valid" class="flex items-start gap-1.5 text-xs text-green-600">
              <CheckCircle2 class="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <div>
                <div v-if="cronValidation.nextRuns.length > 0" class="text-muted-foreground">
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
