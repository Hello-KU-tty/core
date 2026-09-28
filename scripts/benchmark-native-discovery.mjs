// One bounded synthetic action through the actual program port and real native Core.
// Never substitutes Agent output. Starting this script can consume Kiro credits.
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { performance } from 'node:perf_hooks'
import { build } from 'esbuild'
import { connectLocalCore } from '../packages/frontend-client/dist/node.js'
import { entityId, uiMetadata } from '../packages/frontend-client/dist/index.js'
import {
  nativeBenchmarkPromptMetadata,
  requireUnusedBenchmarkReport,
} from './native-benchmark-prompt-metadata.mjs'

const [
  connectionFile,
  programRoot,
  reportFile,
  action,
  suppliedProjectId,
  observedUsage,
  observedAt,
] = process.argv.slice(2)
const deadline = Date.parse('2026-09-28T00:00:00Z')
if (
  !connectionFile ||
  !programRoot ||
  !reportFile ||
  !['preview', 'select', 'spec', 'refine', 'confirm', 'prepare'].includes(action)
)
  throw new Error('NATIVE_BENCHMARK_ARGUMENTS_REQUIRED')
await requireUnusedBenchmarkReport(resolve(reportFile))
if (Date.now() >= deadline - 60_000) throw new Error('NATIVE_BENCHMARK_DEADLINE')
if (
  !Number.isFinite(Number(observedUsage)) ||
  Number(observedUsage) < 0 ||
  Number(observedUsage) >= 880 ||
  !Number.isFinite(Date.parse(observedAt)) ||
  Date.now() - Date.parse(observedAt) > 15 * 60_000 ||
  Date.parse(observedAt) > Date.now()
)
  throw new Error('NATIVE_BENCHMARK_FRESH_CREDIT_CHECK_REQUIRED')
