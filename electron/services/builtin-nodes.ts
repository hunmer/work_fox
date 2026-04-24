import type { PluginWorkflowNode } from './plugin-types'
import { createDefaultEmbeddedWorkflow } from '../../shared/embedded-workflow'
import {
  LOOP_BODY_NODE_TYPE,
  LOOP_BODY_ROLE,
  LOOP_BODY_SOURCE_HANDLE,
  LOOP_NEXT_SOURCE_HANDLE,
  LOOP_NODE_TYPE,
  LOOP_ROOT_ROLE,
} from '../../shared/workflow-composite'

const builtinNodes: PluginWorkflowNode[] = [
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
    type: 'sub_workflow',
    label: '子工作流',
    category: '流程控制',
    icon: 'Workflow',
    description: '选择并调用一个已有工作流，输入字段同步自目标工作流的开始节点。',
    properties: [],
    handles: {
      target: true,
      source: true,
    } as any,
    customViewMinSize: { width: 220, height: 120 },
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
      { key: 'conditions', label: '条件列表', type: 'conditions' as const, tooltip: '按顺序评估条件，匹配则走对应分支，全部不匹配走默认分支' },
    ],
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
    ] as any,
    outputs: [{ key: 'result', type: 'object' }],
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
        visibleWhen: { key: 'loopType', equals: 'count' } as any,
      },
      {
        key: 'arrayPath',
        label: '数组变量',
        type: 'text',
        required: true,
        tooltip: '仅在“使用数组循环”时生效，循环次数取数组长度。',
        visibleWhen: { key: 'loopType', equals: 'array' } as any,
      },
      {
        key: 'sharedVariables',
        label: '中间变量',
        type: 'output_fields' as any,
        default: [],
        tooltip: '在循环体内共享的中间变量定义。循环体内部选择变量时，将优先使用这些变量。',
      },
    ] as any,
    handles: {
      target: true,
      source: true,
      sourceHandles: [
        { id: LOOP_BODY_SOURCE_HANDLE, label: '循环体' },
        { id: LOOP_NEXT_SOURCE_HANDLE, label: '完成后' },
      ],
    } as any,
    outputs: [{ key: 'items', type: 'any' }],
    compound: {
      rootRole: LOOP_ROOT_ROLE,
      children: [
        { role: LOOP_ROOT_ROLE, type: LOOP_NODE_TYPE },
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
    } as any,
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
    } as any,
    customViewMinSize: { width: 520, height: 260 },
    manualCreate: false as any,
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
        type: 'array',
        required: true,
        tooltip: '添加要展示的图片或视频资源',
        itemTemplate: { id: '', src: '', thumb: '', type: 'image', caption: '' },
        fields: [
          { key: 'src', label: '资源地址', type: 'text', required: true, placeholder: '图片/视频 URL' },
          { key: 'thumb', label: '缩略图', type: 'text', placeholder: '缩略图 URL（可选）' },
          {
            key: 'type', label: '类型', type: 'select', default: 'image',
            options: [
              { label: '图片', value: 'image' },
              { label: '视频', value: 'video' },
            ],
          },
          { key: 'caption', label: '标题', type: 'text', placeholder: '显示标题（可选）' },
        ],
      },
    ],
  },
  {
    type: 'music_player',
    label: '音乐播放',
    category: '展示',
    icon: 'Music',
    description: '播放音频文件列表，支持音量调节和循环播放',
    properties: [
      {
        key: 'tracks',
        label: '播放列表',
        type: 'array',
        required: true,
        tooltip: '添加要播放的音频文件',
        itemTemplate: { id: '', src: '', title: '', cover: '', duration: 0 },
        fields: [
          { key: 'src', label: '音频地址', type: 'text', required: true, placeholder: '音频文件 URL 或路径' },
          { key: 'title', label: '标题', type: 'text', placeholder: '曲目标题（可选）' },
          { key: 'cover', label: '封面', type: 'text', placeholder: '封面图片 URL（可选）' },
          { key: 'duration', label: '时长(秒)', type: 'number', placeholder: '音频时长（可选）' },
        ],
      },
      {
        key: 'volume',
        label: '音量',
        type: 'number',
        default: 80,
        tooltip: '音量大小 (0-100)',
      },
      {
        key: 'loop',
        label: '循环播放',
        type: 'checkbox',
        default: false,
        tooltip: '播放结束后是否重新开始',
      },
    ],
  },
  {
    type: 'table_display',
    label: '表格展示',
    category: '展示',
    icon: 'Table',
    description: '展示数据表格，支持单选/多选确认',
    properties: [
      {
        key: 'headers',
        label: '表头',
        type: 'array',
        required: true,
        tooltip: '定义表格列',
        itemTemplate: { id: '', title: '', type: 'string' },
        fields: [
          { key: 'id', label: '字段ID', type: 'text', required: true, placeholder: 'header1' },
          { key: 'title', label: '显示名称', type: 'text', required: true, placeholder: '列名' },
          {
            key: 'type', label: '数据类型', type: 'select', default: 'string',
            options: [
              { label: '字符串', value: 'string' },
              { label: '数字', value: 'number' },
              { label: '布尔', value: 'boolean' },
            ],
          },
        ],
      },
      {
        key: 'cells',
        label: '数据行',
        type: 'array',
        required: true,
        tooltip: '表格数据行',
        itemTemplate: { id: '', data: '{}' },
        fields: [
          { key: 'id', label: '行ID', type: 'text', required: true, placeholder: 'row1' },
          { key: 'data', label: '行数据 (JSON)', type: 'text', required: true, placeholder: '{"header1": "value"}' },
        ],
      },
      {
        key: 'selectionMode',
        label: '选择模式',
        type: 'select',
        default: 'none',
        required: true,
        options: [
          { label: '无选择', value: 'none' },
          { label: '单选', value: 'single' },
          { label: '多选', value: 'multi' },
        ],
      },
    ],
    outputs: [
      { key: 'selectedRows', type: 'any' },
      { key: 'selectedCount', type: 'number' },
    ],
  },
]

export const builtinNodeDefinitions: PluginWorkflowNode[] = builtinNodes.map((node) => ({
  allowInputFields: true,
  ...node,
}))
