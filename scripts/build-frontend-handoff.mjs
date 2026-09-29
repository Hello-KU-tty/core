import { execFile } from 'node:child_process'
import { cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import { promisify } from 'node:util'
import { archive, inventory, sha256 } from '../examples/frontend-handoff/archive.mjs'
import { loadCoreResources } from '../packages/runtime/dist/portable-core.js'
import { handoffConfig } from './frontend-handoff-config.mjs'

// Update kit for a program checkout that already consumed the 20260927 kit. It replaces only
// kit-managed directories; frontend UI sources are wired by the frontend developer.
const REFERENCE_VSIX = 'vibe-helper-portable-core-0.3.17-win32-x64.vsix'
const root = resolve('.')
const config = await handoffConfig(
  process.argv.slice(2).filter((arg) => arg !== '--'),
  root,
)
const { kit: KIT, kitVersion: KIT_VERSION, previous } = config
const output = join(root, 'dist')
await mkdir(output, { recursive: true })
if ((await realpath(output)) !== output) throw new Error('HANDOFF_OUTPUT_PARENT_UNSAFE')
const stage = await mkdtemp(join(output, 'frontend-handoff-stage-'))
const kit = join(stage, KIT)
await mkdir(kit)
const assets = await loadCoreResources(join(output, 'portable-core-win32-x64'))
for (const name of ['update-program.mjs', 'archive.mjs', 'package-program.mjs'])
  await cp(join(root, 'examples/frontend-handoff', name), join(kit, name))
await cp(join(output, 'portable-core-win32-x64'), join(kit, 'portable'), { recursive: true })
await mkdir(join(kit, 'vendor/frontend-host'), { recursive: true })
await cp(join(output, 'frontend-client'), join(kit, 'vendor/frontend-client'), { recursive: true })
await writeFile(
  join(kit, 'vendor/frontend-host/index.d.ts'),
  (await readFile('examples/kiro-panel/src/frontend-host.d.cts', 'utf8')).replace(
    "'@vibe-helper/frontend-client'",
    "'../frontend-client'",
  ),
)
await cp(config.readme, join(kit, 'README.md'))
await mkdir(join(kit, 'verification'))
await cp(config.verification, join(kit, 'verification/update.json'))
await mkdir(join(kit, 'reference'))
await cp(join('dist/portable-win32-x64', REFERENCE_VSIX), join(kit, 'reference', REFERENCE_VSIX))
const { stdout } = await promisify(execFile)('git', ['rev-parse', 'HEAD'], { windowsHide: true })
const dirty = await promisify(execFile)('git', ['status', '--porcelain'], { windowsHide: true })
const files = await inventory(kit)
for (const file of files) {
  if (/\.(?:db|sqlite|log|map)$|(?:^|\/)(?:connection\.json|\.env)(?:$|\/)/.test(file.name))
    throw new Error('HANDOFF_PRIVATE_FILE_DENIED')
  const data = await readFile(join(kit, file.name))
  if (data.includes(Buffer.from(root)) || data.includes(Buffer.from(root.replaceAll('\\', '\\\\'))))
    throw new Error('HANDOFF_PRIVATE_PATH_DENIED')
}
const manifest = {
  schemaVersion: 2,
  kitVersion: KIT_VERSION,
  kind: 'UPDATE',
  target: 'win32-x64',
  backendHead: stdout.trim(),
  backendWorkingTreeDirty: Boolean(dirty.stdout.trim()),
  frontendRevision: previous.frontendRevision,
  previousKitVersion: previous.kitVersion,
  sdkVersion: '0.1.0',
  referenceVsixVersion: '0.3.17',
  portableManifestSha256: sha256(JSON.stringify(assets.manifest)),
  supported: {
    kiro: '1.1.70',
    agent: '1.1.158',
    api: '1.131.0',
    sourceGate: 'EXACT_INSTALLATION_ATTESTATION',
  },
  validationScope: 'CURRENT_WINDOWS_MACHINE_ONLY',
  previousManagedFiles: previous.managedFiles,
  files: Object.fromEntries(files.map(({ name, ...value }) => [name, value])),
}
await writeFile(join(kit, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
const zip = join(output, `${KIT}.zip`)
if (!zip.startsWith(`${output}${sep}`)) throw new Error('HANDOFF_OUTPUT_UNSAFE')
// Replace only the named generated archive. Stage/source/user data are untouched.
await rm(zip, { force: true })
const receipt = await archive(stage, zip)
const report = {
  ...receipt,
  directory: KIT,
  backendHead: manifest.backendHead,
  backendWorkingTreeDirty: manifest.backendWorkingTreeDirty,
  frontendRevision: manifest.frontendRevision,
  validationScope: manifest.validationScope,
}
await writeFile(join(output, `${KIT}-receipt.json`), `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report))
