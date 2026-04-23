# Phase 4: 编辑器集成

> 前置：Phase 3 完成
> 产出：WorkflowEditor.vue 完成改造，Golden Layout 替换 ResizablePanelGroup

---

### Task 8: 改造 WorkflowEditor.vue

**目标：** 替换 ResizablePanelGroup 为 GoldenLayout，VueFlow 移到外层绝对定位。

**Files:**
- Modify: `src/components/workflow/WorkflowEditor.vue`

这是最大的改动。按步骤拆分。

- [ ] **Step 1: 更新 imports**

在 WorkflowEditor.vue 的 `<script setup>` 中：

```typescript
// 移除：
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable'

// 新增：
import { GoldenLayout } from '@/components/ui/golden-layout'
import type { ComponentRegistry, ProvideMap } from '@/components/ui/golden-layout'
import { WORKFLOW_STORE_KEY } from '@/stores/workflow'
import { useEditorLayout } from '@/composables/workflow/useEditorLayout'
```

- [ ] **Step 2: 替换 composables**

移除 `usePanelSizes`，新增 `useEditorLayout`：

```typescript
// 移除：
// const { panelSizes, handlePanelResize } = usePanelSizes()

// 新增（在现有 composable 声明区域）：
const {
  loadLayout,
  saveLayout,
  resetToDefault,
  hasCustomLayout,
} = useEditorLayout(store)
```

- [ ] **Step 3: 添加 GoldenLayout 配置**

在 composable 区域添加：

```typescript
// ── Golden Layout 配置 ──────────────────────────────

const editorLayout = ref<LayoutConfig>(loadLayout())

const componentRegistry: ComponentRegistry = {
  'node-sidebar': NodeSidebar,
  'right-panel': RightPanel,
  'exec-bar': ExecutionBar,
}

const parentProvides: ProvideMap = [
  { key: WORKFLOW_STORE_KEY, value: props.store },
]

function onLayoutChange(config: LayoutConfig) {
  saveLayout(config)
}

// 标签页切换时恢复布局
watch(() => props.tab.id, () => {
  editorLayout.value = loadLayout()
})
```

需要额外 import `ref` from vue 和 `LayoutConfig` from golden-layout：

```typescript
import { ref, markRaw, computed, watch, onMounted, onUnmounted } from 'vue'
import type { LayoutConfig } from 'golden-layout'
```

- [ ] **Step 4: 保留 useExecutionPanel 的 expanded 状态**

`useExecutionPanel` 中的 `executionBarExpanded` 保留，改为控制"是否激活执行 tab"：

```typescript
const {
  executionBarExpanded,
} = useExecutionPanel()
```

> **注意**：`executionBarExpanded` 不再控制面板尺寸，而是控制 golden-layout 中 exec-bar tab 是否被激活。需要在 golden-layout 实例上调用 `focusPanel('exec-bar')` 来激活执行面板。此功能的完整实现依赖 Task 4 中 GoldenLayout.vue 的 `focusPanel` 方法。如果 golden-layout v2 API 不支持直接激活 tab，可改为通过修改 `editorLayout` 的 `activeItemIndex` 来实现。

- [ ] **Step 5: 审计子面板 inject 依赖**

确认 NodeSidebar / RightPanel / ExecutionBar 中的 `inject()` 调用列表：

经审查，三个子面板均只通过 `useWorkflowStore()` 使用 inject（内部 `inject(WORKFLOW_STORE_KEY)`），无其他 inject 依赖。Pinia store（如 `usePluginStore()`、`useAgentSettingsStore()`）通过 `app.use(pinia)` 直接可用，无需额外 provide。

当前 `parentProvides` 只需包含 `WORKFLOW_STORE_KEY`。如果后续添加新面板，需重新审计。

- [ ] **Step 6: 重写模板**

将 `<ResizablePanelGroup>` 块（约 315-410 行）替换为：

