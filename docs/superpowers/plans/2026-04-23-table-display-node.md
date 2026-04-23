# Table Display Node Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增 `table_display` 内置工作流节点，展示数据表格并支持用户交互确认（单选/多选），通过 Interaction Bridge 暂停工作流等待用户提交选中行。

**Architecture:** 在后端 `execution-manager` 的 `dispatchNode` 中为 `table_display` 节点类型发起 `table_confirm` interaction，前端 `interaction.ts` 注册对应 handler，新建 `TableViewComponent.vue` 渲染表格 + checkbox + 提交按钮。用户提交后选中行数据通过 interaction response 返回后端，工作流继续执行。

**Tech Stack:** TypeScript, Vue 3 Composition API, shadcn-vue Table/Checkbox/Button 组件, Tailwind CSS

---

### Task 1: 扩展 InteractionType 和类型定义

**Files:**
- Modify: `shared/ws-protocol.ts:39-46`

- [ ] **Step 1: 在 InteractionType 联合类型中添加 `table_confirm`**

在 `shared/ws-protocol.ts` 的 `InteractionType` 类型中添加 `'table_confirm'`，并新增 `TableConfirmInteractionSchema` 接口：

```typescript
// ws-protocol.ts InteractionType 行后添加
export type InteractionType =
  | 'file_select'
  | 'form'
  | 'confirm'
  | 'agent_chat'
  | 'node_execution'
  | 'table_confirm'
  | 'custom'

// 在 NodeExecutionInteractionSchema 接口后添加
export interface TableConfirmInteractionSchema {
  headers: Array<{ id: string; title: string; type: 'string' | 'number' | 'boolean' }>
  cells: Array<{ id: string; data: Record<string, any> }>
  selectionMode: 'none' | 'single' | 'multi'
}
```

- [ ] **Step 2: 验证 TypeScript 编译**

Run: `pnpm exec tsc -p tsconfig.web.json --noEmit`
Expected: PASS（只添加了类型，无运行时变化）

- [ ] **Step 3: Commit**

```bash
git add shared/ws-protocol.ts
git commit -m "feat: add table_confirm interaction type to ws-protocol"
```

---

### Task 2: 注册 table_display 内置节点定义

**Files:**
- Modify: `electron/services/builtin-nodes.ts:100-167`

- [ ] **Step 1: 在 `builtinNodeDefinitions` 数组末尾（展示分类下）添加 `table_display` 节点**

```typescript
  // 展示分类末尾，music_player 之后添加
  {
    type: 'table_display',
    label: '表格展示',
    category: '展示',
    icon: 'Table',
    description: '展示数据表格，支持单选/多选确认',
    properties: [
      {
        key: 'headers',
        label: '表头',
        type: 'array',
        required: true,
        tooltip: '定义表格列',
        itemTemplate: { id: '', title: '', type: 'string' },
        fields: [
          { key: 'id', label: '字段ID', type: 'text', required: true, placeholder: 'header1' },
          { key: 'title', label: '显示名称', type: 'text', required: true, placeholder: '列名' },
          {
            key: 'type', label: '数据类型', type: 'select', default: 'string',
            options: [
              { label: '字符串', value: 'string' },
              { label: '数字', value: 'number' },
              { label: '布尔', value: 'boolean' },
            ],
          },
        ],
      },
      {
        key: 'cells',
        label: '数据行',
        type: 'array',
        required: true,
        tooltip: '表格数据行',
        itemTemplate: { id: '', data: '{}' },
        fields: [
          { key: 'id', label: '行ID', type: 'text', required: true, placeholder: 'row1' },
          { key: 'data', label: '行数据 (JSON)', type: 'text', required: true, placeholder: '{"header1": "value"}' },
        ],
      },
      {
        key: 'selectionMode',
        label: '选择模式',
        type: 'select',
        default: 'none',
        required: true,
        options: [
          { label: '无选择', value: 'none' },
          { label: '单选', value: 'single' },
          { label: '多选', value: 'multi' },
        ],
      },
    ],
  },
```

- [ ] **Step 2: 验证 TypeScript 编译**

