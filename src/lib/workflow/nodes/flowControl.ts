import type { NodeTypeDefinition } from '../types'
import LoopBodyContainer from '@/components/workflow/LoopBodyContainer.vue'
import { createDefaultEmbeddedWorkflow } from '@shared/embedded-workflow'
import {
  LOOP_BODY_NODE_TYPE,
  LOOP_BODY_ROLE,
  LOOP_BODY_SOURCE_HANDLE,
  LOOP_NEXT_SOURCE_HANDLE,
  LOOP_NODE_TYPE,
  LOOP_ROOT_ROLE,
} from '@shared/workflow-composite'

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
  {
    type: 'variable_aggregate',
    label: '变量聚合',
    category: '流程控制',
    icon: 'Combine',
    description: '对多个分支的输出变量进行分组聚合，返回每组第一个非空值。',
    properties: [
      {
        key: 'strategy',
        label: '聚合策略',
        type: 'select',
        default: 'first_non_empty',
        required: true,
        options: [
          { label: '返回每个分组中第一个非空的值', value: 'first_non_empty' },
        ],
        tooltip: '对同一组内的变量实施相应聚合策略。',
      },
      {
        key: 'groups',
        label: '变量分组',
        type: 'array',
        default: [],
        required: true,
        itemTemplate: { key: '', variables: [] },
        fields: [
          { key: 'key', label: '输出字段名', type: 'text', required: true, placeholder: 'result' },
          {
            key: 'variables',
            label: '变量列表',
            type: 'output_fields',
            required: true,
            tooltip: '同一分组下可添加多个变量，类型默认以第一个变量为主。',
          },
        ],
        tooltip: '可创建多个分组，每个分组输出一个聚合后的变量。',
      },
    ],
    outputs: [
      {
        key: 'result',
        type: 'object',
      },
    ],
  },
  {
    type: LOOP_NODE_TYPE,
    label: '循环节点',
    category: '流程控制',
    icon: 'RotateCw',
    description: '按次数、数组长度或循环体逻辑重复执行一组节点，输出循环体末节点结果数组。',
    properties: [
      {
        key: 'loopType',
        label: '循环类型',
        type: 'select',
        default: 'count',
        required: true,
        options: [
          { label: '按次数循环', value: 'count' },
          { label: '使用数组循环', value: 'array' },
          { label: '无限循环', value: 'infinite' },
        ],
        tooltip: '如果引用数组，循环次数为数组长度；如果指定次数，循环次数为指定值；无限循环需后续配合终止循环节点。',
      },
      {
        key: 'count',
        label: '循环次数',
        type: 'number',
        default: 1,
        required: true,
        tooltip: '仅在“按次数循环”时生效。',
        visibleWhen: { key: 'loopType', equals: 'count' },
      },
      {
        key: 'arrayPath',
        label: '数组变量',
        type: 'text',
        required: true,
        tooltip: '仅在“使用数组循环”时生效，循环次数取数组长度。',
        visibleWhen: { key: 'loopType', equals: 'array' },
      },
      {
        key: 'sharedVariables',
        label: '中间变量',
        type: 'output_fields',
        default: [],
        tooltip: '在循环体内共享的中间变量定义。循环体内部选择变量时，将优先使用这些变量。',
      },
    ],
    handles: {
      target: true,
      source: true,
      sourceHandles: [
        { id: LOOP_BODY_SOURCE_HANDLE, label: '循环体' },
        { id: LOOP_NEXT_SOURCE_HANDLE, label: '完成后' },
      ],
    },
    outputs: [
      {
        key: 'items',
        type: 'any',
      },
    ],
    compound: {
      rootRole: LOOP_ROOT_ROLE,
      children: [
        {
          role: LOOP_ROOT_ROLE,
          type: LOOP_NODE_TYPE,
        },
        {
          role: LOOP_BODY_ROLE,
          type: LOOP_BODY_NODE_TYPE,
          label: '循环体节点',
          offset: { x: 260, y: 0 },
          scopeBoundary: true,
          parentRole: LOOP_ROOT_ROLE,
          data: {
            width: 520,
            height: 260,
            bodyWorkflow: createDefaultEmbeddedWorkflow(),
            outputs: [
              { key: '$index', type: 'number' },
              { key: '$count', type: 'number' },
              { key: '$item', type: 'any' },
              { key: '$isFirst', type: 'boolean' },
              { key: '$isLast', type: 'boolean' },
            ],
          },
        },
      ],
      edges: [
        {
          sourceRole: LOOP_ROOT_ROLE,
          targetRole: LOOP_BODY_ROLE,
          sourceHandle: LOOP_BODY_SOURCE_HANDLE,
          targetHandle: 'target',
          locked: true,
        },
      ],
    },
  },
  {
    type: LOOP_BODY_NODE_TYPE,
    label: '循环体节点',
    category: '流程控制',
    icon: 'Container',
    description: '循环节点自动生成的内部锚点，用户不可手动创建。',
    properties: [],
    handles: {
      target: true,
      source: false,
    },
    customView: LoopBodyContainer,
    customViewMinSize: { width: 520, height: 260 },
    manualCreate: false,
  },
]