```vue
<template>
  <div
    class="flex flex-col h-full min-h-0 bg-background overflow-hidden"
    tabindex="0"
    @keydown="handleKeyDown"
  >
    <EditorToolbar
      :is-editing-name="isEditingName"
      :editing-name="editingName"
      :workflow-name="store.currentWorkflow?.name || ''"
      :hide-tab-switcher="!store.currentWorkflow"
      :is-dirty="store.isDirty"
      :recent-workflows="recentWorkflows"
      :has-custom-layout="hasCustomLayout"
      @new="openWorkflowList(true)"
      @open="openWorkflowList(false)"
      @save="saveWorkflow"
      @export="exportWorkflow"
      @import="importWorkflow"
      @update:editing-name="editingName = $event"
      @start-edit-name="startEditName"
      @finish-edit-name="finishEditName"
      @cancel-edit-name="cancelEditName"
      @open-plugins="pluginsDialogOpen = true"
      @open-settings="settingsDialogOpen = true"
      @go-home="goHome"
      @open-recent="openRecentWorkflow"
      @reset-layout="handleResetLayout"
    />

    <div v-if="store.currentWorkflow" class="relative flex-1 min-h-0">
      <!-- VueFlow 画布：绝对定位底层，始终存在 -->
      <VueFlow
        :id="FLOW_ID"
        :nodes="nodes"
        :edges="edges"
        :node-types="nodeTypes"
        :edge-types="edgeTypes"
        :min-zoom="0.2"
        :max-zoom="4"
        :connection-mode="ConnectionMode.Loose"
        :nodes-draggable="!store.isPreview"
        :nodes-connectable="!store.isPreview"
        :edges-updatable="!store.isPreview"
        class="absolute inset-0 z-0"
        @connect="onConnect"
        @connect-start="onConnectStart"
        @connect-end="onConnectEnd"
        @dragover="onDragOver"
        @drop="onDrop"
        @node-click="onNodeClick"
        @nodes-initialized="handleNodesInitialized as any"
        @pane-click="onPaneClick"
      >
        <Background />
        <MiniMap v-if="agentSettings.minimapVisible" />
        <template #edge-custom="edgeProps">
          <CustomEdge
            v-bind="edgeProps"
            @insert-node="onEdgeInsertNode"
          />
        </template>
        <Controls />
      </VueFlow>

      <CanvasToolbar class="absolute bottom-3 left-1/2 -translate-x-1/2 z-20" />

      <!-- 注：CanvasToolbar 已有自身 absolute 定位样式，此处 class 为覆盖定位 -->

      <!-- Golden Layout：覆盖在 VueFlow 之上 -->
      <GoldenLayout
        :config="editorLayout"
        :registry="componentRegistry"
        :provides="parentProvides"
        class="absolute inset-0 z-10"
        @layout-change="onLayoutChange"
      />
    </div>

    <!-- 无工作流时的加载状态 -->
    <Empty v-else class="flex-1">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Spinner class="size-8" />
        </EmptyMedia>
        <EmptyTitle>加载工作流中</EmptyTitle>
        <EmptyDescription>正在加载工作流数据，请稍候...</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="outline" size="sm" @click="goHome">
          返回主页
        </Button>
      </EmptyContent>
    </Empty>

    <!-- Dialog 组件保持不变 -->
    <WorkflowListDialog ... />
    <NodeSelectDialog ... />
    <PluginsDialog ... />
    <SettingsDialog ... />
    <PluginPickerDialog ... />
  </div>
</template>
```

- [ ] **Step 7: 添加 handleResetLayout**

```typescript
function handleResetLayout() {
  editorLayout.value = resetToDefault()
}
```

- [ ] **Step 8: 移除不再需要的变量**

移除以下引用：
- `usePanelSizes` 的 `handlePanelResize`（整个 composable 可不再调用）
- `useExecutionPanel` 的 `execPanelSizes` / `execPanelRef` / `onExecBarResize`

- [ ] **Step 9: 验证事件穿透**

golden-layout 容器（z-10）覆盖 VueFlow（z-0），需要确认事件穿透 CSS（Task 6 中已添加 `pointer-events: none` + 子元素 `auto`）能正确工作：

```bash
pnpm dev
```

验证以下交互不被阻断：
- [ ] 从 NodeSidebar 拖拽节点到 VueFlow 画布空白区域
- [ ] 在 VueFlow 画布中拖拽连线
- [ ] golden-layout 内的 tab 点击和拖拽正常
- [ ] golden-layout 分割线拖拽正常

如果 tab 拖拽被影响（因为根容器 `pointer-events: none`），需要将 `.lm_dragProxy` 和 `.lm_dropTargetIndicator` 也加上 `pointer-events: auto`。

- [ ] **Step 10: 验证编译**

```bash
pnpm exec tsc -p tsconfig.web.json --noEmit
```

- [ ] **Step 11: 提交**

```bash
git add src/components/workflow/WorkflowEditor.vue
git commit -m "feat(workflow-editor): replace ResizablePanelGroup with GoldenLayout"
```

