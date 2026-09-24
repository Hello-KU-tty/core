// Read-only W1 evidence audit, plus re-execution of the bounded generated test.
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstat, readFile, readdir, realpath, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { isPrivateDirectory } from '../apps/local-backend/dist/private-files.js'
import privatePaths from '../examples/kiro-native-host/native-private-directory.cjs'

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const root = await realpath(process.argv[2])
const runId = process.argv[3]
const executable = await realpath(process.argv[4])
assert.equal(process.platform, 'win32')
assert.match(basename(root), /^vibe-w1-host-[a-zA-Z0-9]{6}$/)
assert.equal(dirname(root), await realpath(tmpdir()))
assert.match(runId, /^[0-9a-f-]{36}$/)
assert.equal(await isPrivateDirectory(root), true)
const host = JSON.parse(await readFile(join(root, `host-${runId}.json`), 'utf8'))
const runtimeRoot = join(root, `한글 공백 runtime-${runId}`)
assert.equal(host.child.exitCode, 0)
assert.equal(host.builder.helperDuringBuilder, true)
assert.equal(host.builder.separateWindows, true)
assert.equal(host.builder.coreRuns.length, 3)
assert.deepEqual(
  host.builder.coreRuns.map((run) => run.status),
  ['SUCCEEDED', 'CANCELLED', 'SUCCEEDED'],
)
assert.ok(
  host.builder.runs.every(
    (run) => ['PASS', 'CANCELLED'].includes(run.native.status) && run.native.revokedStatus === 401,
  ),
)
const nativeBuilder = host.builder.runs.find((run) => run.role === 'BUILDER').native
assert.ok(
  nativeBuilder.toolReceipts.some(
    (tool) => tool.kind === 'execute' && tool.status === 'completed' && tool.exitCode === 0,
  ),
)
assert.equal(nativeBuilder.builder.receipt.coreContextVersion, 2)
const matches = []
for (const entry of await readdir(join(root, 'workspace'), { withFileTypes: true })) {
  if (!entry.isDirectory() || !/^scenario-[0-9a-f-]{36}$/.test(entry.name)) continue
  const folder = join(
    root,
    'workspace',
    entry.name,
    'projects',
    'project_00000000-0000-4000-8000-000000000001',
  )
  const matched = await Promise.all(
    host.builder.files.map(async (file) => {
      const path = join(folder, file.path)
      try {
        assert.equal(privatePaths.privateNativeFile(path), true)
        const contents = await readFile(path)
        return createHash('sha256').update(contents).digest('hex') === file.sha256
      } catch {
        return false
      }
    }),
  )
  if (matched.every(Boolean)) matches.push(folder)
}
assert.equal(matches.length, 1)
const tested = await promisify(execFile)(
  executable,
  ['--test', '--test-reporter=tap', 'src/native-event.test.ts'],
  {
    cwd: matches[0],
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    windowsHide: true,
    timeout: 10000,
  },
)
assert.match(tested.stdout, /# fail 0\b/)
const report = {
  status: 'PASS',
  auditedRunId: runId,
  nativeTestExitCode: 0,
  independentTestExitCode: 0,
  independentTestsPassed: Number(tested.stdout.match(/# pass (\d+)/)?.[1]),
  sameFileHashes: true,
  privateRoot: true,
  bindingsRevoked: 0,
  databases: [],
  coreTerminalStates: host.builder.coreRuns.map((run) => run.status),
  nativeTurnsUsed: JSON.parse(await readFile(join(root, 'model-turns.json'), 'utf8')).used,
}
assert.equal(report.nativeTurnsUsed, 8)
const Database = createRequire(join(repository, 'packages/storage-sqlite/package.json'))(
  'better-sqlite3',
)
for (const name of ['core', 'core-http', 'native-builder']) {
  const directory = join(runtimeRoot, name)
  const database = join(directory, 'vibe-helper.sqlite')
  assert.equal(privatePaths.privateNativeFile(database), true)
  const db = new Database(database, { readonly: true, fileMustExist: true })
  try {
    assert.equal(db.pragma('quick_check', { simple: true }), 'ok')
    assert.equal(db.pragma('foreign_key_check').length, 0)
    report.databases.push({ name, privateFile: true, quickCheck: 'ok', foreignKeyViolations: 0 })
  } finally {
    db.close()
  }
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (
      !entry.isFile() ||
      !/^(?:[0-9a-f-]{36}|discovery-binding|builder-binding|helper-binding)\.json$/.test(entry.name)
    )
      continue
    const path = join(directory, entry.name)
    assert.equal((await lstat(path)).nlink, 1)
    assert.equal(privatePaths.privateNativeFile(path), true)
    assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), { status: 'REVOKED' })
    report.bindingsRevoked++
  }
}
assert.equal(report.bindingsRevoked, 6)
await writeFile(join(root, `audit-${runId}.json`), JSON.stringify(report, null, 2), { flag: 'wx' })
console.log(JSON.stringify(report))
