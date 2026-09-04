import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { ApplicationService, WorkspacePathPolicy } from '../packages/application/dist/index.js'
import {
  discoveryInputSchema,
  learningSpecRevisionSchema,
} from '../packages/contracts/dist/index.js'
import { loadDiscoveryAgentDefinition } from '../packages/kiro-adapter/dist/discovery-prompt-node.js'
import { openSqliteStorage } from '../packages/storage-sqlite/dist/index.js'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const liveModel = process.env.VIBE_HELPER_LIVE_EVAL_MODEL ?? 'claude-haiku-4.5'
const liveEffort = process.env.VIBE_HELPER_LIVE_EVAL_EFFORT ?? ''
const useProvidedContext = process.env.VIBE_HELPER_LIVE_EVAL_PROVIDED_CONTEXT === 'true'
const timeoutMs = Number(process.env.VIBE_HELPER_LIVE_EVAL_TIMEOUT_MS ?? 600_000)
if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 60_000 || timeoutMs > 1_200_000) {
  throw new TypeError('VIBE_HELPER_LIVE_EVAL_TIMEOUT_MS must be 60000..1200000')
}
const inputPath = resolve(
  repositoryRoot,
  process.argv[2] ?? 'tests/eval/fixtures/inputs/webhook-lens.json',
)
const input = discoveryInputSchema.parse(JSON.parse(await readFile(inputPath, 'utf8')))
const runtimeRoot = await mkdtemp(join(tmpdir(), 'vibe-helper-t09-spec-'))
const dataDirectory = join(runtimeRoot, 'data')
const workspaceRoot = join(runtimeRoot, 'generated-workspaces')
const agentWorkspace = join(runtimeRoot, 'agent-workspace')
await Promise.all([
  mkdir(dataDirectory, { recursive: true }),
  mkdir(workspaceRoot, { recursive: true }),
  mkdir(join(agentWorkspace, '.kiro', 'agents'), { recursive: true }),
])

const ids = {
  project: 'project_20000000-0000-4000-8000-000000000001',
  session: 'discovery_session_20000000-0000-4000-8000-000000000002',
  correlation: 'corr_20000000-0000-4000-8000-000000000003',
  startIdempotency: 'idem_20000000-0000-4000-8000-000000000004',
  candidate: 'candidate_20000000-0000-4000-8000-000000000005',
  round: 'candidate_round_20000000-0000-4000-8000-000000000006',
  roundIdempotency: 'idem_20000000-0000-4000-8000-000000000007',
  selection: 'feedback_20000000-0000-4000-8000-000000000008',
  selectionIdempotency: 'idem_20000000-0000-4000-8000-000000000009',
  specIdempotency: 'idem_20000000-0000-4000-8000-000000000010',
}
const selectedAt = '2026-08-27T00:00:00.000Z'
let generatedSequence = 10
const storage = await openSqliteStorage({ dataDirectory })
const application = new ApplicationService({
  storage,
  workspacePolicy: await WorkspacePathPolicy.create(workspaceRoot),
  generateId: (prefix) => {
    if (prefix === 'discovery_session') return ids.session
    generatedSequence += 1
    return `${prefix}_20000000-0000-4000-8000-${String(generatedSequence).padStart(12, '0')}`
  },
})
const started = await application.executeUi({
  schemaVersion: 1,
  kind: 'UI_START_DISCOVERY',
  correlationId: ids.correlation,
  actor: { kind: 'UI' },
  idempotencyKey: ids.startIdempotency,
  projectId: ids.project,
  input,
})
if (!started.success) throw new Error(`Could not seed Discovery: ${started.error.code}`)

