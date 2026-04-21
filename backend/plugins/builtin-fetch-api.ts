import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import tls from 'node:tls'

export interface FetchOptions {
  headers?: Record<string, string>
  encoding?: string
  timeout?: number
  userAgent?: string
  proxy?: string
}

export interface FetchBufferResult {
  buffer: Buffer
  size: number
  mimeType: string
}

export interface FetchBuffersItem extends Partial<FetchBufferResult> {
  url: string
  success: boolean
  error?: string
}

export interface PostOptions extends FetchOptions {
  body?: any
}

function createHttpsTunnel(proxyUrl: string, targetHost: string, targetPort: number): Promise<tls.TLSSocket> {
  const proxy = new URL(proxyUrl)
  const proxyPort = Number(proxy.port) || 8080
  const proxyHost = proxy.hostname

  return new Promise((resolve, reject) => {
    const socket = net.connect(proxyPort, proxyHost)
    const onError = (err: Error) => {
      socket.destroy()
      reject(err)
    }

    socket.once('error', onError)
    socket.once('connect', () => {
      let authHeader = ''
      if (proxy.username || proxy.password) {
        const credentials = Buffer.from(
          `${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password)}`,
        ).toString('base64')
        authHeader = `Proxy-Authorization: Basic ${credentials}\r\n`
      }

      socket.write(
        `CONNECT ${targetHost}:${targetPort} HTTP/1.1\r\n`
        + `Host: ${targetHost}:${targetPort}\r\n`
        + authHeader
        + '\r\n',
      )
    })

    let response = ''
    const onData = (chunk: Buffer) => {
      response += chunk.toString()
      if (!response.includes('\r\n\r\n')) return

      socket.removeListener('data', onData)
      const statusLine = response.slice(0, response.indexOf('\r\n'))
      const statusCode = Number(statusLine.split(' ')[1])

      if (statusCode !== 200) {
        socket.destroy()
        reject(new Error(`代理连接失败: ${statusLine}`))
        return
      }

      const tlsSocket = tls.connect({ socket, servername: targetHost }, () => resolve(tlsSocket))
      tlsSocket.once('error', onError)
    }

    socket.on('data', onData)
    socket.once('timeout', () => onError(new Error('代理连接超时')))
  })
}

async function createProxiedRequest(
  url: string,
  method: string,
  headers: http.OutgoingHttpHeaders,
  timeout: number,
  proxy?: string,
): Promise<http.ClientRequest> {
  const parsed = new URL(url)

  if (proxy && parsed.protocol === 'https:') {
    const targetPort = Number(parsed.port) || 443
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

function collectBody(res: http.IncomingMessage, encoding?: BufferEncoding): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    res.on('data', (chunk: Buffer) => chunks.push(chunk))
    res.on('end', () => resolve(Buffer.concat(chunks).toString(encoding || 'utf-8')))
    res.on('error', reject)
  })
}

function collectBuffer(res: http.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    res.on('data', (chunk: Buffer) => chunks.push(chunk))
    res.on('end', () => resolve(Buffer.concat(chunks)))
    res.on('error', reject)
  })
}

async function httpGet(url: string, options: FetchOptions & { timeout: number }): Promise<http.IncomingMessage> {
  const headers: http.OutgoingHttpHeaders = {
    'User-Agent': options.userAgent || 'WorkFox/1.0',
    ...options.headers,
  }
  const req = await createProxiedRequest(url, 'GET', headers, options.timeout, options.proxy)

  return new Promise((resolve, reject) => {
    req.on('response', (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        httpGet(res.headers.location, options).then(resolve, reject)
        return
      }
      if (res.statusCode && res.statusCode >= 400) {
        res.resume()
        reject(new Error(`HTTP ${res.statusCode}`))
        return
      }
      resolve(res)
    })
    req.on('error', reject)
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('请求超时'))
    })
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
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        httpGet(res.headers.location, options).then(resolve, reject)
        return
      }
      if (res.statusCode && res.statusCode >= 400) {
        collectBody(res).then((text) => reject(new Error(`HTTP ${res.statusCode}: ${text.slice(0, 200)}`)))
        return
      }
      resolve(res)
    })
    req.on('error', reject)
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('请求超时'))
    })
    req.write(body)
    req.end()
  })
}

export function createBuiltinFetchApi() {
  return {
    async fetchText(url: string, options: FetchOptions = {}): Promise<string> {
      const res = await httpGet(url, { ...options, timeout: options.timeout || 30_000 })
      return collectBody(res, options.encoding as BufferEncoding | undefined)
    },

    async fetchJson<T = any>(url: string, options: FetchOptions = {}): Promise<T> {
      const text = await this.fetchText(url, options)
      return JSON.parse(text) as T
    },

    async fetchBuffer(url: string, options: FetchOptions = {}): Promise<FetchBufferResult> {
      const res = await httpGet(url, { ...options, timeout: options.timeout || 60_000 })
      const buffer = await collectBuffer(res)
      return {
        buffer,
        size: buffer.length,
        mimeType: String(res.headers['content-type'] || 'application/octet-stream'),
      }
    },

    async fetchBuffers(urls: string[], options: FetchOptions = {}): Promise<FetchBuffersItem[]> {
      const results: FetchBuffersItem[] = []
      for (const url of urls) {
        try {
          const result = await this.fetchBuffer(url, options)
          results.push({ url, ...result, success: true })
        } catch (error) {
          results.push({
            url,
            success: false,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }
      return results
    },

    async postJson<T = any>(url: string, options: PostOptions = {}): Promise<T> {
      const res = await httpPost(url, { ...options, timeout: options.timeout || 60_000 })
      const text = await collectBody(res)
      return JSON.parse(text) as T
    },
  }
}