const fixtures = {
  unions: {
    learningGoal:
      'TypeScript의 판별 유니온으로 잘못된 상태 전이를 방지하는 실용적인 앱을 만들고 싶다.',
    personalNeed: '동아리 장비 대여와 반납 현황을 내 컴퓨터에서 정리하고 싶다.',
    currentLevel: 'BEGINNER',
    interestAreas: ['동아리 활동', '생활 도구'],
  },
  cancellation: {
    learningGoal:
      'TypeScript와 AbortController를 사용해 비동기 작업 취소를 안전하게 처리하는 앱을 만들고 싶다.',
    currentLevel: 'BEGINNER',
    interestAreas: ['로컬 생산성 도구'],
  },
  deduplication: {
    learningGoal:
      'TypeScript의 Map과 Set을 활용해 중복 데이터와 빠른 조회를 다루는 실용적인 앱을 만들고 싶다.',
    personalNeed:
      '모임 신청 명단을 여러 번 받아도 중복 참가자와 변경된 내용을 내 컴퓨터에서 쉽게 확인하고 싶다.',
    currentLevel: 'BEGINNER',
    interestAreas: ['소규모 모임 운영', '생활 도구'],
  },
  streaming: {
    learningGoal:
      'TypeScript의 제너레이터와 이터레이터로 많은 데이터를 필요한 만큼만 처리하는 앱을 만들고 싶다.',
    currentLevel: 'BEGINNER',
    interestAreas: ['로컬 생산성 도구'],
  },
}
const selectedFixture = process.env.VIBE_NATIVE_BENCHMARK_FIXTURE ?? 'unions'
if (!Object.hasOwn(fixtures, selectedFixture)) throw new Error('NATIVE_BENCHMARK_FIXTURE_INVALID')
const stage = await mkdtemp(join(tmpdir(), 'vibe-native-port-'))
await build({
  entryPoints: [join(resolve(programRoot), 'src/adapter/flow/local-core-port.ts')],
  outfile: join(stage, 'port.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node24',
})
const { LocalCoreDiscoveryPort } = createRequire(import.meta.url)(join(stage, 'port.cjs'))
const client = await connectLocalCore(resolve(connectionFile))
assert.equal((await client.health()).agent, 'KIRO_IDE_BUILTIN_AGENT')
const startedAt = new Date().toISOString()
const began = performance.now()
const elapsed = () => performance.now() - began
const abort = new AbortController()
const acceptedRuns = []
const events = []
const timers = {}
let projectId = suppliedProjectId || null
const receiptPath = join(dirname(resolve(connectionFile)), 'native-core-receipts.jsonl')
const lines = async (file) =>
  (await readFile(file, 'utf8').catch(() => ''))
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))
const receiptOffset = (await lines(receiptPath)).length
const instrumented = new Proxy(client, {
  get(target, property) {
    if (property === 'startDiscovery')
      return async (...args) => {
        if (abort.signal.aborted) throw new Error('NATIVE_BENCHMARK_CANCELLED')
        const result = await target.startDiscovery(...args)
        projectId = result.projectId
        acceptedRuns.push(result.run)
        timers.acceptedMs ??= elapsed()
        return result
      }
    if (property === 'startRun')
      return async (...args) => {
        if (abort.signal.aborted) throw new Error('NATIVE_BENCHMARK_CANCELLED')
        if (acceptedRuns.length >= 1) throw new Error('NATIVE_BENCHMARK_RUN_LIMIT')
        const result = await target.startRun(...args)
        acceptedRuns.push(result)
        timers.acceptedMs ??= elapsed()
        return result
      }
    if (property === 'watchRun')
      return (id, onEvent, options = {}) =>
        target.watchRun(
          id,
          (event) => {
            const atMs = elapsed()
            timers.firstEventMs ??= atMs
            if (event.kind === 'TEXT') timers.firstTextMs ??= atMs
            if (
              event.kind === 'TOOL' &&
              event.update?.coreSuccess === true &&
              /^DISCOVERY_SUBMIT_/.test(event.update.coreAction ?? '')
            )
              timers.durableToolObservedMs ??= atMs
            events.push({
              atMs,
              kind: event.kind,
              ...(event.text ? { textChars: event.text.length } : {}),
              ...(event.run
                ? { phase: event.run.phase, status: event.run.status, outcome: event.run.outcome }
                : {}),
              ...(event.kind === 'TOOL'
                ? {
                    coreAction: event.update?.coreAction,
                    envelopeInputAction: event.update?.envelopeInputAction,
                    coreSuccess: event.update?.coreSuccess,
                    coreIsError: event.update?.coreIsError,
                    coreErrorCode: event.update?.coreErrorCode,
                    bridgeErrorCode: event.update?.bridgeErrorCode,
                    validationFieldMentions: event.update?.validationFieldMentions,
                    validationIssueKinds: event.update?.validationIssueKinds,
                    status: event.update?.nativeStatus,
                  }
                : {}),
            })
            onEvent(event)
          },
          {
            ...options,
            signal: options.signal ? AbortSignal.any([options.signal, abort.signal]) : abort.signal,
          },
        )
    const value = Reflect.get(target, property, target)
    return typeof value === 'function' ? value.bind(target) : value
  },
})
const cancelOwnedRuns = async () =>
  Promise.allSettled(acceptedRuns.map((run) => client.cancelRun(run.id)))
