# Workflow Plugin Config Schemes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-workflow plugin config scheme management with Combobox selector in NodeSidebar and `__config__` variable support in the workflow engine.

**Architecture:** Backend-first approach — types/storage/IPC first, then engine integration, then UI. Each task produces a self-contained, committable unit.

**Tech Stack:** Electron IPC, Vue 3 Composition API, Pinia, TypeScript, shadcn-vue components (Combobox/Command)

**Spec:** `docs/superpowers/specs/2026-04-21-workflow-plugin-config-schemes-design.md`

---

## File Map

### New Files
- None (all changes are modifications to existing files)

### Modified Files

| File | Responsibility |
|------|---------------|
| `src/lib/workflow/types.ts` | Add `pluginConfigSchemes` to `Workflow` type |
| `electron/services/store.ts` | Add `pluginConfigSchemes` to mirror `Workflow` type |
| `electron/services/workflow-store.ts` | Add scheme CRUD functions + cleanup on delete |
| `electron/ipc/workflow.ts` | Register 5 new scheme IPC handlers |
| `preload/index.ts` | Expose 5 new scheme IPC methods |
| `src/lib/workflow/engine.ts` | Add `pluginConfigSchemes` to runtimeConfig, `loadPluginConfigs()`, `__config__` resolution |
| `src/stores/workflow.ts` | Pass `pluginConfigSchemes` in engine construction |
| `src/stores/plugin.ts` | Add scheme IPC wrappers |
| `src/components/workflow/NodeSidebar.vue` | Add Combobox scheme selector + scheme management |
| `src/components/plugins/PluginConfigDialog.vue` | Accept `schemeName`/`workflowId` props for dual save mode |
| `src/components/workflow/VariablePicker.vue` | Add dual sub-menu (节点属性 + 配置属性) |

---

## Task 1: Types — Add `pluginConfigSchemes` to Workflow

**Files:**
- Modify: `src/lib/workflow/types.ts:43-54`
- Modify: `electron/services/store.ts:46-57`

- [ ] **Step 1: Update renderer process type**

In `src/lib/workflow/types.ts`, add `pluginConfigSchemes` to the `Workflow` interface after `agentConfig`:

```typescript
// Line 53, after agentConfig?: WorkflowAgentConfig
pluginConfigSchemes?: Record<string, string>  // pluginId -> selected scheme name (empty = default)
```

- [ ] **Step 2: Update main process type (keep in sync)**

In `electron/services/store.ts`, add the same field to the `Workflow` interface after `agentConfig`:

```typescript
// Line 56, after agentConfig?: WorkflowAgentConfig
pluginConfigSchemes?: Record<string, string>
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/workflow/types.ts electron/services/store.ts
git commit -m "feat(types): add pluginConfigSchemes to Workflow type"
```

---

## Task 2: Backend — Scheme Storage CRUD in workflow-store.ts

**Files:**
- Modify: `electron/services/workflow-store.ts`

- [ ] **Step 1: Add scheme file helper functions**

First, update line 4 import to add `rmSync`:

```typescript
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, unlinkSync, rmSync } from 'node:fs'
```

After the existing `deleteWorkflowFile` function (line 73), add:

```typescript
// ====== 插件配置方案 ======

function pluginConfigsDir(workflowId: string): string {
  return join(agentWorkflowsDir, workflowId, 'plugin_configs')
}

function pluginSchemePath(workflowId: string, pluginId: string, schemeName: string): string {
  const dir = join(pluginConfigsDir(workflowId), pluginId)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, `${schemeName}.json`)
}

export function listPluginSchemes(workflowId: string, pluginId: string): string[] {
  const dir = join(pluginConfigsDir(workflowId), pluginId)
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .map(f => f.replace(/\.json$/, ''))
    .sort()
}

export function readPluginScheme(workflowId: string, pluginId: string, schemeName: string): Record<string, string> {
  const path = pluginSchemePath(workflowId, pluginId, schemeName)
  if (!existsSync(path)) throw new Error(`配置方案 ${schemeName} 不存在`)
  return JSON.parse(readFileSync(path, 'utf-8'))
}

export function createPluginScheme(workflowId: string, pluginId: string, schemeName: string): void {
  // Validate scheme name (no illegal filesystem chars)
  if (/[\/\\:*?"<>|]/.test(schemeName)) {
    throw new Error('方案名称包含非法字符')
  }
  const dir = join(pluginConfigsDir(workflowId), pluginId)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const path = join(dir, `${schemeName}.json`)
  if (existsSync(path)) throw new Error(`方案 ${schemeName} 已存在`)

  // Read defaults from plugin info.json
  // Use require() to avoid circular dependency with plugin-manager
  const pluginManager = require('./plugin-manager').pluginManager
  const plugin = pluginManager.getPlugin(pluginId)
  const defaults: Record<string, string> = {}
  if (plugin?.info?.config) {
    for (const field of plugin.info.config) {
      defaults[field.key] = field.value ?? ''
    }
  }
  writeFileSync(path, JSON.stringify(defaults, null, 2), 'utf-8')
}

export function savePluginScheme(workflowId: string, pluginId: string, schemeName: string, data: Record<string, string>): void {
  const path = pluginSchemePath(workflowId, pluginId, schemeName)
  writeFileSync(path, JSON.stringify(data, null, 2), 'utf-8')
}

export function deletePluginScheme(workflowId: string, pluginId: string, schemeName: string): void {
  const path = pluginSchemePath(workflowId, pluginId, schemeName)
  if (existsSync(path)) unlinkSync(path)
}
```

- [ ] **Step 2: Update `deleteWorkflowFile` to clean plugin_configs directory**

Change the existing `deleteWorkflowFile` function (line 70-73) to also clean the plugin_configs directory:

```typescript
function deleteWorkflowFile(id: string): void {
  const path = workflowPath(id)
  if (existsSync(path)) unlinkSync(path)
  // Clean plugin_configs directory
  const configsDir = pluginConfigsDir(id)
  if (existsSync(configsDir)) {
    rmSync(configsDir, { recursive: true, force: true })
  }
}
```

Note: `rmSync` was already added to the `node:fs` import in Step 1.

- [ ] **Step 3: Commit**

```bash
git add electron/services/workflow-store.ts
git commit -m "feat(workflow-store): add plugin config scheme CRUD and cleanup"
```

---

## Task 3: IPC — Register Scheme Channels

**Files:**
- Modify: `electron/ipc/workflow.ts`
- Modify: `preload/index.ts`

- [ ] **Step 1: Add scheme IPC handlers**

In `electron/ipc/workflow.ts`, add the import for new functions and register 5 new handlers inside `registerWorkflowIpcHandlers()`:

Add to the import block (line 2-12):
```typescript
import {
  // ...existing imports
  listPluginSchemes,
  readPluginScheme,
  createPluginScheme,
  savePluginScheme,
  deletePluginScheme,
} from '../services/workflow-store'
```

Add inside `registerWorkflowIpcHandlers()`, after the folder handlers (after line 55):

```typescript
  // 插件配置方案
  ipcMain.handle('workflow:list-plugin-schemes', (_e, { workflowId, pluginId }: { workflowId: string; pluginId: string }) => {
    try { return listPluginSchemes(workflowId, pluginId) } catch { return [] }
  })
  ipcMain.handle('workflow:read-plugin-scheme', (_e, { workflowId, pluginId, schemeName }: { workflowId: string; pluginId: string; schemeName: string }) => {
    return readPluginScheme(workflowId, pluginId, schemeName)
  })
  ipcMain.handle('workflow:create-plugin-scheme', (_e, { workflowId, pluginId, schemeName }: { workflowId: string; pluginId: string; schemeName: string }) => {
    return createPluginScheme(workflowId, pluginId, schemeName)
  })
  ipcMain.handle('workflow:save-plugin-scheme', (_e, { workflowId, pluginId, schemeName, data }: { workflowId: string; pluginId: string; schemeName: string; data: Record<string, string> }) => {
    return savePluginScheme(workflowId, pluginId, schemeName, data)
  })
  ipcMain.handle('workflow:delete-plugin-scheme', (_e, { workflowId, pluginId, schemeName }: { workflowId: string; pluginId: string; schemeName: string }) => {
    return deletePluginScheme(workflowId, pluginId, schemeName)
  })
```

- [ ] **Step 2: Expose in preload**

