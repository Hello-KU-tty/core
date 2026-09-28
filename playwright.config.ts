import { defineConfig, devices } from '@playwright/test'

// Windows cold process/toolchain startup can exceed 30s; test timeouts stay unchanged.
const serverStartupTimeout = process.platform === 'win32' ? 120_000 : 30_000
// Keep a developer's existing UI server untouched during isolated checks.
const frontendPortValue = process.env.VIBE_E2E_FRONTEND_PORT ?? '4173'
const frontendPort = Number(frontendPortValue)
if (
  !/^\d+$/.test(frontendPortValue) ||
  !Number.isInteger(frontendPort) ||
  frontendPort < 1 ||
  frontendPort > 65_535 ||
  frontendPort === 4174
)
  throw new Error('E2E_FRONTEND_PORT_INVALID')
const frontendUrl = `http://127.0.0.1:${frontendPort}`
// Optional installed Edge reuse avoids downloading a second browser on Windows.
// Playwright still creates its own temporary profile; no personal profile is used.
const browserChannel = process.env.VIBE_E2E_BROWSER_CHANNEL
if (browserChannel !== undefined && browserChannel !== 'msedge')
  throw new Error('E2E_BROWSER_CHANNEL_UNSUPPORTED')

export default defineConfig({
  testDir: './tests/e2e',
  // E2E specs share one temporary backend; their project histories must not interleave.
  fullyParallel: false,
  workers: 1,
  forbidOnly: true,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: frontendUrl,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], ...(browserChannel ? { channel: browserChannel } : {}) },
    },
  ],
  webServer: [
    {
      command: 'pnpm --filter @vibe-helper/crew-backend dev:test',
      url: 'http://127.0.0.1:4174/health',
      reuseExistingServer: false,
      timeout: serverStartupTimeout,
    },
    {
      command: `pnpm --filter @vibe-helper/crew-app exec vite --mode test --host 127.0.0.1 --port ${frontendPort} --strictPort`,
      url: frontendUrl,
      reuseExistingServer: false,
      timeout: serverStartupTimeout,
    },
  ],
})
