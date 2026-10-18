import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ownedPrivateDirectory } from '../src/portable-core.js'
import { isPrivateDirectory, privateDirectory } from '../src/private-directory.js'

const roots: string[] = []
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

const scratch = async () => {
  const value = await realpath(await mkdtemp(join(tmpdir(), 'vibe-k25-acl-')))
  roots.push(value)
  return value
}

// Real ACLs, no mocks: a folder another tool made with the inherited ACL (K25, Windows 0.2.13).
describe.skipIf(process.platform !== 'win32')('ownedPrivateDirectory on Windows', () => {
  it('tightens an inherited-ACL folder inside a private parent', async () => {
    const parent = await privateDirectory(join(await scratch(), 'project-tools'))
    const child = join(parent, 'AppData')
    await mkdir(child)
    expect(await isPrivateDirectory(child)).toBe(false)
    expect(await ownedPrivateDirectory(child)).toBe(child)
    expect(await isPrivateDirectory(child)).toBe(true)
  }, 60_000)

  it('still refuses an inherited-ACL folder whose parent is not private', async () => {
    const parent = await scratch()
    const child = join(parent, 'AppData')
    await mkdir(child)
    await expect(ownedPrivateDirectory(child)).rejects.toThrow('PRIVATE_DIRECTORY_UNSAFE')
    expect(await isPrivateDirectory(child)).toBe(false)
  }, 60_000)
})
