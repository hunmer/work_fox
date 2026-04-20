/**
 * Agent 工具定义。
 *
 * 业务工具仍由主进程执行；模型侧默认只暴露工具发现工具，
 * 按「分类 -> 工具列表 -> 工具详情 -> 执行」逐层获取能力信息。
 */

export interface ToolDefinition {
  name: string
  description: string
  input_schema: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
  }
}

export type ToolCategoryName = 'workflow' | 'tab' | 'auto' | 'page' | 'dom' | 'utils'
export type ToolRiskLevel = 'low' | 'medium' | 'high'
export type DiscoveryStage = 'category_list' | 'tool_list' | 'tool_detail' | 'execute'
export type DiscoveryNextAction =
  | 'select_category'
  | 'select_tool'
  | 'get_tool_detail'
  | 'execute'
  | 'none'

/** 工具元数据（用于 UI 展示和分层披露，不依赖 targetTabId） */
export interface ToolMeta {
  name: string
  description: string
  category: string
  discoveryCategory: ToolCategoryName
  tags: string[]
  riskLevel: ToolRiskLevel
  suitableFor: string[]
}

export interface ToolCategoryInfo {
  name: ToolCategoryName
  scenario: string
  suitable_for: string[]
  not_suitable_for: string[]
}

export interface ToolDiscoveryResponse<TData = Record<string, unknown>> {
  stage: DiscoveryStage
  need_next: boolean
  next_action: DiscoveryNextAction
  data: TData
  message: string
}

type EnabledToolFilter = ReadonlySet<string> | string[] | undefined

export const TOOL_CATEGORY_INFOS: ToolCategoryInfo[] = [
  {
    name: 'workflow',
    scenario: '多步骤编排、跨工具联动和任务流调度。',
    suitable_for: ['顺序执行多个动作', '条件分支和循环', '协调多个工具完成复杂任务'],
    not_suitable_for: ['单一页面点击', '单个 DOM 操作', '只做标签页切换'],
  },
  {
    name: 'tab',
    scenario: '浏览器标签页管理。',
    suitable_for: ['打开新标签页', '切换标签页', '关闭标签页', '获取标签页列表'],
    not_suitable_for: ['页面元素交互', '页面内容解析', '自动化工作流'],
  },
  {
    name: 'auto',
    scenario: '自动执行、批量执行和无人值守执行。',
    suitable_for: ['批量处理', '定时任务', '自动登录后执行', '自动重复操作'],
    not_suitable_for: ['单次人工交互', '精细 DOM 定位', '页面级信息读取'],
  },
  {
    name: 'page',
    scenario: '页面级操作，介于 tab 和 dom 之间。',
    suitable_for: ['页面跳转', '刷新页面', '获取页面标题和 URL', '页面截图', '页面整体状态读取'],
    not_suitable_for: ['精确定位某个元素', '复杂组件内部交互'],
  },
  {
    name: 'dom',
    scenario: '页面 DOM 级别操作，是最细粒度的交互层。',
    suitable_for: ['查找元素', '点击按钮', '输入文本', '读取元素文本', '判断元素状态'],
    not_suitable_for: ['标签页管理', '项目/工作区管理', '工作流编排'],
  },
  {
    name: 'utils',
    scenario: '通用辅助工具，提供流程控制与辅助能力。',
    suitable_for: ['等待页面加载', '延迟执行下一步', '流程中插入固定等待', '等待 AJAX 请求完成'],
    not_suitable_for: ['页面元素交互', '标签页管理', 'DOM 操作', '工作流编排'],
  },
]

/** 所有浏览器业务工具的元数据列表 */
export const BROWSER_TOOL_LIST: ToolMeta[] = [
  {
    name: 'delay',
    description: '延迟等待指定时间后继续执行，用于等待页面加载、AJAX 完成或动画结束',
    category: '辅助工具',
    discoveryCategory: 'utils',
    tags: ['wait', 'delay', 'sleep', 'timing'],
    riskLevel: 'low',
    suitableFor: ['等待页面加载完成', '等待 AJAX 请求返回', '等待动画结束', '流程中插入固定间隔'],
  },
]

