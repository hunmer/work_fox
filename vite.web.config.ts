import { resolve } from 'path'
import { existsSync } from 'node:fs'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import vueDevTools from 'vite-plugin-vue-devtools'
import { readFileSync } from 'fs'

function getEditor() {
  const editor = process.env.VUE_EDITOR || 'code'
  if (process.platform === 'win32' && (editor === 'code' || editor === 'vscode')) {
    const possiblePaths = [
      resolve(process.env.USERPROFILE || '', 'AppData/Local/Programs/Microsoft VS Code/bin/code.cmd'),
      resolve('C:/Program Files/Microsoft VS Code/bin/code.cmd'),
      resolve('C:/Program Files (x86)/Microsoft VS Code/bin/code.cmd')
    ]
    for (const p of possiblePaths) {
      if (existsSync(p)) return p
    }
  }
  return editor
}

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
  plugins: [vue(), tailwindcss(), vueDevTools({ launchEditor: getEditor() }), serveWebIndex()],
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
    watch: {
      ignored: [
        '**/backend/data/**',
        '**/agent-workflows/**',
        '**/tabs.json',
        '**/shortcuts.json',
        '**/agent-settings.json',
        '**/ai-providers.json',
        '**/workflow-folders.json',
      ],
    },
    proxy: {
      '/api': {
        target: 'http://localhost:9123',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:9123',
        ws: true,
      },
      '/health': {
        target: 'http://localhost:9123',
        changeOrigin: true,
      },
      '/version': {
        target: 'http://localhost:9123',
        changeOrigin: true,
      },
    },
  },
})
