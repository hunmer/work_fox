# Workflow Triggers Plan 7: 前端 Badge & Toolbar 集成

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans.

**Goal:** 在 WorkflowListPage 添加触发器 badge 和详情面板触发器信息。在 EditorToolbar 添加触发器设置入口按钮。

**Architecture:** Badge 基于工作流 triggers 字段计算，纯展示。Toolbar 按钮 open/close 控制对话框。

**Tech Stack:** Vue 3, shadcn-vue

**Spec:** Section 5.2, 5.3, 5.4

**Depends on:** Plan 6 (TriggerSettingsDialog)

---

### Task 14: WorkflowListPage 添加触发器 Badge

**Files:**
- Modify: `src/components/dashboard/WorkflowListPage.vue`

- [ ] **Step 1: 添加 badge 辅助函数**

在 `<script setup>` 中添加：

```typescript
function getTriggerBadges(triggers?: WorkflowTrigger[]) {
  if (!triggers) return { cron: false, hook: false }
  return {
    cron: triggers.some(t => t.type === 'cron' && t.enabled),
    hook: triggers.some(t => t.type === 'hook' && t.enabled)
  }
}
```

需要 import: `import type { WorkflowTrigger } from '@shared/workflow-types'`

- [ ] **Step 2: 在工作流列表项模板中添加 badge**

找到每个工作流列表项（按钮模板），在工作流名称 `{{ wf.name }}` 之后添加：

```html
<span class="ml-1 inline-flex gap-0.5">
  <Badge v-if="getTriggerBadges(wf.triggers).cron" variant="secondary" class="text-[10px] px-1 py-0">
    ⏰
  </Badge>
  <Badge v-if="getTriggerBadges(wf.triggers).hook" variant="secondary" class="text-[10px] px-1 py-0">
    🔗
  </Badge>
</span>
```

> **注意:** Badge 组件需要从 `@/components/ui` 导入。如果项目使用其他 badge 方案，对齐现有模式。

- [ ] **Step 3: 验证编译**

Run: `pnpm exec tsc -p tsconfig.web.json --noEmit 2>&1 | head -10`
Expected: PASS

- [ ] **Step 4: 提交**

```bash
git add src/components/dashboard/WorkflowListPage.vue
git commit -m "feat(triggers): add trigger badges to workflow list"
```

---

### Task 15: WorkflowListPage 右侧详情面板

**Files:**
- Modify: `src/components/dashboard/WorkflowListPage.vue` 或 `WorkflowDetailPanel` 组件

- [ ] **Step 1: 在详情面板中添加触发器信息区块**

找到右侧详情面板，在工作流基本信息之后、操作按钮之前，添加：

```html
<!-- 触发器信息 -->
<template v-if="detail?.triggers && detail.triggers.length > 0">
  <Separator />
  <div class="space-y-2">
    <h4 class="text-sm font-medium">触发器</h4>
    <div v-for="t in detail.triggers" :key="t.id" class="flex items-center justify-between text-sm">
      <div class="flex items-center gap-2">
        <Badge variant="outline">{{ t.type === 'cron' ? 'Cron' : 'Hook' }}</Badge>
        <span class="font-mono text-xs">{{ t.type === 'cron' ? t.cron : t.hookName }}</span>
      </div>
      <Badge :variant="t.enabled ? 'default' : 'secondary'" class="text-xs">
        {{ t.enabled ? '已启用' : '已禁用' }}
      </Badge>
    </div>
    <Button variant="outline" size="sm" @click="openTriggerDialog(detail.id)">
      编辑触发器
    </Button>
  </div>
</template>
```

- [ ] **Step 2: 添加 TriggerSettingsDialog 到页面**

在模板底部添加对话框组件：

```html
<TriggerSettingsDialog
  v-if="selectedWorkflowId"
  :workflow-id="selectedWorkflowId"
  :open="triggerDialogOpen"
  @update:open="triggerDialogOpen = $event"
  @saved="refreshWorkflowDetail"
/>
```

在 script 中添加状态：

```typescript
import TriggerSettingsDialog from '@/components/workflow/TriggerSettingsDialog.vue'

const triggerDialogOpen = ref(false)

function openTriggerDialog(workflowId: string) {
  triggerDialogOpen.value = true
}
```

- [ ] **Step 3: 提交**

```bash
git add src/components/dashboard/WorkflowListPage.vue
git commit -m "feat(triggers): add trigger info to workflow detail panel"
```

---

### Task 16: EditorToolbar 添加触发器按钮

**Files:**
- Modify: `src/components/workflow/EditorToolbar.vue`

- [ ] **Step 1: 添加触发器按钮**

在右侧按钮区域（`hasCustomLayout` 按钮之前）添加。通过 props 传入 `hasTriggers`：

```html
<!-- 触发器设置 -->
<button
  v-if="hasTriggers !== undefined"
  class="relative p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
  title="触发器设置"
  @click="emit('open-triggers')"
>
  <Zap class="w-4 h-4" />
  <span
    v-if="hasTriggers"
    class="absolute -top-0.5 -right-0.5 w-2 h-2 bg-primary rounded-full"
  />
</button>
```

在 EditorToolbar 的 props 中添加：

```typescript
hasTriggers?: boolean
```

在 emits 中添加 `'open-triggers'`。

> **注意:** `Zap` 图标来自 lucide-vue-next。hasTriggers 由父组件计算传入，EditorToolbar 不直接引用 workflowStore。

- [ ] **Step 2: 在父组件 WorkflowEditor.vue 中连接**

找到 `WorkflowEditor.vue`（持有 workflowStore 的组件），添加：

```typescript
import TriggerSettingsDialog from '@/components/workflow/TriggerSettingsDialog.vue'

const triggerDialogOpen = ref(false)
const hasTriggers = computed(() =>
  workflowStore.currentWorkflow?.triggers?.some(t => t.enabled) ?? false
)
```

在模板中：

```html
<EditorToolbar
  ...
  :has-triggers="hasTriggers"
  @open-triggers="triggerDialogOpen = true"
/>

<TriggerSettingsDialog
  v-if="workflowStore.currentWorkflow?.id"
  :workflow-id="workflowStore.currentWorkflow.id"
  :open="triggerDialogOpen"
  @update:open="triggerDialogOpen = $event"
  @saved="/* refresh workflow data */"
/>
```

- [ ] **Step 3: 验证编译**

Run: `pnpm exec tsc -p tsconfig.web.json --noEmit 2>&1 | head -10`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/components/workflow/EditorToolbar.vue src/components/workflow/WorkflowEditor.vue
git commit -m "feat(triggers): add trigger button to EditorToolbar"
```

> **注意:** 如果 WorkflowEditor.vue 不存在，查找实际使用 EditorToolbar 的组件文件名，可能是 `EditorPage.vue` 或其他。需要对照实际目录结构确认。

---

### Task 17: 最终集成验证

- [ ] **Step 1: 完整构建**

Run: `pnpm build:backend && pnpm build`
Expected: 全部成功

- [ ] **Step 2: 开发模式功能验证**

```bash
pnpm dev
```

验证清单：
- [ ] 后端启动日志有 `[TriggerService] Started`
- [ ] Dashboard 工作流列表显示触发器 badge
- [ ] 点击工作流详情显示触发器信息
- [ ] 编辑器工具栏有触发器按钮
- [ ] 触发器对话框可以添加/删除/启禁用 cron 和 hook
- [ ] 保存后 curl 测试 HTTP Hook 端点正常

- [ ] **Step 3: 最终提交**

```bash
git add -A && git commit -m "feat(triggers): complete workflow triggers system integration"
```
