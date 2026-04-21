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

### Workflow Type Extension

```typescript
// In src/lib/workflow/types.ts
interface Workflow {
  // ...existing fields
  pluginConfigSchemes?: Record<string, string>  // pluginId -> selected scheme name
                                                    // empty string or absent = default
}
```

The `pluginConfigSchemes` field tracks which scheme is selected for each plugin. Empty string or absent entry means "default config".

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

**Combobox behavior:**
- Default display: "默认配置" (Default Config)
- Dropdown list items:
  1. "默认配置" — always first, not deletable
  2. User-created scheme names
  3. "[+ 新增方案]" action button — always at bottom
  4. "[✕ 删除当前方案]" action button — only shown when a non-default scheme is selected
- On scheme selection: update `workflow.pluginConfigSchemes[pluginId]` and persist

**Add scheme flow:**
1. User clicks "[+ 新增方案]"
2. Dialog prompts for scheme name
3. System reads default config values from `info.json`
4. Writes `{schemeName}.json` to `{workflowId}/plugin_configs/{pluginId}/`
5. Auto-selects the new scheme

**Edit button (⚙) behavior:**
- Opens `PluginConfigDialog` with the plugin's config fields
- On save:
  - If "default" scheme selected: calls global `plugin:save-config` IPC (updates global config)
  - If custom scheme selected: writes to `{pluginId}/{schemeName}.json`

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
2. For each enabled plugin with config fields: fetch field definitions
3. Render each field as a clickable menu item

**Variable format:**
- Node properties (unchanged): `{{ __data__["nodeId"].fieldPath }}`
- Config properties (new): `{{ __config__["pluginId"]["key"] }}`

Nested access for `object`-type config fields: `{{ __config__["pluginId"]["key"]["nestedKey"] }}`

## Engine Changes

### Config Loading at Execution Start

In `WorkflowEngine.execute()`, add a new initialization step:

```typescript
async execute() {
  // ...existing setup (topological sort, etc.)

  // NEW: Initialize __config__
  this.context.__config__ = await this.loadPluginConfigs()

  // ...existing execution loop
}
```

**`loadPluginConfigs()` logic:**

1. Read `workflow.enabledPlugins`
2. For each enabled plugin:
   a. Read `workflow.pluginConfigSchemes[pluginId]` to get selected scheme name
   b. If default/empty: call existing `plugin:get-config` IPC (merges info.json defaults + global user overrides)
   c. If custom scheme: read `{workflowId}/plugin_configs/{pluginId}/{schemeName}.json`
3. Assemble result as `Record<pluginId, Record<key, value>>`

### Variable Resolution Extension

Extend `resolveStringValue()` to handle `__config__` references:

```
{{ __config__["pluginId"]["key"] }}  → this.context.__config__[pluginId][key]
```

This follows the same pattern as existing `__data__` resolution:
- Pure variable reference → preserve original type
- Mixed with text → string interpolation
- Dot-notation for nested access

## IPC Changes

New IPC channels registered in `electron/ipc/workflow.ts`:

| Channel | Direction | Purpose |
|---------|-----------|---------|
| `workflow:list-plugin-schemes` | R→M | List scheme files for a plugin in a workflow |
| `workflow:read-plugin-scheme` | R→M | Read a specific scheme file |
| `workflow:create-plugin-scheme` | R→M | Create a new scheme file (copy defaults) |
| `workflow:save-plugin-scheme` | R→M | Save edits to a scheme file |
| `workflow:delete-plugin-scheme` | R→M | Delete a scheme file |

## Change Summary

| Layer | File | Change |
|-------|------|--------|
| Types | `src/lib/workflow/types.ts` | Add `pluginConfigSchemes` to `Workflow` |
| Store | `electron/services/workflow-store.ts` | Add scheme file CRUD methods |
| IPC | `electron/ipc/workflow.ts` | Register 5 new scheme management channels |
| Preload | `preload/index.ts` | Expose new IPC channels to renderer |
| UI | `src/components/workflow/NodeSidebar.vue` | Add Combobox + scheme management per plugin row |
| UI | `src/components/workflow/VariablePicker.vue` | Add "配置属性" sub-menu |
| Engine | `src/lib/workflow/engine.ts` | Add `__config__` loading and resolution |
| Store | `src/stores/workflow.ts` | Track selected schemes, provide IPC wrappers |

## Out of Scope

- Import/export of config schemes between workflows
- Config scheme templates or sharing
- Validation of config values against field type definitions at scheme creation time
- Migration of existing global configs to per-workflow schemes
