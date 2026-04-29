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
| `getHookConflicts(hookName, excludeWorkflowId?)` | Return list of workflows using same hookName (informational, not a conflict error) |
| `validateCron(cron)` | Validate cron expression, return next 5 run times or error |

### Cron scheduling flow

```
start()
  -> workflowStore.listWorkflows()
  -> filter triggers where type='cron' && enabled=true
  -> for each: try { create node-cron CronJob } catch { log error, skip }
  -> on fire -> executionManager.execute({ workflowId, input: {} }, '__scheduler__')
  -> results written to executionLog only, no WS push
```

- Uses `__scheduler__` as virtual clientId
- Invalid cron expressions are caught with try-catch during registration — logged as errors but do not block workflow save
- `validateCron()` exposed via WS channel for frontend validation before save

### Hook reverse index

Maintained for fast lookup on HTTP requests:

```
hookIndex: {
  "deploy-notify" => Set[{ workflowId: "wf1", triggerId: "t2" }, { workflowId: "wf3", triggerId: "t5" }]
}
```

### Hook concurrency

Default behavior: `allow` — multiple concurrent requests may trigger the same workflow simultaneously. Each execution gets a unique `executionId`. SSE events use `executionId` to distinguish concurrent runs.

Future extension point: add `concurrency: 'allow' | 'skip' | 'queue'` to `WorkflowTriggerBase` if needed.

### ExecutionManager adaptation — session-scoped event sink

The current `ExecutionManagerDeps.emit` broadcasts to all WS clients and has no clientId parameter. Instead of modifying the global emit signature, we use a **session-scoped event sink**:

```typescript
interface ExecutionSession {
  // ... existing fields ...
  eventSink?: (channel: string, payload: unknown) => void  // new optional
}
```

- When `TriggerService` calls `execute()`, it creates a session-specific `eventSink`
- `ExecutionManager.emitEvent()` checks `session.eventSink` first — if present, routes to it instead of WS
- For `__scheduler__` sessions: `eventSink` is a no-op (results only in executionLog)
- For `__hook_*` sessions: `eventSink` writes to the SSE `res` object
- Normal WS sessions: `eventSink` is undefined, existing WS emit behavior unchanged

This avoids changing the global `ExecutionManagerDeps.emit` signature and keeps the adaptation minimal.

### Integration with workflow CRUD

TriggerService integrates with existing storage channels via dependency injection, following the same pattern as `registerExecutionChannels(router, executionManager)`:

```typescript
// In backend/main.ts
const triggerService = new WorkflowTriggerService(...)
// Pass triggerService to storage channel registration
registerStorageChannels(router, storageServices, triggerService)
```

```typescript
// In backend/ws/storage-channels.ts (modified)
export function registerStorageChannels(
  router: WSRouter,
  services: StorageServices,
  triggerService?: WorkflowTriggerService  // new optional param
): void {
  router.register('workflow:update', ({ id, data }) => {
    workflowStore.updateWorkflow(id, data)
    triggerService?.reloadWorkflow(id)  // notify trigger service
    return undefined
  })
  router.register('workflow:delete', ({ id }) => {
    workflowStore.deleteWorkflow(id)
    triggerService?.removeWorkflow(id)
    return undefined
  })
  router.register('workflow:create', ({ data }) => {
    const wf = workflowStore.createWorkflow(data)
    triggerService?.reloadWorkflow(wf.id)
    return wf
  })
}
```

### Initialization in `backend/main.ts`

```
ExecutionManager created
  -> TriggerService created
  -> triggerService.start()
  -> registerStorageChannels(router, storageServices, triggerService)
```

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
// Session eventSink writes ExecutionEventMap payloads directly to SSE
// On completion: send event: done, close connection
```

**SSE event format — direct passthrough of existing `ExecutionEventMap`**:

SSE events reuse the exact same payload structure as `shared/execution-events.ts`. Each event already contains `executionId`, enabling clients to distinguish concurrent executions.

```
event: workflow:started
data: <JSON of WorkflowStartedEvent from ExecutionEventMap>

event: node:start
data: <JSON of NodeStartEvent from ExecutionEventMap>

