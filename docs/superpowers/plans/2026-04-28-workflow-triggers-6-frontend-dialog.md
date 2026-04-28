# Workflow Triggers Plan 6: 前端 TriggerSettingsDialog

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans.

**Goal:** 创建触发器设置对话框组件，支持 cron/hook 触发器的增删改、验证、测试。

**Architecture:** 独立 Vue 对话框组件，通过 Props 接收 workflowId，Emits 通知保存。使用项目现有 shadcn-vue 组件库。

**Tech Stack:** Vue 3 Composition API, shadcn-vue, triggerApi

**Spec:** Section 5.1 "TriggerSettingsDialog"

**Depends on:** Plan 5 (triggerApi)

---

### Task 13: 创建 TriggerSettingsDialog 组件

**Files:**
- Create: `src/components/workflow/TriggerSettingsDialog.vue`

- [ ] **Step 1: 创建组件骨架**

```vue
<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useWorkflowStore } from '@/stores/workflow'
import { triggerApi } from '@/lib/backend-api/trigger-domain'
import type { WorkflowTrigger } from '@shared/workflow-types'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  Button, Input, Switch, Badge, Separator
} from '@/components/ui'

const props = defineProps<{
  workflowId: string
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'saved': []
}>()

const workflowStore = useWorkflowStore()

// 本地编辑状态
const triggers = ref<WorkflowTrigger[]>([])
const newCronExpr = ref('')
const newHookName = ref('')
const cronValidation = ref<{ valid: boolean; nextRuns: string[]; error?: string } | null>(null)
const hookCheck = ref<{ conflictWorkflowIds: string[]; hookUrl: string } | null>(null)
const adding = ref<'cron' | 'hook' | null>(null)

// 初始化: open 变化时同步 triggers
watch(() => props.open, (val) => {
  if (val) {
    const wf = workflowStore.currentWorkflow
    triggers.value = wf?.triggers ? JSON.parse(JSON.stringify(wf.triggers)) : []
    adding.value = null
    newCronExpr.value = ''
    newHookName.value = ''
    cronValidation.value = null
    hookCheck.value = null
  }
})

const hasCron = computed(() => triggers.value.some(t => t.type === 'cron' && t.enabled))
const hasHook = computed(() => triggers.value.some(t => t.type === 'hook' && t.enabled))

// --- Cron ---
async function validateCron() {
  if (!newCronExpr.value) return
  cronValidation.value = await triggerApi.validateCron(newCronExpr.value)
}

function addCronTrigger() {
  if (!cronValidation.value?.valid) return
  triggers.value.push({
    id: crypto.randomUUID(),
    enabled: true,
    type: 'cron',
    cron: newCronExpr.value
  })
  newCronExpr.value = ''
  cronValidation.value = null
  adding.value = null
}

// --- Hook ---
async function checkHookName() {
  if (!newHookName.value) return
  hookCheck.value = await triggerApi.checkHookName(newHookName.value, props.workflowId)
}

function addHookTrigger() {
  if (!newHookName.value.trim()) return
  triggers.value.push({
    id: crypto.randomUUID(),
    enabled: true,
    type: 'hook',
    hookName: newHookName.value.trim()
  })
  newHookName.value = ''
  hookCheck.value = null
  adding.value = null
}

// --- 通用 ---
function toggleTrigger(id: string) {
  const t = triggers.value.find(t => t.id === id)
  if (t) t.enabled = !t.enabled
}

function removeTrigger(id: string) {
  triggers.value = triggers.value.filter(t => t.id !== id)
}

async function save() {
  await workflowStore.updateWorkflow({ triggers: triggers.value })
  emit('saved')
  emit('update:open', false)
}
</script>
```

- [ ] **Step 2: 编写模板部分**

模板结构（参考 spec Section 5.1 的布局）：

```html
<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>触发器设置</DialogTitle>
      </DialogHeader>

      <!-- 触发器列表 -->
      <div class="space-y-2">
        <div v-for="t in triggers" :key="t.id"
          class="flex items-center justify-between p-2 rounded border">
          <div class="flex items-center gap-2">
            <Badge variant="outline">{{ t.type === 'cron' ? 'Cron' : 'Hook' }}</Badge>
            <span class="text-sm font-mono">
              {{ t.type === 'cron' ? t.cron : t.hookName }}
            </span>
          </div>
          <div class="flex items-center gap-2">
            <Switch :checked="t.enabled" @update:checked="toggleTrigger(t.id)" />
            <Button variant="ghost" size="sm" @click="removeTrigger(t.id)">删除</Button>
          </div>
        </div>
        <div v-if="triggers.length === 0" class="text-sm text-muted-foreground py-2">
          暂无触发器
        </div>
      </div>

      <!-- 添加按钮 -->
      <div v-if="!adding" class="flex gap-2">
        <Button variant="outline" size="sm" @click="adding = 'cron'">+ Cron 定时</Button>
        <Button variant="outline" size="sm" @click="adding = 'hook'">+ HTTP Hook</Button>
      </div>

      <!-- 添加 Cron 表单 -->
      <div v-if="adding === 'cron'" class="space-y-2 border rounded p-3">
        <div class="text-sm font-medium">添加 Cron 触发器</div>
        <Input v-model="newCronExpr" placeholder="0 9 * * 1-5" @blur="validateCron" />
        <div v-if="cronValidation" class="text-xs">
          <span v-if="cronValidation.valid" class="text-green-600">有效表达式</span>
          <span v-else class="text-red-500">{{ cronValidation.error }}</span>
        </div>
        <div class="flex gap-2">
          <Button size="sm" :disabled="!cronValidation?.valid" @click="addCronTrigger">添加</Button>
          <Button variant="ghost" size="sm" @click="adding = null">取消</Button>
        </div>
      </div>

      <!-- 添加 Hook 表单 -->
      <div v-if="adding === 'hook'" class="space-y-2 border rounded p-3">
        <div class="text-sm font-medium">添加 HTTP Hook</div>
        <div class="flex gap-2">
          <Input v-model="newHookName" placeholder="deploy-notify" />
          <Button variant="outline" size="sm" @click="checkHookName">检查</Button>
        </div>
        <div v-if="hookCheck" class="text-xs space-y-1">
          <div>Hook URL: <code class="font-mono">{{ hookCheck.hookUrl }}</code></div>
          <div v-if="hookCheck.conflictWorkflowIds.length > 0" class="text-yellow-600">
            注意: 此 hook 已被 {{ hookCheck.conflictWorkflowIds.length }} 个工作流使用（广播模式）
          </div>
        </div>
        <div class="flex gap-2">
          <Button size="sm" :disabled="!newHookName.trim()" @click="addHookTrigger">添加</Button>
          <Button variant="ghost" size="sm" @click="adding = null">取消</Button>
        </div>
      </div>

      <Separator />
      <div class="flex justify-end gap-2">
        <Button variant="outline" @click="emit('update:open', false)">取消</Button>
        <Button @click="save">保存</Button>
      </div>
    </DialogContent>
  </Dialog>
</template>
```

- [ ] **Step 3: 验证编译**

Run: `pnpm exec tsc -p tsconfig.web.json --noEmit 2>&1 | head -20`
Expected: 无新增错误

- [ ] **Step 4: 提交**

```bash
git add src/components/workflow/TriggerSettingsDialog.vue
git commit -m "feat(triggers): add TriggerSettingsDialog component"
```

> **注意:** 实际实现时需要根据项目现有 shadcn-vue 组件的具体 import 路径和 API 调整。`workflowStore.updateWorkflow` 的调用方式也需要对照现有 store API 确认。
