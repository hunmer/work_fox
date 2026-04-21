/**
 * FishAudio 插件共享网络与文件工具
 *
 * 将 TTS/STT 共用的 HTTP 和文件操作集中于此，
 * tools.js 和 workflow.js 均通过 require('./shared') 引用。
 */
const https = require('https')
const http = require('http')
const { URL } = require('url')
const fs = require('fs')
const path = require('path')
const os = require('os')

const FISH_AUDIO_BASE_URL = 'https://api.fish.audio'

// ---------- HTTP 工具 ----------

/**
 * POST JSON 并返回二进制 Buffer（用于 TTS 音频流）
 */
function postForBuffer(url, options) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    const mod = parsed.protocol === 'https:' ? https : http
    const body = options.body ? JSON.stringify(options.body) : ''
    const req = mod.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'User-Agent': 'WorkFox/1.0',
        ...options.headers,
      },
      timeout: options.timeout || 120000,
    }, (res) => {
      if (res.statusCode === 401) {
        res.resume()
        return reject(new Error('认证失败：API Key 无效或已过期'))
      }
      if (res.statusCode === 402) {
        res.resume()
        return reject(new Error('余额不足：请检查 FishAudio 账户余额'))
      }
      if (res.statusCode >= 400) {
        const chunks = []
        res.on('data', c => chunks.push(c))
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf-8')
          reject(new Error(`HTTP ${res.statusCode}: ${text.slice(0, 300)}`))
        })
        return
      }
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => resolve({
        buffer: Buffer.concat(chunks),
        mimeType: res.headers['content-type'] || 'audio/mpeg',
      }))
      res.on('error', reject)
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('请求超时')) })
    req.write(body)
    req.end()
  })
}

/**
 * POST multipart/form-data（用于 STT 音频上传）
 */
function postFormData(url, options) {
  return new Promise((resolve, reject) => {
    const boundary = '----WorkFoxBoundary' + Date.now()
    const parts = []

    if (options.file) {
      parts.push(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="audio"; filename="audio.wav"\r\n` +
        `Content-Type: ${options.file.mimeType || 'audio/wav'}\r\n\r\n`
      )
    }
    if (options.language) {
      parts.push(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="language"\r\n\r\n` +
        `${options.language}\r\n`
      )
    }
    parts.push(`--${boundary}--\r\n`)

    let totalLength = 0
    const encodedParts = parts.map(p => {
      const buf = Buffer.from(p, 'utf-8')
      totalLength += buf.length
      return buf
    })
    if (options.file) {
      totalLength += options.file.buffer.length + 2
    }

    const parsed = new URL(url)
    const mod = parsed.protocol === 'https:' ? https : http
    const req = mod.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': totalLength,
        'User-Agent': 'WorkFox/1.0',
        ...options.headers,
      },
      timeout: options.timeout || 120000,
    }, (res) => {
      if (res.statusCode >= 400) {
        const chunks = []
        res.on('data', c => chunks.push(c))
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf-8')
          reject(new Error(`HTTP ${res.statusCode}: ${text.slice(0, 300)}`))
        })
        return
      }
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8')))
        } catch (e) {
          reject(new Error('响应解析失败'))
        }
      })
      res.on('error', reject)
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('请求超时')) })

    for (const part of encodedParts) {
      req.write(part)
      if (part.toString().includes('name="audio"')) {
        req.write(options.file.buffer)
        req.write('\r\n')
      }
    }
    req.end()
  })
}

// ---------- 文件工具 ----------

function saveToTempFile(buffer, ext) {
  const tmpDir = path.join(os.tmpdir(), 'workfox-fish-audio')
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true })
  const filePath = path.join(tmpDir, `tts_${Date.now()}.${ext}`)
  fs.writeFileSync(filePath, buffer)
  return filePath
}

function readAudioFile(filePath) {
  try {
    return fs.readFileSync(filePath)
  } catch (e) {
    throw new Error(`无法读取音频文件: ${e.message}`)
  }
}

// ---------- 格式工具 ----------

function getFormatExt(format) {
  const map = { mp3: 'mp3', wav: 'wav', pcm: 'pcm', opus: 'opus' }
  return map[format] || 'mp3'
}

function getMimeType(ext) {
  const map = { '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.flac': 'audio/flac', '.ogg': 'audio/ogg' }
  return map[ext] || 'audio/wav'
}

function buildAuthHeader(apiKey) {
  if (!apiKey) throw new Error('缺少 apiKey（请在插件配置中设置 FishAudio API Key）')
  return { 'Authorization': `Bearer ${apiKey}` }
}

function resolveBaseUrl(args) {
  return args.baseUrl || FISH_AUDIO_BASE_URL
}

module.exports = {
  postForBuffer,
  postFormData,
  saveToTempFile,
  readAudioFile,
  getFormatExt,
  getMimeType,
  buildAuthHeader,
  resolveBaseUrl,
}