event: node:complete
data: <JSON of NodeCompleteEvent from ExecutionEventMap>

event: workflow:completed
data: <JSON of WorkflowCompletedEvent from ExecutionEventMap>

event: done
data: {}
```

No simplified schema — the `eventSink` directly serializes the `ExecutionEventMap[channel]` payload.

### SSE connection lifecycle

- `res.on('close')` handler: removes the SSE eventSink from the session, but **does not stop** the running workflow. Execution continues in the background, results persisted to executionLog.
- SSE timeout: if execution exceeds 5 minutes, send `event: timeout` and close SSE connection (workflow continues).
- Client disconnect is a transport concern, not an execution concern.

### Broadcast logic

```
handleHookRequest(hookName, params)
  -> lookup hookIndex for bound workflows
  -> if params.workflowId exists, filter to that workflow only
  -> execute all target workflows in parallel
  -> each execution gets unique executionId (already guaranteed by ExecutionManager)
  -> SSE streams all events (distinguishable by executionId in payload)
  -> send done event when all complete
```

---

## 4. WS Channels

### New channels (`shared/channel-contracts.ts`)

```typescript
'trigger:validate-cron': ChannelContract<
  { cron: string },
  { valid: boolean; nextRuns: string[]; error?: string }
>

'trigger:check-hook-name': ChannelContract<
  { hookName: string; excludeWorkflowId?: string },
  { conflictWorkflowIds: string[]; hookUrl: string }
>
```

**Rationale**:
- Trigger CRUD uses existing `workflow:update` channel (triggers field)
- `trigger:validate-cron` validates cron expression and returns next 5 execution times for preview
- `trigger:check-hook-name` returns conflict list (workflows using same hookName) as **informational** — not an error, since hook broadcast is one-to-many by design. Also returns the full hook URL for convenience.
- No `trigger:test` channel — frontend can reuse existing `workflow:execute` channel and execution event subscriptions for testing

### Channel registration (`backend/ws/trigger-channels.ts`)

New handler file registering both channels, depends on TriggerService.

### Channel metadata (`shared/channel-metadata.ts`)

Follows existing pattern using helper functions:

```typescript
'trigger:validate-cron': crud('trigger:validate-cron', 'Validate cron expression'),
'trigger:check-hook-name': crud('trigger:check-hook-name', 'Check hook name bindings'),
```

### Frontend API adapter (`src/lib/backend-api/trigger-domain.ts`)

```typescript
export const triggerApi = {
  validateCron(cron: string): Promise<{ valid: boolean; nextRuns: string[]; error?: string }>,
  checkHookName(hookName: string, excludeWorkflowId?: string): Promise<{ conflictWorkflowIds: string[]; hookUrl: string }>
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
- Add Cron: input expression, real-time validation via `trigger:validate-cron`, show next 5 execution times preview
- Add Hook: input hookName, click "Check" to see conflicts (other workflows using same name, shown as info not error) and full hook URL
- Test button: triggers `workflow:execute` for a dry run (reuses existing execution infrastructure)
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
| `shared/channel-contracts.ts` | Add `trigger:validate-cron` and `trigger:check-hook-name` channels |
| `shared/channel-metadata.ts` | Add metadata for new channels using existing helper patterns |
| `shared/execution-events.ts` | No change — reuse existing event types for SSE |
| `backend/app/config.ts` | Add `hookSecret` config field |
| `backend/app/create-server.ts` | Register `POST /hook/:hookName` route |
| `backend/main.ts` | Initialize TriggerService after ExecutionManager |
| `backend/workflow/trigger-service.ts` | **New** — cron scheduler + hook index + SSE handler |
| `backend/workflow/execution-manager.ts` | Add optional `eventSink` to ExecutionSession, use it when present |
| `backend/ws/trigger-channels.ts` | **New** — WS handler for trigger validation |
| `backend/ws/storage-channels.ts` | Inject TriggerService, call reload/remove on workflow CRUD |
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
- SSE connections auto-close on execution completion, timeout (5 min), or client disconnect
- SSE disconnect does not stop running workflows — execution continues, results persisted to log
