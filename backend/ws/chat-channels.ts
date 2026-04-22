import type { WSRouter } from './router'
import type { ConnectionManager } from './connection-manager'
import type { ChatRuntime } from '../chat/chat-runtime'
import { ChatEventSender } from '../chat/chat-event-sender'

export interface ChatServices {
  chatRuntime: ChatRuntime
  connectionManager: ConnectionManager
}

export function registerChatChannels(router: WSRouter, services: ChatServices): void {
  const { chatRuntime, connectionManager } = services

  router.register('chat:completions', async (data: any, context) => {
    const eventSender = new ChatEventSender(connectionManager, context.clientId)
    return chatRuntime.completions(data, eventSender)
  })

  router.register('chat:abort', async ({ requestId }) => {
    return chatRuntime.abort(requestId)
  })
}
