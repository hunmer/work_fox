import type { PluginWorkflowNode } from '../plugin-types'

export const aiNodes: PluginWorkflowNode[] = [
  {
    type: 'agent_run',
    label: 'AI 执行',
    category: 'AI',
    icon: 'Bot',
    description: '调用 Claude Agent 运行任务，支持工作目录、规则加载和插件工具',
    properties: [
      { key: 'prompt', label: '任务', type: 'textarea', required: true, tooltip: '要交给 Agent 执行的任务描述' },
      { key: 'systemPrompt', label: '系统提示词', type: 'textarea', tooltip: '可选的系统级提示词' },
      { key: 'cwd', label: '工作目录', type: 'text', tooltip: '可选。Agent 的工作目录绝对路径' },
      { key: 'additionalDirectories', label: '附加目录', type: 'textarea', tooltip: '可选。每行一个绝对路径' },
      {
        key: 'permissionMode',
        label: '权限模式',
        type: 'select',
        default: 'dontAsk',
        options: [
          { label: '默认', value: 'default' },
          { label: '不询问', value: 'dontAsk' },
          { label: '接受编辑', value: 'acceptEdits' },
          { label: '计划模式', value: 'plan' },
          { label: '自动', value: 'auto' },
          { label: '跳过权限', value: 'bypassPermissions' },
        ],
      },
      { key: 'loadProjectClaudeMd', label: '加载 CLAUDE.md', type: 'checkbox', default: true },
      { key: 'loadRuleMd', label: '加载 rule.md', type: 'checkbox', default: true },
      { key: 'extraInstructions', label: '附加说明', type: 'textarea', tooltip: '追加到 Agent 系统提示中的额外说明' },
    ],
  },
]
