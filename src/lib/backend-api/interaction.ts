import { createErrorShape } from '@shared/errors'
import type {
  AgentChatInteractionSchema,
  InteractionRequest,
  NodeExecutionInteractionSchema,
  TableConfirmInteractionSchema,
} from '@shared/ws-protocol'
import { useWorkflowStore } from '@/stores/workflow'
import { wsBridge } from '../ws-bridge'
import { executeAgentRunTask } from '../workflow/agent-run'

let initialized = false

export function ensureWorkflowInteractionHandler(): void {
  if (initialized) return
  wsBridge.onInteraction(handleWorkflowInteraction)
  initialized = true
}

async function handleWorkflowInteraction(request: InteractionRequest): Promise<{ data: unknown }> {
  switch (request.interactionType) {
    case 'agent_chat':
      return {
        data: await runAgentChat(request.schema as AgentChatInteractionSchema),
      }
    case 'node_execution':
      return {
        data: await executeMainProcessNode(request.schema as NodeExecutionInteractionSchema),
      }
    case 'table_confirm':
      return {
        data: await handleTableConfirm(request),
      }
    default:
      throw new Error(createErrorShape('BAD_REQUEST', `未知交互类型: ${request.interactionType}`).message)
  }
}

async function runAgentChat(schema: AgentChatInteractionSchema): Promise<unknown> {
  return executeAgentRunTask(schema, {
    workflowId: schema.workflowId,
    workflowName: schema.workflowName,
    workflowDescription: schema.workflowDescription,
    enabledPlugins: schema.enabledPlugins,
  })
}

async function executeMainProcessNode(schema: NodeExecutionInteractionSchema): Promise<unknown> {
  if (!schema.toolType) {
    throw new Error('缺少本地节点类型')
  }
  return window.api.agent.execTool(schema.toolType, JSON.parse(JSON.stringify(schema.params || {})))
}

async function handleTableConfirm(request: InteractionRequest): Promise<unknown> {
  const schema = request.schema as TableConfirmInteractionSchema
  const store = useWorkflowStore()

  return new Promise((resolve, reject) => {
    store.pendingTableConfirm = {
      request: {
        executionId: request.executionId,
        workflowId: request.workflowId,
        nodeId: request.nodeId,
        headers: schema.headers,
        cells: schema.cells,
        selectionMode: schema.selectionMode,
      },
      resolve,
      reject,
    }
  })
}