const candidate = {
  schemaVersion: 1,
  id: ids.candidate,
  discoverySessionId: ids.session,
  correlationId: ids.correlation,
  revision: 1,
  parentRevisions: [],
  title: 'Webhook Contract Explorer',
  summary: 'A local tool for comparing webhook event variants against typed contracts.',
  targetUsers: ['TypeScript developers learning external event contracts'],
  coreInteraction:
    'Paste a redacted event and inspect the matched typed variant and rejected fields.',
  usageMoment: 'Before implementing a webhook handler for an unfamiliar provider.',
  appeal: 'Turns invisible payload rules into an immediate local experiment.',
  personalNeedRelationship:
    'Keeps redacted samples on the local machine while debugging integrations.',
  technologyNecessity:
    'Discriminated unions and runtime validation are central to matching safe event variants.',
  coreConcepts: ['discriminated union', 'runtime validation'],
  mvpFeatures: ['Paste one redacted payload', 'Match an event variant', 'Explain rejected fields'],
  suggestedScope: {
    learnerFocus: ['Discriminated union narrowing', 'Runtime schema validation'],
    agentSupport: ['Local UI shell'],
    excluded: ['Live provider credentials', 'Hosted payload storage'],
  },
  risks: ['Webhook samples may contain secrets before redaction'],
  generationTags: ['DIRECT', 'DISCOVER'],
  evaluation: [
    'CONCEPT_NECESSITY',
    'PERSONAL_UTILITY',
    'ADOPTION_FEASIBILITY',
    'LEARNER_FIT',
    'SCOPE_FEASIBILITY',
    'ADJACENT_COMPLEXITY',
    'DEPLOYABILITY',
    'DISTINCTIVENESS',
  ].map((criterion) => ({
    criterion,
    assessment: criterion === 'ADJACENT_COMPLEXITY' ? 'MIXED' : 'POSITIVE',
    rationale: `${criterion} supports a bounded local TypeScript learning project.`,
  })),
  createdAt: selectedAt,
  source: { kind: 'AGENT', role: 'DISCOVERY' },
  redactionStatus: 'VERIFIED_REDACTED',
}
const round = {
  schemaVersion: 1,
  id: ids.round,
  discoverySessionId: ids.session,
  correlationId: ids.correlation,
  roundIndex: 1,
  inputSnapshot: input,
  appliedFeedbackIds: [],
  candidates: [{ candidateId: ids.candidate, revision: 1 }],
  generationRationale:
    'The selected fixture isolates Learning Spec generation from Candidate diversity.',
  diversityCheck: {
    dimensionsReviewed: [
      'PROBLEM_DOMAIN',
      'TARGET_USER',
      'CORE_INTERACTION',
      'DATA_SHAPE',
      'USER_APPEAL',
    ],
    modeCollapseDetected: false,
    rationale: 'This bounded Spec fixture intentionally contains one preselected Candidate.',
  },
  createdAt: selectedAt,
  source: { kind: 'AGENT', role: 'DISCOVERY' },
  redactionStatus: 'VERIFIED_REDACTED',
}
const submitted = await application.executeAgent('DISCOVERY', {
  schemaVersion: 1,
  kind: 'DISCOVERY_SUBMIT_CANDIDATE_ROUND',
  correlationId: ids.correlation,
  actor: { kind: 'AGENT', role: 'DISCOVERY' },
  idempotencyKey: ids.roundIdempotency,
  expectedSessionRevision: 1,
  round,
  candidates: [candidate],
})
if (!submitted.success) throw new Error(`Could not seed Candidate: ${submitted.error.code}`)
const selected = await application.executeUi({
  schemaVersion: 1,
  kind: 'UI_RECORD_DISCOVERY_FEEDBACK',
  correlationId: ids.correlation,
  actor: { kind: 'UI' },
  idempotencyKey: ids.selectionIdempotency,
  expectedSessionRevision: 2,
  feedback: {
    schemaVersion: 1,
    id: ids.selection,
    discoverySessionId: ids.session,
    roundId: ids.round,
    correlationId: ids.correlation,
    intent: 'SELECT',
    targets: [{ candidateId: ids.candidate, revision: 1 }],
    message: 'Use this project direction.',
    createdAt: selectedAt,
    source: { kind: 'USER' },
    redactionStatus: 'NOT_REQUIRED',
  },
})
if (!selected.success) throw new Error(`Could not select Candidate: ${selected.error.code}`)