Run: `pnpm exec tsc -p tsconfig.web.json --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add electron/services/builtin-nodes.ts
git commit -m "feat: register table_display node in builtin-nodes"
```

---

### Task 3: 后端 execution-manager 添加 table_display 分发

**Files:**
- Modify: `backend/workflow/execution-manager.ts:399-446`

- [ ] **Step 1: 在 `dispatchNode` 的 switch 中添加 `table_display` case**

在 `dispatchNode` 方法的 switch 语句中，`music_player` case 之后、`run_code` case 之前添加：

```typescript
      case 'table_display':
        return this.executeTableDisplay(session, node, resolvedData)
```

- [ ] **Step 2: 添加 import**

在文件顶部 import 区域，将 `AgentChatInteractionSchema, NodeExecutionInteractionSchema` 扩展为也导入 `TableConfirmInteractionSchema`：

```typescript
import type { AgentChatInteractionSchema, NodeExecutionInteractionSchema, TableConfirmInteractionSchema } from '../../shared/ws-protocol'
```

- [ ] **Step 3: 实现 `executeTableDisplay` 方法**

在 `executeMainProcessNode` 方法之后添加：

```typescript
  private async executeTableDisplay(
    session: ExecutionSession,
    node: WorkflowNode,
    resolvedData: Record<string, any>,
  ): Promise<any> {
    const headers = Array.isArray(resolvedData.headers) ? resolvedData.headers : []
    const cells = Array.isArray(resolvedData.cells) ? resolvedData.cells : []
    const selectionMode = ['none', 'single', 'multi'].includes(resolvedData.selectionMode)
      ? resolvedData.selectionMode
      : 'none'

    if (selectionMode === 'none') {
      return { selectedRows: cells, selectedCount: cells.length }
    }

    const schema: TableConfirmInteractionSchema = { headers, cells, selectionMode }

    const result = await this.deps.interactionManager.request({
      clientId: session.ownerClientId,
      executionId: session.id,
      workflowId: session.workflow.id,
      nodeId: node.id,
      interactionType: 'table_confirm',
      schema,
    })

    return result
  }
```

- [ ] **Step 4: 验证后端编译**

Run: `pnpm build:backend`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/workflow/execution-manager.ts
git commit -m "feat: add table_display dispatch in execution-manager"
```

---

### Task 4: 新建 TableViewComponent.vue

**Files:**
- Create: `src/components/workflow/TableViewComponent.vue`

- [ ] **Step 1: 创建 TableViewComponent.vue**

```vue
<script setup lang="ts">
import { ref, computed } from 'vue'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'

interface TableHeaderDef {
  id: string
  title: string
  type: 'string' | 'number' | 'boolean'
}

interface TableCellDef {
  id: string
  data: Record<string, any>
}

const props = withDefaults(defineProps<{
  headers?: TableHeaderDef[]
  cells?: TableCellDef[]
  selectionMode?: 'none' | 'single' | 'multi'
  interactive?: boolean
  onSubmit?: (selectedRows: TableCellDef[]) => void
}>(), {
  headers: () => [],
  cells: () => [],
  selectionMode: 'none',
  interactive: false,
})

const selectedIds = ref<Set<string>>(new Set())

const canSubmit = computed(() => {
  if (props.selectionMode === 'none') return true
  return selectedIds.value.size > 0
})

function toggleRow(id: string) {
  if (props.selectionMode === 'single') {
    selectedIds.value = new Set(selectedIds.value.has(id) ? [] : [id])
  } else {
    const next = new Set(selectedIds.value)
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
    }
    selectedIds.value = next
  }
}

function handleSubmit() {
  if (!canSubmit.value) return
  const selected = props.selectionMode === 'none'
    ? props.cells
    : props.cells.filter((c) => selectedIds.value.has(c.id))
  props.onSubmit?.(selected)
}
</script>

