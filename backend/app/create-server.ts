import http from 'node:http'
import express from 'express'
import { WebSocketServer } from 'ws'
import type { BackendConfig } from './config'
import type { Logger } from './logger'
import { WSRouter } from '../ws/router'
import { registerSystemChannels } from '../ws/channels'
import { ConnectionManager } from '../ws/connection-manager'

export interface BackendServer {
  server: http.Server
  router: WSRouter
  connections: ConnectionManager
  start(): Promise<{ port: number }>
  stop(): Promise<void>
}

export function createBackendServer(config: BackendConfig, logger: Logger): BackendServer {
  const app = express()
  const server = http.createServer(app)
  const wss = new WebSocketServer({ server, path: '/ws' })
  const router = new WSRouter(logger)
  registerSystemChannels(router)
  const connections = new ConnectionManager(wss, router, logger, config)

  app.get('/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'workfox-backend',
      version: config.appVersion,
      uptimeSec: Math.round(process.uptime()),
    })
  })

  app.get('/version', (_req, res) => {
    res.json({
      version: config.appVersion,
      protocolVersion: 1,
    })
  })

  return {
    server,
    router,
    connections,
    start() {
      return new Promise((resolve, reject) => {
        connections.start()
        server.once('error', reject)
        server.listen(config.port, config.host, () => {
          const address = server.address()
          const port = typeof address === 'object' && address ? address.port : config.port
          logger.info('Backend server listening', { host: config.host, port })
          resolve({ port })
        })
      })
    },
    stop() {
      return new Promise((resolve, reject) => {
        connections.stop()
        server.close((error) => {
          if (error) return reject(error)
          resolve()
        })
      })
    },
  }
}
