import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const backendTarget = process.env.VITE_DEV_BACKEND_URL ?? 'http://127.0.0.1:8000'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Pre-bundle the lazily imported MediaPipe package so the dev server never reloads the page
  // when the camera step first loads it.
  optimizeDeps: { include: ['@mediapipe/tasks-vision'] },
  server: {
    // In development, forward /api/* to the FastAPI service so the browser
    // sees a single origin (no CORS needed locally).
    proxy: {
      '/api': {
        target: backendTarget,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
    css: false,
    // Browser tests live in e2e/ and run with `npm run test:e2e` (Playwright), not Vitest.
    exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**'],
  },
})
