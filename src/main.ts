import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import './styles/globals.css'
import type { BackendLogEntry } from '../preload/index'

function forwardBackendLogsToConsole(): void {
  window.api.on('backend:log', (entry: BackendLogEntry) => {
    const message = entry.message.trimEnd()
    if (!message) return

    const logger = entry.level === 'error' ? console.error : console.log
    logger(`[backend:${entry.stream}] ${message}`)
  })
}

forwardBackendLogsToConsole()

const pinia = createPinia()
const app = createApp(App).use(pinia).use(router)

import { useThemeStore } from './stores/theme'
useThemeStore()

app.mount('#app')
