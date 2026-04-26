import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const isCI = process.env.CI === 'true'

export default defineConfig({
  base: isCI ? '/VpnBot/' : '/',
  plugins: [react()],
  server: {
    allowedHosts: true,
    proxy: {
      '/api': 'http://localhost:8080',
    },
  },
})
