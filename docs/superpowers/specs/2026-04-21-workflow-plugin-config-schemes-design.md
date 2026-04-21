# Workflow Plugin Config Schemes Design

> Date: 2026-04-21
> Status: Draft

## Summary

Enable workflows to read and switch between multiple plugin configuration schemes. Each workflow independently manages per-plugin config schemes stored in its own directory. The workflow engine loads selected schemes at runtime and exposes them via `{{ __config__["pluginId"]["key"] }}` variables accessible to all nodes.

## Background

Currently, plugin configs are global — stored in `{userDataPath}/plugin-data/{pluginId}/data.json` and shared across all workflows. When a user changes a plugin's config (e.g., switching API keys), it affects every workflow. This design adds per-workflow config scheme management, allowing workflows to use different plugin configurations independently.

## Data Model

### Storage Structure

```
{userDataPath}/agent-workflows/{workflowId}/
  workflow.json                         # existing
  plugin_configs/                       # NEW directory
    {pluginId}/                         # one directory per plugin
      production.json                   # user-created scheme files
      staging.json                      # filename = scheme name
```

- **Default scheme**: No file created. Values come from `info.json` `config` field defaults merged with global user overrides (existing `plugin:get-config` IPC).
- **Custom schemes**: User-created JSON files. Format is `Record<string, string>` — flat key-value pairs matching the `PluginConfigField` keys.

### Scheme File Format

```json
{
  "defaultTimeout": "60000",
  "userAgent": "WorkFox-Production/1.0"
}
```

For `object`-type config fields, the value is stored as a JSON string: `"apiEndpoints": "{\"prod\":\"https://api.example.com\"}"`.

### Workflow Type Extension

**Both** renderer and main process type definitions must be updated in sync:

```typescript
// In src/lib/workflow/types.ts (renderer process)
interface Workflow {
  // ...existing fields
  pluginConfigSchemes?: Record<string, string>  // pluginId -> selected scheme name
                                                    // empty string or absent = default
}

// In electron/services/store.ts (main process)
// Same field added to the mirror Workflow type definition
```

The `pluginConfigSchemes` field tracks which scheme is selected for each plugin. Empty string or absent entry means "default config".

### Engine RuntimeConfig Extension

```typescript
// In src/lib/workflow/engine.ts
interface RuntimeConfig {
  // ...existing fields
  pluginConfigSchemes?: Record<string, string>  // passed from workflow store
}
```

**Passing chain**: `stores/workflow.ts` `createExecutionActions()` must pass `workflow.pluginConfigSchemes` when constructing the engine's `runtimeConfig`. Similarly, `debugSingleNode` must pass scheme info to its temporary engine instance.

## UI Changes

### NodeSidebar.vue — Scheme Selector

**Current layout per plugin category row:**
```
[Category Name]                    [⚙ Settings]
```

**New layout:**
```
[Category Name]    [Combobox]      [⚙ Settings]
```

**State management**: NodeSidebar accesses the current workflow via `workflowStore` (Pinia). On scheme selection change, it calls `workflowStore.updateWorkflow()` to persist the updated `pluginConfigSchemes`. On component mount, it calls the new `workflow:list-plugin-schemes` IPC to populate the Combobox for each plugin category.

**Combobox behavior:**
- Default display: "默认配置" (Default Config)
- Dropdown list items:
  1. "默认配置" — always first, not deletable
  2. User-created scheme names (loaded via `workflow:list-plugin-schemes` IPC)
  3. "[+ 新增方案]" action button — always at bottom
  4. "[✕ 删除当前方案]" action button — only shown when a non-default scheme is selected
- On scheme selection: update `workflow.pluginConfigSchemes[pluginId]` via `workflowStore.updateWorkflow()`

