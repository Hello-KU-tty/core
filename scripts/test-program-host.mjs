import { spawn, execFile } from 'node:child_process'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, dirname, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'
import { promisify } from 'node:util'
import { build } from 'esbuild'
import { privateDirectory } from '../packages/runtime/dist/private-directory.js'
import { packageHostDriver } from './package-managed-host-driver.mjs'
const executable = resolve(process.argv[2]),
  program = resolve(process.argv[3]),
  vsix = resolve(process.argv[4])
const root = await privateDirectory(await mkdtemp(join(tmpdir(), 'vibe-program-host-')))
const profile = join(root, 'profile'),
  extensions = join(root, 'extensions'),
  driver = join(root, 'driver')
const storage = join(profile, 'User/globalStorage/vibe-helper.builder-helper-agent-panel')
await mkdir(storage, { recursive: true })
await privateDirectory(join(storage, 'core-data'))
const workspace = await privateDirectory(join(storage, 'core-data/workspaces'))
// User delegated Workspace Trust for synthetic verification. Use Kiro's exact
// installed storage format in an isolated shared-data directory; never disable
// trust or touch the normal profile/shared store.
const shared = await privateDirectory(join(root, 'shared'))
await mkdir(join(shared, 'sharedStorage'))
const Database = createRequire(import.meta.url)(
  '../packages/storage-sqlite/node_modules/better-sqlite3',
)
const trustDb = new Database(join(shared, 'sharedStorage/state.vscdb'))
trustDb.exec('CREATE TABLE ItemTable (key TEXT UNIQUE ON CONFLICT REPLACE, value BLOB)')
trustDb.prepare('INSERT INTO ItemTable (key,value) VALUES (?,?)').run(
  'content.trust.model.key',
  JSON.stringify({
    uriTrustInfo: [
      {
        trusted: true,
        uri: { $mid: 1, scheme: 'file', path: `/${workspace.replaceAll('\\', '/')}` },
      },
    ],
  }),
)
trustDb.close()
await mkdir(driver)
await build({
  entryPoints: ['examples/frontend-handoff/program-host-driver.cjs'],
  outfile: join(driver, 'extension.cjs'),
  platform: 'node',
  format: 'cjs',
  target: 'node24',
  bundle: true,
  external: ['vscode'],
  alias: { 'program-port': join(program, 'src/adapter/flow/local-core-port.ts') },
})
await writeFile(
  join(driver, 'package.json'),
  JSON.stringify({
    name: 'vibe-w3-host-driver',
    publisher: 'vibe-helper',
    version: '0.0.1',
    engines: { vscode: '^1.131.0' },
    main: './extension.cjs',
    extensionDependencies: ['vibe-helper.builder-helper-agent-panel'],
    activationEvents: ['onStartupFinished'],
    capabilities: { untrustedWorkspaces: { supported: true } },
  }),
)
const reportFile = join(root, 'receipt.json')
await writeFile(join(driver, 'config.json'), JSON.stringify({ report: reportFile }))
const driverVsix = await packageHostDriver(root, driver)
const env = { ...process.env }
for (const key of Object.keys(env))
  if (
    /^VSCODE_|^(ELECTRON_RUN_AS_NODE|KIRO_LOG_LEVEL|VIBE_W5_KIRO_1170_DIAGNOSTIC|PSExecutionPolicyPreference)$/.test(
      key,
    )
  )
    delete env[key]
for (const artifact of [vsix, driverVsix])
  await promisify(execFile)(
    executable,
    [
      join(dirname(executable), 'resources/app/out/cli.js'),
      '--user-data-dir',
      profile,
      '--shared-data-dir',
      shared,
      '--extensions-dir',
      extensions,
      '--install-extension',
      artifact,
      '--force',
    ],
    { env: { ...env, ELECTRON_RUN_AS_NODE: '1' }, windowsHide: true, timeout: 60000 },
  )
const child = spawn(
  executable,
  [
    '--new-window',
    '--wait',
    '--user-data-dir',
    profile,
    '--shared-data-dir',
    shared,
    '--extensions-dir',
    extensions,
    '--skip-welcome',
    '--skip-release-notes',
    '--sync',
    'off',
    workspace,
  ],
  { env, windowsHide: true, stdio: 'ignore' },
)
await writeFile(
  resolve('dist/program-host-location.json'),
  JSON.stringify({ root, pid: child.pid, reportFile }),
)
let last
try {
  const deadline = Date.now() + 20 * 60_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error('PROGRAM_HOST_EXITED')
    const report = await readFile(reportFile, 'utf8')
      .then(JSON.parse)
      .catch(() => null)
    if (report && JSON.stringify(report) !== last) {
      last = JSON.stringify(report)
      console.log(
        JSON.stringify({
          stage: report.stage,
          status: report.status,
          errorCode: report.errorCode,
          nativeRequests: report.nativeRequests,
        }),
      )
    }
    if (report && ['PASS', 'FAIL'].includes(report.status)) {
      await writeFile(resolve('dist/frontend-native-receipt.json'), JSON.stringify(report, null, 2))
      if (report.status !== 'PASS') process.exitCode = 1
      break
    }
    await new Promise((done) => setTimeout(done, 1000))
  }
  if (!last || !['PASS', 'FAIL'].includes(JSON.parse(last).status))
    throw new Error('PROGRAM_HOST_TIMEOUT')
} finally {
  if (child.exitCode === null && child.pid)
    await promisify(execFile)('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
      windowsHide: true,
    }).catch(() => {})
}
