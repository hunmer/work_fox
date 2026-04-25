import type { NodeProperty, NodeTypeDefinition } from './workflow-types'

export interface LocalBridgeWorkflowNodeDefinition extends NodeTypeDefinition {
  runtime: 'main_process_bridge'
  source: 'browser_tool'
}

const DELAY_NODE_PROPERTIES: NodeProperty[] = [
  {
    key: 'milliseconds',
    label: '等待时长（毫秒）',
    type: 'number',
    required: true,
    default: 1000,
    tooltip: '等待时长，范围 100-30000。',
  },
  {
    key: 'reason',
    label: '等待原因',
    type: 'text',
    tooltip: '可选，用于日志记录。',
  },
]

export const LOCAL_BRIDGE_WORKFLOW_NODES: LocalBridgeWorkflowNodeDefinition[] = [
  {
    type: 'delay',
    label: '延迟',
    category: '辅助工具',
    icon: 'Circle',
    description: '延迟等待指定毫秒数后继续执行。用于等待页面加载、AJAX 请求返回、动画结束等场景。不依赖标签页。',
    properties: DELAY_NODE_PROPERTIES,
    runtime: 'main_process_bridge',
    source: 'browser_tool',
  },
]

export function getLocalBridgeWorkflowNode(type: string): LocalBridgeWorkflowNodeDefinition | undefined {
  return LOCAL_BRIDGE_WORKFLOW_NODES.find((node) => node.type === type)
}

export function isLocalBridgeWorkflowNode(type: string): boolean {
  return LOCAL_BRIDGE_WORKFLOW_NODES.some((node) => node.type === type)
}
