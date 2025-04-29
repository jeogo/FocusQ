import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    middlewareMode: false,
    fs: {
      strict: false,
      allow: ['..'], // This allows serving files from outside /src
    }
  },
  // Add publicDir config to explicitly set public directory
  publicDir: 'public',
  resolve: {
    alias: {
      '@': resolve(__dirname, './src')
    }
  }
})