**Add scheme flow:**
1. User clicks "[+ 新增方案]"
2. Dialog prompts for scheme name (validated: no `/`, `\`, `:`, `*`, `?`, `"`, `<`, `>`, `|` characters; no duplicate names)
3. System calls `workflow:create-plugin-scheme` IPC (server-side reads info.json defaults, creates file)
4. Auto-selects the new scheme

**Edit button (⚙) behavior:**
- Opens `PluginConfigDialog` with the plugin's config fields
- `PluginConfigDialog` receives new optional props: `schemeName?: string` and `workflowId?: string`
  - If `schemeName` is provided (custom scheme): on save calls `workflow:save-plugin-scheme` IPC
  - If `schemeName` is absent (default scheme): on save calls existing `plugin:save-config` IPC (updates global config)
- Current scheme and workflow ID are derived from the workflow store context

**Visibility:** The Combobox and edit button only appear for plugin categories that have `config` fields defined (same condition as the current settings button).

### VariablePicker.vue — Dual Sub-menus

**Current menu:**
```
[Node A] → output fields
[Node B] → output fields
```

**New menu structure:**
```
📋 节点属性 (Node Properties)
  └─ [Node A] → output fields
  └─ [Node B] → output fields

⚙️ 配置属性 (Config Properties)
  └─ [Plugin Name 1] → api_key, timeout, ...
  └─ [Plugin Name 2] → model, base_url, ...
```

**Config properties menu items** are built by:
1. Reading `workflow.enabledPlugins`
2. For each enabled plugin with config fields: fetch field definitions from `pluginStore`
3. Render each field as a clickable menu item, grouped by plugin name

**Variable format:**
- Node properties (unchanged): `{{ __data__["nodeId"].fieldPath }}`
- Config properties (new): `{{ __config__["pluginId"]["key"] }}`

Nested access for `object`-type config fields uses dot-notation after the key: `{{ __config__["pluginId"]["key"].nestedKey }}`. The engine parses the JSON string and applies dot-notation traversal for nested values.

## Engine Changes

### Config Loading at Execution Start

In `WorkflowEngine.start()`, add a new initialization step:

```typescript
async start() {
  // ...existing setup (topological sort, etc.)

  // NEW: Initialize __config__
  this.context.__config__ = await this.loadPluginConfigs()

  // ...existing execution loop
}
```

**For `debugSingleNode`**: The temporary engine instance must also call `loadPluginConfigs()`. Since debug mode operates on a subset of context, it reuses the parent workflow's `pluginConfigSchemes` from `runtimeConfig`.

**`loadPluginConfigs()` logic (all reads via IPC, since engine runs in renderer process):**

1. Read `runtimeConfig.enabledPlugins` and `runtimeConfig.pluginConfigSchemes`
2. For each enabled plugin:
   a. Read selected scheme name from `pluginConfigSchemes[pluginId]`
   b. If default/empty: call `plugin:get-config` IPC (returns merged info.json defaults + global user overrides)
   c. If custom scheme: call `workflow:read-plugin-scheme` IPC with `(workflowId, pluginId, schemeName)`
   d. On error (scheme file missing/corrupted): fall back to default config and log a warning
3. Assemble result as `Record<pluginId, Record<key, value>>`
4. Cache the result to avoid repeated IPC calls during execution

### Variable Resolution Extension

Extend `resolveStringValue()` to handle `__config__` references with a new regex branch:

```typescript
// New regex for __config__ variables (bracket-indexed pluginId, then key access)
const configPureRegex = /^\s*\{\{\s*__config__\["([^"]+)"\]\["([^"]+)"\](?:\.(\w+(?:\.\w+)*))?\s*\}\}\s*$/
const configMixedRegex = /__config__\["([^"]+)"\]\["([^"]+)"\](?:\.(\w+(?:\.\w+)*))?/g
```

**Resolution strategy**:
- Pure reference (entire string is `{{ __config__["pluginId"]["key"] }}`): preserve original type (string, number, boolean)
- Mixed with text: string interpolation
- Dot-notation after `["key"]`: parse the JSON value for `object`-type fields, then traverse dot path
- Missing key: return empty string (consistent with `__data__` behavior)

This parallels the existing `__data__` resolution pattern in `engine.ts` lines 494-526.

## IPC Changes

New IPC channels registered in `electron/ipc/workflow.ts`:

| Channel | Input | Return | Purpose |
|---------|-------|--------|---------|
| `workflow:list-plugin-schemes` | `{ workflowId: string, pluginId: string }` | `Promise<string[]>` | List scheme file names (without .json extension) for a plugin |
| `workflow:read-plugin-scheme` | `{ workflowId: string, pluginId: string, schemeName: string }` | `Promise<Record<string, string>>` | Read a specific scheme file |
| `workflow:create-plugin-scheme` | `{ workflowId: string, pluginId: string, schemeName: string }` | `Promise<void>` | Create scheme file with defaults from info.json |
| `workflow:save-plugin-scheme` | `{ workflowId: string, pluginId: string, schemeName: string, data: Record<string, string> }` | `Promise<void>` | Save edits to a scheme file |
| `workflow:delete-plugin-scheme` | `{ workflowId: string, pluginId: string, schemeName: string }` | `Promise<void>` | Delete a scheme file |

**Preload exposure** in `preload/index.ts`:
```typescript
listPluginSchemes: (workflowId: string, pluginId: string) => ipcRenderer.invoke('workflow:list-plugin-schemes', { workflowId, pluginId }),
readPluginScheme: (workflowId: string, pluginId: string, schemeName: string) => ipcRenderer.invoke('workflow:read-plugin-scheme', { workflowId, pluginId, schemeName }),
createPluginScheme: (workflowId: string, pluginId: string, schemeName: string) => ipcRenderer.invoke('workflow:create-plugin-scheme', { workflowId, pluginId, schemeName }),
savePluginScheme: (workflowId: string, pluginId: string, schemeName: string, data: Record<string, string>) => ipcRenderer.invoke('workflow:save-plugin-scheme', { workflowId, pluginId, schemeName, data }),
deletePluginScheme: (workflowId: string, pluginId: string, schemeName: string) => ipcRenderer.invoke('workflow:delete-plugin-scheme', { workflowId, pluginId, schemeName }),
```

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Custom scheme file missing at execution time | Fall back to default config, log warning to execution log |
| Scheme file contains invalid JSON | Fall back to default config, log warning with parse error |
| Scheme name with illegal characters | Validation in "add scheme" dialog prevents creation |
| Concurrent scheme file writes | IPC handlers are sequential (Electron main process single-threaded), no race condition |
| Workflow deletion | `workflow-store.ts` `deleteWorkflow()` must recursively clean `{workflowId}/plugin_configs/` directory |

## Change Summary

| Layer | File | Change |
|-------|------|--------|
| Types | `src/lib/workflow/types.ts` | Add `pluginConfigSchemes` to `Workflow` |
| Types | `electron/services/store.ts` | Add `pluginConfigSchemes` to mirror `Workflow` type (keep in sync) |
| Types | `src/lib/workflow/engine.ts` | Add `pluginConfigSchemes` to `RuntimeConfig` interface |
| Store | `electron/services/workflow-store.ts` | Add scheme file CRUD methods; update `deleteWorkflow()` to clean `plugin_configs/` |
| IPC | `electron/ipc/workflow.ts` | Register 5 new scheme management channels with full parameter signatures |
| Preload | `preload/index.ts` | Expose 5 new IPC channels to renderer |
| UI | `src/components/workflow/NodeSidebar.vue` | Add Combobox + scheme management per plugin row |
| UI | `src/components/plugins/PluginConfigDialog.vue` | Accept optional `schemeName`/`workflowId` props for custom scheme saves |
| UI | `src/components/workflow/VariablePicker.vue` | Add "配置属性" sub-menu |
| Engine | `src/lib/workflow/engine.ts` | Add `__config__` loading in `start()`, resolution regex in `resolveStringValue()` |
| Store | `src/stores/workflow.ts` | Pass `pluginConfigSchemes` in `createExecutionActions()` and `debugSingleNode()` |

## Out of Scope

- Import/export of config schemes between workflows
- Config scheme templates or sharing
- Validation of config values against field type definitions at scheme creation time
- Migration of existing global configs to per-workflow schemes
