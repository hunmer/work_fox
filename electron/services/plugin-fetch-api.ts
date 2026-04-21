import https from 'https'
import http from 'http'
import { URL } from 'url'
import tls from 'tls'
import net from 'net'
import type { FetchApi, FetchOptions, FetchBufferResult, FetchBuffersItem, PostOptions } from './plugin-types'

// ---------- Proxy Support ----------

/**
 * 通过 HTTP 代理建立 HTTPS CONNECT 隧道
 *
 * 流程：TCP -> proxy -> CONNECT host:port -> 200 -> TLS upgrade
 */
function createHttpsTunnel(proxyUrl: string, targetHost: string, targetPort: number): Promise<tls.TLSSocket> {
  const proxy = new URL(proxyUrl)
  const proxyPort = parseInt(proxy.port) || 8080
  const proxyHost = proxy.hostname

  return new Promise((resolve, reject) => {
    const socket = net.connect(proxyPort, proxyHost)
    const onError = (err: Error) => { socket.destroy(); reject(err) }

    socket.once('error', onError)

    socket.once('connect', () => {
      let authHeader = ''
      if (proxy.username || proxy.password) {
        const credentials = Buffer.from(
          `${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password)}`
        ).toString('base64')
        authHeader = `Proxy-Authorization: Basic ${credentials}\r\n`
      }

      socket.write(
        `CONNECT ${targetHost}:${targetPort} HTTP/1.1\r\n` +
        `Host: ${targetHost}:${targetPort}\r\n` +
        authHeader +
        '\r\n'
      )
    })

    let response = ''
    const onData = (chunk: Buffer) => {
      response += chunk.toString()
      if (response.indexOf('\r\n\r\n') === -1) return

      socket.removeListener('data', onData)

      const statusLine = response.substring(0, response.indexOf('\r\n'))
      const statusCode = parseInt(statusLine.split(' ')[1])

      if (statusCode !== 200) {
        socket.destroy()
        return reject(new Error(`代理连接失败: ${statusLine}`))
      }

      const tlsSocket = tls.connect({ socket, servername: targetHost }, () => resolve(tlsSocket))
      tlsSocket.once('error', onError)
    }

    socket.on('data', onData)
    socket.once('timeout', () => onError(new Error('代理连接超时')))
  })
}

/**
 * 创建 HTTP(S) 请求，支持可选代理
 *
 * - 无代理：直接请求
 * - HTTPS + 代理：CONNECT 隧道
 * - HTTP  + 代理：直接发给代理（full URL as path）
 */
async function createProxiedRequest(
  url: string,
  method: string,
  headers: http.OutgoingHttpHeaders,
  timeout: number,
  proxy?: string,
): Promise<http.ClientRequest> {
  const parsed = new URL(url)

  if (proxy && parsed.protocol === 'https:') {
    const targetPort = parseInt(parsed.port) || 443
    const tunnel = await createHttpsTunnel(proxy, parsed.hostname, targetPort)
    const agent = new https.Agent({ keepAlive: false })
    ;(agent as any).createConnection = () => tunnel
    return https.request({
      hostname: parsed.hostname,
      port: parsed.port || 443,
      path: parsed.pathname + (parsed.search || ''),
      method,
      headers,
      timeout,
      agent,
    })
  }

  if (proxy && parsed.protocol === 'http:') {
    const proxyParsed = new URL(proxy)
    return http.request({
      hostname: proxyParsed.hostname,
      port: proxyParsed.port || 8080,
      path: url,
      method,
      headers,
      timeout,
    })
  }

  const mod = parsed.protocol === 'https:' ? https : http
  return mod.request(url, { method, headers, timeout })
}

// ---------- Response Helpers ----------

function collectBody(res: http.IncomingMessage, encoding?: BufferEncoding): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    res.on('data', (c: Buffer) => chunks.push(c))
    res.on('end', () => resolve(Buffer.concat(chunks).toString(encoding || 'utf-8')))
    res.on('error', reject)
  })
}

function collectBuffer(res: http.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    res.on('data', (c: Buffer) => chunks.push(c))
    res.on('end', () => resolve(Buffer.concat(chunks)))
    res.on('error', reject)
  })
}

// ---------- HTTP Methods ----------

async function httpGet(url: string, options: FetchOptions & { timeout: number }): Promise<http.IncomingMessage> {
  const headers: http.OutgoingHttpHeaders = {
    'User-Agent': options.userAgent || 'WorkFox/1.0',
    ...options.headers,
  }
  const req = await createProxiedRequest(url, 'GET', headers, options.timeout, options.proxy)

  return new Promise((resolve, reject) => {
    req.on('response', (res) => {
      if (res.statusCode! >= 300 && res.statusCode! < 400 && res.headers.location) {
        return httpGet(res.headers.location, options).then(resolve, reject)
      }
      if (res.statusCode! >= 400) {
        res.resume()
        return reject(new Error(`HTTP ${res.statusCode}`))
      }
      resolve(res)
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('请求超时')) })
    req.end()
  })
}

async function httpPost(url: string, options: PostOptions & { timeout: number }): Promise<http.IncomingMessage> {
  const body = options.body ? JSON.stringify(options.body) : ''
  const headers: http.OutgoingHttpHeaders = {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'User-Agent': options.userAgent || 'WorkFox/1.0',
    ...options.headers,
  }
  const req = await createProxiedRequest(url, 'POST', headers, options.timeout, options.proxy)

  return new Promise((resolve, reject) => {
    req.on('response', (res) => {
      if (res.statusCode! >= 300 && res.statusCode! < 400 && res.headers.location) {
        return httpGet(res.headers.location, options).then(resolve, reject)
      }
      if (res.statusCode! >= 400) {
        collectBody(res).then(text => reject(new Error(`HTTP ${res.statusCode}: ${text.slice(0, 200)}`)))
        return
      }
      resolve(res)
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('请求超时')) })
    req.write(body)
    req.end()
  })
}

// ---------- Fetch API Factory ----------

export function createBuiltinFetchApi(): FetchApi {
  return {
    async fetchText(url, options = {}): Promise<string> {
      const res = await httpGet(url, { ...options, timeout: options.timeout || 30000 })
      return collectBody(res, options.encoding as BufferEncoding | undefined)
    },

    async fetchJson<T = any>(url: string, options?: FetchOptions): Promise<T> {
      const text = await createBuiltinFetchApi().fetchText(url, options)
      return JSON.parse(text)
    },

    async fetchBuffer(url, options = {}): Promise<FetchBufferResult> {
      const res = await httpGet(url, { ...options, timeout: options.timeout || 60000 })
      const buffer = await collectBuffer(res)
      return {
        buffer,
        size: buffer.length,
        mimeType: res.headers['content-type'] || 'application/octet-stream',
      }
    },

    async fetchBuffers(urls, options = {}): Promise<FetchBuffersItem[]> {
      const results: FetchBuffersItem[] = []
      for (const url of urls) {
        try {
          const result = await createBuiltinFetchApi().fetchBuffer(url, options)
          results.push({ url, ...result, success: true })
        } catch (err: any) {
          results.push({ url, success: false, error: err.message })
        }
      }
      return results
    },

    async postJson<T = any>(url: string, options: PostOptions = {}): Promise<T> {
      const res = await httpPost(url, { ...options, timeout: options.timeout || 60000 })
      const text = await collectBody(res)
      return JSON.parse(text)
    },
  }
}
