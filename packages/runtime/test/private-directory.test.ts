import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const probe = vi.hoisted(() => vi.fn())
vi.mock('node:child_process', async () => {
  const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process')
  const execFile = Object.assign(() => {}, {
    [Symbol.for('nodejs.util.promisify.custom')]: probe,
  })
  return { ...actual, execFile }
})
import { isPrivateDirectory } from '../src/private-directory.js'

const roots: string[] = []
afterEach(async () => {
  probe.mockReset()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

describe.skipIf(process.platform !== 'win32')('Windows private directory inspection', () => {
  const root = async () => {
    const value = await realpath(await mkdtemp(join(tmpdir(), 'vibe-w5-acl-test-')))
    roots.push(value)
    return value
  }
  it('accepts only a positive inspection and preserves an explicit unsafe result', async () => {
    const path = await root()
    probe
      .mockResolvedValueOnce({ stdout: 'PRIVATE\r\n' })
      .mockResolvedValueOnce({ stdout: 'UNSAFE\r\n' })
    expect(await isPrivateDirectory(path)).toBe(true)
    expect(await isPrivateDirectory(path)).toBe(false)
    expect(probe.mock.calls[0]?.[2]).toMatchObject({ timeout: 30_000, windowsHide: true })
  })
  it('fails closed with a distinct code when the ACL process times out', async () => {
    probe.mockRejectedValue(
      Object.assign(new Error('synthetic private path'), { code: 'ETIMEDOUT' }),
    )
    await expect(isPrivateDirectory(await root())).rejects.toThrow(
      'PRIVATE_DIRECTORY_CHECK_UNAVAILABLE',
    )
  })
  it('does not accept empty or unexpected inspector output', async () => {
    const path = await root()
    for (const stdout of ['', 'PRIVATE\nUNSAFE', 'unexpected']) {
      probe.mockResolvedValue({ stdout })
      await expect(isPrivateDirectory(path)).rejects.toThrow('PRIVATE_DIRECTORY_CHECK_UNAVAILABLE')
    }
  })
})
