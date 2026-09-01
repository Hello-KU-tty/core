import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  ApplicationService,
  redactSensitiveText,
  WorkspacePathPolicy,
} from '../packages/application/dist/index.js'
import {
  activityEventSchema,
  analysisJobSchema,
  episodeSchema,
  projectSchema,
} from '../packages/contracts/dist/index.js'
import {
  EvidenceAnalystJobAdapter,
  parseEvidenceAnalystResult,
} from '../packages/kiro-adapter/dist/index.js'
import { loadEvidenceAnalystAgentDefinition } from '../packages/kiro-adapter/dist/evidence-analyst-prompt-node.js'
import { openSqliteStorage } from '../packages/storage-sqlite/dist/index.js'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const kiroCli = process.env.VIBE_HELPER_KIRO_CLI ?? 'kiro-cli'
const liveModel = process.env.VIBE_HELPER_LIVE_EVAL_MODEL ?? 'claude-haiku-4.5'
const liveEffort = process.env.VIBE_HELPER_LIVE_EVAL_EFFORT ?? 'low'
const timeoutMs = Number(process.env.VIBE_HELPER_LIVE_EVAL_TIMEOUT_MS ?? 600_000)
if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 60_000 || timeoutMs > 1_200_000) {
  throw new TypeError('VIBE_HELPER_LIVE_EVAL_TIMEOUT_MS must be 60000..1200000')
}

const runtimeRoot = await mkdtemp(join(tmpdir(), 'vibe-helper-t13-evidence-analyst-'))
const dataDirectory = join(runtimeRoot, 'data')
const workspaceRoot = join(runtimeRoot, 'generated-workspaces')
const agentWorkspace = join(runtimeRoot, 'agent-workspace')
await Promise.all([
  mkdir(dataDirectory, { recursive: true }),
  mkdir(workspaceRoot, { recursive: true }),
  mkdir(join(agentWorkspace, '.kiro', 'agents'), { recursive: true }),
])

const subject = JSON.parse(
  await readFile(
    join(repositoryRoot, 'tests/eval/fixtures/prompt-regressions/evidence-analyst-v1.0-mixed.json'),
    'utf8',
  ),
)
const seededEpisode = episodeSchema.parse({ ...subject.episode, taskId: undefined })
const seededEvents = activityEventSchema
  .array()
  .parse(subject.analystInteraction.events.map((event) => ({ ...event, taskId: undefined })))
const seededAt = seededEpisode.endedAt
const project = projectSchema.parse({
  schemaVersion: 1,
  id: seededEpisode.projectId,
  correlationId: seededEpisode.correlationId,
  revision: 1,
  title: 'Webhook Lens Analyst Fixture',
  learningGoal: 'Apply runtime validation without false mastery.',
  status: 'BUILDING',
  createdAt: seededEpisode.startedAt,
  updatedAt: seededAt,
  source: { kind: 'USER' },
  redactionStatus: 'VERIFIED_REDACTED',
})
const pendingJob = analysisJobSchema.parse({
  schemaVersion: 1,
  id: 'analysis_job_22000000-0000-4000-8000-000000000231',
  projectId: project.id,
  episodeId: seededEpisode.id,
  episodeRevision: seededEpisode.revision,
  correlationId: project.correlationId,
  revision: 1,
  status: 'PENDING',
  attempt: 0,
  maxAttempts: 2,
  timeoutMs: 30_000,
  createdAt: seededAt,
  updatedAt: seededAt,
  source: { kind: 'CORE' },
  redactionStatus: 'VERIFIED_REDACTED',
})

const storage = await openSqliteStorage({ dataDirectory })
storage.transaction((repository) => {
  repository.appendProject(project)
  for (const event of seededEvents) repository.appendActivityEvent(event)
  for (let revision = 1; revision < seededEpisode.revision; revision += 1) {
    repository.appendEpisode(
      episodeSchema.parse({
        ...seededEpisode,
        revision,
        status: 'OPEN',
        eventIds: seededEpisode.eventIds.slice(0, revision),
        endedAt: undefined,
        closeReason: undefined,
      }),
    )
  }
  repository.appendEpisode(seededEpisode)
  repository.appendAnalysisJob(pendingJob)
})
const workspacePolicy = await WorkspacePathPolicy.create(workspaceRoot)
let generatedSequence = 240
const application = new ApplicationService({
  storage,
  workspacePolicy,
  now: () => new Date('2026-09-02T00:00:05.000Z'),
  generateId: (prefix) => {
    generatedSequence += 1
    return `${prefix}_22000000-0000-4000-8000-${String(generatedSequence).padStart(12, '0')}`
  },
})
const adapter = new EvidenceAnalystJobAdapter(application)
const claimedJob = await adapter.claim(pendingJob, 'kiro-live-analyst-1')
const episodeContext = await adapter.getEpisodeContext(claimedJob)

const definition = await loadEvidenceAnalystAgentDefinition(repositoryRoot)
const agentConfig = {
  name: definition.name,
  description: definition.description,
  prompt: definition.prompt,
  tools: definition.tools,
  allowedTools: definition.allowedTools,
  ...(liveModel === 'auto' ? {} : { model: liveModel }),
}
const agentConfigPath = join(agentWorkspace, '.kiro', 'agents', `${definition.name}.json`)
await writeFile(agentConfigPath, `${JSON.stringify(agentConfig, null, 2)}\n`, 'utf8')

