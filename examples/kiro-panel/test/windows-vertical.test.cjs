const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { runInNewContext } = require('node:vm')
const { test } = require('node:test')
const source = readFileSync(join(__dirname, 'windows-vertical.cjs'), 'utf8')

function driver(journal, { helper = false, renameFailure = false } = {}) {
  const files = new Map([['report.json', JSON.stringify(journal)]])
  let mutations = 0, renameAttempts = 0
  const client = { health: async () => ({ backendInstanceId: 'synthetic-instance' }),
    execute: async () => { mutations++; throw new Error('CORE_CONNECTION_UNAVAILABLE') } }
  const extension = { extensionPath: '/synthetic', packageJSON: { version: 'synthetic' },
    activate: async () => ({ lifecycleStatus: () => ({ phase: 'CORE_CONNECTED', native: 'WORKER_READY' }) }) }
  const module = { exports: {} }
  runInNewContext(source, { module, exports: module.exports, __dirname,
    process, Buffer, AbortSignal, fetch, setTimeout: callback => { queueMicrotask(callback); return 0 },
    require: name => {
      if (name === 'vscode') return { version: 'synthetic', workspace: { isTrusted: true,
        workspaceFolders: [{ uri: { fsPath: helper ? '/__vibe-native-helper-synthetic' : '/workspaces' } }] },
        extensions: { getExtension: () => extension }, commands: { executeCommand: async () => ({ panelOpened: true }) } }
      if (name.endsWith('client.cjs')) return { connectLocalCore: async () => client }
      if (name === 'node:fs/promises') return {
        readFile: async path => path.endsWith('config.json') ? JSON.stringify({ report: 'report.json' }) : files.get(path),
        writeFile: async (path, contents) => { files.set(path, contents) },
        rename: async (from, to) => {
          renameAttempts++
          if (renameFailure && renameAttempts === 1) throw Object.assign(new Error('busy'), { code: 'EPERM' })
          files.set(to, files.get(from)); files.delete(from)
        },
      }
      return require(name)
    },
  })
  return { activate: module.exports.activate, mutations: () => mutations,
    renameAttempts: () => renameAttempts, report: () => JSON.parse(files.get('report.json')) }
}

const initial = () => ({ stage: 'ACTIVATING', nativeRequests: 0, steps: {}, runs: {}, activatedHosts: 0 })

test('an interrupted mutation is never replayed after extension-host reload', async () => {
  const first = driver(initial())
  await first.activate()
  assert.equal(first.mutations(), 1)
  const interrupted = first.report()
  assert.equal(interrupted.steps.START_DISCOVERY.state, 'STARTED')
  delete interrupted.status // Simulate a reload before the error could be saved.
  const resumed = driver(interrupted)
  await resumed.activate()
  assert.equal(resumed.mutations(), 0)
  assert.equal(resumed.report().errorCode, 'MUTATION_RESPONSE_UNKNOWN_NOT_REPLAYED')
})

test('Windows atomic receipt rename retries do not repeat a Core mutation', async () => {
  const run = driver(initial(), { renameFailure: true })
  await run.activate()
  assert.ok(run.renameAttempts() > 1)
  assert.equal(run.mutations(), 1)
  assert.equal(run.report().errorCode, 'CORE_CONNECTION_UNAVAILABLE')
})

test('the automatic Helper window cannot start a second validation flow', async () => {
  const run = driver(initial(), { helper: true })
  await run.activate()
  assert.equal(run.mutations(), 0)
  assert.equal(run.renameAttempts(), 0)
})

const { prepareBuilderRetry } = require('./windows-vertical.cjs')
const uuid = '12345678-1234-1234-1234-123456789abc'
const digest = 'a'.repeat(64)
const receiptName = `receipt-${uuid}.json`
function failedBuilderReceipt() {
  const report = { ...initial(), status: 'FAIL', stage: 'BUILDER_INITIAL_WAITING',
    errorCode: 'NATIVE_RPC_TIMEOUT', nativeRequests: 6, productVersion: '0.3.2',
    projectId: `project_${uuid}`, backendInstanceId: 'previous-core', activatedHosts: 2,
    firstSpecRevision: 1, revisedSpecRevision: 2 }
  for (const key of ['PREVIEW', 'JIT_ENRICH', 'REFINE_ROUND', 'SPEC', 'SPEC_REVISE']) {
    report.steps[key] = { state: 'DONE', value: `run_${uuid}` }
    report.runs[key] = { status: 'SUCCEEDED', outcome: 'DURABLE_RESULT' }
  }
  report.steps.START_DISCOVERY = { state: 'DONE', value: report.projectId }
  report.steps.CONFIRM_SPEC = { state: 'DONE', value: true }
  report.steps.PREPARE_TASK = { state: 'DONE', value: { taskId: `task_${uuid}` } }
  report.steps.BUILDER_INITIAL = { state: 'DONE', value: `run_${uuid}` }
  report.runs.BUILDER_INITIAL = { id: `run_${uuid}`, status: 'FAILED', outcome: 'NONE',
    errorCode: 'NATIVE_RPC_TIMEOUT' }
  return report
}

