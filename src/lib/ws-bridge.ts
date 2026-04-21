import type {
  BackendChannel,
  ChannelRequest,
  ChannelResponse,
} from '@shared/channel-contracts'
import type {
  InteractionRequest,
  InteractionResponse,
  WSRequest,
  WSResponse,
  WSEvent,
  WSError,
  WSClientHello,
} from '@shared/ws-protocol'
import { createErrorShape } from '@shared/errors'

type PendingRequest = {
  resolve: (value: any) => void
  reject: (reason?: unknown) => void
  timeout: ReturnType<typeof setTimeout>
}

type EventHandler = (data: unknown) => void

const CLIENT_ID_STORAGE_KEY = 'workfox.backendClientId'

interface WSReconnectState {
  attempt: number
  delayMs: number
}

export class WSBridge {
  private ws: WebSocket | null = null
  private pending = new Map<string, PendingRequest>()
  private eventHandlers = new Map<string, Set<EventHandler>>()
  private interactionHandler?: (req: InteractionRequest) => Promise<InteractionResponse | { data: unknown; cancelled?: boolean }>
  private endpoint?: { url: string; token: string }
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectAttempts = 0
  private manualClose = false
  private clientId = this.loadClientId()

  async connect(url?: string, token?: string): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.manualClose = false
    if (!url || !token) {
      this.endpoint = await window.api.backend.getEndpoint()
    } else {
      this.endpoint = { url, token }
    }