const runProcess = (command, args, options = {}) =>
  new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? agentWorkspace,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: options.detached ?? false,
    })
    const stdout = []
    const stderr = []
    let timedOut = false
    let forceKillTimeout
    const terminate = (signal) => {
      if (child.pid === undefined) return
      if (options.detached) {
        try {
          process.kill(-child.pid, signal)
          return
        } catch {}
      }
      child.kill(signal)
    }
    child.stdout.on('data', (chunk) => stdout.push(Buffer.from(chunk)))
    child.stderr.on('data', (chunk) => stderr.push(Buffer.from(chunk)))
    const timeout = setTimeout(() => {
      timedOut = true
      terminate('SIGTERM')
      forceKillTimeout = setTimeout(() => terminate('SIGKILL'), 10_000)
    }, options.timeoutMs ?? 60_000)
    child.once('error', (error) => {
      clearTimeout(timeout)
      clearTimeout(forceKillTimeout)
      rejectRun(error)
    })
    child.once('close', (code) => {
      clearTimeout(timeout)
      clearTimeout(forceKillTimeout)
      resolveRun({ code, timedOut, stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr) })
    })
  })

const validation = await runProcess(kiroCli, ['agent', 'validate', '--path', agentConfigPath])
if (validation.code !== 0) {
  storage.close()
  throw new Error(`Evidence Analyst Agent config is invalid: ${validation.stderr.toString('utf8')}`)
}

const turn = [
  '다음 bounded EpisodeContext를 Evidence Analyst prompt에 따라 한 번 분석하세요.',
  '다른 정보나 도구를 사용하지 말고 strict JSON 하나만 반환하세요.',
  JSON.stringify(episodeContext),
].join('\n')
process.stdout.write(
  `${JSON.stringify({ phase: 'STARTED', runtimeRoot, promptVersion: definition.promptVersion, liveModel, liveEffort, timeoutMs, episodeId: seededEpisode.id, analysisJobId: claimedJob.id })}\n`,
)
const run = await runProcess(
  kiroCli,
  [
    'chat',
    '--agent',
    definition.name,
    '--agent-engine',
    'v2',
    '--effort',
    liveEffort,
    '--no-interactive',
    '--output-format',
    'stream-json',
    '--verbose',
    turn,
  ],
  { detached: true, timeoutMs },
)
const rawStream = run.stdout.toString('utf8')
const redactedStream = redactSensitiveText(rawStream)
const redactedError = redactSensitiveText(run.stderr.toString('utf8'))
const streamPath = join(runtimeRoot, 'evidence-analyst-stream-redacted.jsonl')
const errorPath = join(runtimeRoot, 'evidence-analyst-stderr-redacted.log')
await Promise.all([
  writeFile(streamPath, redactedStream, 'utf8'),
  writeFile(errorPath, redactedError, 'utf8'),
])
if (run.timedOut || run.code !== 0) {
  storage.close()
  throw new Error(
    `Live Evidence Analyst ${run.timedOut ? `exceeded ${String(timeoutMs)} milliseconds` : `exited with ${String(run.code)}`}. Inspect ${errorPath} and ${streamPath}.`,
  )
}

let answer = ''
let toolCalls = 0
for (const line of rawStream.split(/\r?\n/u).filter(Boolean)) {
  let event
  try {
    event = JSON.parse(line)
  } catch {
    continue
  }
  const update = event?.data?.update
  if (update?.sessionUpdate === 'tool_call') toolCalls += 1
  if (
    update?.sessionUpdate === 'agent_message_chunk' &&
    update?.content?.type === 'text' &&
    typeof update.content.text === 'string'
  ) {
    answer += update.content.text
  }
}
if (toolCalls !== 0) {
  storage.close()
  throw new Error(`No-tool Evidence Analyst attempted ${String(toolCalls)} tool call(s).`)
}

const semanticResult = parseEvidenceAnalystResult(answer)
const applicationResult = await adapter.submit(
  claimedJob,
  semanticResult,
  'idem_22000000-0000-4000-8000-000000000232',
)
const traces = storage.repository.readEvidenceTracesForProject(project.id)
const runtimeTrace = traces.find(
  (trace) => trace.concept.canonicalName.toLowerCase() === 'runtime validation',
)
const unionTrace = traces.find(
  (trace) => trace.concept.canonicalName.toLowerCase() === 'discriminated union',
)
const acceptedCount = applicationResult.outcomes.filter(
  (outcome) => outcome.decision.outcome === 'ACCEPTED',
).length
const rejectedCount = applicationResult.outcomes.filter(
  (outcome) => outcome.decision.outcome === 'REJECTED',
).length
const completedJob = storage.repository.readAnalysisJob(project.id, claimedJob.id)
const completedEpisode = storage.repository.readEpisodeAggregate(project.id, seededEpisode.id)
if (
  semanticResult.proposals.length < 2 ||
  acceptedCount < 1 ||
  rejectedCount < 1 ||
  runtimeTrace?.ledger?.state.state !== 'DEMONSTRATED' ||
  unionTrace?.ledger !== null ||
  completedJob?.status !== 'SUCCEEDED' ||
  completedEpisode?.episode.status !== 'ANALYZED'
) {
  storage.close()
  throw new Error(`Evidence Analyst result failed semantic/Core checks. Inspect ${streamPath}.`)
}

storage.close()
process.stdout.write(
  `${JSON.stringify({
    phase: 'COMPLETED',
    runtimeRoot,
    streamPath,
    errorPath,
    promptVersion: definition.promptVersion,
    liveModel,
    liveEffort,
    timeoutMs,
    episodeId: seededEpisode.id,
    analysisJobId: claimedJob.id,
    toolCalls,
    proposalCount: semanticResult.proposals.length,
    acceptedCount,
    rejectedCount,
    runtimeValidationState: runtimeTrace.ledger.state.state,
    discriminatedUnionState: unionTrace?.ledger?.state.state ?? null,
    jobStatus: completedJob.status,
    episodeStatus: completedEpisode.episode.status,
  })}\n`,
)
