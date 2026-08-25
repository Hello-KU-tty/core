import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'packages/**/test/**/*.test.ts', 'apps/**/test/**/*.test.ts'],
    testTimeout: 10_000,
  },
})
