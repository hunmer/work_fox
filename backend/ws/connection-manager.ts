import { randomUUID } from 'node:crypto'
import type { IncomingMessage } from 'node:http'
import { WebSocketServer, type WebSocket } from 'ws'
import type { Logger } from '../app/logger'
import type { BackendConfig } from '../app/config'
import { createErrorShape } from '../../shared/errors'
import type {
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
  private heartbeatTimer: NodeJS.Timeout | null = null

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
  }

  private handleConnection(socket: WebSocket, request: IncomingMessage): void {
    const clientId = randomUUID()
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
    this.clients.set(socket, session)
    this.logger.info('WS client connected', { clientId })

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

  private async handleMessage(session: ClientSession, raw: string): Promise<void> {
    let parsed: WSRequest | WSClientHello
    try {
      parsed = JSON.parse(raw) as WSRequest | WSClientHello
    } catch (error) {
      this.sendError(session.socket, undefined, undefined, createErrorShape('BAD_REQUEST', 'Invalid JSON payload', String(error)))
      return
    }

    if (isClientHello(parsed)) return
    if (parsed.type !== 'request') {
      this.sendError(session.socket, parsed.id, parsed.channel, createErrorShape('BAD_REQUEST', 'Only request messages are supported'))
      return
    }

    try {
      const data = await this.router.dispatch(parsed.channel as any, parsed.id, session.id, parsed.data as any)
      this.send(session.socket, {
        id: parsed.id,
        channel: parsed.channel,
        type: 'response',
        data,
      } satisfies WSResponse)
    } catch (error: any) {
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
