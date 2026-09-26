// No model calls. Exact candidate metadata is checked by the diagnostic extension.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, realpath, rename, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import { isPrivateDirectory, privateDirectory } from '../packages/runtime/dist/private-directory.js'

const executable = process.argv[2]
assert.equal(process.platform, 'win32')
assert.equal(process.arch, 'x64')
assert.ok(executable && isAbsolute(executable))
await mkdir('.data', { recursive: true })
const resumingTrust = process.argv.includes('--resume-trust')
const recheckingMetadata = process.argv.includes('--recheck-metadata')
assert.ok(!(resumingTrust && recheckingMetadata))
const prior =
  resumingTrust || recheckingMetadata
    ? JSON.parse(await readFile('.data/w5-1170-location.json', 'utf8'))
    : null
const root = prior
  ? await realpath(prior.root)
  : await privateDirectory(await mkdtemp(join(tmpdir(), 'vibe-w5-compat-')))
assert.equal(dirname(root), await realpath(tmpdir()))
assert.match(basename(root), /^vibe-w5-compat-[A-Za-z0-9]{6}$/)
assert.equal(await isPrivateDirectory(root), true)
if (prior) {
  const receipt = JSON.parse(await readFile(join(root, 'receipt.json'), 'utf8'))
  if (recheckingMetadata) assert.ok(['FAIL', 'PASS_METADATA_ONLY'].includes(receipt.status))
  else assert.equal(receipt.stage, 'WAITING_FOR_WORKSPACE_TRUST')
  assert.equal(receipt.modelCalls, 0)
  if (Number.isInteger(prior.pid)) {
    try {
      process.kill(prior.pid, 0)
      throw new Error('PRIOR_HOST_STILL_RUNNING')
    } catch (error) {
      if (error.code !== 'ESRCH') throw error
    }
  }
  if (recheckingMetadata) {
    await rename(join(root, 'receipt.json'), join(root, `receipt-${Date.now()}.json`))
  }
}
const workspace = join(root, 'workspace')
if (!prior) {
  await mkdir(workspace)
  await writeFile(join(workspace, 'README.md'), '# W5 synthetic compatibility workspace\n')
}
const environment = { ...process.env, VIBE_W5_COMPAT_ROOT: root }
// Only this synthetic host gets diagnostic logging; no persistent setting changes.
if (process.argv.includes('--cloud-diagnostics')) environment.KIRO_LOG_LEVEL = 'debug'
if (process.argv.includes('--live-helper')) environment.VIBE_W5_COMPAT_HELPER_LIMIT = '1'
delete environment.ELECTRON_RUN_AS_NODE
for (const key of Object.keys(environment)) if (key.startsWith('VSCODE_')) delete environment[key]
const child = spawn(
  await realpath(executable),
  [
    '--new-window',
    '--wait',
    '--user-data-dir',
    join(root, 'profile'),
    '--extensions-dir',
    join(root, 'extensions'),
    `--extensionDevelopmentPath=${resolve('examples/windows-compatibility')}`,
    '--skip-welcome',
    '--skip-release-notes',
    '--sync',
    'off',
    workspace,
  ],
  // This is an interactive test window: Workspace Trust must remain visible.
  { env: environment, windowsHide: false, stdio: 'ignore' },
)
let launchFailed = false
child.on('error', () => {
  launchFailed = true
})
const location = { root, pid: child.pid, receipt: join(root, 'receipt.json') }
await writeFile('.data/w5-1170-location.json', JSON.stringify(location, null, 2))
console.log(JSON.stringify({ status: 'HOST_STARTED', syntheticRootName: basename(root) }))
let previous
const deadline = Date.now() + 240_000
while (Date.now() < deadline) {
  if (launchFailed) throw new Error('COMPATIBILITY_HOST_LAUNCH_FAILED')
  const report = await readFile(location.receipt, 'utf8')
    .then(JSON.parse)
    .catch(() => null)
  const progress = report ? JSON.stringify({ stage: report.stage, status: report.status }) : null
  if (progress && progress !== previous) {
    console.log(progress)
    previous = progress
  }
  if (report && report.status !== 'RUNNING') {
    await writeFile('.data/w5-1170-receipt.json', JSON.stringify(report, null, 2))
    console.log(JSON.stringify(report))
    process.exitCode = ['PASS_METADATA_ONLY', 'PASS_NATIVE_HELPER'].includes(report.status) ? 0 : 1
    child.unref()
    break
  }
  if (child.exitCode !== null) throw new Error('COMPATIBILITY_HOST_EXITED')
  await new Promise((done) => setTimeout(done, 500))
}
// Keep the dedicated host available for inspecting Trust or failures. Never stop other Kiro windows.
child.unref()
if (!previous || JSON.parse(previous).status === 'RUNNING') {
  console.log(JSON.stringify({ status: 'INCOMPLETE', reason: 'HOST_OR_TRUST_WAIT_TIMEOUT' }))
  process.exitCode = 1
}
if (process.argv.includes('--hold') && child.exitCode === null) {
  child.ref()
  await new Promise((done) => child.once('exit', done))
}