test('known terminal Builder retry preserves the source and prior durable mutations', () => {
  const source = failedBuilderReceipt()
  source.maxObservedHostRssBytes = 123456
  source.hostMemoryAtStartBytes = 123000
  const original = JSON.stringify(source)
  const next = prepareBuilderRetry(source, digest, receiptName)
  assert.equal(JSON.stringify(source), original)
  assert.equal(next.stage, 'RETRY_VALIDATING')
  assert.equal(next.status, undefined)
  assert.equal(next.backendInstanceId, undefined)
  assert.equal(next.steps.BUILDER_INITIAL, undefined)
  assert.equal(next.runs.BUILDER_INITIAL, undefined)
  assert.deepEqual(next.steps.PREPARE_TASK, source.steps.PREPARE_TASK)
  assert.deepEqual(next.runs.SPEC_REVISE, source.runs.SPEC_REVISE)
  assert.equal(next.revisedSpecRevision, 2)
  assert.equal(next.nativeRequests, 6)
  assert.equal(next.maxObservedHostRssBytes, undefined)
  assert.equal(next.hostMemoryAtStartBytes, undefined)
  assert.equal(next.previousAttempts[0].memory.maxObservedBytes, 123456)
  assert.equal(next.retry.previousRunId, source.runs.BUILDER_INITIAL.id)
  assert.equal(next.retry.attempt, 1)
  assert.equal(next.previousAttempts[0].sourceDigest, digest)
  assert.deepEqual(next.previousAttempts[0].failedRun, source.runs.BUILDER_INITIAL)
})

test('unknown, active, inconsistent, or already advanced Builder attempts cannot be retried', () => {
  const changes = [
    source => { source.steps.BUILDER_INITIAL.state = 'STARTED' },
    source => { source.runs.BUILDER_INITIAL.status = 'RUNNING' },
    source => { source.runs.BUILDER_INITIAL.outcome = 'DURABLE_RESULT' },
    source => { source.steps.BUILDER_INITIAL.value = 'different-run' },
    source => { source.errorCode = 'CORE_CONNECTION_UNAVAILABLE' },
    source => { source.runs.SPEC_REVISE.status = 'FAILED' },
    source => { source.steps.CHOOSE_DECISION = { state: 'STARTED' } },
    source => { source.steps.BUILDER_APPLY = { state: 'DONE' } },
    source => { source.steps.START_DISCOVERY.value = 'different-project' },
    source => { source.steps.PREPARE_TASK.state = 'STARTED' },
    source => { source.previousAttempts = {} },
    source => { source.retry = { attempt: -1 } },
  ]
  for (const change of changes) {
    const source = failedBuilderReceipt()
    change(source)
    assert.throws(() => prepareBuilderRetry(source, digest, receiptName), /KNOWN_FAILED_BUILDER_RETRY_REQUIRED/)
  }
  for (const source of [null, {}, { status: 'FAIL' }])
    assert.throws(() => prepareBuilderRetry(source, digest, receiptName), /KNOWN_FAILED_BUILDER_RETRY_REQUIRED/)
})

test('retry lineage is bounded and requires a digest and a local receipt basename', () => {
  const source = failedBuilderReceipt()
  source.retry = { attempt: 1 }
  source.previousAttempts = [{}]
  assert.equal(prepareBuilderRetry(source, digest, receiptName).retry.attempt, 2)
  source.retry.attempt = 2
  source.previousAttempts.push({})
  assert.throws(() => prepareBuilderRetry(source, digest, receiptName), /KNOWN_FAILED_BUILDER_RETRY_REQUIRED/)
  for (const [hash, name] of [['invalid', receiptName], [digest, `../${receiptName}`]])
    assert.throws(() => prepareBuilderRetry(failedBuilderReceipt(), hash, name), /KNOWN_FAILED_BUILDER_RETRY_REQUIRED/)
})

const { verifyBuilderRetry } = require('./windows-vertical.cjs')
function retryClient(report, options = {}) {
  return {
    restoreProject: async () => ({
      project: { id: report.projectId },
      currentTask: { id: options.wrongTask ? 'changed-task' : report.retry.taskId },
      learningSpec: { status: 'CONFIRMED', revision: 2 },
      discoverySession: { input: { personalNeed: 'synthetic' } },
      decisions: options.decisions ?? [], completionReport: null,
    }),
    listRuns: async () => options.active ? [{ status: 'RUNNING' }] : [],
    getRun: async () => {
      if (options.error) throw new Error(options.error)
      return { ...report.previousAttempts[0].failedRun, projectId: report.projectId, kind: 'BUILDER',
        ...(options.running ? { status: 'RUNNING' } : {}) }
    },
  }
}

test('retry verifies live terminal state or a terminal receipt across a Core restart', async () => {
  const report = prepareBuilderRetry(failedBuilderReceipt(), digest, receiptName)
  assert.equal(await verifyBuilderRetry(retryClient(report), report, 'previous-core', true),
    'CURRENT_CORE_TERMINAL_RUN')
  assert.equal(await verifyBuilderRetry(retryClient(report, { error: 'RUN_NOT_FOUND_RESTORE_PROJECT' }),
    report, 'new-core', true), 'RECORDED_TERMINAL_RESPONSE_AND_RESTORED_PROJECT')
})

