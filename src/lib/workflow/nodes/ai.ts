import type { NodeTypeDefinition } from '../types'

export const aiNodes: NodeTypeDefinition[] = [
  {
    type: 'agent_chat',
    label: 'AI 对话',
    category: 'AI',
    icon: 'Bot',
    description: '调用 AI 处理文本，prompt 支持 $context 变量替换',
    properties: [
      {
        key: 'prompt',
        label: 'Prompt',
        type: 'textarea',
        required: true,
        tooltip: 'AI 提示词，可用 {{context.nodeId.field}} 引用上下文变量',
      },
      {
        key: 'systemPrompt',
        label: '系统提示词',
        type: 'textarea',
        tooltip: '可选的系统级提示词',
      },
    ],
  },
]
