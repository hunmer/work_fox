# Workflow Triggers Design — Cron Scheduling & HTTP Hook

**Date**: 2026-04-28
**Status**: Draft
**Approach**: Lightweight embedded — triggers stored in Workflow JSON, single TriggerService manages both cron and hook

---

## Overview

Add workflow trigger capabilities to WorkFox, enabling:

1. **Cron triggers** — schedule workflows to run on cron expressions (e.g., `0 9 * * 1-5` for weekdays at 9am)
2. **HTTP Hook triggers** — external systems trigger workflows via HTTP POST with SSE response streaming execution events

This is modeled after n8n's trigger system but adapted to WorkFox's JSON-file storage and Express + WebSocket architecture.

---

## 1. Data Model

### New type: `WorkflowTrigger` (`shared/workflow-types.ts`)

```typescript
export interface WorkflowTriggerBase {
  id: string       // uuid
  enabled: boolean // toggle without deleting
}

export type WorkflowTrigger =
  | (WorkflowTriggerBase & {
      type: 'cron'
      cron: string       // standard cron expression, e.g. '0 9 * * 1-5'
      timezone?: string  // optional, defaults to system timezone
    })
  | (WorkflowTriggerBase & {
      type: 'hook'
      hookName: string   // used as URL path segment: /hook/:hookName
    })
```

### `Workflow` type extension

```typescript
interface Workflow {
  // ... existing fields ...
  triggers?: WorkflowTrigger[]  // new optional field
}
```

**Design decisions**:
- Discriminated union for type safety
- `id` for frontend editing identification
- `enabled` allows temporary disable without deletion
- One `hookName` may appear in multiple workflows (one-to-many broadcast)
- Stored directly in workflow JSON — no separate storage needed

---

## 2. Backend: TriggerService

### New file: `backend/workflow/trigger-service.ts`

Single service managing both trigger types.

```typescript
class WorkflowTriggerService {
  private cronJobs: Map<string, cron.CronJob>   // triggerId -> CronJob
  private hookIndex: Map<string, Set<{ workflowId: string; triggerId: string }>>

  constructor(
    private workflowStore: BackendWorkflowStore,
    private executionManager: ExecutionManager,
    private config: BackendConfig,
    private logger: Logger
  ) {}
}
```

### Core methods

| Method | Responsibility |
|--------|---------------|
| `start()` | Scan all workflows, register enabled cron jobs and build hook index |
| `reloadWorkflow(workflowId)` | Called on workflow update — clear old triggers, register new ones |
| `removeWorkflow(workflowId)` | Called on workflow delete — clear associated triggers |
| `getHookBindings(hookName)` | Return workflow IDs bound to a hookName |
| `isHookNameAvailable(hookName, excludeWorkflowId?)` | Check hook name availability |

### Cron scheduling flow

```
start()
  -> workflowStore.listWorkflows()
  -> filter triggers where type='cron' && enabled=true
  -> create node-cron CronJob for each
  -> on fire -> executionManager.execute({ workflowId, input: {} }, '__scheduler__')
  -> results written to executionLog only, no WS push
```

- Uses `__scheduler__` as virtual clientId
- ExecutionManager needs minor adaptation: skip WS emit when clientId starts with `__`

### Hook reverse index

Maintained for fast lookup on HTTP requests:

```
hookIndex: {
  "deploy-notify" => Set[{ workflowId: "wf1", triggerId: "t2" }, { workflowId: "wf3", triggerId: "t5" }]
}
```

### Initialization in `backend/main.ts`

```
ExecutionManager created
  -> TriggerService created
  -> triggerService.start()
```

Workflow CRUD handlers must notify TriggerService:
- `workflow:update` -> `triggerService.reloadWorkflow(id)`
- `workflow:delete` -> `triggerService.removeWorkflow(id)`
- `workflow:create` -> `triggerService.reloadWorkflow(id)`

---

## 3. HTTP Hook Endpoint & SSE

### New dependency

- `node-cron` — cron scheduling (no SSE dependency needed — native Express `res.write()`)

### Config extension (`backend/app/config.ts`)

```typescript
interface BackendConfig {
  // ... existing fields ...
  hookSecret?: string  // WORKFOX_HOOK_SECRET, verification key for HTTP hooks
}
```

### HTTP endpoint (`backend/app/create-server.ts`)

```
POST /hook/:hookName    Trigger workflows, SSE response with execution events
```

### Request protocol

```http
POST /hook/deploy-notify
Authorization: Bearer <hookSecret>
Content-Type: application/json

{
  "workflowId": "wf1",          // optional, target specific workflow
  "input": { "key": "value" }  // optional, passed to start node
}
```

**Auth**: `Authorization: Bearer <token>` compared against `config.hookSecret`. If `hookSecret` is not configured, auth is skipped (dev convenience).

### SSE response

```typescript
res.writeHead(200, {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  'Connection': 'keep-alive'
})

const sseClientId = `__hook_${uuid()}__`
// Intercept ExecutionManager emit -> write to SSE
// On completion: send event: done, close connection
```

**SSE event format**:

```
event: workflow:started
data: {"executionId":"exec1","workflowId":"wf1","status":"running"}

event: node:start
data: {"nodeId":"n1","workflowId":"wf1","label":"Start"}

event: node:complete
data: {"nodeId":"n1","workflowId":"wf1","output":{...}}

event: workflow:completed
data: {"executionId":"exec1","workflowId":"wf1","status":"completed"}

event: done
data: {}
```

### Broadcast logic

```
handleHookRequest(hookName, params)
  -> lookup hookIndex for bound workflows
  -> if params.workflowId exists, filter to that workflow only
  -> execute all target workflows in parallel
  -> SSE streams events from all workflows (tagged with workflowId)
  -> send done event when all complete
```

