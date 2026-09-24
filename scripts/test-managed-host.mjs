import { execFile, spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { cp, lstat, mkdir, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { connectLocalCore } from '../packages/frontend-client/dist/node.js'
import { isPrivateDirectory, privateDirectory } from '../packages/runtime/dist/private-directory.js'

const executable = process.argv[2]
const hold = process.argv.includes('--hold')
const windowLifecycle = process.argv.includes('--window-lifecycle')
const builderTools = process.argv.includes('--builder-tools')
const withoutProjectTools = process.argv.includes('--without-project-tools')
const vertical = process.argv.includes('--vertical')
if (vertical && (builderTools || windowLifecycle || process.argv.includes('--helper')))
  throw new Error('VERTICAL_MUST_NOT_USE_SEEDED_TASK')
if (windowLifecycle && !process.argv.includes('--helper')) throw new Error('HELPER_CHECK_REQUIRED')
if (!executable || process.platform !== 'win32') throw new Error('WINDOWS_KIRO_REQUIRED')
const reuseIndex = process.argv.indexOf('--reuse')
const reuse = reuseIndex < 0 ? null : process.argv[reuseIndex + 1]
if (reuseIndex >= 0 && !reuse) throw new Error('SYNTHETIC_HOST_ROOT_REQUIRED')
const root = reuse
  ? await realpath(reuse)
  : await privateDirectory(await mkdtemp(join(tmpdir(), 'vibe-w3-host-')))
if (
  dirname(root) !== (await realpath(tmpdir())) ||
  !/^vibe-w3-host-[A-Za-z0-9]+$/.test(basename(root)) ||
  !(await isPrivateDirectory(root))
)
  throw new Error('SYNTHETIC_HOST_ROOT_UNSAFE')
const receiptFile = join(root, `receipt-${randomUUID()}.json`)
const initializationRetryIndex = process.argv.indexOf('--retry-builder-from')
const continuationIndex = process.argv.indexOf('--continue-build-from')
if (initializationRetryIndex >= 0 && continuationIndex >= 0)
  throw new Error('ONLY_ONE_CONTINUATION_ALLOWED')
const retryIndex = Math.max(initializationRetryIndex, continuationIndex)
let retryReport
if (retryIndex >= 0) {
  const sourceName = process.argv[retryIndex + 1]
  if (!vertical || !reuse || !/^receipt-[0-9a-f-]{36}\.json$/.test(sourceName ?? ''))
    throw new Error('KNOWN_FAILED_BUILDER_RECEIPT_REQUIRED')
  const sourceFile = join(root, sourceName)
  const stat = await lstat(sourceFile)
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.nlink !== 1 ||
    dirname(await realpath(sourceFile)) !== root
  )
    throw new Error('KNOWN_FAILED_BUILDER_RECEIPT_UNSAFE')
  const source = await readFile(sourceFile)
  const { prepareBuilderRetry, prepareBuildContinuation } = createRequire(import.meta.url)(
    '../examples/kiro-panel/test/windows-vertical.cjs',
  )
  const prepare = continuationIndex >= 0 ? prepareBuildContinuation : prepareBuilderRetry
  retryReport = prepare(
    JSON.parse(source.toString('utf8')),
    createHash('sha256').update(source).digest('hex'),
    sourceName,
  )
  await writeFile(receiptFile, JSON.stringify(retryReport), { mode: 0o600 })
}
const profile = join(root, vertical ? '한글 사용자 프로필' : 'profile')
const extensions = join(root, 'extensions')
const driver = join(root, 'driver')
const storage = join(profile, 'User/globalStorage/vibe-helper.vibe-helper-portable-core')
await mkdir(storage, { recursive: true })
await privateDirectory(join(storage, 'core-data'))
await privateDirectory(join(storage, 'core-data/workspaces'))
const helperTask = process.argv.includes('--helper')
  ? await (await import('./seed-managed-host-helper.mjs')).seedHelperTask(storage)
  : null
const builderTask = builderTools
  ? await (await import('./seed-managed-host-helper.mjs')).seedHelperTask(storage)
  : null
if (builderTask) {
  await (await import('./project-toolchain-fixture.mjs')).writeToolchainFixture(
    join(storage, 'core-data/workspaces/projects', builderTask.projectId),
  )
}
await mkdir(driver, { recursive: true })
await cp(
  vertical
    ? 'examples/kiro-panel/test/windows-vertical.cjs'
    : 'examples/kiro-panel/test/managed-host.cjs',
  join(driver, 'extension.cjs'),
)
await writeFile(
  join(driver, 'package.json'),
  JSON.stringify({
    name: 'vibe-w3-host-driver',
    publisher: 'vibe-helper',
    version: '0.0.1',
    engines: { vscode: '^1.131.0' },
    main: './extension.cjs',
    capabilities: { untrustedWorkspaces: { supported: true } },
    activationEvents: ['onStartupFinished'],
  }),
)
await writeFile(
  join(driver, 'config.json'),
  JSON.stringify({
    report: receiptFile,
    connectionFile: join(storage, 'core-data/connection.json'),
    live: process.argv.includes('--live'),
    hold,
    helperTask,
    windowLifecycle,
    builderTask,
    withoutProjectTools,
    vertical,
    personalNeed: process.argv.includes('--personal-need'),
  }),
)
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
for (const name of Object.keys(env)) if (name.startsWith('VSCODE_')) delete env[name]
if (withoutProjectTools) {
  for (const key of Object.keys(env))
    if (/^(path|node_options|node_path|pnpm_home|npm_config_.*)$/i.test(key)) delete env[key]
  env.PATH = join(process.env.SystemRoot, 'System32')
}
// Install only into this synthetic profile. Nothing is copied into the normal profile.
const driverVsix = await (await import('./package-managed-host-driver.mjs')).packageHostDriver(
  root,
  driver,
)
for (const vsix of [
  resolve('dist/portable-win32-x64/vibe-helper-portable-core-0.3.7-win32-x64.vsix'),
  driverVsix,
])
  await promisify(execFile)(
    executable,
    [
      join(dirname(executable), 'resources/app/out/cli.js'),
      '--user-data-dir',
      profile,
      '--extensions-dir',
      extensions,
      '--install-extension',
      vsix,
      '--force',
    ],
    {
      env: { ...env, ELECTRON_RUN_AS_NODE: '1' },
      windowsHide: true,
      timeout: 60000,
      maxBuffer: 32768,
    },
  ).catch(() => {
    throw new Error('SYNTHETIC_VSIX_INSTALL_FAILED')
  })
const child = spawn(
  executable,
  [
    '--new-window',
    '--wait',
    '--user-data-dir',
    profile,
    '--extensions-dir',
    extensions,
    '--skip-welcome',
    '--skip-release-notes',
    '--sync',
    'off',
    builderTask || retryReport
      ? join(storage, 'core-data/workspaces/projects', (builderTask ?? retryReport).projectId)
      : join(storage, 'core-data/workspaces'),
  ],
  { env, windowsHide: false, stdio: 'ignore' },
)
child.on('error', () => {})
await writeFile(
  resolve('dist/managed-host-location.json'),
  JSON.stringify({ root, pid: child.pid, receiptFile }),
)
console.log(JSON.stringify({ status: 'SYNTHETIC_HOST_LAUNCHED', root }))
let stage
let completed = false
const until = hold ? Infinity : Date.now() + (vertical ? 2400000 : 480000)
try {
  while (Date.now() < until) {
    if (child.exitCode !== null) throw new Error('SYNTHETIC_HOST_EXITED')
    const report = await readFile(receiptFile, 'utf8')
      .then(JSON.parse)
      .catch(() => null)
    const progress =
      report && vertical
        ? {
            stage: report.stage,
            status: report.status,
            errorCode: report.errorCode,
            nativeRequests: report.nativeRequests,
            readFailures: report.readFailures ?? 0,
          }
        : report
    const progressKey = progress ? JSON.stringify(progress) : null
    if (progressKey && progressKey !== stage) {
      stage = progressKey
      console.log(progressKey)
    }
    if (report?.status || report?.nativeStatus === 'PASS') {
      process.exitCode = report.status === 'PASS' ? 0 : 1
      if (report.nativeStatus === 'PASS' && windowLifecycle) {
        const connectionFile = join(storage, 'core-data/connection.json')
        const wait = async (check, timeout) => {
          const deadline = Date.now() + timeout
          while (Date.now() < deadline) {
            if (await check()) return
            await new Promise((done) => setTimeout(done, 500))
          }
          throw new Error('WINDOW_LIFECYCLE_TIMEOUT')
        }
        await wait(async () => {
          const helper = await readFile(`${receiptFile}.helper-host`, 'utf8')
            .then(JSON.parse)
            .catch(() => null)
          return (
            helper?.mainPresent === false &&
            Date.now() - helper.observedAt < 5000 &&
            helper.phase === 'CORE_CONNECTED' &&
            helper.backendInstanceId === report.lifecycle.backendInstanceId
          )
        }, 45000)
        // Beyond the departing owner's grace period, Helper alone must keep Core alive.
        const keepUntil = Date.now() + 35000
        while (Date.now() < keepUntil) {
          const health = await (await connectLocalCore(connectionFile)).health()
          if (health.backendInstanceId !== report.lifecycle.backendInstanceId)
            throw new Error('CORE_RESTARTED_WHILE_HELPER_LIVE')
          await new Promise((done) => setTimeout(done, 2000))
        }
        report.ownerCloseKeptSharedCore = true
        await writeFile(
          `${receiptFile}.close-helper`,
          JSON.stringify({ action: 'CLOSE_SYNTHETIC_HELPER' }),
        )
        await wait(async () => {
          try {
            await readFile(join(storage, 'core-data/backend.lock/owner.json'))
            return false
          } catch (error) {
            if (error.code === 'ENOENT') return true
            throw error
          }
        }, 65000)
        report.lastWindowClosedCore = true
        report.stage = 'COMPLETE'
        report.status = 'PASS'
        process.exitCode = 0
        await writeFile(receiptFile, JSON.stringify(report))
        console.log(JSON.stringify({ ownerCloseKeptSharedCore: true, lastWindowClosedCore: true }))
      }
      completed = true
      break
    }
    await new Promise((done) => setTimeout(done, 1000))
  }
  if (!completed) throw new Error('HOST_CHECK_TIMEOUT')
} catch (error) {
  const report = await readFile(receiptFile, 'utf8')
    .then(JSON.parse)
    .catch(() => ({}))
  report.status = 'FAIL'
  report.errorCode = /^[A-Z0-9_]{1,100}$/.test(error.code ?? error.message)
    ? (error.code ?? error.message)
    : 'HOST_CHECK_FAILED'
  await writeFile(receiptFile, JSON.stringify(report))
  console.log(
    JSON.stringify({ stage: report.stage, status: report.status, errorCode: report.errorCode }),
  )
  process.exitCode = 1
} finally {
  if (!hold && child.exitCode === null && child.pid)
    await promisify(execFile)('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
      windowsHide: true,
    }).catch(() => {})
}
