import type { WSRouter } from './router'
import type { ConnectionManager } from './connection-manager'
import type { ChatRuntime } from '../chat/chat-runtime'
import { ChatEventSender } from '../chat/chat-event-sender'
import type { ClientNodeCache } from '../chat/client-node-cache'

export interface ChatServices {
  chatRuntime: ChatRuntime
  connectionManager: ConnectionManager
  clientNodeCache: ClientNodeCache
}

export function registerChatChannels(router: WSRouter, services: ChatServices): void {
  const { chatRuntime, connectionManager, clientNodeCache } = services

  router.register('chat:completions', async (data: any, context) => {
    const eventSender = new ChatEventSender(connectionManager, context.clientId)
    return chatRuntime.completions(data, eventSender, context.clientId)
  })

  router.register('chat:abort', async ({ requestId }) => {
    return chatRuntime.abort(requestId)
  })

  router.register('chat:register-client-nodes', async ({ nodes }, context) => {
    clientNodeCache.registerNodes(context.clientId, Array.isArray(nodes) ? nodes : [])
    return undefined
  })

  router.register('chat:register-client-agent-tools', async ({ tools }, context) => {
    clientNodeCache.registerTools(context.clientId, Array.isArray(tools) ? tools : [])
    return undefined
  })
}
