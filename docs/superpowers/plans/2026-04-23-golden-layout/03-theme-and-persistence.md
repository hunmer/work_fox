# Phase 3: 主题覆盖 + 布局持久化

> 前置：Phase 2 完成
> 产出：主题样式跟随 WorkFox 主题 + useEditorLayout composable

---

### Task 6: 创建主题覆盖样式

**目标：** golden-layout CSS 覆盖，跟随 WorkFox light/dark 主题切换。

**Files:**
- Create: `src/components/ui/golden-layout/golden-layout.css`
- Modify: `src/components/ui/golden-layout/GoldenLayout.vue`（添加 style import）

- [ ] **Step 1: 编写主题覆盖 CSS**

> **注意：** CSS 类名基于 v1 的 `lm_` 前缀。实施时根据 Task 1 Spike 结论替换为 v2 实际类名。

```css
/* src/components/ui/golden-layout/golden-layout.css */
/* 主题覆盖：golden-layout 样式映射到 WorkFox CSS 变量 */
/* TODO: 根据 Spike 验证结果修正 v2.x 实际 CSS 类名 */

/* ── 全局 ── */
.lm_root {
  background: var(--background);
}

/* ── 面板标题栏 ── */
.lm_header {
  background: var(--background) !important;
  border-bottom: 1px solid var(--border) !important;
  height: 32px !important;
}

/* ── Tab 标签 ── */
.lm_tab {
  background: var(--muted) !important;
  color: var(--muted-foreground) !important;
  font-size: 12px !important;
  border-radius: 4px 4px 0 0 !important;
  height: 28px !important;
  line-height: 28px !important;
  padding: 0 12px !important;
  margin-right: 2px !important;
}

.lm_tab.lm_active {
  background: var(--background) !important;
  color: var(--foreground) !important;
  font-weight: 500 !important;
  box-shadow: none !important;
}

/* Tab 关闭按钮 */
.lm_tab .lm_close_tab {
  color: var(--muted-foreground) !important;
  opacity: 0;
  transition: opacity 0.15s;
}
.lm_tab:hover .lm_close_tab {
  opacity: 1;
}

/* ── 分割线 ── */
.lm_splitter {
  background: var(--border) !important;
}
.lm_splitter.lm_vertical {
  width: 4px !important;
}
.lm_splitter.lm_horizontal {
  height: 4px !important;
}

/* 分割线拖拽手柄 */
.lm_splitter .lm_drag_handle {
  background: transparent;
}
.lm_splitter:hover {
  background: var(--accent) !important;
  opacity: 0.5;
}

/* ── 拖拽占位/预览 ── */
.lm_dragProxy,
.lm_dropTargetIndicator {
  background: color-mix(in srgb, var(--accent) 20%, transparent) !important;
  border: 1px dashed var(--accent) !important;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1) !important;
}

/* ── 面板内容区 ── */
.lm_content {
  background: var(--background) !important;
}

/* ── 堆叠容器 ── */
.lm_stack {
  background: var(--background) !important;
}

/* ── 行/列容器 ── */
.lm_row,
.lm_column {
  background: var(--background) !important;
}

/* ── 事件穿透 ── */
/* golden-layout 容器设置 pointer-events: none，
   使得底层的 VueFlow 画布可以接收拖拽/连线/点击事件。
   面板内容区、标题栏、tab、分割线恢复 pointer-events: auto */
.lm_goldenlayout {
  pointer-events: none;
}
.lm_content,
.lm_header,
.lm_tab,
.lm_splitter,
.lm_drag_handle {
  pointer-events: auto;
}
.lm_dragProxy {
  pointer-events: auto;
}
```

- [ ] **Step 2: 在 GoldenLayout.vue 中引入样式**

在 `GoldenLayout.vue` 的 `<script setup>` 标签下方添加无 scoped 的 style 块：

```vue
<!-- GoldenLayout.vue 底部 -->
<style>
@import 'golden-layout/dist/css/goldenlayout-base.css';
@import './golden-layout.css';
</style>
```

- [ ] **Step 3: 验证样式加载**

```bash
pnpm dev
```

