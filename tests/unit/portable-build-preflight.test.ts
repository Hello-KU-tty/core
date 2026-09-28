import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// @ts-expect-error Build scripts are intentionally plain JavaScript, not package APIs.
import { verifyPortableBuildSource } from '../../scripts/portable-build-preflight.mjs'

const fixture = async (license = true) => {
  const root = await mkdtemp(join(tmpdir(), 'vibe-portable-build-preflight-'))
  const executable = join(root, 'node.exe')
  const bytes = Buffer.from('synthetic executable bytes; never executed')
  await writeFile(executable, bytes)
  if (license) await writeFile(join(root, 'LICENSE'), 'synthetic default distribution license')
  return { root, executable, hash: createHash('sha256').update(bytes).digest('hex') }
}

describe('portable build source preflight', () => {
  it('returns the regular license beside the exactly matched executable', async () => {
    const f = await fixture()
    await expect(verifyPortableBuildSource(f.executable, f.hash)).resolves.toBe(
      join(f.root, 'LICENSE'),
    )
  })

  it('rejects the executable before reading a missing license', async () => {
    const f = await fixture(false)
    await expect(verifyPortableBuildSource(f.executable, '0'.repeat(64))).rejects.toThrow(
      'NODE_DISTRIBUTION_UNVERIFIED',
    )
  })

  it('does not accept an invalid caller pin', async () => {
    const f = await fixture()
    await expect(verifyPortableBuildSource(f.executable, '')).rejects.toThrow(
      'NODE_DISTRIBUTION_PIN_INVALID',
    )
  })

  it('checks an explicit sidecar against the fixed official license hash', async () => {
    const f = await fixture()
    const sidecar = join(f.root, 'sidecar-LICENSE')
    await writeFile(sidecar, 'not the official license')
    await expect(verifyPortableBuildSource(f.executable, f.hash, sidecar)).rejects.toThrow(
      'NODE_DISTRIBUTION_LICENSE_UNVERIFIED',
    )
  })

  it('rejects a missing license before any package work', async () => {
    const f = await fixture(false)
    await expect(verifyPortableBuildSource(f.executable, f.hash)).rejects.toMatchObject({
      code: 'ENOENT',
    })
  })

  it('rejects a directory in place of the default license', async () => {
    const f = await fixture(false)
    await mkdir(join(f.root, 'LICENSE'))
    await expect(verifyPortableBuildSource(f.executable, f.hash)).rejects.toThrow(
      'PACKAGE_SOURCE_FILE_UNSAFE',
    )
  })

  it.skipIf(process.platform === 'win32')('rejects a symlinked default license', async () => {
    const f = await fixture(false)
    await writeFile(join(f.root, 'real-license'), 'synthetic license')
    await symlink(join(f.root, 'real-license'), join(f.root, 'LICENSE'))
    await expect(verifyPortableBuildSource(f.executable, f.hash)).rejects.toThrow(
      'PACKAGE_SOURCE_FILE_UNSAFE',
    )
  })

  it('runs the fixed source check before the first output mutation', async () => {
    const source = await readFile(
      new URL('../../scripts/build-portable-core.mjs', import.meta.url),
      'utf8',
    )
    const preflight = source.indexOf('const nodeLicensePath = await verifyPortableBuildSource(')
    const firstOutputMutation = source.indexOf("await mkdir(join(repository, 'dist')")
    const replacement = source.indexOf('await rm(output,')
    expect(preflight).toBeGreaterThan(-1)
    expect(firstOutputMutation).toBeGreaterThan(preflight)
    expect(replacement).toBeGreaterThan(firstOutputMutation)
    expect(source.slice(preflight, firstOutputMutation)).toContain('MANAGED_NODE.sha256')
    expect(source).toContain("await copy(nodeLicensePath, 'licenses/node-LICENSE')")
  })
})
