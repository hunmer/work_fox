import { reactive } from 'vue'
import type { SuggestionItem, SuggestionState } from './types'
import { useAgentSettingsStore } from '@/stores/agent-settings'
import { useTabStore } from '@/stores/tab'

/**
 * 创建三种 Mention 的 suggestion 配置和共享响应式状态。
 *
 * 架构：reactive state + 模板渲染 popup（不手动挂载 Vue 组件）。
 * 每个 mention 类型的 render() 回调更新同一个 reactive 对象，
 * 模板中的 SuggestionPopup 读取该对象来渲染下拉列表。
 */
export function useMentionConfig() {
  const agentSettingsStore = useAgentSettingsStore()
  const tabStore = useTabStore()

  // ---- 共享 suggestion 状态 ----
  const state = reactive<SuggestionState>({
    active: false,
    type: null,
    items: [],
    selectedIndex: 0,
    query: '',
    clientRect: null,
    command: null,
  })

  function selectItem(index: number) {
    const item = state.items[index]
    if (item && state.command) {
      state.command({ id: item.id, label: item.label })
    }
    dismiss()
  }

  function dismiss() {
    state.active = false
    state.type = null
    state.clientRect = null
    state.command = null
  }

  // ---- 通用 render 工厂 ----
  function createRenderHandlers(type: 'file' | 'skill' | 'mcp') {
    return () => ({
      onStart(props: {
        items: SuggestionItem[]
        query: string
        clientRect: (() => DOMRect | undefined) | null
        command: (props: Record<string, string>) => void
      }) {
        state.active = true
        state.type = type
        state.items = props.items
        state.selectedIndex = 0
        state.query = props.query ?? ''
        state.clientRect = props.clientRect
        state.command = props.command
      },
      onUpdate(props: {
        items: SuggestionItem[]
        query: string
        clientRect: (() => DOMRect | undefined) | null
      }) {
        state.items = props.items
        state.selectedIndex = 0
        state.query = props.query ?? ''
        state.clientRect = props.clientRect
      },
      onKeyDown({ event }: { event: KeyboardEvent }) {
        if (event.key === 'ArrowUp') {
          state.selectedIndex =
            (state.selectedIndex - 1 + state.items.length) % state.items.length
          return true
        }
        if (event.key === 'ArrowDown') {
          state.selectedIndex = (state.selectedIndex + 1) % state.items.length
          return true
        }
        if (event.key === 'Enter') {
          selectItem(state.selectedIndex)
          return true
        }
        if (event.key === 'Escape') {
          dismiss()
          return true
        }
        return false
      },
      onExit() {
        dismiss()
      },
    })
  }

  // ---- 数据源：工作区文件 (@) ----
  function getWorkspacePath(): string {
    const currentWorkflowAgent =
      tabStore.activeStore?.currentWorkflow?.agentConfig ?? null
    return (
      currentWorkflowAgent?.workspaceDir ||
      agentSettingsStore.globalSettings.workspaceDir ||
      ''
    )
  }

  const fileItems = async ({ query }: { query: string }) => {
    const workspace = getWorkspacePath()
    if (!workspace) return []

    try {
      const entries = await window.api.fs.listDir(workspace)
      const q = query.toLowerCase()
      return entries
        .filter((e) => e.name.toLowerCase().includes(q))
        .slice(0, 20)
        .map((e) => ({
          id: e.path,
          label: e.name,
          description:
            e.type === 'directory'
              ? '📁 文件夹'
              : e.path.replace(workspace, '').replace(/^[/\\]/, ''),
        }))
    } catch {
      return []
    }
  }

  // ---- 数据源：Skills (/) ----
  function getSkills() {
    const currentWorkflowAgent =
      tabStore.activeStore?.currentWorkflow?.agentConfig ?? null
    return currentWorkflowAgent?.skills?.length
      ? currentWorkflowAgent.skills
      : agentSettingsStore.globalSettings.skills
  }

  const skillItems = async ({ query }: { query: string }) => {
    const skills = getSkills()
    const q = query.toLowerCase()
    return skills
      .filter((s) => s.enabled && s.name.toLowerCase().includes(q))
      .slice(0, 20)
      .map((s) => ({
        id: s.id,
        label: s.name,
        description: s.description || s.source,
      }))
  }

  // ---- 数据源：MCPs (#) ----
  function getMcps() {
    const currentWorkflowAgent =
      tabStore.activeStore?.currentWorkflow?.agentConfig ?? null
    return currentWorkflowAgent?.mcps?.length
      ? currentWorkflowAgent.mcps
      : agentSettingsStore.globalSettings.mcps
  }

  const mcpItems = async ({ query }: { query: string }) => {
    const mcps = getMcps()
    const q = query.toLowerCase()
    return mcps
      .filter((m) => m.enabled && m.name.toLowerCase().includes(q))
      .slice(0, 20)
      .map((m) => ({
        id: m.id,
        label: m.name,
        description: m.description || m.command,
      }))
  }

  // ---- 导出三种 mention 的 suggestion 配置 ----
  return {
    suggestionState: state,
    selectItem,
    fileConfig: {
      render: createRenderHandlers('file'),
      items: fileItems,
      char: '@',
    },
    skillConfig: {
      render: createRenderHandlers('skill'),
      items: skillItems,
      char: '/',
    },
    mcpConfig: {
      render: createRenderHandlers('mcp'),
      items: mcpItems,
      char: '#',
    },
  }
}