<template>
  <div class="flex flex-col gap-2 w-full">
    <div class="overflow-auto max-h-[200px]">
      <Table class="text-xs">
        <TableHeader>
          <TableRow>
            <TableHead
              v-if="selectionMode !== 'none'"
              class="w-8 px-1"
            />
            <TableHead
              v-for="header in headers"
              :key="header.id"
              class="px-2 py-1 whitespace-nowrap"
            >
              {{ header.title }}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow
            v-for="cell in cells"
            :key="cell.id"
            class="cursor-pointer hover:bg-muted/50"
            @click="selectionMode !== 'none' && toggleRow(cell.id)"
          >
            <TableCell
              v-if="selectionMode !== 'none'"
              class="w-8 px-1"
            >
              <Checkbox
                :checked="selectedIds.has(cell.id)"
                class="size-3.5"
              />
            </TableCell>
            <TableCell
              v-for="header in headers"
              :key="header.id"
              class="px-2 py-1 whitespace-nowrap"
            >
              {{ cell.data?.[header.id] ?? '' }}
            </TableCell>
          </TableRow>
          <TableRow v-if="cells.length === 0">
            <TableCell
              :colspan="selectionMode !== 'none' ? headers.length + 1 : headers.length"
              class="text-center text-muted-foreground py-3"
            >
              暂无数据
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
    <div v-if="interactive" class="flex justify-end">
      <Button
        size="sm"
        :disabled="!canSubmit"
        @click.stop="handleSubmit"
      >
        提交
      </Button>
    </div>
  </div>
</template>
```

- [ ] **Step 2: 验证前端编译**

Run: `pnpm exec tsc -p tsconfig.web.json --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/workflow/TableViewComponent.vue
git commit -m "feat: add TableViewComponent with selection support"
```

---

### Task 5: 注册 display 节点 customView

**Files:**
- Modify: `src/lib/workflow/nodes/display.ts`

- [ ] **Step 1: 导入 TableViewComponent 并注册到 displayNodes 数组**

在 `display.ts` 顶部添加 import，并在 `displayNodes` 数组末尾添加 `table_display` 条目：

```typescript
import TableViewComponent from '@/components/workflow/TableViewComponent.vue'
```

```typescript
  // displayNodes 数组末尾添加
  {
    type: 'table_display',
    label: '表格展示',
    category: '展示',
    icon: 'Table',
    description: '展示数据表格，支持单选/多选确认',
    customView: TableViewComponent,
    customViewMinSize: { width: 400, height: 200 },
    properties: [
      {
        key: 'headers',
        label: '表头',
        type: 'array',
        required: true,
        tooltip: '定义表格列',
        itemTemplate: { id: '', title: '', type: 'string' },
        fields: [
          { key: 'id', label: '字段ID', type: 'text', required: true, placeholder: 'header1' },
          { key: 'title', label: '显示名称', type: 'text', required: true, placeholder: '列名' },
          {
            key: 'type', label: '数据类型', type: 'select', default: 'string',
            options: [
              { label: '字符串', value: 'string' },
              { label: '数字', value: 'number' },
              { label: '布尔', value: 'boolean' },
            ],
          },
        ],
      },
      {
        key: 'cells',
        label: '数据行',
        type: 'array',
        required: true,
        tooltip: '表格数据行',
        itemTemplate: { id: '', data: '{}' },
        fields: [
          { key: 'id', label: '行ID', type: 'text', required: true, placeholder: 'row1' },
          { key: 'data', label: '行数据 (JSON)', type: 'text', required: true, placeholder: '{"header1": "value"}' },
        ],
      },
      {
        key: 'selectionMode',
        label: '选择模式',
        type: 'select',
        default: 'none',
        required: true,
        options: [
          { label: '无选择', value: 'none' },
          { label: '单选', value: 'single' },
          { label: '多选', value: 'multi' },
        ],
      },
    ],
  },
