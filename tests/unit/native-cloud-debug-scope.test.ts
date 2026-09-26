import { createRequire } from 'node:module'
import { expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const {
  createScopedCloudDebug,
} = require('../../examples/kiro-native-host/native-cloud-debug-scope.cjs')

it('restores absent or configured logging before returning a session and after failure', async () => {
  for (const initial of [undefined, 'info', 'warn', 'debug', 'trace']) {
    const env: Record<string, string> = initial === undefined ? {} : { KIRO_LOG_LEVEL: initial }
    const scope = createScopedCloudDebug(env)
    const expected = { ...env }
    expect(
      await scope(async () => {
        expect(env.KIRO_LOG_LEVEL).toBe(initial === 'trace' ? 'trace' : 'debug')
        return 'fresh-session'
      }),
    ).toBe('fresh-session')
    expect(env).toEqual(expected)
    await expect(
      scope(async () => {
        throw new Error('CLOUD_PROOF_FAILED')
      }),
    ).rejects.toThrow('CLOUD_PROOF_FAILED')
    expect(env).toEqual(expected)
  }
})

it('keeps overlapping pre-model proofs covered until the last one settles', async () => {
  const env: Record<string, string> = {}
  const scope = createScopedCloudDebug(env)
  let release!: () => void
  const waiting = new Promise<void>((resolve) => {
    release = resolve
  })
  const first = scope(async () => {
    await waiting
  })
  await expect(
    scope(async () => {
      throw new Error('SECOND_PROOF_FAILED')
    }),
  ).rejects.toThrow('SECOND_PROOF_FAILED')
  expect(env.KIRO_LOG_LEVEL).toBe('debug')
  release()
  await first
  expect(env).toEqual({})
})

it('resolves the host environment when a proof starts, after startup replaces its object', async () => {
  const old: Record<string, string> = {}
  let current = old
  const scope = createScopedCloudDebug(() => current)
  current = { KIRO_LOG_LEVEL: 'info' }
  await scope(async () => {
    expect(current.KIRO_LOG_LEVEL).toBe('debug')
    expect(old).toEqual({})
  })
  expect(current).toEqual({ KIRO_LOG_LEVEL: 'info' })
})

it('does not overwrite an environment change made by another component during proof', async () => {
  const env = { KIRO_LOG_LEVEL: 'info' }
  const scope = createScopedCloudDebug(env)
  await scope(async () => {
    env.KIRO_LOG_LEVEL = 'warn'
  })
  expect(env.KIRO_LOG_LEVEL).toBe('warn')
})