const definition = await loadDiscoveryAgentDefinition(repositoryRoot)
const serverName = 'vibe-helper-discovery-core'
const agentConfig = {
  name: definition.name,
  description: definition.description,
  prompt: definition.prompt,
  includeMcpJson: definition.includeMcpJson,
  mcpServers: {
    [serverName]: {
      command: process.execPath,
      args: [join(repositoryRoot, 'apps/mcp-server/dist/main.js')],
      timeout: 60_000,
      requestTimeout: 600_000,
      env: {
        VIBE_HELPER_AGENT_ROLE: 'DISCOVERY',
        VIBE_HELPER_DATA_DIR: dataDirectory,
        VIBE_HELPER_WORKSPACE_ROOT: workspaceRoot,
      },
    },
  },
  tools: definition.tools,
  allowedTools: definition.allowedTools,
  model: liveModel,
}
await writeFile(
  join(agentWorkspace, '.kiro', 'agents', `${definition.name}.json`),
  `${JSON.stringify(agentConfig, null, 2)}\n`,
  'utf8',
)
process.stdout.write(
  `${JSON.stringify({ phase: 'STARTED', runtimeRoot, liveModel, liveEffort, useProvidedContext, timeoutMs })}\n`,
)

const providedContext = JSON.stringify({
  schemaVersion: 1,
  kind: 'VIBE_HELPER_DISCOVERY_CONTEXT',
  purpose: 'SPEC',
  expectedSessionRevision: 3,
  project: {
    id: ids.project,
    title: input.learningGoal,
    learningGoal: input.learningGoal,
    status: 'SPEC_REVIEW',
  },
  session: {
    id: ids.session,
    correlationId: ids.correlation,
    revision: 3,
    status: 'SELECTED',
    input,
  },
  latestRound: {
    id: ids.round,
    roundIndex: 1,
    appliedFeedbackIds: [],
    candidates: [{ candidateId: ids.candidate, revision: 1 }],
  },
  currentCandidates: [candidate],
  pendingFeedback: [
    {
      id: ids.selection,
      roundId: ids.round,
      intent: 'SELECT',
      targets: [{ candidateId: ids.candidate, revision: 1 }],
      message: 'Use this project direction.',
    },
  ],
  selectedCandidate: candidate,
  learningSpec: null,
  relevantLedgerEntries: [],
})
const turn = [
  'Run one synthetic, redacted Learning Spec evaluation for the already selected Candidate.',
  ...(useProvidedContext
    ? [
        'Use the following validated ephemeral Core snapshot directly and do not call get_discovery_context because its IDs and revision match this request:',
        providedContext,
      ]
    : [
        `Call get_discovery_context with kind=DISCOVERY_GET_CONTEXT for projectId ${ids.project} and discoverySessionId ${ids.session}.`,
      ]),
  `Use correlationId ${ids.correlation} for every tool call.`,
  'Create the recommended Learning Spec from the selected Candidate and submit it once with submit_learning_spec.',
  `Use idempotencyKey=${ids.specIdempotency}, expectedSessionRevision=3, and expectedSpecRevision=0.`,
  'Submit only the semantic draft fields. Do not invent Spec ID, selected Candidate reference, revision, parent revision, timestamps, source, or redaction status.',
  'Keep the MVP local and TypeScript-based. Put the goal concepts in LEARNER_FOCUS, the local UI shell in AGENT_SUPPORT, and live credentials plus hosted storage in EXCLUDED.',
  'Include only real Decision candidates and do not confirm the Spec or create a Builder Task.',
  'After the tool succeeds, reply only with LEARNING_SPEC_STORED.',
].join('\n')

