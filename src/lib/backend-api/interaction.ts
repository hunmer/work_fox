import { createErrorShape } from '@shared/errors'
import type {
  AgentChatInteractionSchema,
  ChatToolInteractionSchema,
  InteractionRequest,
  InteractionType,
  NodeExecutionInteractionSchema,
  TableConfirmInteractionSchema,
} from '@shared/ws-protocol'
import { wsBridge } from '../ws-bridge'
import { executeAgentRunTask } from '../workflow/agent-run'
import { executeRendererWorkflowTool } from '../agent/workflow-renderer-tools'

let initialized = false

export function ensureWorkflowInteractionHandler(): void {
  if (initialized) return
  wsBridge.onInteraction(handleWorkflowInteraction)
  initialized = true
}

// 需要前端 UI 参与的 interaction 类型集合
// 后续新增需要用户确认的节点（含插件节点）只需在此添加即可
const UI_INTERACTION_TYPES: Set<InteractionType> = new Set([
  'table_confirm',
  // 'form',
  // 'confirm',
  // ...future plugin interaction types
])

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
    case 'chat_tool':
      return {
        data: await executeChatTool(request.schema as ChatToolInteractionSchema),
      }
    default:
      if (UI_INTERACTION_TYPES.has(request.interactionType)) {
        return { data: await delegateToUI(request) }
      }
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

async function executeChatTool(schema: ChatToolInteractionSchema): Promise<unknown> {
  if (schema.kind === 'renderer_workflow_tool') {
    return executeRendererWorkflowTool(schema.toolName, JSON.parse(JSON.stringify(schema.args || {})))
  }
  return window.api.agent.execTool(schema.toolName, JSON.parse(JSON.stringify(schema.args || {})), schema.targetTabId)
}

// ---- 通用 UI interaction 委托 ----
// 不直接调用 store（store 依赖 Vue inject），改为通过 ws-bridge 事件通知组件树

let pendingResolve: ((data: unknown) => void) | null = null
let pendingReject: ((error: Error) => void) | null = null

async function delegateToUI(request: InteractionRequest): Promise<unknown> {
  return new Promise((resolve, reject) => {
    pendingResolve = resolve
    pendingReject = reject
    wsBridge.emit('interaction:ui_required', {
      interactionType: request.interactionType,
      executionId: request.executionId,
      workflowId: request.workflowId,
      nodeId: request.nodeId,
      schema: request.schema,
    })
  })
}

export function resolveInteraction(data: unknown) {
  if (pendingResolve) {
    const resolve = pendingResolve
    pendingResolve = null
    pendingReject = null
    resolve(data)
  }
}

export function rejectInteraction(error: Error) {
  if (pendingReject) {
    const reject = pendingReject
    pendingResolve = null
    pendingReject = null
    reject(error)
  }
}