In `preload/index.ts`, add inside the `workflow` object (after `exportSaveFile`, line 97):

```typescript
    listPluginSchemes: (workflowId: string, pluginId: string): Promise<string[]> =>
      ipcRenderer.invoke('workflow:list-plugin-schemes', { workflowId, pluginId }),
    readPluginScheme: (workflowId: string, pluginId: string, schemeName: string): Promise<Record<string, string>> =>
      ipcRenderer.invoke('workflow:read-plugin-scheme', { workflowId, pluginId, schemeName }),
    createPluginScheme: (workflowId: string, pluginId: string, schemeName: string): Promise<void> =>
      ipcRenderer.invoke('workflow:create-plugin-scheme', { workflowId, pluginId, schemeName }),
    savePluginScheme: (workflowId: string, pluginId: string, schemeName: string, data: Record<string, string>): Promise<void> =>
      ipcRenderer.invoke('workflow:save-plugin-scheme', { workflowId, pluginId, schemeName, data }),
    deletePluginScheme: (workflowId: string, pluginId: string, schemeName: string): Promise<void> =>
      ipcRenderer.invoke('workflow:delete-plugin-scheme', { workflowId, pluginId, schemeName }),
```

- [ ] **Step 3: Commit**

```bash
git add electron/ipc/workflow.ts preload/index.ts
git commit -m "feat(ipc): add plugin config scheme channels and preload exposure"
```

---

## Task 4: Engine — Add `__config__` Loading and Resolution

**Files:**
- Modify: `src/lib/workflow/engine.ts`

- [ ] **Step 1: Extend runtimeConfig type**

In `engine.ts`, update the `runtimeConfig` type in both the constructor parameter and class field (lines 24-29 and 38-43). Add `pluginConfigSchemes`:

```typescript
  private runtimeConfig?: {
    workflowId?: string
    workflowName?: string
    workflowDescription?: string
    enabledPlugins?: string[]
    pluginConfigSchemes?: Record<string, string>  // NEW
  }
```

Apply this to both locations (class field at line 24 and constructor parameter at line 38).

- [ ] **Step 2: Add `loadPluginConfigs()` method**

Add this new method after the `reset()` method (after line 137):

```typescript
  /** 加载已启用插件的配置到 __config__ */
  private async loadPluginConfigs(): Promise<Record<string, Record<string, string>>> {
    const plugins = this.runtimeConfig?.enabledPlugins
    const schemes = this.runtimeConfig?.pluginConfigSchemes
    if (!plugins?.length) return {}

    const config: Record<string, Record<string, string>> = {}
    for (const pluginId of plugins) {
      try {
        const schemeName = schemes?.[pluginId]
        if (schemeName) {
          // Custom scheme: read via IPC
          config[pluginId] = await (window as any).api.workflow.readPluginScheme(
            this.runtimeConfig!.workflowId!, pluginId, schemeName,
          )
        } else {
          // Default scheme: use global plugin config
          config[pluginId] = await (window as any).api.plugin.getConfig(pluginId)
        }
      } catch (e) {
        // Fall back to default on error
        console.warn(`[Engine] 加载插件 ${pluginId} 配置失败，使用默认值:`, e)
        try {
          config[pluginId] = await (window as any).api.plugin.getConfig(pluginId)
        } catch {
          config[pluginId] = {}
        }
      }
    }
    return config
  }
```

- [ ] **Step 3: Call `loadPluginConfigs()` in `start()` and `reset()`**

In `start()` (line 78), add after `this.reset()` and before `this.buildExecutionOrder()`:

```typescript
  async start(): Promise<ExecutionLog> {
    this.reset()
    this.context.__config__ = await this.loadPluginConfigs()  // NEW
    this.executionOrder = this.buildExecutionOrder()
    // ...rest unchanged
  }
```

In `reset()` (line 128), add `__config__: {}` to the context initialization:

```typescript
  private reset(): void {
    this.context = { __data__: {}, __config__: {} }  // updated
    // ...rest unchanged
  }
```

- [ ] **Step 4: Add `__config__` resolution to `resolveStringValue()`**

In `resolveStringValue()` (line 494), add a new pure-variable check after the `__data__` match (after line 504, before the `context` match):

