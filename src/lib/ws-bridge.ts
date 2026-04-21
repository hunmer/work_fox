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

type PendingRequest = {
  resolve: (value: unknown) => void
  reject: (reason?: unknown) => void
  timeout: ReturnType<typeof setTimeout>
}

type EventHandler = (data: unknown) => void

export class WSBridge {
  private ws: WebSocket | null = null
  private pending = new Map<string, PendingRequest>()
  private eventHandlers = new Map<string, Set<EventHandler>>()
  private interactionHandler?: (req: InteractionRequest) => Promise<InteractionResponse | { data: unknown; cancelled?: boolean }>
  private endpoint?: { url: string; token: string }

  async connect(url?: string, token?: string): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return
    if (!url || !token) {
      this.endpoint = await window.api.backend.getEndpoint()
    } else {
      this.endpoint = { url, token }
    }

    await new Promise<void>((resolve, reject) => {
      const url = new URL(this.endpoint!.url)
      url.searchParams.set('token', this.endpoint!.token)
      const ws = new WebSocket(url.toString())

      ws.addEventListener('open', () => {
        this.ws = ws
        this.sendHello()
        resolve()
      })
      ws.addEventListener('message', (event) => this.handleMessage(event.data))
      ws.addEventListener('error', (event) => reject(event))
      ws.addEventListener('close', () => {
        this.ws = null
        this.rejectAllPending(new Error('WebSocket closed'))
      })
    })
  }

  disconnect(): void {
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
      this.emit('ws:hello', message)
    }
  }

  private async handleInteraction(request: InteractionRequest): Promise<void> {
    if (!this.interactionHandler || !this.ws) return
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
}

export const wsBridge = new WSBridge()
