// src/web/web-entry.ts
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from '../App.vue'
import router from '../router'
import { wsBridge } from '../lib/ws-bridge'
import { BrowserAPIAdapter } from './browser-api-adapter'

import '../styles/globals.css'
import { useThemeStore } from '../stores/theme'

function loadSavedEndpoint() {
  try {
    const saved = localStorage.getItem('workfox.backendEndpoint')
    if (saved) return JSON.parse(saved) as { url: string; token: string }
  } catch { /* ignore */ }
  return {
    url: `ws://${location.hostname}:3001`,
    token: '',
  }
}

function mountApp() {
  const pinia = createPinia()
  const app = createApp(App).use(pinia).use(router)
  useThemeStore()
  app.mount('#app')
}

async function bootstrap() {
  // 1. 注入 window.api（替代 Electron preload 的 contextBridge）
  const endpoint = loadSavedEndpoint()
  const adapter = new BrowserAPIAdapter(wsBridge, endpoint)
  ;(window as any).api = adapter

  // 2. 连接 backend（必须显式传参，避免循环依赖）
  await wsBridge.connect(endpoint.url, endpoint.token)

  // 3. 启动 Vue app
  mountApp()
}

bootstrap().catch((error) => {
  console.error('Web bootstrap failed:', error)
  // 连接失败仍挂载 app，让 UI 显示连接状态
  const endpoint = loadSavedEndpoint()
  ;(window as any).api = new BrowserAPIAdapter(wsBridge, endpoint)
  mountApp()
})
