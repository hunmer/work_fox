import type { NodeTypeDefinition } from '../types'

export const interactionNodes: NodeTypeDefinition[] = [
  {
    type: 'alert',
    label: '消息弹窗',
    category: '交互',
    icon: 'MessageSquare',
    description: '显示消息弹窗，等待用户确认后继续执行',
    properties: [
      { key: 'title', label: '标题', type: 'text', default: '提示', tooltip: '弹窗标题' },
      { key: 'message', label: '消息内容', type: 'textarea', required: true, tooltip: '要展示的消息文本' },
    ],
    outputs: [{ key: 'confirmed', type: 'boolean' }],
  },
  {
    type: 'prompt',
    label: '输入弹窗',
    category: '交互',
    icon: 'TextCursorInput',
    description: '弹出输入框让用户输入文字，将输入值传递给下游节点',
    properties: [
      { key: 'title', label: '标题', type: 'text', default: '请输入', tooltip: '弹窗标题' },
      { key: 'message', label: '提示文字', type: 'text', tooltip: '输入框上方的提示说明' },
      { key: 'placeholder', label: '占位文本', type: 'text', tooltip: '输入框占位文本' },
      { key: 'defaultValue', label: '默认值', type: 'text', tooltip: '输入框预填值' },
    ],
    outputs: [
      { key: 'value', type: 'string' },
      { key: 'confirmed', type: 'boolean' },
    ],
  },
  {
    type: 'form',
    label: '表单弹窗',
    category: '交互',
    icon: 'ClipboardList',
    description: '弹出自定义表单让用户填写，将表单数据传递给下游节点',
    properties: [
      { key: 'title', label: '标题', type: 'text', default: '表单', tooltip: '弹窗标题' },
      {
        key: 'items',
        label: '表单项',
        type: 'array',
        required: true,
        tooltip: '定义表单字段列表',
        itemTemplate: { id: '', title: '', type: 'text', data: { value: '', placeholder: '' } },
        fields: [
          { key: 'id', label: '字段ID', type: 'text', required: true, placeholder: 'user_name' },
          { key: 'title', label: '显示名称', type: 'text', required: true, placeholder: '用户名称' },
          {
            key: 'type',
            label: '字段类型',
            type: 'select',
            default: 'text',
            options: [
              { label: '文本', value: 'text' },
              { label: '多行文本', value: 'textarea' },
              { label: '数字', value: 'number' },
              { label: '选择', value: 'select' },
              { label: '复选框', value: 'checkbox' },
              { label: '密码', value: 'password' },
            ],
          },
          { key: 'data', label: '字段配置', type: 'object' },
        ],
      },
    ],
    outputs: [{ key: 'values', type: 'object' }, { key: 'confirmed', type: 'boolean' }],
  },
]