```

- [ ] **Step 2: 验证前端编译**

Run: `pnpm exec tsc -p tsconfig.web.json --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/lib/workflow/nodes/display.ts
git commit -m "feat: register table_display customView in display nodes"
```

---

### Task 6: CustomNodeWrapper 传入 table_display 的 customViewProps

**Files:**
- Modify: `src/components/workflow/CustomNodeWrapper.vue:163-202`

- [ ] **Step 1: 在 `customViewProps` computed 中添加 `table_display` 分支**

在 `customViewProps` computed 的 `music_player` 分支之后、`return props.data || {}` 之前添加：

```typescript
  if (definition.value?.type === 'table_display') {
    const headers = props.data?.headers
    const cells = props.data?.cells
    const selectionMode = props.data?.selectionMode ?? 'none'
    const isStaticHeaders = Array.isArray(headers)
    const isStaticCells = Array.isArray(cells)
    const output = executionStep.value?.output
    return {
      headers: isStaticHeaders ? headers : (Array.isArray(output?.headers) ? output.headers : []),
      cells: isStaticCells ? cells : (Array.isArray(output?.selectedRows) ? output.selectedRows : []),
      selectionMode,
      interactive: false,
    }
  }
```

注意：画布上展示时不传 `interactive: true`，interaction 触发时的交互 UI 由 Task 7 中的独立处理流程负责。customView 在画布中仅作静态预览，展示配置好的表头或执行结果。

- [ ] **Step 2: 验证前端编译**

Run: `pnpm exec tsc -p tsconfig.web.json --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/workflow/CustomNodeWrapper.vue
git commit -m "feat: add table_display customViewProps in CustomNodeWrapper"
```

---

### Task 7: 前端 interaction handler 处理 table_confirm

**Files:**
- Modify: `src/lib/backend-api/interaction.ts`

这是核心交互流程。当后端发起 `table_confirm` interaction 时，前端需要：
1. 显示表格 UI 让用户选择行
2. 等待用户点击提交
3. 返回选中行数据

由于现有 `interaction.ts` 中 `agent_chat` 和 `node_execution` 都是同步桥接到 IPC/WS，`table_confirm` 需要一种新的模式——在前端展示 UI 并等待用户操作。

方案：在 workflow store 中维护一个 `pendingTableConfirm` ref，`interaction.ts` handler 将 interaction 请求存入 store 并返回 Promise，前端 `ExecutionBar.vue`（或新组件）监听 store 变化展示表格选择对话框，用户提交后 resolve Promise。

- [ ] **Step 1: 在 workflow store 中添加 pendingTableConfirm 状态**

在 `src/stores/workflow.ts` 中，找到其他 ref 定义区域附近添加：

```typescript
  // table_confirm 交互状态
  const pendingTableConfirm = ref<{
    request: {
      executionId: string
      workflowId: string
      nodeId: string
      headers: Array<{ id: string; title: string; type: 'string' | 'number' | 'boolean' }>
      cells: Array<{ id: string; data: Record<string, any> }>
      selectionMode: 'none' | 'single' | 'multi'
    }
    resolve: (data: { selectedRows: Array<{ id: string; data: Record<string, any> }>; selectedCount: number }) => void
    reject: (error: Error) => void
  } | null>(null)
```

在 store return 对象中暴露：

```typescript
    pendingTableConfirm,
    resolveTableConfirm(selectedRows: Array<{ id: string; data: Record<string, any> }>) {
      if (pendingTableConfirm.value) {
        const count = selectedRows.length
        pendingTableConfirm.value.resolve({ selectedRows, selectedCount: count })
        pendingTableConfirm.value = null
      }
    },
    rejectTableConfirm(error: Error) {
      if (pendingTableConfirm.value) {
        pendingTableConfirm.value.reject(error)
        pendingTableConfirm.value = null
      }
    },
```

- [ ] **Step 2: 在 interaction.ts 中添加 table_confirm handler**

在 `src/lib/backend-api/interaction.ts` 中：

顶部添加 import：
```typescript
import type { TableConfirmInteractionSchema } from '@shared/ws-protocol'
import { useWorkflowStore } from '@/stores/workflow'
```

在 `handleWorkflowInteraction` switch 中添加 case：

```typescript
    case 'table_confirm':
      return {
        data: await handleTableConfirm(request),
      }
