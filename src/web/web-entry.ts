import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from '../App.vue'
import router from '../router'
import { wsBridge } from '../lib/ws-bridge'
import { BrowserAPIAdapter } from './browser-api-adapter'

import '../styles/globals.css'
import { useThemeStore } from '../stores/theme'

const BACKEND_ENDPOINT_STORAGE_KEY = 'workfox.backendEndpoint'

function defaultEndpoint() {
  return {
    url: `ws://${location.hostname}:3001/ws`,
    token: '',
  }
}

function loadSavedEndpoint() {
  try {
    const saved = localStorage.getItem(BACKEND_ENDPOINT_STORAGE_KEY)
    if (saved) return JSON.parse(saved) as { url: string; token: string }
  } catch {
    // ignore invalid localStorage payload
  }
  return defaultEndpoint()
}

async function resolveEndpoint() {
  try {
    const response = await fetch(`/workfox-backend-endpoint.json?t=${Date.now()}`, {
      cache: 'no-store',
    })
    if (response.ok) {
      const endpoint = await response.json() as { url: string; token?: string }
      if (endpoint.url) {
        const normalized = {
          url: endpoint.url,
          token: endpoint.token ?? '',
        }
        localStorage.setItem(BACKEND_ENDPOINT_STORAGE_KEY, JSON.stringify(normalized))
        return normalized
      }
    }
  } catch {
    // ignore fetch failure and fallback to local settings
  }

  return loadSavedEndpoint()
}

function mountApp() {
  const pinia = createPinia()
  const app = createApp(App).use(pinia).use(router)
  useThemeStore()
  app.mount('#app')
}

async function bootstrap() {
  const endpoint = await resolveEndpoint()
  ;(window as any).api = new BrowserAPIAdapter(wsBridge, endpoint)

  try {
    await wsBridge.connect(endpoint.url, endpoint.token)
  } catch (error) {
    console.warn('Backend connection failed, app will work in offline mode:', error)
  }

  mountApp()
}

bootstrap()
