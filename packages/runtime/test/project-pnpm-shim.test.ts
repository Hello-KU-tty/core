import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { olderPinnedPnpmShims } from '../src/project-toolchain.js'

let root: string
const node = 'C:\\tools\\node.exe'
beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'vibe-pnpm-shim-')))
  for (const version of ['11.12.0', '11.13.1', '11.14.0', 'not-a-version'])
    await mkdir(join(root, 'pnpm-cache', `pnpm-${version}`, 'bin'), { recursive: true })
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('shared pnpm shim after a pin change', () => {
  it('lists only exact shims for strictly older cached pins with the same Node', async () => {
    const shims = await olderPinnedPnpmShims(root, node, '11.13.1')
    const older = `"${node}" "${join(root, 'pnpm-cache', 'pnpm-11.12.0', 'bin/pnpm.cjs')}" %*`
    expect(shims).toHaveLength(2)
    expect(shims.every((shim) => shim.includes(older))).toBe(true)
    expect(shims.some((shim) => shim.includes('pnpm-11.13.1'))).toBe(false)
    expect(shims.some((shim) => shim.includes('pnpm-11.14.0'))).toBe(false)
    expect(shims[1]).toBe(`@echo off\r\n${older}\r\nexit /b %errorlevel%\r\n`)
  })

  it('never covers another Node or an invalid current version', async () => {
    const shims = await olderPinnedPnpmShims(root, 'C:\\other\\node.exe', '11.13.1')
    expect(shims.some((shim) => shim.includes(node))).toBe(false)
    expect(await olderPinnedPnpmShims(root, node, 'latest')).toEqual([])
  })

  it('returns nothing without a cache', async () => {
    expect(await olderPinnedPnpmShims(join(root, 'missing'), node, '11.13.1')).toEqual([])
  })
})