```typescript
    // Pure __config__ variable → preserve original type
    const configMatch = value.match(/^\s*\{\{\s*__config__\["([^"]+)"\]\["([^"]+)"\](?:\.(\w+(?:\.\w+)*))?\s*\}\}\s*$/)
    if (configMatch) {
      const pluginConfig = this.context.__config__?.[configMatch[1]]
      if (pluginConfig != null) {
        let raw: any = pluginConfig[configMatch[2]]
        // If dot-path exists, parse JSON and traverse
        if (configMatch[3] && typeof raw === 'string') {
          try { raw = JSON.parse(raw) } catch { /* not JSON, use as-is */ }
        }
        const result = configMatch[3] ? this.getNestedValue(raw, configMatch[3]) : raw
        if (result !== undefined) return result
      }
      return ''
    }
```

Then add the mixed-text replacement. Before the existing `context` replace (line 522), add:

```typescript
    str = str.replace(
      /__config__\["([^"]+)"\]\["([^"]+)"\](?:\.(\w+(?:\.\w+)*))?/g,
      (_, pluginId, key, dotPath) => {
        const pluginConfig = this.context.__config__?.[pluginId]
        if (pluginConfig == null) return ''
        let raw: any = pluginConfig[key]
        if (dotPath && typeof raw === 'string') {
          try { raw = JSON.parse(raw) } catch { /* not JSON */ }
        }
        return String((dotPath ? this.getNestedValue(raw, dotPath) : raw) ?? '')
      },
    )
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/workflow/engine.ts
git commit -m "feat(engine): add __config__ loading and variable resolution"
```

---

## Task 5: Workflow Store — Pass `pluginConfigSchemes` to Engine

**Files:**
- Modify: `src/stores/workflow.ts`

- [ ] **Step 1: Update `createExecutionActions` to pass `pluginConfigSchemes`**

In `startExecution()` (around line 447), add `pluginConfigSchemes` to the runtimeConfig:

```typescript
    engine.value = new WorkflowEngine(currentWorkflow.value.nodes, currentWorkflow.value.edges, {
      onLogUpdate: (log) => { executionLog.value = { ...log } },
      onNodeStatusChange: () => {},
    }, {
      workflowId: currentWorkflow.value.id,
      workflowName: currentWorkflow.value.name,
      workflowDescription: currentWorkflow.value.description,
      enabledPlugins: currentWorkflow.value.enabledPlugins || [],
      pluginConfigSchemes: currentWorkflow.value.pluginConfigSchemes || {},  // NEW
    })
```

- [ ] **Step 2: Update `createDebugActions` to pass `pluginConfigSchemes`**

In `debugSingleNode()` (around line 508), add `pluginConfigSchemes` to the debug engine's runtimeConfig:

```typescript
    debugEngine = new WorkflowEngine([node], [], undefined, {
      workflowId: currentWorkflow.value.id,
      workflowName: currentWorkflow.value.name,
      workflowDescription: currentWorkflow.value.description,
      enabledPlugins: currentWorkflow.value.enabledPlugins || [],
      pluginConfigSchemes: currentWorkflow.value.pluginConfigSchemes || {},  // NEW
    })
```

- [ ] **Step 3: Commit**

```bash
git add src/stores/workflow.ts
git commit -m "feat(workflow-store): pass pluginConfigSchemes to engine"
```

---

## Task 6: Plugin Store — Add Scheme IPC Wrappers

**Files:**
- Modify: `src/stores/plugin.ts`

- [ ] **Step 1: Add scheme management methods**

In `src/stores/plugin.ts`, add after `savePluginConfig` (after line 85):

```typescript
  async function listPluginSchemes(workflowId: string, pluginId: string): Promise<string[]> {
    return window.api.workflow.listPluginSchemes(workflowId, pluginId)
  }

  async function createPluginScheme(workflowId: string, pluginId: string, schemeName: string): Promise<void> {
    return window.api.workflow.createPluginScheme(workflowId, pluginId, schemeName)
  }

  async function deletePluginScheme(workflowId: string, pluginId: string, schemeName: string): Promise<void> {
    return window.api.workflow.deletePluginScheme(workflowId, pluginId, schemeName)
  }

  async function readPluginScheme(workflowId: string, pluginId: string, schemeName: string): Promise<Record<string, string>> {
    return window.api.workflow.readPluginScheme(workflowId, pluginId, schemeName)
  }

  async function savePluginScheme(workflowId: string, pluginId: string, schemeName: string, data: Record<string, string>): Promise<void> {
    return window.api.workflow.savePluginScheme(workflowId, pluginId, schemeName, data)
  }
```

