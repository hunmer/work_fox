import type { NodeTypeDefinition } from '../types'

export const flowControlNodes: NodeTypeDefinition[] = [
  {
    type: 'start',
    label: '开始',
    category: '流程控制',
    icon: 'LogIn',
    description: '工作流入口节点，仅支持输出连接',
    properties: [],
    handles: { source: true, target: false },
  },
  {
    type: 'end',
    label: '结束',
    category: '流程控制',
    icon: 'LogOut',
    description: '工作流出口节点，仅支持输入连接',
    properties: [],
    handles: { source: false, target: true },
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
        tooltip: 'JavaScript 代码，可使用 context 变量。返回值将写入 context[this.id]',
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
      {
        key: 'message',
        label: '消息内容',
        type: 'text',
        required: true,
        tooltip: '要显示的消息文本',
      },
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
      {
        key: 'conditions',
        label: '条件列表',
        type: 'conditions',
        tooltip: '按顺序评估条件，匹配则走对应分支，全部不匹配走默认分支',
      },
    ],
    handles: {
      target: true,
      dynamicSource: {
        dataKey: 'conditions',
        extraCount: 1,
      },
    },
  },
]
