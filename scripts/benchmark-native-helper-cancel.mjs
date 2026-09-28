// One synthetic Helper call, or a two-call explicit queued-retry probe.
// Uses program's real port. This can consume Kiro credits; never fabricates an answer.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { setTimeout as delay } from 'node:timers/promises'
import { build } from 'esbuild'
import { uiMetadata } from '../packages/frontend-client/dist/index.js'
import { connectLocalCore } from '../packages/frontend-client/dist/node.js'
import { requireUnusedBenchmarkReport } from './native-benchmark-prompt-metadata.mjs'
import {
  assertHelperEndpointObservations,
  assertQueuedHelperObservation,
  inspectNativeHelperCancellation,
} from './native-helper-cancel-observation.mjs'

const [connectionFile, programRoot, reportFile, projectId, usage, observedAt, retryMode] =
  process.argv.slice(2)
const deadline = Date.parse('2026-09-28T00:00:00Z')
if (
  !connectionFile ||
  !programRoot ||
  !reportFile ||
  !/^project_[0-9a-f-]{36}$/.test(projectId ?? '')
)
  throw new Error('NATIVE_CANCEL_BENCHMARK_ARGUMENTS_REQUIRED')
if (retryMode !== undefined && retryMode !== '--queue-retry')
  throw new Error('NATIVE_CANCEL_RETRY_MODE_INVALID')
const queueRetry = retryMode === '--queue-retry'
await requireUnusedBenchmarkReport(resolve(reportFile))
if (Date.now() >= deadline - 180_000) throw new Error('NATIVE_BENCHMARK_DEADLINE')
if (
  !Number.isFinite(Number(usage)) ||
  Number(usage) < 0 ||
  Number(usage) >= 880 ||
  !Number.isFinite(Date.parse(observedAt)) ||
  Date.parse(observedAt) > Date.now() ||
  Date.now() - Date.parse(observedAt) > 15 * 60_000
)
  throw new Error('NATIVE_BENCHMARK_FRESH_CREDIT_CHECK_REQUIRED')

const stage = await mkdtemp(join(tmpdir(), 'vibe-native-cancel-port-'))
await build({
  entryPoints: [join(resolve(programRoot), 'src/adapter/agent/managed-agent-port.ts')],
  outfile: join(stage, 'port.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node24',
})
const require = createRequire(import.meta.url)
const { ManagedAgentPort } = require(join(stage, 'port.cjs'))
const {
  assertNativeCoreIdle,
} = require('../examples/kiro-panel/src/native-helper-ablation-idle.cjs')
const client = await connectLocalCore(resolve(connectionFile))
assert.equal((await client.health()).agent, 'KIRO_IDE_BUILTIN_AGENT')
const port = new ManagedAgentPort(client, undefined)
const unwrap = (result) => {
  if (!result.ok)
    throw new Error(
      /^[A-Z0-9_]{1,100}$/.test(result.error.raw) ? result.error.raw : 'FRONTEND_PORT_FAILED',
    )
  return result.value
}
const root = dirname(resolve(connectionFile))
const lines = async (file) =>
  (await readFile(file, 'utf8').catch(() => ''))
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))
const workerPath = join(root, 'native-worker-status.jsonl')
const endpointPath = join(root, 'native-host-endpoints.jsonl')
const workerOffset = (await lines(workerPath)).length
const endpointOffset = (await lines(endpointPath)).length
const before = unwrap(await port.snapshot(projectId))
assert.ok(before.currentTask)
await assertNativeCoreIdle(client, projectId, before.currentTask.id, uiMetadata)
const beforeEvidence = await client.execute({
  ...uiMetadata(),
  kind: 'UI_READ_EVIDENCE_TRACE',
  projectId,
})
const startedAt = new Date().toISOString()
const began = performance.now()
const elapsed = () => performance.now() - began
const input =
  '현재 코드에서 학습 목표의 핵심 개념이 어떻게 동작하는지, 실제 코드 근거와 한계까지 단계별로 설명해 주세요. 코드나 결정을 변경하지 마세요.'
const events = []
const timings = {}
const abort = new AbortController()
const recoveryInput =
  '새 요청입니다. 현재 구현의 학습 목표 핵심 개념 한 가지를 실제 코드와 연결해 간단히 설명해 주세요. 코드나 결정을 변경하지 마세요.'
const recoveryEvents = []
let recoveryRun, recoveryTerminal, recoverySnapshot, queueOrder
let run,
  cancelled,
  terminal,
  cancellation,
  errorCode,
  nativeConfirmed = false
