import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    /** Listen on all interfaces so LAN / SSH tunnel / non-localhost access works (not only 127.0.0.1). */
    host: true,
    port: 5173,
    strictPort: true,
    hmr: {
      path: '/vite-ws'
    },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true
      }
    }
  }
})
