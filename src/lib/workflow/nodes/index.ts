import type { NodeTypeDefinition } from '../types'
import { flowControlNodes } from './flowControl'
import { aiNodes } from './ai'
import { displayNodes } from './display'

export const customNodeDefinitions: NodeTypeDefinition[] = [
  ...flowControlNodes,
  ...aiNodes,
  ...displayNodes,
]
