import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/main/index.ts'),
        },
        external: [
          'net',
          'http',
          'path',
          'fs',
          'os',
          'electron'
        ]
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@assets': resolve('resources/assets')
      }
    },
    plugins: [react()],
    css: {
      postcss: './postcss.config.js'
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/renderer/index.html')
        }
      }
    },
    publicDir: resolve('resources'),
    server: {
      port: Number(process.env.PORT) || 3000,
      host: process.env.HOST || 'localhost',
      open: false,
      hmr: {
        host: 'localhost'
      },
      cors: true
    },
    optimizeDeps: {
      exclude: ['events', 'os', 'path', 'fs']
    }
  }
})
