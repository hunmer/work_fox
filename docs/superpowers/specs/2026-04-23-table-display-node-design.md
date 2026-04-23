# Table Display Node Design

## Overview

新增 `table_display` 内置工作流节点，展示数据表格并支持用户交互确认（单选/多选）。执行到该节点时，工作流通过 Interaction Bridge 暂停等待用户操作，用户提交选中行后工作流继续。

## Data Model

### Headers

```typescript
interface TableHeader {
  id: string       // 字段标识，对应 cells 中的 key
  title: string    // 显示名称
  type: 'string' | 'number' | 'boolean'
}
```

### Cells

```typescript
interface TableCell {
  id: string                // 行 ID
  data: Record<string, any> // key 为 header.id，value 为对应数据
}
```

### Selection Mode

- `none` - 仅展示，第一列无 checkbox
- `single` - 单选，radio 行为
- `multi` - 多选，checkbox 行为

## Node Definition

**文件**: `electron/services/builtin-nodes.ts`

- type: `table_display`
- category: `展示`
- icon: `Table`
- properties:
  - `headers` (array) - 表头定义，子字段 id/title/type
  - `cells` (array) - 数据行，子字段 id/data
  - `selectionMode` (select) - none/single/multi，默认 none
- outputs:
  - `selectedRows` (array) - 用户选中的行数据
  - `selectedCount` (number) - 选中数量
- customView: `TableViewComponent`
- customViewMinSize: `{ width: 400, height: 200 }`
- `requireInteraction: true` - 标记此节点需要用户交互

数据来源支持两种：
1. 属性面板手动配置静态 headers/cells
2. 上游节点输出变量映射到 headers/cells

## Execution Flow

### 执行引擎 (execution-manager.ts)

1. 执行到 `table_display` 节点时，检查 `requireInteraction` 标志
2. 调用 `interactionManager.request()` 发送 `table_confirm` 交互请求
3. 工作流暂停，等待客户端响应
4. 收到 `interaction_response` 后，提取 `selectedRows`/`selectedCount` 作为节点输出
5. 工作流继续执行下游节点

### Interaction Manager

在 `InteractionType` 中新增 `'table_confirm'`。

交互请求 schema：
```typescript
{
  headers: TableHeader[]
  cells: TableCell[]
  selectionMode: 'none' | 'single' | 'multi'
}
```

交互响应 data：
```typescript
{
  selectedRows: TableCell[]
  selectedCount: number
}
```

## Frontend

### CustomView Registration

**文件**: `src/lib/workflow/nodes/display.ts`

注册 `table_display` 节点的 customView 为 `TableViewComponent`。

### TableViewComponent

**文件**: `src/components/workflow/TableViewComponent.vue`（新建）

Props:
- `headers: TableHeader[]`
- `cells: TableCell[]`
- `selectionMode: 'none' | 'single' | 'multi'`
- `interactive: boolean` - 是否处于等待确认状态

渲染：
- 表头行
- 数据行，selectionMode !== 'none' 时第一列渲染 checkbox/radio
- 底部右下角提交按钮（仅 interactive=true 时显示）
- 提交时收集选中行，通过 interaction response 发回

### Interaction Handler

**文件**: `src/lib/backend-api/interaction.ts`

在 `handleWorkflowInteraction` 中新增 `table_confirm` case：
- 渲染表格 UI
- 等待用户选择并提交
- 返回选中行数据

### CustomNodeWrapper.vue

当节点状态为 `interaction_required` 且类型为 `table_display` 时，传入 `interactive: true` 和相关数据给 TableViewComponent。

## Files Changed

| File | Change |
|------|--------|
| `electron/services/builtin-nodes.ts` | 注册 table_display 节点 |
| `src/lib/workflow/nodes/display.ts` | 注册 TableViewComponent |
| `backend/workflow/execution-manager.ts` | 检查 requireInteraction，发起 interaction |
| `shared/ws-protocol.ts` | InteractionType 加 `table_confirm` |
| `src/lib/backend-api/interaction.ts` | 处理 table_confirm 交互 |
| `src/components/workflow/CustomNodeWrapper.vue` | 传入 interactive prop |
| `src/components/workflow/TableViewComponent.vue` | 新建表格组件 |

## Edge Cases

- `selectionMode: 'none'` 时，提交按钮仅作确认用，输出全部行
- `selectionMode: 'single'` 但用户未选中任何行时，提交按钮禁用
- 交互超时由 interaction-manager 现有超时机制处理
- 断线重连后 interaction-manager 会重新发送 pending 请求
- 用户可取消交互（`cancelled: true`），工作流终止当前执行
