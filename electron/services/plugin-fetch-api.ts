import https from 'https'
import http from 'http'
import { URL } from 'url'
import type { FetchApi, FetchOptions, FetchBufferResult, FetchBuffersItem, PostOptions } from './plugin-types'

function httpGet(url: string, options: FetchOptions & { timeout: number }): Promise<http.IncomingMessage> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    const mod = parsed.protocol === 'https:' ? https : http
    const req = mod.get(url, {
      headers: {
        'User-Agent': options.userAgent || 'WorkFox/1.0',
        ...options.headers,
      },
      timeout: options.timeout,
    }, (res) => {
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
  })
}

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

function httpPost(url: string, options: PostOptions & { timeout: number }): Promise<http.IncomingMessage> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    const mod = parsed.protocol === 'https:' ? https : http
    const body = options.body ? JSON.stringify(options.body) : ''
    const req = mod.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'User-Agent': options.userAgent || 'WorkFox/1.0',
        ...options.headers,
      },
      timeout: options.timeout,
    }, (res) => {
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