Then expose them in the return object:

```typescript
    listPluginSchemes,
    createPluginScheme,
    deletePluginScheme,
    readPluginScheme,
    savePluginScheme,
```

- [ ] **Step 2: Commit**

```bash
git add src/stores/plugin.ts
git commit -m "feat(plugin-store): add scheme management IPC wrappers"
```

---

## Task 7: UI — PluginConfigDialog Dual Save Mode

**Files:**
- Modify: `src/components/plugins/PluginConfigDialog.vue`

- [ ] **Step 1: Add optional `schemeName` and `workflowId` props**

Update the `defineProps` (line 32-37) to:

```typescript
const props = defineProps<{
  open: boolean
  pluginId: string
  pluginName: string
  config: PluginConfigField[]
  schemeName?: string    // NEW: custom scheme name (empty = default/global)
  workflowId?: string    // NEW: needed for scheme-based save
}>()
```

- [ ] **Step 2: Update `handleSave` to branch on save target**

Replace the `handleSave` function (lines 72-90) with:

```typescript
async function handleSave() {
  const validationError = validateForm()
  if (validationError) {
    errorMessage.value = validationError
    return
  }
  saving.value = true
  errorMessage.value = ''
  try {
    if (props.schemeName && props.workflowId) {
      // Custom scheme: save to workflow-specific scheme file
      await pluginStore.savePluginScheme(props.workflowId, props.pluginId, props.schemeName, { ...formValues.value })
    } else {
      // Default/global scheme: use existing global save
      const result = await pluginStore.savePluginConfig(props.pluginId, { ...formValues.value })
      if (!result.success) {
        errorMessage.value = result.error || '保存失败'
        return
      }
    }
    emit('update:open', false)
  } catch (e: any) {
    errorMessage.value = e?.message || '保存失败'
  } finally {
    saving.value = false
  }
}
```

Also update the `watch` that loads config (line 48-53) to load from scheme file when `schemeName` is set:

```typescript
watch(() => props.open, async (isOpen) => {
  if (!isOpen || !props.pluginId) return
  errorMessage.value = ''
  if (props.schemeName && props.workflowId) {
    // Load from custom scheme
    try {
      formValues.value = await pluginStore.readPluginScheme(props.workflowId, props.pluginId, props.schemeName)
    } catch {
      formValues.value = await pluginStore.getPluginConfig(props.pluginId)
    }
  } else {
    formValues.value = await pluginStore.getPluginConfig(props.pluginId)
  }
})
```

- [ ] **Step 3: Update dialog title to show scheme name**

In the template, update the DialogTitle (line 98):

```html
<DialogTitle>{{ pluginName }} - 设置{{ schemeName ? ` (${schemeName})` : '' }}</DialogTitle>
```

- [ ] **Step 4: Commit**

```bash
git add src/components/plugins/PluginConfigDialog.vue
git commit -m "feat(PluginConfigDialog): add dual save mode for custom schemes"
```

---

## Task 8: UI — NodeSidebar Scheme Combobox

**Files:**
- Modify: `src/components/workflow/NodeSidebar.vue`

This is the largest UI task. The NodeSidebar needs a Combobox per plugin category row, plus add/delete scheme actions.

- [ ] **Step 1: Add new imports and state**

Add to the `<script setup>` imports:

```typescript
import { ref, computed, watch } from 'vue'
import { useWorkflowStore } from '@/stores/workflow'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Input as DialogInput } from '@/components/ui/input'
import { ChevronDown, Plus, Trash2 } from 'lucide-vue-next'
```

Add state refs:

```typescript
const workflowStore = useWorkflowStore()
const schemeMap = ref<Record<string, string[]>>({})  // pluginId -> scheme names
const newSchemeDialogOpen = ref(false)
const newSchemeName = ref('')
const newSchemePluginId = ref<string | null>(null)
```

- [ ] **Step 2: Add scheme loading function**

