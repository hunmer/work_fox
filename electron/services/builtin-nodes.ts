import type { PluginWorkflowNode } from './plugin-types'

export const builtinNodeDefinitions: PluginWorkflowNode[] = [
  // 流程控制
  {
    type: 'start',
    label: '开始',
    category: '流程控制',
    icon: 'LogIn',
    description: '工作流入口节点，仅支持输出连接',
    properties: [],
  },
  {
    type: 'end',
    label: '结束',
    category: '流程控制',
    icon: 'LogOut',
    description: '工作流出口节点，仅支持输入连接',
    properties: [],
  },
  {
    type: 'run_code',
    label: '运行 JS 代码',
    category: '流程控制',
    icon: 'Terminal',
    description: '执行自定义 JavaScript 代码，可通过 context 访问上游数据',
    properties: [
      {
        key: 'code',
        label: '代码',
        type: 'code',
        required: true,
        tooltip: 'JavaScript 代码，可使用 context 变量',
      },
    ],
  },
  {
    type: 'toast',
    label: 'Toast 消息',
    category: '流程控制',
    icon: 'Bell',
    description: '显示 Toast 通知消息',
    properties: [
      { key: 'message', label: '消息内容', type: 'text', required: true, tooltip: '要显示的消息文本' },
      {
        key: 'type',
        label: '消息类型',
        type: 'select',
        default: 'info',
        options: [
          { label: '信息', value: 'info' },
          { label: '成功', value: 'success' },
          { label: '警告', value: 'warning' },
          { label: '错误', value: 'error' },
        ],
      },
    ],
  },
  {
    type: 'switch',
    label: '选择器',
    category: '流程控制',
    icon: 'GitBranch',
    description: '条件分支路由，按条件顺序匹配，输出 = 条件数 + 1（默认）',
    properties: [
      { key: 'conditions', label: '条件列表', type: 'code', tooltip: '按顺序评估条件，匹配则走对应分支' },
    ],
  },
  // AI
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
  // 展示
  {
    type: 'gallery_preview',
    label: '资源预览',
    category: '展示',
    icon: 'Image',
    description: '展示图片/视频资源画廊，支持添加多个资源',
    properties: [
      {
        key: 'items',
        label: '资源列表',
        type: 'text',
        required: true,
        tooltip: '添加要展示的图片或视频资源',
      },
    ],
  },
]
