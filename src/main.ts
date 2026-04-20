import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import './styles/globals.css'

const pinia = createPinia()
const app = createApp(App).use(pinia).use(router)

import { useThemeStore } from './stores/theme'
useThemeStore()

app.mount('#app')
