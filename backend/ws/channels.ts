import type { WSRouter } from './router'

export function registerSystemChannels(router: WSRouter): void {
  router.register('system:ping', (data) => ({
    timestamp: data?.timestamp ?? Date.now(),
    serverTime: Date.now(),
  }))

  router.register('system:echo', (data) => ({
    value: data?.value,
  }))
}
