import { execFile, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { privateDirectory } from '../apps/local-backend/dist/private-files.js'

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const executable = process.argv[2]
if (process.platform !== 'win32' || !executable || !isAbsolute(executable))
  throw new Error('WINDOWS_KIRO_EXECUTABLE_REQUIRED')
const previous = process.argv[3]
const activation = process.argv[4] === '--activation'
if (
  previous &&
  (!isAbsolute(previous) ||
    !/^vibe-w1-host-[a-zA-Z0-9]{6}$/.test(basename(previous)) ||
    (await realpath(dirname(previous))) !== (await realpath(tmpdir())))
)
  throw new Error('W1_EXISTING_ROOT_INVALID')
const root = previous
  ? await realpath(previous)
  : await privateDirectory(await mkdtemp(join(tmpdir(), 'vibe-w1-host-')))
if (!previous) {
  await mkdir(join(root, 'workspace'))
  await writeFile(
    join(root, 'workspace', 'README.md'),
    '# Synthetic Windows capability workspace\n',
  )
}
const runId = randomUUID()
const child = spawn(
  await realpath(executable),
  [
    '--new-window',
    '--wait',
    '--user-data-dir',
    join(root, 'profile'),
    '--extensions-dir',
    join(root, 'extensions'),
    `--extensionDevelopmentPath=${join(repository, 'examples/windows-capability')}`,
    ...(activation
      ? []
      : [`--extensionTestsPath=${join(repository, 'examples/windows-capability/test.cjs')}`]),
    '--skip-welcome',
    '--skip-release-notes',
    '--sync',
    'off',
    join(root, 'workspace'),
  ],
  {
    env: {
      ...process.env,
      VIBE_W1_PROBE_ROOT: root,
      VIBE_W1_RUN_ID: runId,
      VIBE_W1_ACTIVATION_PROBE: activation ? '1' : '0',
      VIBE_W1_HELPER_LIVE: process.argv.includes('--helper-live') ? '1' : '0',
      VIBE_W1_DISCOVERY_LIVE: process.argv.includes('--discovery-live') ? '1' : '0',
      VIBE_W1_BUILDER_LIVE: process.argv.includes('--builder-live') ? '1' : '0',
      VIBE_W1_DUAL_HOST: process.argv.includes('--dual-host') ? '1' : '0',
    },
    stdio: ['ignore', 'ignore', 'ignore'],
    windowsHide: true,
  },
)
console.log(
  JSON.stringify({ experiment: basename(root), runId, pid: child.pid, status: 'HOST_STARTED' }),
)
let timedOut = false
const stopOwnedHost = () => {
  if (child.exitCode === null && child.pid)
    execFile(
      'taskkill.exe',
      ['/PID', String(child.pid), '/T', '/F'],
      { windowsHide: true },
      () => {},
    )
}
const timer = setTimeout(
  () => {
    timedOut = true
    stopOwnedHost()
  },
  process.argv.includes('--builder-live')
    ? 660_000
    : process.argv.some((arg) => arg.endsWith('-live'))
      ? 210_000
      : 90_000,
)
const reportWatcher = activation
  ? setInterval(async () => {
      try {
        await readFile(join(root, `host-${runId}.json`))
        stopOwnedHost()
      } catch {}
    }, 500)
  : null
try {
  const code = await new Promise((done, reject) => {
    child.once('error', reject)
    child.once('exit', done)
  })
  const report = await readFile(join(root, `host-${runId}.json`), 'utf8')
    .then(JSON.parse)
    .catch(() => null)
  console.log(JSON.stringify({ experiment: basename(root), code, timedOut, report }))
  const passed =
    report &&
    report.status !== 'FAIL' &&
    report.child?.exitCode === 0 &&
    [report.nativeMetadata, report.helperMetadata, report.discovery, report.builder].every(
      (result) => !result || result.status === 'PASS',
    )
  process.exitCode = !timedOut && passed && (activation || code === 0) ? 0 : 1
} finally {
  clearTimeout(timer)
  if (reportWatcher) clearInterval(reportWatcher)
}
