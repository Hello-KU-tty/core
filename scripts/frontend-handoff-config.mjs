import { lstat, readFile, readdir, realpath } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { inventory, sha256 } from '../examples/frontend-handoff/archive.mjs'

export const managedDirectories = ['portable', 'vendor/frontend-client', 'vendor/frontend-host']
const managed = (name) => managedDirectories.some((directory) => name.startsWith(`${directory}/`))
const versionParts = (version) => {
  if (!/^20\d{2}\.\d{2}\.\d{2}\.[1-9]\d*$/.test(version)) throw new Error('KIT_VERSION_INVALID')
  return version.split('.').map(Number)
}
export function nextKitVersion(previous, now = new Date()) {
  const before = versionParts(previous)
  const today = now.toISOString().slice(0, 10).replaceAll('-', '.')
  const day = previous.slice(0, 10) > today ? previous.slice(0, 10) : today
  return `${day}.${day === previous.slice(0, 10) ? before[3] + 1 : 1}`
}
function validateBaseline(baseline) {
  versionParts(baseline.kitVersion)
  const files = baseline.managedFiles
  if (
    !files ||
    !Object.keys(files).length ||
    Object.entries(files).some(
      ([name, hash]) =>
        !managed(name) ||
        name.includes('\\') ||
        name.split('/').some((part) => !part || part === '.' || part === '..') ||
        !/^[a-f0-9]{64}$/.test(hash),
    )
  )
    throw new Error('KIT_BASELINE_INVALID')
  return baseline
}
export async function selectProgramBaseline(program, baselines) {
  const files = []
  for (const directory of managedDirectories) {
    if ((await realpath(join(program, directory))) !== resolve(program, directory))
      throw new Error('PROGRAM_MANAGED_PATH_UNSAFE')
    for (const entry of await inventory(join(program, directory))) {
      const data = await readFile(join(program, directory, entry.name))
      files.push({
        name: `${directory}/${entry.name}`,
        hash: entry.sha256,
        normalized: data.includes(0)
          ? entry.sha256
          : sha256(Buffer.from(data.toString('utf8').replaceAll('\r\n', '\n'))),
      })
    }
  }
  const matches = baselines
    .map(validateBaseline)
    .filter(
      (baseline) =>
        Object.keys(baseline.managedFiles).length === files.length &&
        files.every((file) =>
          [file.hash, file.normalized].includes(baseline.managedFiles[file.name]),
        ),
    )
  if (matches.length !== 1)
    throw new Error(matches.length ? 'KIT_BASELINE_AMBIGUOUS' : 'PROGRAM_MANAGED_FILE_MODIFIED')
  return matches[0]
}
export async function handoffConfig(args, root) {
  const { values } = parseArgs({
    args,
    options: {
      program: { type: 'string' },
      'previous-manifest': { type: 'string' },
      'kit-version': { type: 'string' },
      verification: { type: 'string' },
      readme: { type: 'string' },
    },
  })
  if (!values.program || !values.verification)
    throw new Error('HANDOFF_ARGUMENTS_REQUIRED: --program <checkout> --verification <receipt>')
  const program = await realpath(resolve(values.program))
  const receiptPath = values['previous-manifest']
    ? resolve(values['previous-manifest'])
    : join(program, '.vibe-helper-kit.json')
  const baselines = []
  if (await lstat(receiptPath).catch(() => null)) {
    const receipt = JSON.parse(await readFile(receiptPath, 'utf8'))
    baselines.push({
      kitVersion: receipt.kitVersion,
      frontendRevision: receipt.frontendRevision,
      managedFiles:
        receipt.managedFiles ??
        Object.fromEntries(
          Object.entries(receipt.files ?? {})
            .filter(([name]) => managed(name))
            .map(([name, item]) => [name, item.sha256]),
        ),
    })
  } else {
    if (values['previous-manifest']) throw new Error('KIT_BASELINE_MISSING')
    const directory = join(root, 'examples/frontend-handoff')
    for (const name of await readdir(directory))
      if (/^program-managed-\d{8}\.json$/.test(name))
        baselines.push(JSON.parse(await readFile(join(directory, name), 'utf8')))
  }
  const previous = await selectProgramBaseline(program, baselines)
  const kitVersion = values['kit-version'] ?? nextKitVersion(previous.kitVersion)
  const before = versionParts(previous.kitVersion),
    after = versionParts(kitVersion)
  const firstDifference = after.findIndex((part, index) => part !== before[index])
  if (firstDifference < 0 || after[firstDifference] < before[firstDifference])
    throw new Error('KIT_VERSION_NOT_NEWER')
  const verification = resolve(values.verification)
  const verified = JSON.parse(await readFile(verification, 'utf8'))
  if (verified.kitVersion !== kitVersion || verified.previousKitVersion !== previous.kitVersion)
    throw new Error('KIT_VERIFICATION_VERSION_MISMATCH')
  const kit = `frontend-handoff-${after
    .slice(0, 3)
    .map((part, index) => String(part).padStart(index ? 2 : 4, '0'))
    .join('')}-${after[3]}`
  return {
    previous,
    kit,
    kitVersion,
    verification,
    readme: resolve(values.readme ?? join(root, 'docs/FRONTEND_HANDOFF.md')),
  }
}
