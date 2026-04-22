import { resolve } from 'path'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync } from 'fs'

function serveWebIndex() {
  const webIndexPath = resolve(__dirname, 'index-web.html')

  return {
    name: 'serve-web-index',
    configureServer(server: any) {
      server.middlewares.use((req: any, res: any, next: () => void) => {
        if (req.url !== '/') {
          next()
          return
        }

        const html = readFileSync(webIndexPath, 'utf-8')
        server.transformIndexHtml('/', html).then((transformedHtml: string) => {
          res.setHeader('Content-Type', 'text/html')
          res.end(transformedHtml)
        }).catch(next)
      })
    },
  }
}

export default defineConfig({
  root: '.',
  define: {
    __WEB_MODE__: JSON.stringify(true),
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@shared': resolve(__dirname, 'shared'),
      'vue': 'vue/dist/vue.esm-bundler.js',
      '../../preload/index': resolve(__dirname, 'preload/index.ts'),
    },
  },
  plugins: [vue(), tailwindcss(), serveWebIndex()],
  build: {
    outDir: 'dist-web',
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index-web.html'),
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
