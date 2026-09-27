// Replace only the kit-managed directories of program. UI sources are never touched.
//   node update-program.mjs <program> --check   read-only preflight
//   node update-program.mjs <program>           replace portable/ and vendor/frontend-{client,host}/
//   node update-program.mjs <program> --verify  read-only integrity check of the current state
import { appendFile, cp, lstat, readFile, realpath, rm } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inventory, sha256 } from './archive.mjs'

const kit = dirname(fileURLToPath(import.meta.url))
const program = await realpath(resolve(process.argv[2] ?? ''))
const mode = process.argv.includes('--verify') ? 'verify' : process.argv.includes('--check') ? 'check' : 'apply'
const manifest = JSON.parse(await readFile(join(kit, 'manifest.json'), 'utf8'))
const MANAGED = ['portable', 'vendor/frontend-client', 'vendor/frontend-host']
const GIT_RULES = [
  ['.gitattributes', '/portable/** -text'],
  ['.gitattributes', '/vendor/frontend-client/** -text'],
  ['.gitattributes', '/vendor/frontend-host/** -text'],
  ['.gitignore', '!/portable/node_modules/'],
]
const fail = (code) => {
  console.error(code)
  process.exit(1)
}
// Git may check out LF blobs as CRLF; only a CRLF-normalized match counts as unchanged.
const matches = (data, expected) =>
  sha256(data) === expected ||
  (!data.includes(0) && sha256(Buffer.from(data.toString('utf8').replaceAll('\r\n', '\n'))) === expected)
async function exists(path) {
  try {
    await lstat(path)
    return true
  } catch (error) {
    if (error.code === 'ENOENT') return false
    throw error
  }
}
async function managedInventory(root) {
  const files = []
  for (const directory of MANAGED)
    if (await exists(join(root, directory)))
      for (const file of await inventory(join(root, directory)))
        files.push({ ...file, name: `${directory}/${file.name}` })
  return files
}
async function missingGitRules() {
  const missing = []
  for (const [file, rule] of GIT_RULES) {
    const path = join(program, file)
    const text = (await exists(path)) ? await readFile(path, 'utf8') : ''
    if (!text.split(/\r?\n/).includes(rule)) missing.push([file, rule])
  }
  return missing
}

// 1. The kit itself must be intact before anything else is trusted.
for (const [name, expected] of Object.entries(manifest.files)) {
  const path = resolve(kit, name)
  if (!path.startsWith(kit + sep) || (await lstat(path)).isSymbolicLink() || sha256(await readFile(path)) !== expected.sha256)
    fail(`KIT_HASH_MISMATCH: ${name}`)
}
const packageJson = JSON.parse(await readFile(join(program, 'package.json'), 'utf8'))
if (!packageJson.extensionDependencies?.includes('kiro.kiroAgent')) fail('PROGRAM_NOT_KIT_BASED: apply the 20260926 kit first')

if (mode === 'verify') {
  // Exact bytes: the runtime rejects any portable file whose SHA-256 differs from its manifest.
  const expected = Object.fromEntries(Object.entries(manifest.files).filter(([name]) => MANAGED.some((d) => name.startsWith(`${d}/`))))
  const actual = await managedInventory(program)
  const problems = []
  for (const file of actual) if (expected[file.name]?.sha256 !== file.sha256) problems.push(`CHANGED_OR_UNKNOWN ${file.name}`)
  for (const name of Object.keys(expected)) if (!actual.some((file) => file.name === name)) problems.push(`MISSING ${name}`)
  for (const [file, rule] of await missingGitRules()) problems.push(`GIT_RULE_MISSING ${file}: ${rule}`)
  if (problems.length) fail(`PROGRAM_KIT_STATE_INVALID\n${problems.slice(0, 40).join('\n')}${problems.length > 40 ? `\n… ${problems.length - 40} more` : ''}`)
  console.log(`VERIFIED: ${actual.length} managed files match kit ${manifest.kitVersion}; git tracking rules present.`)
  process.exit(0)
}

// 2. Every managed file present in program must be the previous kit's content (or this kit's,
//    for a re-run). Files missing from a clone are expected: they are restored from the kit.
const previous = manifest.previousManagedFiles
for (const file of await managedInventory(program)) {
  const data = await readFile(join(program, file.name))
  if (!matches(data, previous[file.name] ?? '') && !matches(data, manifest.files[file.name]?.sha256 ?? ''))
    fail(`PROGRAM_MANAGED_FILE_MODIFIED: ${file.name}; move local edits out of kit-managed directories`)
}
const rules = await missingGitRules()
if (mode === 'check') {
  console.log(`READY: kit ${manifest.kitVersion} can replace ${MANAGED.join(', ')}; ${rules.length} git tracking rule(s) to add. No files changed.`)
  process.exit(0)
}

// 3. Mutation. Preflight above is complete; no network, install scripts or credential access.
for (const directory of MANAGED) {
  await rm(join(program, directory), { recursive: true, force: true })
  await cp(join(kit, directory), join(program, directory), { recursive: true })
}
for (const [file, rule] of rules) {
  const path = join(program, file)
  const text = (await exists(path)) ? await readFile(path, 'utf8') : ''
  await appendFile(path, `${text && !text.endsWith('\n') ? '\n' : ''}${rule}\n`)
}
console.log(`UPDATED to kit ${manifest.kitVersion}. Next: git add portable vendor .gitattributes .gitignore; npm run typecheck; npm test; npm run build; node update-program.mjs <program> --verify; node package-program.mjs <program>.`)
