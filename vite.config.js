import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

/** 后端服务地址，与 server/index.js 的默认端口保持一致 */
const API_TARGET = process.env.BIGBO_API_TARGET || 'http://localhost:8787'

export default defineConfig({
  plugins: [vue()],
  base: './',
  server: {
    port: 5173,
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: true },
    },
  },
  preview: {
    port: 4173,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/**/*.spec.js'],
    setupFiles: ['./tests/setup.js'],
    css: false,
    restoreMocks: true,
  },
})
