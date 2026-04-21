# WorkFox Backend Migration Verification

## Goal

Provide one repeatable verification path for the backend-migration rollout so Phase 11/12 does not depend on ad-hoc manual checks.

## Commands

```bash
pnpm exec tsc -p tsconfig.web.json --noEmit
pnpm build:backend
node scripts/backend-smoke-test.mjs
pnpm build
```

## What The Smoke Test Covers

`node scripts/backend-smoke-test.mjs` starts the compiled backend with a temporary `userData` directory and the built-in plugins under `resources/plugins/`, then verifies:

1. HTTP endpoints:
   - `GET /health`
   - `GET /version`
2. WebSocket request/response:
   - `system:ping`
   - `workflow:create`
   - `workflow:list`
   - `workflow:get`
   - `workflow:delete`
3. Plugin registry:
   - `plugin:list-workflow-plugins`
   - built-in `workfox.file-system`
   - built-in `workfox.fetch`
4. Workflow plugin config schemes:
   - `workflow:create-plugin-scheme`
   - `workflow:save-plugin-scheme`
   - persisted `pluginConfigSchemes`
5. Backend execution lifecycle:
   - `workflow:execute`
   - `workflow:pause`
   - `workflow:resume`
   - `workflow:get-execution-recovery`
   - `workflow:started`
   - `workflow:paused`
   - `workflow:completed`
   - `executionLog:list`
6. Built-in server plugin execution:
   - `write_file`
   - `read_file`

## Manual Checks Still Recommended

The smoke script does not cover Electron-local interaction nodes or renderer-only UX. Before a release, still verify:

1. `agent_run` end-to-end through the Electron interaction bridge.
2. `window-manager` workflow nodes through the local main-process bridge.
3. Renderer reconnect UX:
   - `ExecutionBar` reconnecting state
   - reconnect recovery after backend restart or transient socket drop
4. Workflow editor behavior:
   - node drag/drop
   - undo/redo
   - version restore
   - execution history preview
5. Plugin UI behavior:
   - `PluginPickerDialog`
   - plugin enable/disable
   - plugin config dialog

## Current Gate

As of this verification pass:

- `pnpm exec tsc -p tsconfig.web.json --noEmit` passes
- `pnpm build:backend` passes
- `pnpm build` passes
- backend smoke verification is scripted in `scripts/backend-smoke-test.mjs`