    await new Promise<void>((resolve, reject) => {
      const url = new URL(this.endpoint!.url)
      url.searchParams.set('token', this.endpoint!.token)
      if (this.clientId) {
        url.searchParams.set('clientId', this.clientId)
      }
      const ws = new WebSocket(url.toString())
      const wasReconnect = this.reconnectAttempts > 0

      ws.addEventListener('open', () => {
        this.ws = ws
        this.reconnectAttempts = 0
        this.sendHello()
        this.emit('ws:connected', { clientId: this.clientId })
        if (wasReconnect) {
          this.emit('ws:reconnected', { clientId: this.clientId })
        }
        resolve()
      })
      ws.addEventListener('message', (event) => this.handleMessage(event.data))
      ws.addEventListener('error', (event) => reject(event))
      ws.addEventListener('close', () => {
        this.ws = null
        this.rejectAllPending(new Error('WebSocket closed'))
        this.scheduleReconnect()
      })
    })
  }

  disconnect(): void {
    this.manualClose = true
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.ws?.close()
    this.ws = null
  }

  async reconnect(): Promise<void> {
    this.disconnect()
    await this.connect()
  }

  async invoke<C extends BackendChannel>(channel: C, data: ChannelRequest<C>): Promise<ChannelResponse<C>> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      await this.connect()
    }

    const requestId = crypto.randomUUID()
    const payload: WSRequest<C, ChannelRequest<C>> = {
      id: requestId,
      channel,
      type: 'request',
      data,
    }

    return new Promise<ChannelResponse<C>>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(requestId)
        reject(new Error(`WS request timeout: ${channel}`))
      }, 35_000)

      this.pending.set(requestId, { resolve, reject, timeout })
      this.ws!.send(JSON.stringify(payload))
    })
  }

  on(channel: string, handler: EventHandler): void {
    const set = this.eventHandlers.get(channel) || new Set<EventHandler>()
    set.add(handler)
    this.eventHandlers.set(channel, set)
  }

  off(channel: string, handler: EventHandler): void {
    const set = this.eventHandlers.get(channel)
    if (!set) return
    set.delete(handler)
    if (set.size === 0) this.eventHandlers.delete(channel)
  }

  onInteraction(handler: (req: InteractionRequest) => Promise<InteractionResponse | { data: unknown; cancelled?: boolean }>): void {
    this.interactionHandler = handler
  }

  private sendHello(): void {
    if (!this.ws) return
    const hello: WSClientHello = {
      protocolVersion: 1,
      clientId: this.clientId || undefined,
    }
    this.ws.send(JSON.stringify(hello))
  }

  private async handleMessage(raw: unknown): Promise<void> {
    const text = typeof raw === 'string' ? raw : String(raw)
    const message = JSON.parse(text) as WSResponse | WSEvent | WSError | InteractionRequest

    if ('type' in message && message.type === 'response') {
      const pending = this.pending.get(message.id)
      if (!pending) return
      clearTimeout(pending.timeout)
      this.pending.delete(message.id)
      pending.resolve(message.data)
      return
    }

    if ('type' in message && message.type === 'error') {
      if (message.id) {
        const pending = this.pending.get(message.id)
        if (!pending) return
        clearTimeout(pending.timeout)
        this.pending.delete(message.id)
        pending.reject(new Error(message.error.message))
        return
      }
      this.emit('ws:error', message.error)
      return
    }

    if ('type' in message && message.type === 'interaction_required') {
      await this.handleInteraction(message)
      return
    }

    if ('type' in message && message.type === 'event') {
      this.emit(message.channel, message.data)
      return
    }

    if ('protocolVersion' in (message as any)) {
      if ('clientId' in (message as any) && typeof (message as any).clientId === 'string') {
        this.setClientId((message as any).clientId)
      }
      this.emit('ws:hello', message)
    }
  }

  private async handleInteraction(request: InteractionRequest): Promise<void> {
    if (!this.ws) return

    if (!this.interactionHandler) {
      this.ws.send(JSON.stringify({
        id: request.id,
        channel: 'workflow:interaction',
        type: 'interaction_response',
        executionId: request.executionId,
        workflowId: request.workflowId,
        nodeId: request.nodeId,
        data: null,
        error: createErrorShape('HANDLER_FAILED', `未注册 interaction handler: ${request.interactionType}`),
      } satisfies InteractionResponse))
      return
    }

    try {
      const result = await this.interactionHandler(request)
      const response: InteractionResponse = 'type' in result
        ? result
        : {
            id: request.id,
            channel: 'workflow:interaction',
            type: 'interaction_response',
            executionId: request.executionId,
            workflowId: request.workflowId,
            nodeId: request.nodeId,
            data: result.data,
            cancelled: result.cancelled,
          }
      this.ws.send(JSON.stringify(response))
    } catch (error) {
      this.ws.send(JSON.stringify({
        id: request.id,
        channel: 'workflow:interaction',
        type: 'interaction_response',
        executionId: request.executionId,
        workflowId: request.workflowId,
        nodeId: request.nodeId,
        data: null,
        error: createErrorShape(
          'HANDLER_FAILED',
          error instanceof Error ? error.message : String(error),
        ),
      } satisfies InteractionResponse))
    }
  }

  private emit(channel: string, data: unknown): void {
    const set = this.eventHandlers.get(channel)
    if (!set) return
    for (const handler of set) handler(data)
  }

  private rejectAllPending(error: Error): void {
    for (const [id, pending] of this.pending.entries()) {
      clearTimeout(pending.timeout)
      pending.reject(error)
      this.pending.delete(id)
    }
  }

  private scheduleReconnect(): void {
    if (this.manualClose || !this.endpoint || this.reconnectTimer) return
    const delayMs = Math.min(1000 * Math.max(1, this.reconnectAttempts + 1), 5000)
    this.reconnectAttempts += 1
    this.emit('ws:reconnecting', {
      attempt: this.reconnectAttempts,
      delayMs,
    } satisfies WSReconnectState)
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      void this.connect(this.endpoint?.url, this.endpoint?.token).catch((error) => {
        this.emit('ws:error', error)
        this.scheduleReconnect()
      })
    }, delayMs)
  }

  private loadClientId(): string {
    try {
      return window.localStorage.getItem(CLIENT_ID_STORAGE_KEY) || crypto.randomUUID()
    } catch {
      return crypto.randomUUID()
    }
  }

  private setClientId(clientId: string): void {
    this.clientId = clientId
    try {
      window.localStorage.setItem(CLIENT_ID_STORAGE_KEY, clientId)
    } catch {
      // ignore localStorage access issues
    }
  }
}

export const wsBridge = new WSBridge()