const timer = setTimeout(
  () => {
    abort.abort()
    void cancelOwnedRuns()
  },
  Math.min(360_000, deadline - Date.now()),
)
const port = new LocalCoreDiscoveryPort(instrumented)
const envelope = (revision) => ({
  ...uiMetadata(),
  idempotencyKey: entityId('idem'),
  expectedRevision: revision,
})
const unwrap = (result) => {
  if (!result.ok)
    throw new Error(
      /^[A-Z0-9_]{1,100}$/.test(result.error.message)
        ? result.error.message
        : 'FRONTEND_PORT_FAILED',
    )
  return result.value
}
let value, errorCode
try {
  if (action === 'preview') {
    const session = unwrap(
      await port.startDiscovery(
        { projectId: 'SDK_OWNS_ID', input: fixtures[selectedFixture] },
        envelope(0),
      ),
    )
    value = unwrap(
      await port.generatePreviewRound(
        { discoverySessionId: session.id },
        envelope(session.revision),
      ),
    )
    assert.equal(value.previews.length, 10)
  } else {
    assert.ok(projectId, 'PROJECT_REQUIRED')
    unwrap(await port.restoreProject(projectId, envelope(0)))
    const snapshot = await client.restoreProject(projectId)
    const session = snapshot.discoverySession
    const preview = snapshot.discoveryContext?.previewRound?.previews[0]
    const spec = snapshot.learningSpec
    if (action === 'select') {
      assert.ok(session && preview)
      value = unwrap(
        await port.submitFeedback(
          {
            discoverySessionId: session.id,
            feedback: {
              id: entityId('feedback'),
              intent: 'SELECT',
              targets: [{ candidateId: preview.candidateId, revision: 1 }],
            },
          },
          envelope(session.revision),
        ),
      )
    } else if (action === 'spec') {
      assert.ok(snapshot.selectedCandidate)
      value = unwrap(
        await port.generateSpecDraft(
          {
            projectId,
            selectedCandidate: {
              candidateId: snapshot.selectedCandidate.id,
              revision: snapshot.selectedCandidate.revision,
            },
          },
          envelope(0),
        ),
      )
    } else if (action === 'refine') {
      assert.ok(spec)
      value = unwrap(
        await port.refineSpec(
          {
            projectId,
            learningSpecId: spec.id,
            message:
              '초기 버전은 로그인과 외부 서버 없이 이 컴퓨터에서만 사용하고, 데이터 내보내기는 다음 버전으로 제외해 주세요.',
          },
          envelope(spec.revision),
        ),
      )
      assert.equal(value.revision, spec.revision + 1)
    } else if (action === 'confirm') {
      assert.ok(spec)
      value = unwrap(
        await port.confirmSpec({ projectId, learningSpecId: spec.id }, envelope(spec.revision)),
      )
    } else if (action === 'prepare') {
      assert.ok(spec)
      const prepared = unwrap(
        await port.prepareBuilderTask(
          { projectId, learningSpecId: spec.id },
          envelope(spec.revision),
        ),
      )
      const durable = await client.restoreProject(projectId)
      assert.ok(durable.currentTask)
      assert.equal(durable.currentTask.learningSpecId, spec.id)
      assert.equal(durable.learningSpec.status, 'CONFIRMED')
      value = {
        taskId: durable.currentTask.id,
        taskRevision: durable.currentTask.revision,
        projectId: prepared.projectId,
        status: prepared.status,
      }
    }
  }
} catch (error) {
  errorCode = /^[A-Z0-9_]{1,100}$/.test(error?.message ?? '')
    ? error.message
    : 'NATIVE_BENCHMARK_FAILED'
  abort.abort()
  await cancelOwnedRuns()
} finally {
  clearTimeout(timer)
}
const worker = await lines(join(dirname(resolve(connectionFile)), 'native-worker-status.jsonl'))
const runs = await Promise.all(acceptedRuns.map((run) => client.getRun(run.id)))
const report = {
  kind: 'SYNTHETIC_ACTUAL_PROGRAM_NATIVE_ACTION',
  startedAt,
  completedAt: new Date().toISOString(),
  action,
  fixture: selectedFixture,
  input: fixtures[selectedFixture],
  projectId,
  observedCumulativeCredits: Number(observedUsage),
  observedCreditsAt: observedAt,
  status: errorCode ? 'FAILED' : 'PASS',
  nativePrompts: await nativeBenchmarkPromptMetadata(
    join(dirname(resolve(connectionFile)), 'workspaces'),
    'DISCOVERY',
    startedAt,
  ),
  ...(errorCode ? { errorCode } : {}),
  durationMs: elapsed(),
  timers,
  runs,
  events,
  worker: worker.filter((event) => event.updatedAt >= startedAt),
  receipts: (await lines(receiptPath)).slice(receiptOffset),
  value,
}
await writeFile(resolve(reportFile), `${JSON.stringify(report, null, 2)}\n`, {
  mode: 0o600,
  flag: 'wx',
})
console.log(
  JSON.stringify({
    status: report.status,
    action,
    projectId,
    durationMs: report.durationMs,
    timers,
    runs: runs.map(({ id, phase, status, outcome, errorCode }) => ({
      id,
      phase,
      status,
      outcome,
      errorCode,
    })),
    ...(errorCode ? { errorCode } : {}),
  }),
)
if (errorCode) process.exitCode = 1
