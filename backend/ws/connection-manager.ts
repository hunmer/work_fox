import { randomUUID } from 'node:crypto'
import type { IncomingMessage } from 'node:http'
import { WebSocketServer, type WebSocket } from 'ws'
import type { Logger } from '../app/logger'
import type { BackendConfig } from '../app/config'
import { createErrorShape } from '../../shared/errors'
import type {
  InteractionResponse,
  WSError,
  WSRequest,
  WSResponse,
  WSEvent,
  WSClientHello,
  WSServerHello,
} from '../../shared/ws-protocol'
import { WSRouter } from './router'

interface ClientSession {
  id: string
  socket: WebSocket
  lastSeenAt: number
}

export class ConnectionManager {
  private clients = new Map<WebSocket, ClientSession>()
  private clientsById = new Map<string, ClientSession>()
  private heartbeatTimer: NodeJS.Timeout | null = null
  private interactionResponseHandler?: (response: InteractionResponse, clientId: string) => void
  private connectHandlers = new Set<(clientId: string) => void>()
  private disconnectHandlers = new Set<(clientId: string) => void>()

  constructor(
    private wss: WebSocketServer,
    private router: WSRouter,
    private logger: Logger,
    private config: BackendConfig,
  ) {}

  start(): void {
    this.wss.on('connection', (socket, request) => this.handleConnection(socket, request))
    this.heartbeatTimer = setInterval(() => this.sendHeartbeat(), this.config.heartbeatIntervalMs)
  }

  stop(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
    for (const client of this.clients.values()) {
      client.socket.close()
    }
    this.clients.clear()
    this.clientsById.clear()
  }

  private handleConnection(socket: WebSocket, request: IncomingMessage): void {
    const clientId = this.extractClientId(request) || randomUUID()
    const token = this.extractToken(request)
    if (this.config.sessionToken && token !== this.config.sessionToken) {
      this.send(socket, {
        type: 'error',
        error: createErrorShape('UNAUTHORIZED', 'Invalid backend token'),
      })
      socket.close()
      return
    }

    const session: ClientSession = {
      id: clientId,
      socket,
      lastSeenAt: Date.now(),
    }
    const existing = this.clientsById.get(clientId)
    if (existing && existing.socket !== socket) {
      this.clients.delete(existing.socket)
      try {
        existing.socket.close()
      } catch {
        // ignore close race
      }
    }
    this.clients.set(socket, session)
    this.clientsById.set(clientId, session)
    this.logger.info('WS client connected', { clientId })
    for (const handler of this.connectHandlers) handler(clientId)

    this.send(socket, {
      protocolVersion: 1,
      serverId: process.pid.toString(),
      clientId,
      heartbeatIntervalMs: this.config.heartbeatIntervalMs,
    } satisfies WSServerHello)

    socket.on('message', (buffer) => {
      session.lastSeenAt = Date.now()
      this.handleMessage(session, buffer.toString())
    })
    socket.on('pong', () => {
      session.lastSeenAt = Date.now()
    })
    socket.on('close', () => {
      this.clients.delete(socket)
      this.clientsById.delete(clientId)
      for (const handler of this.disconnectHandlers) handler(clientId)
      this.logger.info('WS client disconnected', { clientId })
    })
    socket.on('error', (error) => {
      this.logger.warn('WS client error', { clientId, error: error.message })
    })
  }

  private extractToken(request: IncomingMessage): string | undefined {
    const auth = request.headers.authorization
    if (auth?.startsWith('Bearer ')) return auth.slice('Bearer '.length)
    if (!request.url) return undefined
    const url = new URL(request.url, 'http://127.0.0.1')
    return url.searchParams.get('token') || undefined
  }

  private extractClientId(request: IncomingMessage): string | undefined {
    if (!request.url) return undefined
    const url = new URL(request.url, 'http://127.0.0.1')
    const clientId = url.searchParams.get('clientId') || undefined
    return clientId?.trim() || undefined
  }

