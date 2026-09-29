import { execFile } from 'node:child_process'
import { copyFile, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { expect, it } from 'vitest'
// @ts-expect-error Build scripts are plain JavaScript, not package APIs.
import { inventory, sha256 } from '../../examples/frontend-handoff/archive.mjs'

it('applies an update, records its baseline, verifies it, and preserves edited managed files', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'handoff-update-')))
  try {
    const kit = join(root, 'kit'),
      program = join(root, 'program')
    const previousManagedFiles: Record<string, string> = {}
    for (const directory of ['portable', 'vendor/frontend-client', 'vendor/frontend-host']) {
      for (const target of [kit, program]) await mkdir(join(target, directory), { recursive: true })
      await writeFile(join(kit, directory, 'asset.txt'), 'new kit\n')
      await writeFile(join(program, directory, 'asset.txt'), 'old kit\n')
      previousManagedFiles[`${directory}/asset.txt`] = sha256('old kit\n')
    }
    for (const name of ['update-program.mjs', 'archive.mjs'])
      await copyFile(resolve('examples/frontend-handoff', name), join(kit, name))
    await writeFile(
      join(program, 'package.json'),
      JSON.stringify({ extensionDependencies: ['kiro.kiroAgent'] }),
    )
    await writeFile(join(program, 'ui.ts'), 'frontend source')
    const files = Object.fromEntries(
      (await inventory(kit)).map(({ name, ...value }: { name: string }) => [name, value]),
    )
    await writeFile(
      join(kit, 'manifest.json'),
      JSON.stringify({ kitVersion: '2026.09.29.2', previousManagedFiles, files }),
    )
    const run = (...args: string[]) =>
      promisify(execFile)(process.execPath, [join(kit, 'update-program.mjs'), program, ...args], {
        windowsHide: true,
      })
    expect((await run('--check')).stdout).toContain('READY')
    await expect(readFile(join(program, '.vibe-helper-kit.json'))).rejects.toMatchObject({
      code: 'ENOENT',
    })
    expect((await run()).stdout).toContain('UPDATED')
    expect((await run('--verify')).stdout).toContain('VERIFIED')
    const receipt = JSON.parse(await readFile(join(program, '.vibe-helper-kit.json'), 'utf8'))
    expect(receipt.kitVersion).toBe('2026.09.29.2')
    expect(receipt.managedFiles['portable/asset.txt']).toBe(sha256('new kit\n'))
    await run()
    expect(await readFile(join(program, 'ui.ts'), 'utf8')).toBe('frontend source')
    await writeFile(join(program, 'portable/asset.txt'), 'local change')
    await expect(run()).rejects.toMatchObject({
      stderr: expect.stringContaining('PROGRAM_MANAGED_FILE_MODIFIED'),
    })
    expect(await readFile(join(program, 'portable/asset.txt'), 'utf8')).toBe('local change')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