const runStartedAt = Date.now()
const run = await new Promise((resolveRun, rejectRun) => {
  const chatArguments = [
    'chat',
    '--agent',
    definition.name,
    '--agent-engine',
    'v2',
    ...(liveEffort === '' ? [] : ['--effort', liveEffort]),
    '--no-interactive',
    '--require-mcp-startup',
    '--trust-tools=@vibe-helper-discovery-core',
    '--output-format',
    'stream-json',
    '--verbose',
    turn,
  ]
  const child = spawn('kiro-cli', chatArguments, {
    cwd: agentWorkspace,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  })
  const stdout = []
  const stderr = []
  let timedOut = false
  let forceKillTimeout
  const terminateProcessGroup = (signal) => {
    if (child.pid === undefined) return
    try {
      process.kill(-child.pid, signal)
    } catch {
      child.kill(signal)
    }
  }
  child.stdout.on('data', (chunk) => stdout.push(Buffer.from(chunk)))
  child.stderr.on('data', (chunk) => stderr.push(Buffer.from(chunk)))
  const timeout = setTimeout(() => {
    timedOut = true
    terminateProcessGroup('SIGTERM')
    forceKillTimeout = setTimeout(() => terminateProcessGroup('SIGKILL'), 10_000)
  }, timeoutMs)
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
const transcriptPath = join(runtimeRoot, 'kiro-stream.jsonl')
const errorPath = join(runtimeRoot, 'kiro-stderr.log')
await Promise.all([writeFile(transcriptPath, run.stdout), writeFile(errorPath, run.stderr)])
if (run.timedOut || run.code !== 0) {
  storage.close()
  throw new Error(
    `Live Spec Agent ${run.timedOut ? `exceeded ${String(timeoutMs)} milliseconds` : `exited with ${String(run.code)}`}. Inspect ${errorPath} and ${transcriptPath}.`,
  )
}

const aggregate = storage.repository.readDiscoveryAggregate(ids.project, ids.session)
const learningSpec = aggregate?.learningSpecs.at(-1)
if (learningSpec === undefined || learningSpec.status !== 'DRAFT') {
  storage.close()
  throw new Error(`Discovery Agent did not store a draft Learning Spec. Inspect ${transcriptPath}.`)
}
learningSpecRevisionSchema.parse(learningSpec)
const subjectPath = join(runtimeRoot, 'learning-spec-subject.json')
await writeFile(
  subjectPath,
  `${JSON.stringify({ schemaVersion: 1, learningSpec }, null, 2)}\n`,
  'utf8',
)
storage.close()
const durableMilliseconds = Math.max(0, Date.parse(learningSpec.createdAt) - runStartedAt)
const turnMilliseconds = Math.max(0, Date.now() - runStartedAt)
const toolCallTitles = run.stdout
  .toString('utf8')
  .trim()
  .split('\n')
  .flatMap((line) => {
    try {
      const event = JSON.parse(line)
      return event?.type === 'sessionUpdate' && event?.data?.update?.sessionUpdate === 'tool_call'
        ? [String(event.data.update.title ?? '')]
        : []
    } catch {
      return []
    }
  })
process.stdout.write(
  `${JSON.stringify({
    runtimeRoot,
    subjectPath,
    transcriptPath,
    promptVersion: definition.promptVersion,
    liveModel,
    liveEffort,
    useProvidedContext,
    timeoutMs,
    learningSpecId: learningSpec.id,
    learningSpecRevision: learningSpec.revision,
    sessionRevision: aggregate.session.revision,
    durableMilliseconds,
    turnMilliseconds,
    learningSpecPayloadBytes: Buffer.byteLength(JSON.stringify(learningSpec), 'utf8'),
    getContextCalls: toolCallTitles.filter((title) => title.includes('get_discovery_context'))
      .length,
    submitCalls: toolCallTitles.filter((title) => title.includes('submit_learning_spec')).length,
  })}\n`,
)
