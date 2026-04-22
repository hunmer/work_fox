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

// 关键：在任何 store 初始化之前就注入 window.api，
// 因为部分 store（如 shortcut.ts）在模块顶层访问了 window.api
const endpoint = loadSavedEndpoint()
;(window as any).api = new BrowserAPIAdapter(wsBridge, endpoint)

function mountApp() {
  const pinia = createPinia()
  const app = createApp(App).use(pinia).use(router)
  useThemeStore()
  app.mount('#app')
}

async function bootstrap() {
  // window.api 已在模块顶层注入，这里只需连接 backend
  try {
    await wsBridge.connect(endpoint.url, endpoint.token)
  } catch (error) {
    console.warn('Backend connection failed, app will work in offline mode:', error)
  }
  mountApp()
}

bootstrap()