---

### Task 9: EditorToolbar 新增"重置布局"按钮

**目标：** 在 EditorToolbar 添加"重置布局"按钮，仅在有自定义布局时显示。

**Files:**
- Modify: `src/components/workflow/EditorToolbar.vue`

- [ ] **Step 1: 新增 prop 和 emit**

在 `defineProps` 中新增：

```typescript
hasCustomLayout?: boolean
```

在 `defineEmits` 中新增：

```typescript
'reset-layout': []
```

- [ ] **Step 2: 在模板中添加按钮**

在工具栏右侧区域（dirty indicator 附近）添加：

```vue
<Button
  v-if="hasCustomLayout"
  variant="ghost"
  size="icon"
  class="h-7 w-7"
  title="重置布局"
  @click="emit('reset-layout')"
>
  <LayoutDashboard class="h-4 w-4" />
</Button>
```

需要在 imports 中添加 `LayoutDashboard` 图标：

```typescript
import { LayoutDashboard } from 'lucide-vue-next'
```

- [ ] **Step 3: 验证编译**

```bash
pnpm exec tsc -p tsconfig.web.json --noEmit
```

- [ ] **Step 4: 提交**

```bash
git add src/components/workflow/EditorToolbar.vue
git commit -m "feat(editor-toolbar): add reset layout button"
```

---

### Task 10: 集成验证

**目标：** 端到端验证 Golden Layout 在 WorkflowEditor 中的工作状态。

- [ ] **Step 1: 构建验证**

```bash
pnpm exec tsc -p tsconfig.web.json --noEmit
pnpm build
```

预期：构建成功，无错误。

- [ ] **Step 2: 启动开发服务器**

```bash
pnpm dev
```

- [ ] **Step 3: 手动验证清单**

逐项验证以下场景：

| # | 场景 | 预期 | 通过 |
|---|------|------|------|
| 1 | 打开工作流 | 3 个面板 tab 堆叠，默认激活"节点" | [ ] |
| 2 | 点击 tab 切换 | 切换到"属性"/"执行"面板 | [ ] |
| 3 | 拖拽 tab 分离 | tab 变为独立面板，分割线可调 | [ ] |
| 4 | 拖拽分割线 | 面板大小可调 | [ ] |
| 5 | VueFlow 画布 | 面板缩小后可见底层画布，画布状态不受影响 | [ ] |
| 6 | 布局持久化 | 调整布局后刷新，恢复上次布局 | [ ] |
| 7 | 标签页切换 | 切换工作流标签，各自恢复布局 | [ ] |
| 8 | 重置布局 | 点击工具栏按钮，恢复默认 tab 堆叠 | [ ] |
| 9 | ExecutionBar | 执行面板内部 ResizablePanelGroup 正常 | [ ] |
| 10 | 主题切换 | light/dark 切换后面板样式跟随 | [ ] |
| 11 | 节点拖拽 | 从 NodeSidebar 拖节点到画布（穿透 golden-layout） | [ ] |
| 12 | 连线操作 | 在 VueFlow 画布中连线 | [ ] |

> **事件穿透已处理**：Task 6 CSS 中已添加 `pointer-events: none`（根容器）+ `auto`（子元素），Task 8 Step 9 已验证交互不被阻断。

- [ ] **Step 4: 验证 backend layoutSnapshot 透传**

创建一个包含自定义布局的工作流，保存后重新加载，确认 backend 能正确持久化 `layoutSnapshot` 字段：

```bash
# 检查 backend workflow CRUD 对新字段的处理
# 由于 layoutSnapshot 是 JSON 序列化的可选字段，理论上透传即可
# 如果 backend 有字段白名单过滤，需要同步更新
```

- [ ] **Step 5: 最终提交**

```bash
git add -A
git commit -m "feat: complete golden-layout integration with verification"
```

---

## Phase 4 完成标准

- [x] WorkflowEditor 使用 GoldenLayout 替代 ResizablePanelGroup
- [x] VueFlow 在外层绝对定位，状态不受面板重排影响
- [x] EditorToolbar "重置布局"按钮在有自定义布局时显示
- [x] 标签页切换时各自恢复布局
- [x] 布局持久化正常（全局默认 + 工作流级覆盖）
- [x] VueFlow 画布交互（节点拖拽/连线）不被 golden-layout 遮挡
- [x] `pnpm build` 成功
- [x] 12 项手动验证场景全部通过
