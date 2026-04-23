# Phase 1: 技术验证 + 类型基础

> 前置：无
> 产出：golden-layout v2 API 验证通过 + 类型文件就绪

---

### Task 1: 技术 Spike — 验证 golden-layout v2 API

**目标：** 安装 golden-layout，验证 v2 API 与 Vue 3 createApp 的集成可行性。

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 安装 golden-layout**

```bash
pnpm add golden-layout
```

- [ ] **Step 2: 验证 API 签名**

在浏览器 console 或临时 test 文件中验证以下 API：

```typescript
import { GoldenLayout } from 'golden-layout'

// 1. 构造函数签名
const gl = new GoldenLayout(document.getElementById('root')!)

// 2. bindComponentEvent / unbindComponentEvent 是否存在
console.log(typeof gl.bindComponentEvent)  // 期望: 'undefined' (需要赋值)
console.log(typeof gl.unbindComponentEvent) // 期望: 'undefined' (需要赋值)

// 3. loadLayout 签名
gl.loadLayout({
  root: { type: 'stack', content: [] }
})

// 4. saveLayout 签名
const saved = gl.saveLayout()
console.log(typeof saved) // 期望: 'object'

// 5. stateChanged 事件
gl.on('stateChanged', () => console.log('stateChanged'))

// 6. updateSize 方法
gl.updateSize()

// 7. destroy 方法
gl.destroy()
```

- [ ] **Step 3: 验证 Vue 3 createApp 集成**

创建临时验证文件 `src/components/ui/golden-layout/_spike.vue`（验证后删除）：

```vue
<template>
  <div ref="container" style="width: 100%; height: 400px;"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, createApp } from 'vue'
import { GoldenLayout } from 'golden-layout'

const container = ref<HTMLElement>()
let layout: GoldenLayout | null = null

onMounted(() => {
  layout = new GoldenLayout(container.value!)

  layout.bindComponentEvent = (container, itemConfig) => {
    console.log('bindComponentEvent:', itemConfig)
    const el = document.createElement('div')
    el.style.height = '100%'
    el.style.padding = '12px'
    el.textContent = `Panel: ${itemConfig.componentType}`
    container.element.appendChild(el)
    return { component: el, virtual: false }
  }

  layout.unbindComponentEvent = (container) => {
    console.log('unbindComponentEvent')
  }

  layout.loadLayout({
    root: {
      type: 'row',
      content: [
        { type: 'component', componentType: 'panel-a', title: 'Panel A' },
        { type: 'component', componentType: 'panel-b', title: 'Panel B' },
      ]
    }
  })
})

onBeforeUnmount(() => {
  layout?.destroy()
})
</script>
```

在某页面临时引入该组件，运行 `pnpm dev`，验证：
- [ ] 两个面板正确渲染
- [ ] 拖拽分割线可调整大小
- [ ] 拖拽 tab 可重排
- [ ] header.popout 设为 false 后无 popout 按钮
- [ ] CSS 类名在 DevTools 中可查看（记录实际类名前缀）

- [ ] **Step 4: 记录 Spike 结论**

将以下信息记录到 spec 文件中（或直接更新到 golden-layout.css TODO 注释）：
- 实际构造函数签名
- 实际 CSS 类名前缀（`lm_` 或其他）
- `componentType` 字段名是否正确
- `bindComponentEvent` 回调参数类型
- `saveLayout()` 返回值结构

- [ ] **Step 5: 删除 spike 文件，提交依赖**

```bash
rm src/components/ui/golden-layout/_spike.vue
git add package.json pnpm-lock.yaml
git commit -m "chore: add golden-layout dependency with spike verification"
```

---

### Task 2: 创建类型定义文件

**目标：** 建立 golden-layout 组件的类型基础。

**Files:**
- Create: `src/components/ui/golden-layout/types.ts`

- [ ] **Step 1: 编写类型定义**

```typescript
// src/components/ui/golden-layout/types.ts
import type { Component, InjectionKey } from 'vue'
import type { LayoutConfig } from 'golden-layout'

/**
 * 组件注册表：面板名 -> Vue 组件
 * key 必须与布局 JSON 中的 componentType 一致
 */
export type ComponentRegistry = Record<string, Component>

/**
 * provide 传递映射
 * 用于将父组件的 provide/inject 传递到 golden-layout 子面板
 * （createApp 创建的子应用不继承父应用的 provide 链）
 */
export type ProvideMap = Array<{ key: InjectionKey<unknown> | string; value: unknown }>

/**
 * 布局持久化数据结构
 */
export interface LayoutPersistData {
  version: number
  layout: LayoutConfig
}

/**
 * 工作流编辑器面板类型
 */
export type EditorPanelType = 'node-sidebar' | 'flow-canvas' | 'right-panel' | 'exec-bar'
```

