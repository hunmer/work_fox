import type { ChannelRequest, ChannelResponse, BackendChannel } from '../../shared/channel-contracts'
import { backendChannelMetadata } from '../../shared/channel-metadata'
import { createErrorShape, type BackendErrorShape } from '../../shared/errors'
import type { Logger } from '../app/logger'

export interface RequestContext<C extends BackendChannel = BackendChannel> {
  channel: C
  requestId: string
  clientId: string
}

type Handler<C extends BackendChannel> = (
  data: ChannelRequest<C>,
  context: RequestContext<C>,
) => Promise<ChannelResponse<C>> | ChannelResponse<C>

export class WSRouter {
  private handlers = new Map<BackendChannel, Handler<any>>()

  constructor(private logger: Logger) {}

  register<C extends BackendChannel>(channel: C, handler: Handler<C>): void {
    this.handlers.set(channel, handler as Handler<any>)
  }

  async dispatch<C extends BackendChannel>(
    channel: C,
    requestId: string,
    clientId: string,
    data: ChannelRequest<C>,
  ): Promise<ChannelResponse<C>> {
    const handler = this.handlers.get(channel)
    if (!handler) {
      this.logger.debug('WS channel not found', { channel, requestId, clientId })
      throw createErrorShape('CHANNEL_NOT_FOUND', `Unknown channel: ${channel}`)
    }

    const metadata = backendChannelMetadata[channel]
    const timeoutMs = metadata?.timeoutMs ?? 30_000
    const context: RequestContext<C> = { channel, requestId, clientId }

    const start = Date.now()
    this.logger.debug('WS dispatch start', { channel, requestId, clientId, timeoutMs })

    try {
      const result = await Promise.race([
        Promise.resolve(handler(data, context)),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(createErrorShape('TIMEOUT', `Channel ${channel} timed out`, { timeoutMs }, true)), timeoutMs)
        }),
      ])
      this.logger.debug('WS dispatch done', { channel, requestId, clientId, durationMs: Date.now() - start })
      return result as ChannelResponse<C>
    } catch (error) {
      this.logger.warn(`WS channel failed: ${channel}`, { requestId, clientId, durationMs: Date.now() - start, error: error instanceof Error ? error.message : String(error) })
      throw normalizeRouterError(error)
    }
  }
}

function normalizeRouterError(error: unknown): BackendErrorShape {
  if (isBackendErrorShape(error)) return error
  if (error instanceof Error) return createErrorShape('HANDLER_FAILED', error.message)
  return createErrorShape('INTERNAL_ERROR', 'Unknown backend error', error)
}

function isBackendErrorShape(value: unknown): value is BackendErrorShape {
  return Boolean(
    value
    && typeof value === 'object'
    && 'code' in value
    && 'message' in value,
  )
}
