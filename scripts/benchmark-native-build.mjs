// Bounded synthetic Builder/Helper turn through program's actual ManagedAgentPort.
// This invokes Kiro and can consume credits. Never creates Agent results itself.
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { performance } from 'node:perf_hooks'
import { build } from 'esbuild'
import { connectLocalCore } from '../packages/frontend-client/dist/node.js'
import {
  nativeBenchmarkPromptMetadata,
  requireUnusedBenchmarkReport,
} from './native-benchmark-prompt-metadata.mjs'

const [connectionFile, programRoot, reportFile, action, projectId, usage, observedAt] =
  process.argv.slice(2)
const deadline = Date.parse('2026-09-28T00:00:00Z')
const fixture = process.env.VIBE_NATIVE_BENCHMARK_FIXTURE ?? 'unions'
if (!['unions', 'cancellation', 'deduplication', 'streaming'].includes(fixture))
  throw new Error('NATIVE_BENCHMARK_FIXTURE_INVALID')
if (
  !connectionFile ||
  !programRoot ||
  !reportFile ||
  !projectId ||
  !['builder', 'resume', 'helper'].includes(action)
)
  throw new Error('NATIVE_BENCHMARK_ARGUMENTS_REQUIRED')
await requireUnusedBenchmarkReport(resolve(reportFile))
if (Date.now() >= deadline - 60_000) throw new Error('NATIVE_BENCHMARK_DEADLINE')
if (
  !Number.isFinite(Number(usage)) ||
  Number(usage) < 0 ||
  Number(usage) >= 880 ||
  !Number.isFinite(Date.parse(observedAt)) ||
  Date.parse(observedAt) > Date.now() ||
  Date.now() - Date.parse(observedAt) > 15 * 60_000
)
  throw new Error('NATIVE_BENCHMARK_FRESH_CREDIT_CHECK_REQUIRED')
const stage = await mkdtemp(join(tmpdir(), 'vibe-native-build-port-'))
await build({
  entryPoints: [join(resolve(programRoot), 'src/adapter/agent/managed-agent-port.ts')],
  outfile: join(stage, 'port.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node24',
})
const { ManagedAgentPort } = createRequire(import.meta.url)(join(stage, 'port.cjs'))
const client = await connectLocalCore(resolve(connectionFile))
assert.equal((await client.health()).agent, 'KIRO_IDE_BUILTIN_AGENT')
// These methods use only CoreClient. NativeQuestion/worker methods are not
// substituted; they are intentionally outside this command-line measurement.
const port = new ManagedAgentPort(client, undefined)
const unwrap = (result) => {
  if (!result.ok)
    throw new Error(
      /^[A-Z0-9_]{1,100}$/.test(result.error.raw) ? result.error.raw : 'FRONTEND_PORT_FAILED',
    )
  return result.value
}
const lines = async (file) =>
  (await readFile(file, 'utf8').catch(() => ''))
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))
const root = dirname(resolve(connectionFile))
const receiptPath = join(root, 'native-core-receipts.jsonl')
const receiptOffset = (await lines(receiptPath)).length
const before = unwrap(await port.snapshot(projectId))
assert.ok(before.currentTask)
const builderAction = action === 'builder' || action === 'resume'
const input =
  action === 'resume'
    ? ''
    : action === 'builder'
      ? '확정된 Spec의 로컬 웹 앱을 구현하고 실제 build, test, smoke 검증을 수행해 주세요. 로그인·외부 서버·데이터 내보내기는 제외합니다. 의미 있는 선택이 필요하면 Core Decision으로 질문해 주세요.'
      : fixture === 'unions'
        ? '현재 코드에서 판별 유니온이 어떤 잘못된 상태 조합을 막는지, 런타임 입력 검증과는 어떻게 다른지 실제 코드 근거와 함께 설명해 주세요. 코드 수정은 하지 마세요.'
        : '현재 코드에서 학습 목표의 핵심 개념을 어디에 쓰고 있고 어떤 이점과 한계가 있는지 실제 코드 근거와 함께 설명해 주세요. 아직 구현되지 않았다면 그 사실을 구분해 주세요. 코드 수정은 하지 마세요.'
const startedAt = new Date().toISOString()
const began = performance.now()
const elapsed = () => performance.now() - began
const abort = new AbortController()
const events = []
const timings = {}
let run,
  terminal,
  errorCode,
  timedOut = false
let lastReport = began
const timer = setTimeout(
  () => {
    timedOut = true
    abort.abort()
    if (run) void port.cancel(run.id)
  },
  Math.min(builderAction ? 480_000 : 240_000, deadline - Date.now()),
)
try {
  if (builderAction) {
    const binding = unwrap(await port.prepareBuilder(projectId))
    run = unwrap(await port.startBuilder({ projectId, ...binding, message: input }))
  } else {
    run = unwrap(
      await port.startHelper({
        projectId,
        taskId: before.currentTask.id,
        message: input,
        origin: 'FREE_TEXT',
      }),
    )
  }
  timings.acceptedMs = elapsed()
  console.log(JSON.stringify({ status: 'ACCEPTED', action, runId: run.id, projectId }))
  terminal = unwrap(
    await port.watch(run.id, {
      signal: abort.signal,
      onEvent(event) {
        timings.firstEventMs ??= elapsed()
        if (event.kind === 'TEXT') timings.firstTextMs ??= elapsed()
        events.push({ atMs: elapsed(), event })
        if (performance.now() - lastReport >= 15_000) {
          lastReport = performance.now()
          console.log(
            JSON.stringify({
              status: 'RUNNING',
              action,
              elapsedMs: elapsed(),
              eventCount: events.length,
            }),
          )
        }
      },
      onRun(value) {
        terminal = value
      },
    }),
  )
  if (terminal.status !== 'SUCCEEDED') errorCode = terminal.errorCode ?? terminal.status
} catch (error) {
  errorCode = timedOut
    ? 'NATIVE_BENCHMARK_TIMEOUT'
    : /^[A-Z0-9_]{1,100}$/.test(error?.message ?? '')
      ? error.message
      : 'NATIVE_BENCHMARK_FAILED'
  if (run) await port.cancel(run.id)
} finally {
  clearTimeout(timer)
}
const after = unwrap(await port.snapshot(projectId))
const report = {
  kind: 'SYNTHETIC_ACTUAL_PROGRAM_NATIVE_BUILD_ACTION',
  startedAt,
  completedAt: new Date().toISOString(),
  action,
  fixture,
  projectId,
  input,
  observedCumulativeCredits: Number(usage),
  observedCreditsAt: observedAt,
  status: errorCode ? 'FAILED' : 'PASS',
  nativePrompts: builderAction
    ? await nativeBenchmarkPromptMetadata(
        join(root, 'workspaces/projects', projectId),
        'BUILDER',
        startedAt,
      )
    : [],
  ...(errorCode ? { errorCode } : {}),
  durationMs: elapsed(),
  timings,
  run: run ? await client.getRun(run.id) : null,
  beforeTask: before.currentTask,
  afterTask: after.currentTask,
  snapshot: after,
  events,
  worker: (await lines(join(root, 'native-worker-status.jsonl'))).filter(
    (event) => event.updatedAt >= startedAt,
  ),
  receipts: (await lines(receiptPath)).slice(receiptOffset),
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
    errorCode,
    taskStatus: after.currentTask?.status,
    run: report.run,
  }),
)
if (errorCode) process.exitCode = 1