let after
let evidenceCheck
let durableFieldsUnchanged = false
let recoveryAnalysis
let cancellationObservation
let endpointObservation
const verifyCancelledCheckpoint = async () => {
  after = unwrap(await port.snapshot(projectId))
  for (const key of [
    'project',
    'currentTask',
    'liveContext',
    'decisions',
    'completionReport',
    'helperConversations',
  ])
    assert.deepEqual(after[key], before[key])
  const afterEvidence = await client.execute({
    ...uiMetadata(),
    kind: 'UI_READ_EVIDENCE_TRACE',
    projectId,
  })
  assert.deepEqual(afterEvidence.concepts, beforeEvidence.concepts)
  assert.deepEqual(afterEvidence.analysis, beforeEvidence.analysis)
  // Context-only personalization traces are not accepted learning Evidence.
  evidenceCheck = {
    acceptedAndRejectedEvidenceUnchanged: true,
    analysisUnchanged: true,
    beforePersonalizationTraces: beforeEvidence.personalization.length,
    afterPersonalizationTraces: afterEvidence.personalization.length,
  }
  durableFieldsUnchanged = true
}
const requestCancellation = (reason) => {
  if (cancellation || !run) return
  timings.cancelRequestedMs = elapsed()
  cancellation = port.cancel(run.id).then(async (result) => {
    cancelled = unwrap(result)
    timings.cancelAcknowledgedMs = elapsed()
    console.log(
      JSON.stringify({
        status: 'CORE_CANCEL_RESULT',
        runId: run.id,
        statusAfterCancel: cancelled.status,
        elapsedMs: elapsed(),
        reason,
      }),
    )
    if (queueRetry && reason === 'FIRST_NATIVE_TEXT' && cancelled.status === 'CANCELLED') {
      if (
        abort.signal.aborted ||
        Date.now() >= deadline - 60_000 ||
        Date.now() - Date.parse(observedAt) > 15 * 60_000
      )
        throw new Error('NATIVE_RETRY_BUDGET_EXPIRED')
      timings.retryRequestedMs = elapsed()
      recoveryRun = unwrap(
        await port.startHelper({
          projectId,
          taskId: before.currentTask.id,
          message: recoveryInput,
          origin: 'FREE_TEXT',
        }),
      )
      timings.retryAcceptedMs = elapsed()
      console.log(
        JSON.stringify({ status: 'RETRY_QUEUED', runId: recoveryRun.id, elapsedMs: elapsed() }),
      )
      // Keep the read audit from delaying the intended queue-overlap stimulus.
      // If the new answer already completed, checkpoint equality fails safely.
      await verifyCancelledCheckpoint()
    }
    return cancelled
  })
  // The rejected Promise is still checked below; avoid an unhandled rejection
  // while watchRun is waiting for its terminal event.
  void cancellation.catch(() => abort.abort())
}
const watchdog = setTimeout(() => {
  requestCancellation('DEADLINE')
  if (recoveryRun) void port.cancel(recoveryRun.id)
  abort.abort()
}, 120_000)
try {
  run = unwrap(
    await port.startHelper({
      projectId,
      taskId: before.currentTask.id,
      message: input,
      origin: 'FREE_TEXT',
    }),
  )
  console.log(JSON.stringify({ status: 'ACCEPTED', runId: run.id, projectId }))
  terminal = unwrap(
    await port.watch(run.id, {
      signal: abort.signal,
      onEvent(event) {
        events.push({ atMs: elapsed(), event })
        if (event.kind === 'TEXT' && event.text.trim() && timings.firstTextMs === undefined) {
          timings.firstTextMs = elapsed()
          requestCancellation('FIRST_NATIVE_TEXT')
        }
      },
      onRun(value) {
        terminal = value
      },
    }),
  )
  if (!cancellation || timings.firstTextMs === undefined)
    throw new Error('NATIVE_CANCEL_NOT_DURING_RESPONSE')
  await cancellation
  assert.equal(cancelled.status, 'CANCELLED')
  assert.equal(terminal.status, 'CANCELLED')
  assert.equal(terminal.outcome, 'NONE')
  const confirmationDeadline = Math.min(deadline, Date.now() + 30_000)
  while (Date.now() < confirmationDeadline) {
    const worker = (await lines(workerPath)).slice(workerOffset)
    cancellationObservation = inspectNativeHelperCancellation(worker, run.createdAt)
    if (cancellationObservation) {
      nativeConfirmed = true
      timings.nativeConfirmedMs = elapsed()
      break
    }
    await delay(100)
  }
  if (!nativeConfirmed) throw new Error('NATIVE_CANCEL_CONFIRMATION_TIMEOUT')
  if (queueRetry) {
    assert.ok(recoveryRun)
    recoveryTerminal = unwrap(
      await port.watch(recoveryRun.id, {
        signal: abort.signal,
        onEvent(event) {
          recoveryEvents.push({ atMs: elapsed(), event })
        },
        onRun(value) {
          recoveryTerminal = value
        },
      }),
    )
    assert.equal(recoveryTerminal.status, 'SUCCEEDED')
    assert.equal(recoveryTerminal.outcome, 'HELPER_RECORDED')
    recoverySnapshot = unwrap(await port.snapshot(projectId))
    const newConversations = recoverySnapshot.helperConversations.filter(
      (item) =>
        !before.helperConversations.some((old) => old.conversationId === item.conversationId),
    )
    assert.equal(newConversations.length, 1)
    assert.deepEqual(newConversations[0].redactedUserExcerpts, [recoveryInput])
    assert.deepEqual(recoverySnapshot.currentTask, before.currentTask)
    assert.deepEqual(recoverySnapshot.decisions, before.decisions)
    const worker = (await lines(workerPath)).slice(workerOffset)
    queueOrder = assertQueuedHelperObservation(worker, run.createdAt, recoveryRun.createdAt)
    // The completed Helper legitimately schedules an Analyst. Wait only for
    // this probe's new Episode; unrelated work still fails the global idle audit.
    const analysisDeadline = Math.min(deadline, Date.now() + 60_000)
    while (!abort.signal.aborted && Date.now() < analysisDeadline) {
      const jobs = await client.execute({
        ...uiMetadata(),
        kind: 'UI_READ_ANALYSIS_JOBS',
        projectId,
        limit: 100,
      })
      recoveryAnalysis = jobs.filter((job) => job.episodeId === newConversations[0].episodeId)
      if (recoveryAnalysis.some((job) => job.status === 'FAILED'))
        throw new Error('NATIVE_RETRY_ANALYST_FAILED')
      if (
        recoveryAnalysis.length > 0 &&
        recoveryAnalysis.every((job) => job.status === 'SUCCEEDED')
      )
        break
      await delay(250)
    }
    if (!recoveryAnalysis?.length || !recoveryAnalysis.every((job) => job.status === 'SUCCEEDED'))
      throw new Error('NATIVE_RETRY_ANALYST_NOT_TERMINAL')
  } else {
    await verifyCancelledCheckpoint()
  }
  const endpoints = (await lines(endpointPath)).slice(endpointOffset)
  endpointObservation = assertHelperEndpointObservations(
    endpoints,
    run.createdAt,
    recoveryRun?.createdAt,
  )
  await assertNativeCoreIdle(client, projectId, before.currentTask.id, uiMetadata)
} catch (error) {
  errorCode = /^[A-Z0-9_]{1,100}$/.test(error?.code ?? error?.message ?? '')
    ? (error.code ?? error.message)
    : 'NATIVE_CANCEL_BENCHMARK_FAILED'
  requestCancellation('PROBE_FAILURE')
  await cancellation?.catch(() => undefined)
  if (recoveryRun) await port.cancel(recoveryRun.id).catch(() => undefined)
} finally {
  clearTimeout(watchdog)
}
const report = {
  kind: 'SYNTHETIC_ACTUAL_PROGRAM_NATIVE_HELPER_CANCEL',
  status: errorCode ? 'FAILED' : 'PASS',
  ...(errorCode ? { errorCode } : {}),
  startedAt,
  completedAt: new Date().toISOString(),
  durationMs: elapsed(),
  observedCumulativeCredits: Number(usage),
  observedCreditsAt: observedAt,
  projectId,
  input,
  timings,
  nativeConfirmed,
  cancellationObservation,
  endpointObservation,
  evidenceCheck,
  queueRetry,
  queueOrder,
  recoveryRun,
  recoveryTerminal,
  recoveryAnalysis,
  recoveryEvents,
  recoveryHelperConversationIds: recoverySnapshot?.helperConversations.map(
    (item) => item.conversationId,
  ),
  canonicalHelperPromptSha256: createHash('sha256')
    .update(await readFile(new URL('../docs/agent-prompts/helper.md', import.meta.url)))
    .digest('hex'),
  claimBoundary:
    'Canonical source hash only, not a composed native prompt hash. Global-idle isolated-worker log ordering, not a job-bound typed native ACK. One synthetic cancellation, not universal race freedom or Windows validation.',
  run: run ? await client.getRun(run.id) : null,
  cancelled,
  terminal,
  events,
  durableFieldsUnchanged,
  beforeHelperConversationIds: before.helperConversations.map((item) => item.conversationId),
  afterHelperConversationIds: after?.helperConversations.map((item) => item.conversationId),
  worker: (await lines(workerPath)).slice(workerOffset),
  endpoints: (await lines(endpointPath)).slice(endpointOffset),
}
await writeFile(resolve(reportFile), `${JSON.stringify(report, null, 2)}\n`, {
  mode: 0o600,
  flag: 'wx',
})
console.log(
  JSON.stringify({
    status: report.status,
    errorCode,
    nativeConfirmed,
    timings,
    durationMs: report.durationMs,
    run: report.run,
  }),
)
if (errorCode) process.exitCode = 1