After `loadPluginNodes()`:

```typescript
async function loadSchemes() {
  if (!workflowStore.currentWorkflow?.id) return
  const map: Record<string, string[]> = {}
  for (const pluginId of Object.values(categoryPluginMap.value)) {
    if (!map[pluginId]) {
      try {
        map[pluginId] = await pluginStore.listPluginSchemes(workflowStore.currentWorkflow.id, pluginId)
      } catch {
        map[pluginId] = []
      }
    }
  }
  schemeMap.value = map
}

/** Get selected scheme name for a plugin */
function getSelectedScheme(pluginId: string): string {
  return workflowStore.currentWorkflow?.pluginConfigSchemes?.[pluginId] || ''
}

/** Update selected scheme */
async function selectScheme(pluginId: string, schemeName: string) {
  if (!workflowStore.currentWorkflow) return
  const schemes = { ...workflowStore.currentWorkflow.pluginConfigSchemes }
  schemes[pluginId] = schemeName
  await workflowStore.saveWorkflow({
    ...workflowStore.currentWorkflow,
    pluginConfigSchemes: schemes,
  })
}
```

- [ ] **Step 3: Add create/delete scheme handlers**

```typescript
function openNewSchemeDialog(pluginId: string) {
  newSchemePluginId.value = pluginId
  newSchemeName.value = ''
  newSchemeDialogOpen.value = true
}

async function createScheme() {
  if (!newSchemeName.value.trim() || !newSchemePluginId.value || !workflowStore.currentWorkflow?.id) return
  const name = newSchemeName.value.trim()
  try {
    await pluginStore.createPluginScheme(workflowStore.currentWorkflow.id, newSchemePluginId.value, name)
    await loadSchemes()
    await selectScheme(newSchemePluginId.value, name)
    newSchemeDialogOpen.value = false
  } catch (e: any) {
    console.error('[NodeSidebar] 创建方案失败:', e)
  }
}

async function deleteCurrentScheme(pluginId: string) {
  const schemeName = getSelectedScheme(pluginId)
  if (!schemeName || !workflowStore.currentWorkflow?.id) return
  try {
    await pluginStore.deletePluginScheme(workflowStore.currentWorkflow.id, pluginId, schemeName)
    await selectScheme(pluginId, '')  // reset to default
    await loadSchemes()
  } catch (e: any) {
    console.error('[NodeSidebar] 删除方案失败:', e)
  }
}
```

- [ ] **Step 4: Update `openPluginConfig` to pass scheme info**

```typescript
function openPluginConfig(pluginId: string) {
  const plugin = pluginStore.plugins.find(p => p.id === pluginId)
  if (!plugin?.config?.length) return
  configPluginId.value = plugin.id
  configPluginName.value = plugin.name
  configFields.value = plugin.config
  configSchemeName.value = getSelectedScheme(pluginId) || undefined
  configWorkflowId.value = workflowStore.currentWorkflow?.id
  configDialogOpen.value = true
}
```

Add the missing refs:

```typescript
const configSchemeName = ref<string | undefined>(undefined)
const configWorkflowId = ref<string | undefined>(undefined)
```

- [ ] **Step 5: Trigger scheme loading when plugins load**

Add to the `watch` on `enabledPlugins`:

```typescript
watch(() => props.enabledPlugins, async () => {
  await loadPluginNodes()
  await loadSchemes()
}, { immediate: true, deep: true })
```

- [ ] **Step 6: Update template — add Combobox to category header**

Replace the `CollapsibleTrigger` block (lines 124-137) with:

