# Golden Layout Vue3 集成 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用 golden-layout 替换 WorkflowEditor.vue 中的 ResizablePanelGroup，实现面板 tab 堆叠/拖拽/持久化。

**Architecture:** golden-layout v2.x 作为通用 UI 组件封装在 `components/ui/golden-layout/`。VueFlow 画布保持在外层绝对定位，golden-layout 覆盖其上管理 3 个面板（NodeSidebar / RightPanel / ExecutionBar）。布局持久化采用全局默认 + 工作流级覆盖策略。

**Tech Stack:** golden-layout v2.x, Vue 3 Composition API, Pinia, Tailwind CSS

**Design Spec:** `docs/superpowers/specs/2026-04-23-golden-layout-vue3-design.md`

---

## 计划文件索引

| 文件 | Phase | 内容 | 任务范围 |
|------|-------|------|----------|
| [01-spike-and-types.md](./01-spike-and-types.md) | 1 | 技术验证 + 类型定义 + 安装依赖 | Task 1-3 |
| [02-core-component.md](./02-core-component.md) | 2 | GoldenLayout.vue 核心实现 + 导出 | Task 4-5 |
| [03-theme-and-persistence.md](./03-theme-and-persistence.md) | 3 | 主题 CSS + useEditorLayout composable | Task 6-7 |
| [04-editor-integration.md](./04-editor-integration.md) | 4 | WorkflowEditor 改造 + Toolbar + 验证 | Task 8-10 |

## 文件变更总览

### 新建文件

| 文件 | 职责 |
|------|------|
| `src/components/ui/golden-layout/types.ts` | 类型定义（ComponentRegistry, ProvideMap, EditorPanelType） |
| `src/components/ui/golden-layout/GoldenLayout.vue` | 通用 golden-layout 容器组件 |
| `src/components/ui/golden-layout/golden-layout.css` | 主题覆盖样式 |
| `src/components/ui/golden-layout/index.ts` | 模块导出 |
| `src/composables/workflow/useEditorLayout.ts` | 编辑器布局管理 composable |

### 修改文件

| 文件 | 变更内容 |
|------|----------|
| `package.json` | 新增 `golden-layout` 依赖 |
| `src/lib/workflow/types.ts` | Workflow 接口新增 `layoutSnapshot` 字段 |
| `shared/workflow-types.ts` | 同步新增 `layoutSnapshot` 字段 |
| `src/stores/workflow.ts` | 导出 `WORKFLOW_STORE_KEY` |
| `src/components/workflow/WorkflowEditor.vue` | 替换 ResizablePanelGroup 为 GoldenLayout |
| `src/components/workflow/EditorToolbar.vue` | 新增"重置布局"按钮 |

### 不变文件

| 文件 | 原因 |
|------|------|
| `src/components/workflow/NodeSidebar.vue` | 仅作为 registry 组件注册，内部不变 |
| `src/components/workflow/RightPanel.vue` | 同上 |
| `src/components/workflow/ExecutionBar.vue` | 同上，内部 ResizablePanelGroup 保留 |
| `src/composables/workflow/usePanelSizes.ts` | 被 useEditorLayout 替代，但可暂不删除 |

## 执行顺序依赖

```
Phase 1 (Spike) → Phase 2 (Core) → Phase 3 (Theme + Persistence) → Phase 4 (Integration)
                                                         ↑
                                    无自动化测试，每步通过 tsc --noEmit + dev 目视验证
```

## 验证命令

每个 Phase 完成后运行：

```bash
pnpm exec tsc -p tsconfig.web.json --noEmit
pnpm build
```

最终验证：

```bash
pnpm dev
# 手动测试：面板 tab 堆叠、拖拽重排、布局持久化、标签页切换、主题切换
```
