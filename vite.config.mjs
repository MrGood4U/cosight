import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // The packaged Electron renderer is loaded from file:// rather than a
  // web server, so asset URLs must resolve relative to dist/index.html.
  base: './',
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
})
