import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import './styles/globals.css'

const pinia = createPinia()
const app = createApp(App).use(pinia)

// 确保主题 store 在启动时初始化（Pinia store 是懒加载的）
import { useThemeStore } from './stores/theme'
useThemeStore()

app.mount('#app')
