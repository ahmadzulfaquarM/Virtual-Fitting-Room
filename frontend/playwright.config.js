import { defineConfig, devices } from '@playwright/test'

const PORT = 5173

// Software WebGL (SwiftShader) lets the 3D viewer render in headless CI machines without a GPU.
const launchOptions = {
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
}

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/fixtures/global-setup.js',
  testMatch: '**/*.e2e.js',
  timeout: 90_000,
  expect: { timeout: 20_000 },
  workers: 1, // software rendering is CPU-heavy; run serially for stable timings
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    launchOptions,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], launchOptions } },
    { name: 'mobile', use: { ...devices['Pixel 5'], launchOptions } },
  ],
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort --host 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
