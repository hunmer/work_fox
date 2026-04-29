import type { PluginWorkflowNode } from '../plugin-types'
import { flowControlNodes } from './flow-control'
import { aiNodes } from './ai'
import { displayNodes } from './display'
import { interactionNodes } from './interaction'

export { flowControlNodes } from './flow-control'
export { aiNodes } from './ai'
export { displayNodes } from './display'
export { interactionNodes } from './interaction'

const allNodes: PluginWorkflowNode[] = [
  ...flowControlNodes,
  ...aiNodes,
  ...displayNodes,
  ...interactionNodes,
]

export const builtinNodeDefinitions: PluginWorkflowNode[] = allNodes.map((node) => ({
  allowInputFields: true,
  ...node,
}))