- [ ] **Step 2: 验证类型编译**

```bash
pnpm exec tsc -p tsconfig.web.json --noEmit
```

预期：无错误（types.ts 只引用 golden-layout 类型，无运行时依赖）

- [ ] **Step 3: 提交**

```bash
git add src/components/ui/golden-layout/types.ts
git commit -m "feat(golden-layout): add type definitions"
```

---

### Task 3: 扩展 Workflow 类型

**目标：** 在 Workflow 接口中新增 `layoutSnapshot` 可选字段，同步前后端类型。

**Files:**
- Modify: `src/lib/workflow/types.ts:43-55`
- Modify: `shared/workflow-types.ts:55-67`

- [ ] **Step 1: 修改前端 Workflow 类型**

在 `src/lib/workflow/types.ts` 的 `Workflow` 接口末尾新增字段：

```typescript
// src/lib/workflow/types.ts:43-56
export interface Workflow {
  id: string
  name: string
  folderId: string | null
  description?: string
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  createdAt: number
  updatedAt: number
  enabledPlugins?: string[]
  agentConfig?: WorkflowAgentConfig
  pluginConfigSchemes?: Record<string, string>
  layoutSnapshot?: Record<string, unknown>  // golden-layout 布局快照
}
```

注意：`layoutSnapshot` 类型使用 `Record<string, unknown>` 而非 `LayoutConfig`，避免 renderer 对 golden-layout 的类型硬依赖。

- [ ] **Step 2: 同步修改共享类型**

在 `shared/workflow-types.ts` 的 `Workflow` 接口做相同修改：

```typescript
// shared/workflow-types.ts:55-68
export interface Workflow {
  // ... 现有字段 ...
  layoutSnapshot?: Record<string, unknown>  // golden-layout 布局快照
}
```

- [ ] **Step 3: 验证编译**

```bash
pnpm exec tsc -p tsconfig.web.json --noEmit
pnpm build:backend
```

预期：无类型错误。旧数据无 `layoutSnapshot` 字段，作为可选字段不影响反序列化。

- [ ] **Step 4: 提交**

```bash
git add src/lib/workflow/types.ts shared/workflow-types.ts
git commit -m "feat: add layoutSnapshot field to Workflow type"
```

---

### Task 3.5: 导出 WORKFLOW_STORE_KEY

**目标：** 将 `WORKFLOW_STORE_KEY` 从 `stores/workflow.ts` 中导出，供 GoldenLayout.vue 的 provides 传递使用。

**Files:**
- Modify: `src/stores/workflow.ts:890`

- [ ] **Step 1: 导出 injection key**

将第 890 行的 `const` 改为 `export const`：

```typescript
// src/stores/workflow.ts:890
// Before:
const WORKFLOW_STORE_KEY: symbol = (globalThis as any).__WORKFLOW_STORE_KEY__
  ?? ((globalThis as any).__WORKFLOW_STORE_KEY__ = Symbol('workflowStore'))

// After:
export const WORKFLOW_STORE_KEY: symbol = (globalThis as any).__WORKFLOW_STORE_KEY__
  ?? ((globalThis as any).__WORKFLOW_STORE_KEY__ = Symbol('workflowStore'))
```

- [ ] **Step 2: 验证编译**

```bash
pnpm exec tsc -p tsconfig.web.json --noEmit
```

- [ ] **Step 3: 提交**

```bash
git add src/stores/workflow.ts
git commit -m "feat: export WORKFLOW_STORE_KEY for golden-layout provides"
```

---

## Phase 1 完成标准

- [x] golden-layout v2 API 验证通过，Spike 结论已记录
- [x] `src/components/ui/golden-layout/types.ts` 创建并编译通过
- [x] `Workflow.layoutSnapshot` 字段已添加到前端和共享类型
- [x] `WORKFLOW_STORE_KEY` 已导出
- [x] `tsc --noEmit` 和 `build:backend` 均无错误
