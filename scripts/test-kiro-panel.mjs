import { spawn } from 'node:child_process'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, isAbsolute } from 'node:path'

const executable = process.argv[2]
if (!executable || !isAbsolute(executable))
  throw new Error('Pass the absolute installed Kiro executable/launcher path.')
const connection = resolve(process.argv[3] ?? '.data/local/connection.json')
const profile = await mkdtemp(join(tmpdir(), 'vibe-helper-kiro-ide-test-'))
const child = spawn(
  executable,
  [
    '--new-window',
    '--wait',
    '--user-data-dir',
    join(profile, 'user-data'),
    '--extensions-dir',
    join(profile, 'extensions'),
    `--extensionDevelopmentPath=${resolve('examples/kiro-panel')}`,
    `--extensionTestsPath=${resolve('examples/kiro-panel/dist/ide-test.cjs')}`,
    '--skip-welcome',
    '--skip-release-notes',
    '--sync',
    'off',
  ],
  {
    env: {
      ...process.env,
      VIBE_HELPER_TEST_CONNECTION_FILE: connection,
      VIBE_HELPER_TEST_REPORT: join(profile, 'result.json'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
  },
)
// Only show the test's machine-readable outcome. IDE diagnostics stay outside submissions.
let buffer = ''
child.stdout.setEncoding('utf8')
child.stdout.on('data', (chunk) => {
  buffer += chunk
  for (let boundary = buffer.indexOf('\n'); boundary >= 0; boundary = buffer.indexOf('\n')) {
    const line = buffer.slice(0, boundary)
    buffer = buffer.slice(boundary + 1)
    const start = line.indexOf('{"status":"IDE_HOST_PASSED"')
    if (start >= 0) console.log(line.slice(start))
  }
  if (buffer.length > 16_384) buffer = ''
})
child.stderr.on('data', () => {})
const timeout = setTimeout(() => child.kill('SIGTERM'), 90_000)
try {
  const code = await new Promise((done, reject) => {
    child.once('error', reject)
    child.once('exit', done)
  })
  const report = await readFile(join(profile, 'result.json'), 'utf8')
    .then(JSON.parse)
    .catch(() => null)
  console.log(
    JSON.stringify({
      status:
        code === 0 && report?.status === 'IDE_HOST_PASSED' ? 'IDE_VERIFIED' : 'IDE_TEST_FAILED',
      code,
      profile,
      report,
    }),
  )
  process.exitCode = code === 0 && report?.status === 'IDE_HOST_PASSED' ? 0 : 1
} finally {
  clearTimeout(timeout)
}
