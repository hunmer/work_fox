const https = require('https')
const http = require('http')
const { URL } = require('url')

module.exports = {
  createApi: () => ({
    fetchText: (url, options = {}) =>
      new Promise((resolve, reject) => {
        const parsed = new URL(url)
        const mod = parsed.protocol === 'https:' ? https : http
        const req = mod.get(url, {
          headers: {
            'User-Agent': options.userAgent || 'WorkFox/1.0',
            ...options.headers,
          },
          timeout: options.timeout || 30000,
        }, (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            return module.exports.createApi().fetchText(res.headers.location, options).then(resolve, reject)
          }
          if (res.statusCode >= 400) {
            res.resume()
            return reject(new Error(`HTTP ${res.statusCode}`))
          }
          const chunks = []
          res.on('data', c => chunks.push(c))
          res.on('end', () => resolve(Buffer.concat(chunks).toString(options.encoding || 'utf-8')))
          res.on('error', reject)
        })
        req.on('error', reject)
        req.on('timeout', () => { req.destroy(); reject(new Error('请求超时')) })
      }),

    fetchBuffer: (url, options = {}) =>
      new Promise((resolve, reject) => {
        const parsed = new URL(url)
        const mod = parsed.protocol === 'https:' ? https : http
        const req = mod.get(url, {
          headers: {
            'User-Agent': options.userAgent || 'WorkFox/1.0',
            ...options.headers,
          },
          timeout: options.timeout || 60000,
        }, (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            return module.exports.createApi().fetchBuffer(res.headers.location, options).then(resolve, reject)
          }
          if (res.statusCode >= 400) {
            res.resume()
            return reject(new Error(`HTTP ${res.statusCode}`))
          }
          const chunks = []
          res.on('data', c => chunks.push(c))
          res.on('end', () => {
            const buffer = Buffer.concat(chunks)
            resolve({
              buffer,
              size: buffer.length,
              mimeType: res.headers['content-type'] || 'application/octet-stream',
            })
          })
          res.on('error', reject)
        })
        req.on('error', reject)
        req.on('timeout', () => { req.destroy(); reject(new Error('请求超时')) })
      }),

    fetchBuffers: async (urls, options = {}) => {
      const results = []
      for (const url of urls) {
        try {
          const result = await module.exports.createApi().fetchBuffer(url, options)
          results.push({ url, ...result, success: true })
        } catch (err) {
          results.push({ url, success: false, error: err.message })
        }
      }
      return results
    },
  }),
}
