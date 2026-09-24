// Explicit synthetic validation against an already running installed W5 host.
// Uses its packaged SDK. Never changes normal profiles or replays unknown writes.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { lstat, readFile, realpath, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { isPrivateDirectory } from '../packages/runtime/dist/private-directory.js'

const root = await realpath(process.argv[2])
if (
  process.platform !== 'win32' ||
  dirname(root) !== (await realpath(tmpdir())) ||
  !/^vibe-w3-host-[A-Za-z0-9]+$/.test(basename(root)) ||
  !(await isPrivateDirectory(root))
)
  throw new Error('SYNTHETIC_HOST_ROOT_UNSAFE')
const config = JSON.parse(await readFile(join(root, 'driver/config.json'), 'utf8'))
const vertical = JSON.parse(await readFile(config.report, 'utf8'))
assert.equal(config.vertical, true)
assert.ok(['PASS', 'FAIL'].includes(vertical.status), 'Wait for the vertical run to finish')
const version = vertical.productVersion
assert.match(version, /^0\.3\.\d+$/)
const sdkFile = join(
  root,
  `extensions/vibe-helper.vibe-helper-portable-core-${version}/portable/bin/client.cjs`,
)
const sdkStat = await lstat(sdkFile)
assert.ok(sdkStat.isFile() && !sdkStat.isSymbolicLink() && sdkStat.nlink === 1)
const sdk = createRequire(import.meta.url)(sdkFile)
const client = await sdk.connectLocalCore(config.connectionFile)
const report = {
  schemaVersion: 1,
  productVersion: version,
  status: 'RUNNING',
  input: 'SYNTHETIC',
  client: 'INSTALLED_SDK',
  steps: {},
}
const receipt = join(root, `cancel-${randomUUID()}.json`)
const save = () => writeFile(receipt, JSON.stringify(report, null, 2), { mode: 0o600 })
const step = async (name, fn) => {
  report.steps[name] = { state: 'STARTED' }
  await save()
  const result = await fn()
  report.steps[name] = { state: 'DONE' }
  await save()
  return result
}
const entityId = (prefix) => `${prefix}_${randomUUID()}`
const projectId = entityId('project')
report.projectId = projectId
let run
let cancelAttempted = false
try {
  await step('START_DISCOVERY', () =>
    client.execute({
      schemaVersion: 1,
      actor: { kind: 'UI' },
      correlationId: entityId('corr'),
      kind: 'UI_START_DISCOVERY',
      projectId,
      idempotencyKey: entityId('idem'),
      input: { learningGoal: 'Synthetic cancellation check of TypeScript typed error handling.' },
    }),
  )
  const initial = await client.restoreProject(projectId)
  run = await step('START_PREVIEW', () =>
    client.startRun({
      kind: 'DISCOVERY',
      projectId,
      idempotencyKey: entityId('idem'),
      discoverySessionId: initial.discoverySession.id,
      expectedSessionRevision: initial.discoverySession.revision,
      phase: 'PREVIEW',
      enrichAfterPreview: false,
    }),
  )
  report.runId = run.id
  await save()
  let observed
  const modelEvent = new Promise((resolve) => {
    observed = resolve
  })
  const watching = client.watchRun(
    run.id,
    (event) => {
      if (['TEXT', 'TOOL'].includes(event.kind)) observed(event.kind)
    },
    { signal: AbortSignal.timeout(180000) },
  )
  void watching.catch(() => {})
  // A terminal response before an event is a failure, not a cancellation pass.
  const first = await Promise.race([
    modelEvent.then((kind) => ({ kind })),
    watching.then((terminal) => ({ terminal })),
  ])
  if (first.terminal) {
    report.beforeCancel = { status: first.terminal.status, errorCode: first.terminal.errorCode }
    throw new Error('NATIVE_TERMINAL_BEFORE_CANCELLATION')
  }
  report.observedNativeEvent = first.kind
  const started = Date.now()
  cancelAttempted = true
  const cancelled = await step('CANCEL', () => client.cancelRun(run.id))
  report.cancelMs = Date.now() - started
  assert.equal(cancelled.status, 'CANCELLED')
  const terminal = await watching
  assert.equal(terminal.status, 'CANCELLED')
  report.terminalStatus = terminal.status
  report.terminalOutcome = terminal.outcome
  const before = await client.listRuns(projectId)
  const restored = await client.restoreProject(projectId)
  const history = await client.listProjects()
  assert.equal(restored.project.id, projectId)
  assert.equal(restored.currentTask, null)
  assert.ok(history.projects.some((item) => item.project.id === projectId))
  assert.equal((await client.listRuns(projectId)).length, before.length)
  report.historyReadStartsNoRun = true
  report.taskCreated = false
  report.status = 'PASS'
} catch (error) {
  report.status = 'FAIL'
  const code = error?.code ?? error?.message
  report.errorCode = /^[A-Z][A-Z0-9_]{0,99}$/.test(code ?? '') ? code : 'CANCEL_CHECK_FAILED'
  // This synthetic run is ours. Send at most one cancel even if observation fails.
  if (run && !cancelAttempted) {
    cancelAttempted = true
    await step('CLEANUP_CANCEL', () => client.cancelRun(run.id)).catch(() => {})
  }
  process.exitCode = 1
}
await save()
await writeFile('dist/installed-native-cancel-receipt.json', JSON.stringify(report, null, 2))
console.log(
  JSON.stringify({
    status: report.status,
    nativeEvent: report.observedNativeEvent,
    terminalStatus: report.terminalStatus,
    cancelMs: report.cancelMs,
    errorCode: report.errorCode,
  }),
)