临时在某个页面引入 GoldenLayout 组件，检查：
- [ ] 面板背景色跟随 light/dark 主题
- [ ] Tab 样式显示正确
- [ ] 分割线可见
- [ ] 切换主题时样式跟随

- [ ] **Step 4: 提交**

```bash
git add src/components/ui/golden-layout/golden-layout.css src/components/ui/golden-layout/GoldenLayout.vue
git commit -m "feat(golden-layout): add theme override CSS matching WorkFox light/dark"
```

---

### Task 7: 实现 useEditorLayout composable

**目标：** 工作流编辑器布局管理 composable，处理默认配置、持久化、重置。

**Files:**
- Create: `src/composables/workflow/useEditorLayout.ts`

- [ ] **Step 1: 编写 composable**

```typescript
// src/composables/workflow/useEditorLayout.ts
import { computed } from 'vue'
import type { LayoutConfig } from 'golden-layout'
import type { WorkflowStore } from '@/stores/workflow'

const STORAGE_KEY = 'workflow-editor-layout-default'

/**
 * 默认布局：3 个面板 tab 堆叠
 * VueFlow 在 golden-layout 外层绝对定位，不在 golden-layout 内管理
 */
const DEFAULT_LAYOUT: LayoutConfig = {
  root: {
    type: 'stack',
    content: [
      { type: 'component', componentType: 'node-sidebar', title: '节点' },
      { type: 'component', componentType: 'right-panel', title: '属性' },
      { type: 'component', componentType: 'exec-bar', title: '执行' },
    ],
  },
  activeItemIndex: 0,
}

function loadFromLocalStorage(): LayoutConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function saveToLocalStorage(config: LayoutConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
}

function clearLocalStorage() {
  localStorage.removeItem(STORAGE_KEY)
}

export function useEditorLayout(workflowStore: WorkflowStore) {
  const hasCustomLayout = computed(
    () => !!workflowStore.currentWorkflow?.layoutSnapshot
  )

  function loadLayout(): LayoutConfig {
    try {
      // 优先级：工作流级 > 全局默认 > 内置默认
      const snapshot = workflowStore.currentWorkflow?.layoutSnapshot
      if (snapshot) return snapshot as LayoutConfig

      const global = loadFromLocalStorage()
      if (global) return global
    } catch (e) {
      console.warn('[GoldenLayout] 布局加载失败，回退默认布局', e)
    }
    return DEFAULT_LAYOUT
  }

  function saveLayout(layoutConfig: LayoutConfig) {
    if (hasCustomLayout.value) {
      // 工作流级：赋值到 currentWorkflow
      // WorkflowEditor 中有 deep watcher 监听 currentWorkflow
      // 赋值会触发 markDirty()，随 10 秒自动保存持久化
      if (workflowStore.currentWorkflow) {
        workflowStore.currentWorkflow.layoutSnapshot =
          layoutConfig as unknown as Record<string, unknown>
      }
    } else {
      // 全局级：写 localStorage
      saveToLocalStorage(layoutConfig)
    }
  }

  function resetToDefault(): LayoutConfig {
    clearLocalStorage()
    if (workflowStore.currentWorkflow) {
      delete workflowStore.currentWorkflow.layoutSnapshot
      workflowStore.markDirty()
    }
    return DEFAULT_LAYOUT
  }

  return {
    loadLayout,
    saveLayout,
    resetToDefault,
    hasCustomLayout,
    DEFAULT_LAYOUT,
  }
}
```

- [ ] **Step 2: 验证编译**

```bash
pnpm exec tsc -p tsconfig.web.json --noEmit
```

- [ ] **Step 3: 提交**

```bash
git add src/composables/workflow/useEditorLayout.ts
git commit -m "feat(golden-layout): add useEditorLayout composable"
```

---

## Phase 3 完成标准

- [x] golden-layout 主题 CSS 正确覆盖，跟随 light/dark 切换
- [x] `useEditorLayout` 提供 loadLayout / saveLayout / resetToDefault
- [x] 布局加载优先级：工作流级 > 全局 localStorage > 内置默认
- [x] `tsc --noEmit` 无错误
