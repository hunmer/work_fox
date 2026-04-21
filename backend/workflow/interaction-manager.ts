import { randomUUID } from 'node:crypto'
import { createErrorShape } from '../../shared/errors'
import type {
  InteractionRequest,
  InteractionResponse,
  InteractionType,
} from '../../shared/ws-protocol'
import type { ConnectionManager } from '../ws/connection-manager'
import type { Logger } from '../app/logger'

interface InteractionManagerOptions {
  connectionManager: ConnectionManager
  logger: Logger
  defaultTimeoutMs: number
}

interface RequestInteractionParams {
  clientId: string
  executionId: string
  workflowId: string
  nodeId: string
  interactionType: InteractionType
  schema: unknown
  timeoutMs?: number
}

interface PendingInteraction {
  clientId: string
  executionId: string
  workflowId: string
  nodeId: string
  interactionType: InteractionType
  resolve: (response: InteractionResponse['data']) => void
  reject: (error: Error) => void
  timer: NodeJS.Timeout
}

export class BackendInteractionManager {
  private pending = new Map<string, PendingInteraction>()

  constructor(private options: InteractionManagerOptions) {
    this.options.connectionManager.setInteractionResponseHandler((response, clientId) => {
      this.handleResponse(response, clientId)
    })
    this.options.connectionManager.onClientDisconnected((clientId) => {
      this.handleClientDisconnect(clientId)
    })
  }

  async request(params: RequestInteractionParams): Promise<InteractionResponse['data']> {
    const id = randomUUID()
    const timeoutMs = params.timeoutMs ?? this.options.defaultTimeoutMs
    const payload: InteractionRequest = {
      id,
      channel: 'workflow:interaction',
      type: 'interaction_required',
      executionId: params.executionId,
      workflowId: params.workflowId,
      nodeId: params.nodeId,
      interactionType: params.interactionType,
      schema: params.schema,
      timeoutMs,
    }

    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(createErrorShape('INTERACTION_TIMEOUT', `交互执行超时: ${params.interactionType}`).message))
      }, timeoutMs)

      this.pending.set(id, {
        clientId: params.clientId,
        executionId: params.executionId,
        workflowId: params.workflowId,
        nodeId: params.nodeId,
        interactionType: params.interactionType,
        resolve,
        reject,
        timer,
      })

      const sent = this.options.connectionManager.sendToClient(params.clientId, payload)
      if (sent) return

      clearTimeout(timer)
      this.pending.delete(id)
      reject(new Error(createErrorShape('CONNECTION_CLOSED', `执行端连接不可用，无法发起交互: ${params.interactionType}`).message))
    })
  }

  private handleResponse(response: InteractionResponse, clientId: string): void {
    const pending = this.pending.get(response.id)
    if (!pending) return
    if (pending.clientId !== clientId) return

    clearTimeout(pending.timer)
    this.pending.delete(response.id)

    if (response.error) {
      pending.reject(new Error(response.error.message))
      return
    }

    if (response.cancelled) {
      pending.reject(new Error(createErrorShape('CANCELLED', `交互已取消: ${pending.interactionType}`).message))
      return
    }

    pending.resolve(response.data)
  }

  private handleClientDisconnect(clientId: string): void {
    for (const [id, pending] of this.pending.entries()) {
      if (pending.clientId !== clientId) continue
      clearTimeout(pending.timer)
      this.pending.delete(id)
      pending.reject(new Error(createErrorShape('CONNECTION_CLOSED', `执行端连接已断开，交互中止: ${pending.interactionType}`).message))
      this.options.logger.warn('Interaction aborted because client disconnected', {
        clientId,
        executionId: pending.executionId,
        workflowId: pending.workflowId,
        nodeId: pending.nodeId,
        interactionType: pending.interactionType,
      })
    }
  }
}