### ExecutionManager adaptation

Minimal change — inject a custom `emit` function via deps:

```typescript
// When clientId starts with '__hook_' or '__scheduler__'
// The emit callback injected by TriggerService handles routing
// (SSE for hook, no-op for scheduler)
// No WS emit occurs for system client IDs
```

---

## 4. WS Channels

### New channels (`shared/channel-contracts.ts`)

```typescript
'trigger:check-hook-name': ChannelContract<
  { hookName: string; excludeWorkflowId?: string },
  { available: boolean; conflictWorkflowIds: string[] }
>

'trigger:test': ChannelContract<
  { workflowId: string; triggerId: string; input?: Record<string, unknown> },
  { executionId: string; status: EngineStatus }
>
```

**Rationale**: Trigger CRUD uses existing `workflow:update` channel (triggers field). Only validation and testing need dedicated channels.

### Channel registration (`backend/ws/trigger-channels.ts`)

New handler file registering both channels, depends on TriggerService.

### Channel metadata (`shared/channel-metadata.ts`)

```typescript
'trigger:check-hook-name': { timeout: 5000 },
'trigger:test': { timeout: 120_000, stream: true }
```

### Frontend API adapter (`src/lib/backend-api/trigger-domain.ts`)

```typescript
export const triggerApi = {
  checkHookName(hookName: string, excludeWorkflowId?: string),
  testTrigger(workflowId: string, triggerId: string, input?: Record<string, unknown>)
}
```

---

## 5. Frontend UI Components

### 5.1 TriggerSettingsDialog

**File**: `src/components/workflow/TriggerSettingsDialog.vue`

**Props**: `workflowId: string`, `open: boolean`
**Emits**: `update:open`, `saved`

**Layout**:

```
+-- Trigger Settings -------------------------+
|                                             |
|  Workflow: {workflowName}                   |
|                                             |
|  Trigger list:                              |
|  +-----------------------------------------+|
|  | Cron  0 9 * * 1-5      [on/off] [delete] ||
|  | Hook  deploy-notify    [on/off] [delete] ||
|  +-----------------------------------------+|
|                                             |
|  [+ Add Cron] [+ Add Hook]                  |
|                                             |
|  -- Add Cron --                             |
|  Cron expr: [0 9 * * *         ]            |
|  Next run:  2026-04-29 09:00:00            |
|                                             |
|  -- Add Hook --                             |
|  Hook name:  [deploy-notify  ] [Check]      |
|  Hook URL:   http://host:port/hook/...      |
|                                             |
|                  [Test] [Cancel] [Save]      |
+---------------------------------------------+
```

**Features**:
- List all triggers with enable/disable toggle and delete button per row
- Add Cron: input expression, show next execution time preview
- Add Hook: input hookName, check availability button, display full hook URL
- Test button: calls `trigger:test` for a dry run
- Save: updates workflow via `workflow:update` with modified triggers array

### 5.2 WorkflowListPage Badge

**File**: `src/components/dashboard/WorkflowListPage.vue` (left panel)

Display badges next to workflow name:

- Has enabled cron trigger -> show clock badge
- Has enabled hook trigger -> show link badge
- No triggers -> no badge

### 5.3 WorkflowListPage Detail Panel

**File**: Right-side detail panel in WorkflowListPage

Add a triggers section:

```
--- Triggers ---
Cron  09:00 (weekdays)    Enabled
Hook  deploy-notify       Enabled
              [Edit Triggers]  <- opens TriggerSettingsDialog
```

### 5.4 EditorToolbar Entry

**File**: `src/components/workflow/EditorToolbar.vue`

Add a trigger icon button in the right area, before the layout reset button:

```
[...] tabs [...]  [Triggers] [Reset Layout] [Unsaved] [Window Controls]
```

- Click opens `TriggerSettingsDialog`
- If current workflow has triggers, show a small dot indicator on the icon

---

## 6. File Change Summary

| File | Change |
|------|--------|
| `shared/workflow-types.ts` | Add `WorkflowTrigger` type, extend `Workflow` with `triggers` field |
| `shared/channel-contracts.ts` | Add `trigger:check-hook-name` and `trigger:test` channels |
| `shared/channel-metadata.ts` | Add metadata for new channels |
| `shared/execution-events.ts` | No change — reuse existing event types for SSE |
| `backend/app/config.ts` | Add `hookSecret` config field |
| `backend/app/create-server.ts` | Register `POST /hook/:hookName` route |
| `backend/main.ts` | Initialize TriggerService after ExecutionManager |
| `backend/workflow/trigger-service.ts` | **New** — cron scheduler + hook index + SSE handler |
| `backend/workflow/execution-manager.ts` | Minor adaptation for system client IDs |
| `backend/ws/trigger-channels.ts` | **New** — WS handler for trigger validation and testing |
| `backend/ws/index.ts` (or router) | Register trigger channels |
| `src/lib/backend-api/trigger-domain.ts` | **New** — frontend trigger API adapter |
| `src/components/workflow/TriggerSettingsDialog.vue` | **New** — trigger settings dialog |
| `src/components/dashboard/WorkflowListPage.vue` | Add trigger badges + detail panel section |
| `src/components/workflow/EditorToolbar.vue` | Add trigger settings button |

## 7. Dependencies

- `node-cron` — cron scheduling (production dependency)
- No SSE library needed — native Express streaming

## 8. Security Considerations

- HTTP Hook auth via Bearer token against `WORKFOX_HOOK_SECRET` env var
- No auth when secret not configured (dev mode only)
- Cron triggers run with system-level permissions (no user context)
- SSE connections auto-close on execution completion or client disconnect
