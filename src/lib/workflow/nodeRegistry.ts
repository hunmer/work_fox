// src/lib/workflow/nodeRegistry.ts
import { ref } from 'vue'
import type { NodeTypeDefinition, NodeProperty } from './types'
import { customNodeDefinitions } from './nodes'
import { LOCAL_BRIDGE_WORKFLOW_NODES } from '@shared/workflow-local-bridge'

/** 插件节点版本号，每次 register 递增，供 computed 响应式依赖 */
export const pluginNodesVersion = ref(0)

/** 工具 schema property 到 NodeProperty 的转换 */
function schemaToProps(
  properties: Record<string, any>,
  required?: string[],
): NodeProperty[] {
  return Object.entries(properties).map(([key, schema]) => {
    const prop: NodeProperty = {
      key,
      label: schema.description || key,
      type: inferPropType(schema),
      required: required?.includes(key),
      tooltip: schema.description,
    }
    if (schema.enum) {
      prop.type = 'select'
      prop.options = schema.enum.map((v: string) => ({ label: v, value: v }))
    }
    if (schema.default !== undefined) {
      prop.default = schema.default
    }
    return prop
  })
}

function inferPropType(schema: any): NodeProperty['type'] {
  if (schema.enum) return 'select'
  switch (schema.type) {
    case 'number':
    case 'integer':
      return 'number'
    case 'boolean':
      return 'checkbox'
    case 'string':
      return 'text'
    default:
      return 'text'
  }
}

/** 工具完整 schema 定义（从 tools.ts createBrowserTools 中提取） */
const toolSchemas: Record<string, { properties: Record<string, any>; required?: string[] }> = {
  click_element: {
    properties: {
      selector: { type: 'string', description: 'CSS 选择器，例如 "#login-btn", ".submit-button"' },
      tabId: { type: 'string', description: '目标标签页 ID' },
    },
    required: ['selector'],
  },
  input_text: {
    properties: {
      text: { type: 'string', description: '要输入的文字' },
      selector: { type: 'string', description: 'CSS 选择器定位输入框' },
      tabId: { type: 'string', description: '目标标签页 ID' },
    },
    required: ['text'],
  },
  scroll_page: {
    properties: {
      direction: { type: 'string', enum: ['up', 'down', 'left', 'right'], description: '滚动方向' },
      amount: { type: 'number', description: '滚动像素数', default: 300 },
      tabId: { type: 'string', description: '目标标签页 ID' },
    },
    required: ['direction'],
  },
  select_option: {
    properties: {
      selector: { type: 'string', description: 'select 元素的 CSS 选择器' },
      value: { type: 'string', description: '要选中的选项值' },
      tabId: { type: 'string', description: '目标标签页 ID' },
    },
    required: ['selector', 'value'],
  },
  hover_element: {
    properties: {
      selector: { type: 'string', description: 'CSS 选择器' },
      tabId: { type: 'string', description: '目标标签页 ID' },
    },
    required: ['selector'],
  },
}

function getToolIcon(name: string): string {
  const iconMap: Record<string, string> = {
    click_element: 'MousePointerClick',
    input_text: 'Type',
    scroll_page: 'ArrowUpDown',
    select_option: 'List',
    hover_element: 'Pointer',
    run_code: 'Terminal',
    toast: 'Bell',
    agent_run: 'Bot',
    switch: 'GitBranch',
    start: 'LogIn',
    end: 'LogOut',
  }
  return iconMap[name] || 'Circle'
}

/** 从 shared local bridge capability 构建节点定义 */
function buildToolNodeDefinitions(): NodeTypeDefinition[] {
  return LOCAL_BRIDGE_WORKFLOW_NODES.map((tool) => {
    const schema = toolSchemas[tool.type] || { properties: {} }
    return {
      allowInputFields: true,
      ...tool,
      icon: getToolIcon(tool.type),
      properties: tool.properties?.length
        ? tool.properties as NodeProperty[]
        : schemaToProps(schema.properties, schema.required),
    }
  })
}

/** 选择器条件操作符 */
export const CONDITION_OPERATORS = [
  { value: 'equals', label: '等于' },
  { value: 'not_equals', label: '不等于' },
  { value: 'greater_than', label: '大于' },
  { value: 'less_than', label: '小于' },
  { value: 'greater_than_or_equal', label: '大于等于' },
  { value: 'less_than_or_equal', label: '小于等于' },
  { value: 'contains', label: '包含' },
  { value: 'not_contains', label: '不包含' },
  { value: 'starts_with', label: '开头是' },
  { value: 'ends_with', label: '结尾是' },
  { value: 'is_empty', label: '为空' },
  { value: 'is_not_empty', label: '不为空' },
  { value: 'is_true', label: '为真' },
  { value: 'is_false', label: '为假' },
] as const

/** 不需要比较值的操作符 */
export const NO_VALUE_OPERATORS = new Set(['is_empty', 'is_not_empty', 'is_true', 'is_false'])


/** 所有节点定义（合并） */
export const allNodeDefinitions: NodeTypeDefinition[] = [
  ...buildToolNodeDefinitions(),
  ...customNodeDefinitions.map((def) => ({ allowInputFields: true, ...def })),
]

/** 插件注册的额外节点定义 */
const pluginNodeDefinitions: NodeTypeDefinition[] = []

/** 注册插件节点定义（供 NodeSidebar 调用），替换旧数据 */
export function registerPluginNodeDefinitions(nodes: any[]): void {
  pluginNodeDefinitions.length = 0
  pluginNodeDefinitions.push(...nodes)
  pluginNodesVersion.value++
}

/** 清除插件节点定义 */
export function clearPluginNodeDefinitions(): void {
  pluginNodeDefinitions.length = 0
  pluginNodesVersion.value++
}

/** 按类别分组 */
export function getNodeDefinitionsByCategory(): Record<string, NodeTypeDefinition[]> {
  const groups: Record<string, NodeTypeDefinition[]> = {}
  for (const def of [...allNodeDefinitions, ...pluginNodeDefinitions]) {
    if (!groups[def.category]) groups[def.category] = []
    groups[def.category].push(def)
  }
  return groups
}

/** 按类型查找定义 */
export function getNodeDefinition(type: string): NodeTypeDefinition | undefined {
  return allNodeDefinitions.find((d) => d.type === type)
    || pluginNodeDefinitions.find((d) => d.type === type)
}

/** 搜索节点 */
export function searchNodeDefinitions(query: string): NodeTypeDefinition[] {
  const q = query.toLowerCase()
  return [...allNodeDefinitions, ...pluginNodeDefinitions].filter(
    (d) => d.label.toLowerCase().includes(q) || d.type.toLowerCase().includes(q),
  )
}
