import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    // Node 24 can trip better-sqlite3's cleanup hook when a fork worker exits
    // while native Statement wrappers are being finalized. Worker threads keep
    // the same isolation for these tests without the child-process teardown race.
    pool: 'threads',
    // Windows integration checks spawn real ACL inspectors. Bound contention
    // so those security checks keep their production timeout under IDE load.
    ...(process.platform === 'win32' ? { maxWorkers: 4 } : {}),
    include: ['tests/**/*.test.ts', 'packages/**/test/**/*.test.ts', 'apps/**/test/**/*.test.ts'],
    testTimeout: 10_000,
  },
})