test('restart recovery rejects active, changed, missing-in-same-Core and unavailable states', async () => {
  const report = prepareBuilderRetry(failedBuilderReceipt(), digest, receiptName)
  for (const [options, instance] of [
    [{ error: 'RUN_NOT_FOUND_RESTORE_PROJECT' }, 'previous-core'],
    [{ error: 'CORE_CONNECTION_UNAVAILABLE' }, 'new-core'],
    [{ wrongTask: true }, 'new-core'],
    [{ decisions: [{}] }, 'new-core'],
    [{ active: true }, 'new-core'],
    [{ running: true }, 'previous-core'],
  ]) await assert.rejects(verifyBuilderRetry(retryClient(report, options), report, instance, true))
})

const { prepareBuildContinuation, verifyBuildContinuation } = require('./windows-vertical.cjs')
function incompleteBuildReceipt() {
  const value = failedBuilderReceipt()
  value.stage = 'BUILDER_APPLY_WAITING'
  value.errorCode = 'TASK_COMPLETION_NOT_RECORDED'
  value.nativeRequests = 10
  value.helperRecorded = true
  value.task = { id: 'task_' + uuid, status: 'ACTIVE', revision: 2, completion: false, decisionsApplied: 1 }
  value.runs.BUILDER_INITIAL = { id: 'run_' + uuid, status: 'SUCCEEDED', outcome: 'TURN_ENDED' }
  value.runs.HELPER_DECISION = { id: 'run_' + uuid, status: 'SUCCEEDED', outcome: 'HELPER_RECORDED' }
  value.runs.BUILDER_APPLY = { id: 'run_' + uuid, status: 'SUCCEEDED', outcome: 'TURN_ENDED' }
  value.steps.HELPER_DECISION = { state: 'DONE', value: 'run_' + uuid }
  value.steps.BUILDER_APPLY = { state: 'DONE', value: 'run_' + uuid }
  value.steps.CHOOSE_DECISION = { state: 'DONE', value: 'decision_' + uuid }
  value.steps.RESOLVE_DECISIONS = { state: 'DONE', value: true }
  return value
}

test('a bounded build continuation preserves acknowledged Decision and Helper work', () => {
  const source = incompleteBuildReceipt()
  const original = JSON.stringify(source)
  const next = prepareBuildContinuation(source, digest, receiptName)
  assert.equal(JSON.stringify(source), original)
  assert.equal(next.steps.BUILDER_APPLY, undefined)
  assert.deepEqual(next.steps.HELPER_DECISION, source.steps.HELPER_DECISION)
  assert.deepEqual(next.steps.RESOLVE_DECISIONS, source.steps.RESOLVE_DECISIONS)
  assert.equal(next.continuation.attempt, 1)
  assert.equal(next.continuation.sourceDigest, digest)
  assert.equal(next.continuation.priorRun.outcome, 'TURN_ENDED')
  for (const change of [
    value => { value.steps.BUILDER_APPLY.state = 'STARTED' },
    value => { value.runs.BUILDER_APPLY.status = 'RUNNING' },
    value => { value.task.completion = true },
    value => { value.helperRecorded = false },
    value => { value.continuation = { attempt: 1 } },
    value => { value.task.id = 'task_different' },
  ]) {
    const invalid = incompleteBuildReceipt()
    change(invalid)
    assert.throws(() => prepareBuildContinuation(invalid, digest, receiptName), /KNOWN_INCOMPLETE_BUILD_REQUIRED/)
  }
})

test('build continuation checks current task, decisions and no active run without replay', async () => {
  const report = prepareBuildContinuation(incompleteBuildReceipt(), digest, receiptName)
  const snapshot = { project: { id: report.projectId }, currentTask: { ...report.task },
    learningSpec: { status: 'CONFIRMED', revision: 2 }, discoverySession: { input: { personalNeed: 'synthetic' } },
    pendingDecisions: [], completionReport: null,
    decisions: [{ request: { id: report.steps.CHOOSE_DECISION.value }, application: {} }],
    helperConversations: [{ helperResponseSummaries: ['stored response'] }] }
  let active = false
  const client = { restoreProject: async () => snapshot,
    listRuns: async () => active ? [{ status: 'RUNNING' }] : [],
    getRun: async () => { throw new Error('RUN_NOT_FOUND_RESTORE_PROJECT') } }
  assert.equal(await verifyBuildContinuation(client, report, 'new-core', true),
    'RECORDED_INCOMPLETE_TURN_AND_RESTORED_TASK')
  await assert.rejects(verifyBuildContinuation(client, report, 'previous-core', true))
  active = true
  await assert.rejects(verifyBuildContinuation(client, report, 'new-core', true))
  active = false
  snapshot.currentTask.revision++
  await assert.rejects(verifyBuildContinuation(client, report, 'new-core', true))
})
