# P1: 数据模型与类型定义

> 前置依赖：无
> 设计规格：`docs/superpowers/specs/2026-04-25-node-grouping-design.md`

## 目标

在 shared 层新增 `WorkflowGroup` 类型，扩展 `Workflow` 接口，为后续所有功能提供数据基础。

## 任务

### 1. 新增 `WorkflowGroup` 类型

文件：`shared/workflow-types.ts`

```typescript
export interface WorkflowGroup {
  id: string
  name: string
  childNodeIds: string[]
  childGroupIds: string[]
  locked: boolean
  disabled: boolean
  savedNodeStates: Record<string, NodeRunState>
}
```

### 2. 扩展 `Workflow` 接口

文件：`shared/workflow-types.ts`

在 `Workflow` 接口中新增可选字段：

```typescript
groups?: WorkflowGroup[]
```

### 3. 扩展 Undo/Redo 快照

文件：`src/stores/workflow.ts`

修改 `createUndoRedoManager` 中的 `captureSnapshot` 和 `applySnapshot`：

- `captureSnapshot`: 序列化 `{ nodes, edges, groups }`
- `applySnapshot`: 还原时同时恢复 `groups` 字段

## 验证

```bash
pnpm exec tsc -p tsconfig.web.json --noEmit
pnpm build:backend
```