```

添加 `handleTableConfirm` 函数：

```typescript
async function handleTableConfirm(request: InteractionRequest): Promise<unknown> {
  const schema = request.schema as TableConfirmInteractionSchema
  const store = useWorkflowStore()

  return new Promise((resolve, reject) => {
    store.pendingTableConfirm = {
      request: {
        executionId: request.executionId,
        workflowId: request.workflowId,
        nodeId: request.nodeId,
        headers: schema.headers,
        cells: schema.cells,
        selectionMode: schema.selectionMode,
      },
      resolve,
      reject,
    }
  })
}
```

注意：`useWorkflowStore()` 必须在函数体内调用（不在模块顶层），因为 Pinia 可能还未初始化。

- [ ] **Step 3: 验证前端编译**

Run: `pnpm exec tsc -p tsconfig.web.json --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/stores/workflow.ts src/lib/backend-api/interaction.ts
git commit -m "feat: add table_confirm interaction handler with store-backed pending state"
```

---

### Task 8: 创建 TableConfirmDialog 对话框组件

**Files:**
- Create: `src/components/workflow/TableConfirmDialog.vue`

- [ ] **Step 1: 创建 TableConfirmDialog.vue**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import TableViewComponent from '@/components/workflow/TableViewComponent.vue'
import type { TableConfirmInteractionSchema } from '@shared/ws-protocol'

interface Props {
  open: boolean
  headers: TableConfirmInteractionSchema['headers']
  cells: TableConfirmInteractionSchema['cells']
  selectionMode: TableConfirmInteractionSchema['selectionMode']
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'submit', selectedRows: Array<{ id: string; data: Record<string, any> }>): void
  (e: 'cancel'): void
}>()

function handleSubmit(selectedRows: Array<{ id: string; data: Record<string, any> }>) {
  emit('submit', selectedRows)
}
</script>

<template>
  <Dialog :open="open" @update:open="(v) => !v && $emit('cancel')">
    <DialogContent class="max-w-2xl max-h-[80vh] flex flex-col" @escape-key-down="$emit('cancel')">
      <DialogHeader>
        <DialogTitle>请选择数据行</DialogTitle>
      </DialogHeader>
      <div class="flex-1 overflow-auto">
        <TableViewComponent
          :headers="headers"
          :cells="cells"
          :selection-mode="selectionMode"
          :interactive="true"
          :on-submit="handleSubmit"
        />
      </div>
    </DialogContent>
  </Dialog>
</template>
```

- [ ] **Step 2: 在 WorkflowEditor.vue 中挂载 TableConfirmDialog**

在 `src/components/workflow/WorkflowEditor.vue` 中导入并添加：

```typescript
import TableConfirmDialog from '@/components/workflow/TableConfirmDialog.vue'
```

在 template 中添加（与其他 Dialog 平级）：

```vue
<TableConfirmDialog
  :open="!!store.pendingTableConfirm"
  :headers="store.pendingTableConfirm?.request.headers ?? []"
  :cells="store.pendingTableConfirm?.request.cells ?? []"
  :selection-mode="store.pendingTableConfirm?.request.selectionMode ?? 'none'"
  @submit="store.resolveTableConfirm($event)"
  @cancel="store.rejectTableConfirm(new Error('用户取消选择'))"
/>
```

- [ ] **Step 3: 验证前端编译**

Run: `pnpm exec tsc -p tsconfig.web.json --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/workflow/TableConfirmDialog.vue src/components/workflow/WorkflowEditor.vue
git commit -m "feat: add TableConfirmDialog and mount in WorkflowEditor"
```

---

### Task 9: 完整构建验证

**Files:** 无变更

- [ ] **Step 1: 运行前端类型检查**

Run: `pnpm exec tsc -p tsconfig.web.json --noEmit`
Expected: PASS

- [ ] **Step 2: 运行后端编译**

Run: `pnpm build:backend`
Expected: PASS

- [ ] **Step 3: 运行后端 smoke 测试**

Run: `pnpm smoke:backend`
Expected: PASS

- [ ] **Step 4: 运行完整构建**

Run: `pnpm build`
Expected: PASS

- [ ] **Step 5: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix: resolve build issues from table_display implementation"
```
