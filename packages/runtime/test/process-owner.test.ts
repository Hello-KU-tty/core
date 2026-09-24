import { mkdtemp, lstat, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
const probe = vi.hoisted(() => vi.fn())
vi.mock('node:child_process', async () => {
  const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process')
  return {
    ...actual,
    execFile: Object.assign(() => {}, {
      [Symbol.for('nodejs.util.promisify.custom')]: probe,
    }),
  }
})
import { isLockOwnerAlive } from '../src/process-owner.js'
const roots: string[] = []
afterEach(async () => {
  probe.mockReset()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})
async function owner() {
  const root = await mkdtemp(join(tmpdir(), 'vibe-owner-test-'))
  roots.push(root)
  const file = join(root, 'owner.json')
  await writeFile(file, '{}')
  return file
}
describe.skipIf(process.platform !== 'win32')('Windows lock process identity', () => {
  it('keeps the original process and ambiguous timestamp ordering alive', async () => {
    const file = await owner()
    const time = (await lstat(file)).mtimeMs
    for (const started of [time - 10000, time, time + 500]) {
      probe.mockResolvedValue({ stdout: String(Math.floor(started)), stderr: '' })
      expect(await isLockOwnerAlive(process.pid, file)).toBe(true)
    }
    expect(probe.mock.calls[0]?.[2]).toMatchObject({ windowsHide: true, timeout: 30000 })
  })
  it('recognizes a process born after the old lock without signalling it', async () => {
    const file = await owner()
    const { utimes } = await import('node:fs/promises')
    await utimes(file, 0, 0)
    probe.mockResolvedValue({ stdout: String(Date.now() - 2000), stderr: '' })
    expect(await isLockOwnerAlive(process.pid, file)).toBe(false)
    expect(process.kill(process.pid, 0)).toBe(true)
  })
  it('fails closed on unavailable or malformed inspection', async () => {
    const file = await owner()
    probe.mockRejectedValue(new Error('synthetic timeout'))
    await expect(isLockOwnerAlive(process.pid, file)).rejects.toThrow(
      'LOCK_OWNER_INSPECTION_UNAVAILABLE',
    )
    for (const stdout of ['', 'bad', String(Date.now() + 60000)]) {
      probe.mockResolvedValue({ stdout, stderr: '' })
      await expect(isLockOwnerAlive(process.pid, file)).rejects.toThrow(
        'LOCK_OWNER_INSPECTION_UNAVAILABLE',
      )
    }
  })
  it('refuses a lock changed during inspection', async () => {
    const file = await owner()
    probe.mockImplementation(async () => {
      await writeFile(file, '{"changed":true}')
      return { stdout: String(Date.now() - 10000), stderr: '' }
    })
    await expect(isLockOwnerAlive(process.pid, file)).rejects.toThrow('LOCK_OWNER_CHANGED')
  })
})
