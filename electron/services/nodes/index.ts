import type { PluginWorkflowNode } from '../plugin-types'
import { flowControlNodes } from './flow-control'
import { aiNodes } from './ai'
import { displayNodes } from './display'

export { flowControlNodes } from './flow-control'
export { aiNodes } from './ai'
export { displayNodes } from './display'

const allNodes: PluginWorkflowNode[] = [
  ...flowControlNodes,
  ...aiNodes,
  ...displayNodes,
]

export const builtinNodeDefinitions: PluginWorkflowNode[] = allNodes.map((node) => ({
  allowInputFields: true,
  ...node,
}))