export const DISCOVERY_TOOL_NAMES = [
  'list_categories',
  'list_tools_by_category',
  'get_tool_detail',
  'execute_tool',
] as const

const TOOL_EXAMPLE_INPUTS: Record<string, Record<string, unknown>> = {
  delay: { milliseconds: 2000, reason: '等待页面加载完成' },
}

const GENERIC_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    success: { type: 'boolean', description: '工具是否执行成功。读取类工具可能直接返回结果对象。' },
    result: { type: 'object', description: '工具执行结果。' },
    error: { type: 'string', description: '失败原因。' },
  },
}

/** 辅助工具：延迟等待 */
function createUtilityTools(): ToolDefinition[] {
  return [
    { name: 'delay', description: '延迟等待指定毫秒数后继续执行。用于等待页面加载、AJAX 请求返回、动画结束等场景。不依赖标签页。', input_schema: { type: 'object', properties: { milliseconds: { type: 'number', description: '等待时长（毫秒），范围 100-30000，默认 1000。建议根据场景选择：页面导航后等 2000-5000ms，动画结束后等 300-500ms。', default: 1000 }, reason: { type: 'string', description: '等待原因说明（可选），用于日志记录，例如 "等待搜索结果加载"。' } }, required: ['milliseconds'] } },
  ]
}

/**
 * 创建真正的浏览器业务工具集。
 * @param _targetTabId 默认目标标签页 ID，由执行层兜底处理。
 */
export function createBrowserTools(_targetTabId: string | null): ToolDefinition[] {
  return [
    ...createUtilityTools(),
  ]
}

/** 创建模型可见的工具发现工具集。 */
export function createToolDiscoveryTools(): ToolDefinition[] {
  return [
    {
      name: 'list_categories',
      description: '列出可用能力分类及场景说明。只返回分类信息，不返回工具名、参数或 schema。',
      input_schema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'list_tools_by_category',
      description: '按分类列出轻量工具清单。只返回工具名、简介、标签、适用场景和风险等级，不返回参数 schema。',
      input_schema: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            enum: TOOL_CATEGORY_INFOS.map((category) => category.name),
            description: '能力分类名称',
          },
        },
        required: ['category'],
      },
    },
    {
      name: 'get_tool_detail',
      description: '按工具名获取完整工具用法，包括参数定义、输入输出、示例、约束和注意事项。',
      input_schema: {
        type: 'object',
        properties: {
          tool_name: { type: 'string', description: '工具名，必须来自 list_tools_by_category 返回结果。' },
        },
        required: ['tool_name'],
      },
    },
    {
      name: 'execute_tool',
      description: '执行已通过 get_tool_detail 查看过详情的业务工具。只有参数完整且风险可接受时才调用。',
      input_schema: {
        type: 'object',
        properties: {
          tool_name: { type: 'string', description: '要执行的业务工具名。' },
          args: {
            type: 'object',
            description: '业务工具参数，必须符合 get_tool_detail 返回的 input_schema。',
            properties: {},
          },
        },
        required: ['tool_name'],
      },
    },
  ]
}

export function isDiscoveryToolName(name: string): boolean {
  return (DISCOVERY_TOOL_NAMES as readonly string[]).includes(name)
}

export function isToolCategoryName(name: string): name is ToolCategoryName {
  return TOOL_CATEGORY_INFOS.some((category) => category.name === name)
}

export function isBrowserBusinessToolName(name: string): boolean {
  return BROWSER_TOOL_LIST.some((tool) => tool.name === name)
}

export function buildCategoryListResponse(): ToolDiscoveryResponse<{ categories: ToolCategoryInfo[] }> {
  return {
    stage: 'category_list',
    need_next: true,
    next_action: 'select_category',
    data: {
      categories: TOOL_CATEGORY_INFOS,
    },
    message: '请先根据任务选择能力分类。',
  }
}