```html
<CollapsibleTrigger class="flex items-center w-full px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground rounded hover:bg-muted/50">
  <span class="truncate">{{ category }}</span>
  <span class="ml-auto flex items-center gap-1">
    <!-- Scheme selector (only for plugin categories with config) -->
    <template v-if="categoryPluginMap[category as string]">
      <Popover>
        <PopoverTrigger as-child>
          <Button variant="ghost" size="sm" class="h-5 px-1.5 text-[10px] gap-0.5">
            <span class="truncate max-w-[60px]">
              {{ getSelectedScheme(categoryPluginMap[category as string]) || '默认配置' }}
            </span>
            <ChevronDown class="h-2.5 w-2.5 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent class="w-44 p-0" align="end">
          <Command>
            <CommandList>
              <CommandGroup>
                <CommandItem
                  :value="'__default__'"
                  @select="selectScheme(categoryPluginMap[category as string], '')"
                  class="text-xs"
                >
                  默认配置
                </CommandItem>
                <CommandItem
                  v-for="name in (schemeMap[categoryPluginMap[category as string]] || [])"
                  :key="name"
                  :value="name"
                  @select="selectScheme(categoryPluginMap[category as string], name)"
                  class="text-xs"
                >
                  {{ name }}
                </CommandItem>
              </CommandGroup>
              <CommandGroup>
                <CommandItem
                  @select="openNewSchemeDialog(categoryPluginMap[category as string])"
                  class="text-xs text-primary"
                >
                  <Plus class="h-3 w-3 mr-1" /> 新增方案
                </CommandItem>
                <CommandItem
                  v-if="getSelectedScheme(categoryPluginMap[category as string])"
                  @select="deleteCurrentScheme(categoryPluginMap[category as string])"
                  class="text-xs text-destructive"
                >
                  <Trash2 class="h-3 w-3 mr-1" /> 删除当前方案
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </template>
    <Button
      v-if="categoryPluginMap[category as string]"
      variant="ghost"
      size="icon"
      class="h-4 w-4"
      @click.stop="openPluginConfig(categoryPluginMap[category as string])"
    >
      <Settings class="h-3 w-3" />
    </Button>
    <span class="text-[10px]">{{ nodes.length }}</span>
  </span>
</CollapsibleTrigger>
```

- [ ] **Step 7: Add new scheme dialog and update PluginConfigDialog**

Add before the closing `</template>`:

```html
<!-- New Scheme Dialog -->
<AlertDialog :open="newSchemeDialogOpen" @update:open="newSchemeDialogOpen = $event">
  <AlertDialogContent class="sm:max-w-sm">
    <AlertDialogHeader>
      <AlertDialogTitle>新增配置方案</AlertDialogTitle>
      <AlertDialogDescription>输入方案名称，将基于插件默认配置创建新方案。</AlertDialogDescription>
    </AlertDialogHeader>
    <DialogInput v-model="newSchemeName" placeholder="方案名称" class="text-sm" />
    <AlertDialogFooter>
      <AlertDialogCancel @click="newSchemeDialogOpen = false">取消</AlertDialogCancel>
      <AlertDialogAction :disabled="!newSchemeName.trim()" @click="createScheme">创建</AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>

<!-- Plugin Config Dialog (updated with scheme props) -->
<PluginConfigDialog
  v-if="configPluginId"
  v-model:open="configDialogOpen"
  :plugin-id="configPluginId"
  :plugin-name="configPluginName"
  :config="configFields"
  :scheme-name="configSchemeName"
  :workflow-id="configWorkflowId"
/>
```

- [ ] **Step 8: Commit**

```bash
git add src/components/workflow/NodeSidebar.vue
git commit -m "feat(NodeSidebar): add Combobox scheme selector per plugin category"
```

---

## Task 9: UI — VariablePicker Dual Sub-menus

**Files:**
- Modify: `src/components/workflow/VariablePicker.vue`

- [ ] **Step 1: Add plugin store import and computed data**

Add imports:

```typescript
import { usePluginStore } from '@/stores/plugin'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
```

Replace the existing dropdown-menu import block (lines 9-17) with this expanded version that includes `DropdownMenuItem`.

Add inside `<script setup>` after `const store = useWorkflowStore()`:

```typescript
const pluginStore = usePluginStore()

/** Get config fields for enabled plugins */
const configPlugins = computed(() => {
  if (!store.currentWorkflow?.enabledPlugins?.length) return []
  return store.currentWorkflow.enabledPlugins
    .map(pluginId => {
      const plugin = pluginStore.plugins.find(p => p.id === pluginId)
      if (!plugin?.config?.length) return null
      return { id: pluginId, name: plugin.name, config: plugin.config }
    })
    .filter(Boolean) as Array<{ id: string; name: string; config: any[] }>
})
```

- [ ] **Step 2: Add config variable path builder**

