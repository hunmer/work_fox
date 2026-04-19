import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import './styles/globals.css'

const pinia = createPinia()
const app = createApp(App).use(pinia)

app.mount('#app')
