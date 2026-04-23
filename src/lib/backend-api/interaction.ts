import { createErrorShape } from '@shared/errors'
import type {
  AgentChatInteractionSchema,
  InteractionRequest,
  NodeExecutionInteractionSchema,
  TableConfirmInteractionSchema,
} from '@shared/ws-protocol'
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

// table_confirm 通过 ws-bridge 事件通知组件树内的 store，
// 避免 useWorkflowStore() 必须在组件树内调用的限制
let pendingTableConfirmResolve: ((data: { selectedRows: Array<{ id: string; data: Record<string, any> }>; selectedCount: number }) => void) | null = null
let pendingTableConfirmReject: ((error: Error) => void) | null = null

async function handleTableConfirm(request: InteractionRequest): Promise<unknown> {
  const schema = request.schema as TableConfirmInteractionSchema

  return new Promise((resolve, reject) => {
    pendingTableConfirmResolve = resolve
    pendingTableConfirmReject = reject
    wsBridge.emit('interaction:table_confirm', {
      executionId: request.executionId,
      workflowId: request.workflowId,
      nodeId: request.nodeId,
      headers: schema.headers,
      cells: schema.cells,
      selectionMode: schema.selectionMode,
    })
  })
}

export function resolveTableConfirm(selectedRows: Array<{ id: string; data: Record<string, any> }>) {
  if (pendingTableConfirmResolve) {
    const resolve = pendingTableConfirmResolve
    pendingTableConfirmResolve = null
    pendingTableConfirmReject = null
    resolve({ selectedRows, selectedCount: selectedRows.length })
  }
}

export function rejectTableConfirm(error: Error) {
  if (pendingTableConfirmReject) {
    const reject = pendingTableConfirmReject
    pendingTableConfirmResolve = null
    pendingTableConfirmReject = null
    reject(error)
  }
}