```typescript
/** Build config variable path */
function buildConfigPath(pluginId: string, key: string): string {
  return `{{ __config__["${pluginId}"]["${key}"] }}`
}

/** Handle config field selection */
function handleSelectConfigField(pluginId: string, key: string) {
  emit('select', buildConfigPath(pluginId, key))
}
```

- [ ] **Step 3: Restructure template with two sub-menus**

Replace the entire `<template>` with:

```html
<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button
        variant="ghost"
        size="sm"
        class="h-7 w-7 p-0 shrink-0 text-muted-foreground hover:text-foreground"
        title="插入变量"
      >
        <Braces class="w-3.5 h-3.5" />
      </Button>
    </DropdownMenuTrigger>

    <DropdownMenuContent
      align="end"
      class="w-56"
    >
      <!-- 节点属性 sub-menu -->
      <DropdownMenuSub>
        <DropdownMenuSubTrigger class="text-xs font-medium">
          <span>节点属性</span>
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent class="w-56">
          <template v-if="otherNodes.length === 0">
            <div class="px-2 py-1.5 text-xs text-muted-foreground">
              画布上没有其他节点
            </div>
          </template>
          <template v-for="node in otherNodes" :key="node.id">
            <DropdownMenuSub>
              <DropdownMenuSubTrigger class="text-xs">
                <component
                  :is="getNodeIcon(node.type)"
                  v-if="getNodeIcon(node.type)"
                  class="w-3.5 h-3.5 mr-1.5 shrink-0 text-muted-foreground"
                />
                <span class="truncate">{{ getNodeLabel(node) }}</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent class="min-w-[180px]">
                <template v-if="getNodeOutputs(node).length > 0">
                  <VariableFieldMenu
                    :fields="getNodeOutputs(node)"
                    :node-id="node.id"
                    @select="handleSelectField"
                  />
                </template>
                <div v-else class="px-2 py-1.5 text-xs text-muted-foreground">
                  无输出字段
                </div>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </template>
        </DropdownMenuSubContent>
      </DropdownMenuSub>

      <!-- 配置属性 sub-menu -->
      <DropdownMenuSub v-if="configPlugins.length > 0">
        <DropdownMenuSubTrigger class="text-xs font-medium">
          <span>配置属性</span>
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent class="w-56">
          <DropdownMenuSub v-for="plugin in configPlugins" :key="plugin.id">
            <DropdownMenuSubTrigger class="text-xs">
              <span class="truncate">{{ plugin.name }}</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent class="min-w-[180px]">
              <DropdownMenuItem
                v-for="field in plugin.config"
                :key="field.key"
                class="text-xs"
                @click="handleSelectConfigField(plugin.id, field.key)"
              >
                <span class="font-mono text-[10px] text-muted-foreground mr-1">{{ field.type }}</span>
                <span>{{ field.label }}</span>
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
```

Also add `DropdownMenuItem` to the dropdown-menu imports (already done in Step 1).

- [ ] **Step 4: Commit**

```bash
git add src/components/workflow/VariablePicker.vue
git commit -m "feat(VariablePicker): add config properties sub-menu with __config__ variables"
```

---

## Task 10: Integration Test — Verify End-to-End Flow

**Files:** None (manual testing)

- [ ] **Step 1: Build and run**

```bash
cd G:/programming/nodejs/work_fox && pnpm dev
```

- [ ] **Step 2: Manual test checklist**

Verify each scenario:

1. **Type sync**: Create a workflow, verify `pluginConfigSchemes` is optional (no breaking change)
2. **Scheme CRUD**: Enable a plugin with config (e.g., `workfox.fetch`), open the Combobox, create a new scheme, verify it appears in the list
3. **Scheme edit**: Click settings gear with a custom scheme selected, verify save goes to scheme file
4. **Scheme delete**: Delete a custom scheme, verify it falls back to default
5. **VariablePicker**: Open VariablePicker in a node property, verify "节点属性" and "配置属性" sections appear
6. **Engine execution**: Insert a `{{ __config__["workfox.fetch"]["defaultTimeout"] }}` variable in a toast node, run the workflow, verify it resolves correctly
7. **Workflow delete**: Delete a workflow with custom schemes, verify `plugin_configs/` directory is cleaned up

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: address integration test issues"
```
