import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/** Same proxy for `vite` and `vite preview` — without this, `/api/*` (e.g. SSE `/api/channels/events`) hits the static server and returns 404. */
const apiProxy = {
  '/api': {
    target: 'http://127.0.0.1:3000',
    changeOrigin: true,
    /** Long-lived SSE / avoid proxy timeouts */
    timeout: 0,
    proxyTimeout: 0
  }
}

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
    proxy: apiProxy
  },
  preview: {
    host: true,
    proxy: apiProxy
  }
})
