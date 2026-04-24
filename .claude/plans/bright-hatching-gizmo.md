# 快捷键 Web 模式支持

## Context

当前快捷键系统有两个问题：
1. `SHORTCUT_ACTIONS` / `SHORTCUT_GROUPS` 定义只在 `electron/services/shortcut-manager.ts`，backend 无法使用
2. 前端没有基于配置的 keydown handler，快捷键只在 Electron 全局注册时生效

目标：快捷键在 web 模式下也能生效（仅应用内局部快捷键，不含全局系统快捷键）。

## 改动清单

### 1. 新建 `shared/shortcut-types.ts`

从 `electron/services/shortcut-manager.ts` 提取：
- `ShortcutGroup` 类型
- `ShortcutAction` 接口（新增 `electronOnly?: boolean` 字段）
- `ShortcutBinding` 接口
- `SHORTCUT_GROUPS` 常量
- `SHORTCUT_ACTIONS` 常量
- `getMergedBindings()` 函数（合并默认值与用户自定义绑定）

Electron 和 Backend 都从这里导入。

### 2. 修改 `electron/services/shortcut-manager.ts`

- 删除提取出去的常量和类型，改为从 `@shared/shortcut-types` 导入
- `registerGlobalShortcuts` / `unregisterGlobalShortcuts` 保留（Electron 专属）
- `updateShortcutBinding` 调用 `getMergedBindings()` 后存储到 electron-store，同时通过 WS 同步到 backend

### 3. 修改 `backend/ws/app-channels.ts`

`shortcut:list` 使用 `getMergedBindings()` 返回完整数据（默认 + 用户自定义），而非空数组。

`shortcut:update` / `shortcut:toggle` / `shortcut:clear` 写入后也返回 merged 结果。

### 4. 新建 `src/composables/useShortcutActions.ts`

前端全局 keydown handler，核心逻辑：
- 监听 `window.keydown`
- 匹配当前 shortcut store 中的 enabled + 非 global 的绑定（global 的由 Electron 主进程处理）
- 根据匹配到的 `id` 执行对应 action
- Web 模式下匹配所有 enabled 的绑定（包括 global 标记的，因为 web 没有系统级快捷键）

action 映射：
| id | 动作 | electronOnly |
|---|---|---|
| `new-tab` | `tabStore.addTab()` | |
| `close-tab` | `tabStore.closeTab(activeTabId)` | |
| `next-tab` | 切换到下一个 tab | |
| `prev-tab` | 切换到上一个 tab | |
| `toggle-fullscreen` | `document.documentElement.requestFullscreen()` / exit | |
| `zoom-in/out/reset` | zoom 相关（事件或 API） | |
| `reload-tab` | 重新加载当前 workflow | |
| `open-devtools` | 仅 Electron | ✓ |
| `open-devtools-alt` | 仅 Electron | ✓ |
| `toggle-window` | 仅 Electron | ✓ |

Web 模式下前端过滤掉 `electronOnly` 条目，不显示。

需要依赖 `useTabStore`、`useShortcutStore`、`isElectronRuntime`。

### 5. 修改 `src/App.vue`

在根组件 `onMounted` 时调用 `useShortcutActions()`，确保全局生效。

### 6. 修改 `src/components/settings/SettingsShortcut.vue`

- Web 模式下隐藏 "全局" checkbox
- Web 模式下不显示 Electron 专属条目（`toggle-window`、`open-devtools`、`open-devtools-alt`）
- 后端 `shortcut:list` 可根据运行环境参数过滤 `electronOnly` 条目（或前端过滤）

### 7. 修改 `electron/main.ts`

`registerGlobalShortcuts()` 保持不变。Electron 模式下全局快捷键照常工作。

## 关键文件

- `shared/shortcut-types.ts`（新建）
- `electron/services/shortcut-manager.ts`（精简，导入 shared）
- `backend/ws/app-channels.ts`（shortcut:list 返回 merged 数据）
- `src/composables/useShortcutActions.ts`（新建）
- `src/App.vue`（挂载 shortcut handler）
- `src/components/settings/SettingsShortcut.vue`（web 隐藏全局选项）
- `src/stores/shortcut.ts`（无需改动，已走 WS）

## 验证

```bash
# TypeScript 编译
pnpm exec tsc -p tsconfig.web.json --noEmit
pnpm build:backend
pnpm build

# 功能验证
pnpm dev        # Electron 模式：全局快捷键 + 局部快捷键都生效
pnpm dev:web    # Web 模式：局部快捷键生效，无"全局"选项
```