export function buildToolListResponse(
  category: string,
  enabledToolNames?: EnabledToolFilter,
): ToolDiscoveryResponse<{
  category: string
  tools: Array<{
    name: string
    summary: string
    tags: string[]
    suitable_for: string[]
    risk_level: ToolRiskLevel
  }>
}> {
  if (!isToolCategoryName(category)) {
    return {
      stage: 'tool_list',
      need_next: true,
      next_action: 'select_category',
      data: { category, tools: [] },
      message: `未知能力分类：${category}。请先调用 list_categories 查看可用分类。`,
    }
  }

  const tools = BROWSER_TOOL_LIST
    .filter((tool) => tool.discoveryCategory === category && isToolEnabled(tool.name, enabledToolNames))
    .map((tool) => ({
      name: tool.name,
      summary: tool.description,
      tags: tool.tags,
      suitable_for: tool.suitableFor,
      risk_level: tool.riskLevel,
    }))

  return {
    stage: 'tool_list',
    need_next: tools.length > 0,
    next_action: tools.length > 0 ? 'select_tool' : 'select_category',
    data: {
      category,
      tools,
    },
    message: tools.length > 0
      ? '请从工具列表中选择工具；需要参数时继续调用 get_tool_detail。'
      : '当前分类没有可用工具，或工具已被禁用。',
  }
}

export function buildToolDetailResponse(
  toolName: string,
  enabledToolNames?: EnabledToolFilter,
): ToolDiscoveryResponse<Record<string, unknown>> {
  const meta = BROWSER_TOOL_LIST.find((tool) => tool.name === toolName)
  const definition = createBrowserTools(null).find((tool) => tool.name === toolName)

  if (!meta || !definition) {
    return {
      stage: 'tool_detail',
      need_next: true,
      next_action: 'select_tool',
      data: {},
      message: `未知工具：${toolName}。请先调用 list_tools_by_category 查看可用工具。`,
    }
  }

  if (!isToolEnabled(toolName, enabledToolNames)) {
    return {
      stage: 'tool_detail',
      need_next: true,
      next_action: 'select_tool',
      data: {},
      message: `工具 ${toolName} 当前未启用，不能查看详情或执行。`,
    }
  }

  return {
    stage: 'tool_detail',
    need_next: true,
    next_action: 'execute',
    data: {
      name: definition.name,
      category: meta.discoveryCategory,
      description: definition.description,
      input_schema: definition.input_schema,
      output_schema: GENERIC_OUTPUT_SCHEMA,
      examples: [
        {
          input: TOOL_EXAMPLE_INPUTS[toolName] ?? {},
          output: { success: true, result: {} },
        },
      ],
      constraints: buildToolConstraints(meta, definition),
      notes: buildToolNotes(meta),
    },
    message: '请根据 input_schema 提供完整参数后调用 execute_tool。',
  }
}

function isToolEnabled(name: string, enabledToolNames?: EnabledToolFilter): boolean {
  if (!enabledToolNames) return true
  return Array.isArray(enabledToolNames)
    ? enabledToolNames.includes(name)
    : enabledToolNames.has(name)
}

function buildToolConstraints(meta: ToolMeta, definition: ToolDefinition): string[] {
  const constraints = ['参数必须符合 input_schema。']

  if (definition.input_schema.required?.length) {
    constraints.push(`必填参数：${definition.input_schema.required.join(', ')}。`)
  }
  if (meta.riskLevel === 'high') {
    constraints.push('高风险工具，执行前必须确认目标明确且用户意图清晰。')
  }
  if (meta.discoveryCategory === 'dom') {
    constraints.push('CSS 选择器应尽量唯一定位目标元素。')
  }
  if (meta.discoveryCategory === 'tab') {
    constraints.push('涉及指定标签页时，应优先确认 tabId。')
  }

  return constraints
}

function buildToolNotes(meta: ToolMeta): string[] {
  const notes = [`风险等级：${meta.riskLevel}。`]

  if (meta.riskLevel !== 'low') {
    notes.push('如果参数不足，不要猜测执行，应先获取更多上下文或追问用户。')
  }
  if (meta.name === 'close_tab') {
    notes.push('关闭标签页属于破坏性操作，应在用户明确要求时执行。')
  }
  if (meta.name === 'get_page_screenshot') {
    notes.push('截图结果可能以图片内容返回。')
  }
  if (meta.name === 'create_tab') {
    notes.push('当前执行层对创建标签页可能返回 not yet supported 提示。')
  }

  return notes
}