  private async handleMessage(session: ClientSession, raw: string): Promise<void> {
    this.logger.debug('WS message received', { clientId: session.id, size: raw.length })

    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch (error) {
      this.logger.debug('WS message parse error', { clientId: session.id, error: String(error) })
      this.sendError(session.socket, undefined, undefined, createErrorShape('BAD_REQUEST', 'Invalid JSON payload', String(error)))
      return
    }

    if (isClientHello(parsed)) {
      this.logger.debug('WS client hello', { clientId: session.id })
      return
    }
    if (isInteractionResponse(parsed)) {
      this.logger.debug('WS interaction response', { clientId: session.id, requestId: (parsed as any).requestId })
      this.interactionResponseHandler?.(parsed, session.id)
      return
    }
    if (!isWSRequest(parsed)) {
      this.logger.debug('WS unknown message type', { clientId: session.id, type: (parsed as any)?.type })
      this.sendError(session.socket, undefined, undefined, createErrorShape('BAD_REQUEST', 'Only request messages are supported'))
      return
    }

    this.logger.debug('WS request', { clientId: session.id, channel: parsed.channel, requestId: parsed.id })

    try {
      const data = await this.router.dispatch(parsed.channel as any, parsed.id, session.id, parsed.data as any)
      this.logger.debug('WS response', { clientId: session.id, channel: parsed.channel, requestId: parsed.id })
      this.send(session.socket, {
        id: parsed.id,
        channel: parsed.channel,
        type: 'response',
        data,
      } satisfies WSResponse)
    } catch (error: any) {
      this.logger.debug('WS request error', { clientId: session.id, channel: parsed.channel, requestId: parsed.id, error: error?.message })
      this.sendError(session.socket, parsed.id, parsed.channel, error)
    }
  }

  emit<Channel extends string, Data>(channel: Channel, data: Data): void {
    const payload: WSEvent<Channel, Data> = {
      channel,
      type: 'event',
      data,
    }
    for (const client of this.clients.values()) this.send(client.socket, payload)
  }

  sendToClient(clientId: string, payload: unknown): boolean {
    const client = this.clientsById.get(clientId)
    if (!client || client.socket.readyState !== client.socket.OPEN) {
      return false
    }
    this.send(client.socket, payload)
    return true
  }

  setInteractionResponseHandler(handler: (response: InteractionResponse, clientId: string) => void): void {
    this.interactionResponseHandler = handler
  }

  onClientDisconnected(handler: (clientId: string) => void): () => void {
    this.disconnectHandlers.add(handler)
    return () => this.disconnectHandlers.delete(handler)
  }

  onClientConnected(handler: (clientId: string) => void): () => void {
    this.connectHandlers.add(handler)
    return () => this.connectHandlers.delete(handler)
  }

  private send(socket: WebSocket, payload: unknown): void {
    socket.send(JSON.stringify(payload))
  }

  private sendError(socket: WebSocket, id: string | undefined, channel: string | undefined, error: any): void {
    const payload: WSError = {
      id,
      channel,
      type: 'error',
      error: error?.code ? error : createErrorShape('INTERNAL_ERROR', error?.message || 'Unknown backend error', error),
    }
    this.send(socket, payload)
  }

  private sendHeartbeat(): void {
    for (const client of this.clients.values()) {
      if (client.socket.readyState === client.socket.OPEN) client.socket.ping()
    }
  }
}

function isClientHello(value: unknown): value is WSClientHello {
  return Boolean(
    value
    && typeof value === 'object'
    && 'protocolVersion' in value
    && !('type' in value),
  )
}

function isInteractionResponse(value: unknown): value is InteractionResponse {
  return Boolean(
    value
    && typeof value === 'object'
    && 'type' in value
    && (value as InteractionResponse).type === 'interaction_response',
  )
}

function isWSRequest(value: unknown): value is WSRequest {
  return Boolean(
    value
    && typeof value === 'object'
    && 'type' in value
    && (value as WSRequest).type === 'request',
  )
}
