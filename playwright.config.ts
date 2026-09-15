import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  // E2E specs share one temporary backend; their project histories must not interleave.
  fullyParallel: false,
  workers: 1,
  forbidOnly: true,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'pnpm --filter @vibe-helper/crew-backend dev:test',
      url: 'http://127.0.0.1:4174/health',
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: 'pnpm --filter @vibe-helper/crew-app dev',
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
})
