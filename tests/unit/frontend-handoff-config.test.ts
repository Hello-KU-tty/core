import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
// @ts-expect-error Build scripts are plain JavaScript, not package APIs.
import {
  handoffConfig,
  nextKitVersion,
  selectProgramBaseline,
} from '../../scripts/frontend-handoff-config.mjs'
// @ts-expect-error Build scripts are plain JavaScript, not package APIs.
import { sha256 } from '../../examples/frontend-handoff/archive.mjs'

let root: string
const files = {
  'portable/a.txt': 'portable\n',
  'vendor/frontend-client/a.txt': 'sdk\n',
  'vendor/frontend-host/a.txt': 'host\n',
}
const previous = {
  kitVersion: '2026.09.29.1',
  frontendRevision: 'test',
  managedFiles: Object.fromEntries(
    Object.entries(files).map(([name, content]) => [name, sha256(content)]),
  ),
}
beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'handoff-config-')))
  for (const [name, content] of Object.entries(files)) {
    await mkdir(join(root, name, '..'), { recursive: true })
    await writeFile(join(root, name), content)
  }
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

it('selects applied hashes, not the latest date, and rejects edited, missing or extra files', async () => {
  const wrong = {
    ...previous,
    kitVersion: '2026.09.30.1',
    managedFiles: { ...previous.managedFiles, 'portable/a.txt': sha256('other') },
  }
  expect(await selectProgramBaseline(root, [wrong, previous])).toEqual(previous)
  await writeFile(join(root, 'portable/a.txt'), 'portable\r\n')
  expect(await selectProgramBaseline(root, [previous])).toEqual(previous)
  await writeFile(join(root, 'portable/a.txt'), 'local edit')
  await expect(selectProgramBaseline(root, [previous])).rejects.toThrow(
    'PROGRAM_MANAGED_FILE_MODIFIED',
  )
  await writeFile(join(root, 'portable/a.txt'), files['portable/a.txt'])
  await writeFile(join(root, 'portable/extra'), 'new')
  await expect(selectProgramBaseline(root, [previous])).rejects.toThrow(
    'PROGRAM_MANAGED_FILE_MODIFIED',
  )
  await rm(join(root, 'portable/extra'))
  await rm(join(root, 'portable/a.txt'))
  await expect(selectProgramBaseline(root, [previous])).rejects.toThrow(
    'PROGRAM_MANAGED_FILE_MODIFIED',
  )
})
it('rejects ambiguous and unsafe baselines', async () => {
  await expect(selectProgramBaseline(root, [previous, previous])).rejects.toThrow(
    'KIT_BASELINE_AMBIGUOUS',
  )
  await expect(
    selectProgramBaseline(root, [
      { ...previous, managedFiles: { 'portable/../escape': sha256('x') } },
    ]),
  ).rejects.toThrow('KIT_BASELINE_INVALID')
})
it('increments same-day versions and never goes backwards', () => {
  expect(nextKitVersion('2026.09.29.1', new Date('2026-09-29T12:00:00Z'))).toBe('2026.09.29.2')
  expect(nextKitVersion('2026.09.29.1', new Date('2026-09-28T12:00:00Z'))).toBe('2026.09.29.2')
  expect(nextKitVersion('2026.09.29.1', new Date('2026-09-30T12:00:00Z'))).toBe('2026.09.30.1')
})
it('uses the applied receipt and binds the verification to both versions', async () => {
  await writeFile(join(root, '.vibe-helper-kit.json'), JSON.stringify(previous))
  const verification = join(root, 'verification.json')
  await writeFile(
    verification,
    JSON.stringify({ kitVersion: '2026.09.29.2', previousKitVersion: previous.kitVersion }),
  )
  const args = ['--program', root, '--kit-version', '2026.09.29.2', '--verification', verification]
  expect((await handoffConfig(args, root)).kit).toBe('frontend-handoff-20260929-2')
  await writeFile(
    verification,
    (await readFile(verification, 'utf8')).replace('2026.09.29.1', '2026.09.27.1'),
  )
  await expect(handoffConfig(args, root)).rejects.toThrow('KIT_VERIFICATION_VERSION_MISMATCH')
  await expect(handoffConfig(['--program', root], root)).rejects.toThrow(
    'HANDOFF_ARGUMENTS_REQUIRED',
  )
})
