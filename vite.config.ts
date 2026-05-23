import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

import { cloudflare } from "@cloudflare/vite-plugin";

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react(), cloudflare()],
  server: {
    // Dev-only proxy — stripped in production builds by Cloudflare
    ...(mode === 'development' ? {
      proxy: {
        '/api': {
          target: 'http://192.168.0.102:8001',
          changeOrigin: true,
        },
      },
    } : {}),
  },
}));
