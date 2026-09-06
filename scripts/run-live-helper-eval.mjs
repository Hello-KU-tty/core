import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  ApplicationService,
  redactSensitiveText,
  WorkspacePathPolicy,
} from '../packages/application/dist/index.js'
import {
  acceptedEvidenceSchema,
  activityEventSchema,
  builderTaskSchema,
  canonicalConceptSchema,
  conceptLedgerEntrySchema,
  decisionRequestSchema,
  discoverySessionSchema,
  episodeSchema,
  evidenceDecisionSchema,
  evidenceProposalSchema,
  learningSpecRevisionSchema,
  liveProjectContextSchema,
  projectCandidateRevisionSchema,
  projectSchema,
} from '../packages/contracts/dist/index.js'
import { loadHelperAgentDefinition } from '../packages/kiro-adapter/dist/helper-prompt-node.js'
import { openSqliteStorage } from '../packages/storage-sqlite/dist/index.js'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const kiroCli = process.env.VIBE_HELPER_KIRO_CLI ?? 'kiro-cli'
const liveModel = process.env.VIBE_HELPER_LIVE_EVAL_MODEL ?? 'claude-haiku-4.5'
const liveEffort = process.env.VIBE_HELPER_LIVE_EVAL_EFFORT ?? 'low'
const timeoutMs = Number(process.env.VIBE_HELPER_LIVE_EVAL_TIMEOUT_MS ?? 600_000)
if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 60_000 || timeoutMs > 1_200_000) {
  throw new TypeError('VIBE_HELPER_LIVE_EVAL_TIMEOUT_MS must be 60000..1200000')
}

const runtimeRoot = await mkdtemp(join(tmpdir(), 'vibe-helper-t12-helper-'))
const dataDirectory = join(runtimeRoot, 'data')
const workspaceRoot = join(runtimeRoot, 'generated-workspaces')
const agentWorkspace = join(runtimeRoot, 'agent-workspace')
await Promise.all([
  mkdir(dataDirectory, { recursive: true }),
  mkdir(workspaceRoot, { recursive: true }),
  mkdir(join(agentWorkspace, '.kiro', 'agents'), { recursive: true }),
])

const ids = {
  project: 'project_40000000-0000-4000-8000-000000000001',
  candidate: 'candidate_40000000-0000-4000-8000-000000000002',
  spec: 'learning_spec_40000000-0000-4000-8000-000000000003',
  task: 'task_40000000-0000-4000-8000-000000000004',
  context: 'context_40000000-0000-4000-8000-000000000005',
  decision: 'decision_40000000-0000-4000-8000-000000000006',
  optionReject: 'decision_option_40000000-0000-4000-8000-000000000007',
  optionPreserve: 'decision_option_40000000-0000-4000-8000-000000000008',
  concept: 'concept_40000000-0000-4000-8000-000000000009',
  conversation: 'conversation_40000000-0000-4000-8000-000000000010',
  message: 'message_40000000-0000-4000-8000-000000000011',
  event: 'event_40000000-0000-4000-8000-000000000012',
  episode: 'episode_40000000-0000-4000-8000-000000000013',
  evidenceProposal: 'evidence_proposal_40000000-0000-4000-8000-000000000014',
  evidenceDecision: 'evidence_decision_40000000-0000-4000-8000-000000000015',
  evidence: 'evidence_40000000-0000-4000-8000-000000000016',
  ledger: 'concept_ledger_40000000-0000-4000-8000-000000000017',
  correlation: 'corr_40000000-0000-4000-8000-000000000018',
  discoverySession: 'discovery_session_40000000-0000-4000-8000-000000000019',
}
const seededAt = '2026-09-01T10:00:00.000Z'
const generatedWorkspacePath = `projects/${ids.project}`
const storage = await openSqliteStorage({ dataDirectory })
const workspacePolicy = await WorkspacePathPolicy.create(workspaceRoot)
const application = new ApplicationService({ storage, workspacePolicy })

const project = projectSchema.parse({
  schemaVersion: 1,
  id: ids.project,
  correlationId: ids.correlation,
  revision: 1,
  title: 'Webhook Lens',
  learningGoal: 'Understand runtime validation through a useful local tool.',
  status: 'BUILDING',
  generatedWorkspacePath,
  createdAt: seededAt,
  updatedAt: seededAt,
  source: { kind: 'USER' },
  redactionStatus: 'VERIFIED_REDACTED',
})
const discoverySession = discoverySessionSchema.parse({
  schemaVersion: 1,
  id: ids.discoverySession,
  projectId: ids.project,
  correlationId: ids.correlation,
  revision: 1,
  input: {
    learningGoal: 'Understand runtime validation through a useful local tool.',
    personalNeed: 'Inspect webhook payloads without uploading them.',
  },
  status: 'SELECTED',
  openedAt: seededAt,
  updatedAt: seededAt,
  closedAt: seededAt,
  source: { kind: 'USER' },
  redactionStatus: 'VERIFIED_REDACTED',
})
const candidate = projectCandidateRevisionSchema.parse({
  schemaVersion: 1,
  id: ids.candidate,
  discoverySessionId: ids.discoverySession,
  correlationId: ids.correlation,
  revision: 1,
  parentRevisions: [],
  title: 'Webhook Lens',
  summary: 'A local viewer that explains validated webhook variants.',
  targetUsers: ['A developer integrating third-party webhooks'],
  coreInteraction: 'Paste a redacted payload and inspect its validated fields.',
  usageMoment: 'While debugging an additive provider payload change.',
  appeal: 'Makes external API contracts visible without a hosted service.',
  personalNeedRelationship: 'Keeps sample payloads on the local machine.',
  technologyNecessity: 'Runtime validation protects the external data boundary.',
  coreConcepts: ['runtime validation'],
  mvpFeatures: ['Parse one provider payload', 'Show redacted unknown fields'],
  suggestedScope: {
    learnerFocus: ['Runtime validation boundary'],
    agentSupport: ['Local TypeScript shell'],
    excluded: ['Hosted payload storage'],
  },
  risks: ['Provider payloads can contain secrets.'],
  generationTags: ['DIRECT'],
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
    assessment: 'POSITIVE',
    rationale: `${criterion} supports this bounded local Helper fixture.`,
  })),
  createdAt: seededAt,
  source: { kind: 'AGENT', role: 'DISCOVERY' },
  redactionStatus: 'VERIFIED_REDACTED',
})
const learningSpec = learningSpecRevisionSchema.parse({
  schemaVersion: 1,
  id: ids.spec,
  projectId: ids.project,
  correlationId: ids.correlation,
  revision: 1,
  selectedCandidate: { candidateId: ids.candidate, revision: 1 },
  productPurpose: 'Inspect local webhook payloads without uploading them.',
  targetUsers: ['A developer integrating third-party webhooks'],
  primaryUsageMoment: 'While debugging an additive provider payload change.',
  successMoment: 'A validated event shows known and unknown fields safely.',
  mvpFeatures: ['Parse one provider payload', 'Show redacted unknown fields'],
  scope: [
    {
      category: 'LEARNER_FOCUS',
      title: 'Runtime validation boundary',
      rationale: 'Unknown external payloads must be checked before use.',
      conceptNames: ['runtime validation'],
    },
    {
      category: 'AGENT_SUPPORT',
      title: 'Local TypeScript shell',
      rationale: 'The runtime shell supports the learning flow.',
      conceptNames: [],
    },
    {
      category: 'EXCLUDED',
      title: 'Hosted payload storage',
      rationale: 'It crosses the local privacy boundary.',
      conceptNames: [],
    },
  ],
  expectedDecisions: [
    {
      category: 'PRODUCT_BEHAVIOR',
      description: 'Choose how validated unknown fields appear.',
      whyUserInputMatters: 'The choice changes visible debugging behavior.',
    },
  ],
  runtimeConstraint: 'TYPESCRIPT',
  deploymentConstraints: ['Local execution only', 'PostgreSQL 14+ database required'],
  status: 'CONFIRMED',
  confirmation: { confirmedAt: seededAt, confirmedBy: { kind: 'USER' } },
  createdAt: seededAt,
  updatedAt: seededAt,
  source: { kind: 'USER' },
  redactionStatus: 'VERIFIED_REDACTED',
})
const task = builderTaskSchema.parse({
  schemaVersion: 1,
  id: ids.task,
  projectId: ids.project,
  learningSpecId: ids.spec,
  learningSpecRevision: 1,
  correlationId: ids.correlation,
  revision: 1,
  title: 'Choose unknown-field behavior',
  productGoal: 'Keep useful additive fields visible without weakening validation of known fields.',
  requirements: ['Validate the known event contract before rendering it.'],
  acceptanceCriteria: [
    {
      key: 'unknown_fields',
      description: 'The selected unknown-field policy is visible and tested.',
    },
  ],
  expectedConcepts: ['runtime validation'],
  excludedWork: ['Hosted sample storage'],
  prerequisiteTaskIds: [],
  expectedDecisionCategories: ['PRODUCT_BEHAVIOR'],
  sequence: 1,
  status: 'ACTIVE',
  createdAt: seededAt,
  updatedAt: seededAt,
  source: { kind: 'CORE' },
  redactionStatus: 'VERIFIED_REDACTED',
})
const codeReference = {
  kind: 'CODE',
  path: 'src/events.ts',
  lineRange: { start: 1, end: 16 },
}
const context = liveProjectContextSchema.parse({
  schemaVersion: 1,
  id: ids.context,
  projectId: ids.project,
  taskId: ids.task,
  correlationId: ids.correlation,
  contextVersion: 1,
  expectedPreviousVersion: 0,
  checkpoint: 'DECISION_REQUIRED',
  stage: 'Choosing parser output',
  currentGoal: 'Choose whether validated unknown fields are rejected or preserved for inspection.',
  recentChanges: ['Added strict validation for required event fields.'],
  activeDecisionIds: [ids.decision],
  activeConceptNames: ['runtime validation'],
  relatedFiles: [codeReference],
  nextActions: ['Resolve the product behavior Decision', 'Apply the selected parser branch'],
  blockingReason: 'The parser result type depends on the visible unknown-field policy.',
  updatedAt: seededAt,
  source: { kind: 'AGENT', role: 'BUILDER' },
  redactionStatus: 'VERIFIED_REDACTED',
})
const decision = decisionRequestSchema.parse({
  schemaVersion: 1,
  id: ids.decision,
  projectId: ids.project,
  taskId: ids.task,
  correlationId: ids.correlation,
  contextVersion: 1,
  category: 'PRODUCT_BEHAVIOR',
  question: 'Should validated unknown fields be rejected or preserved for local inspection?',
  reasonRequiredNow: 'The parser return shape and visible debugging result depend on the choice.',
  options: [
    {
      id: ids.optionReject,
      label: 'Reject unknown fields',
      description: 'Fail when a recognized event contains undeclared fields.',
      impacts: ['Typos and provider drift fail at the input boundary.'],
      tradeoffs: ['Additive provider changes require a schema update.'],
    },
    {
      id: ids.optionPreserve,
      label: 'Preserve unknown fields',
      description: 'Validate required fields and show additional redacted fields.',
      impacts: ['New provider fields remain visible for local inspection.'],
      tradeoffs: ['The accepted result is less strictly closed.'],
    },
  ],
  recommendedOptionId: ids.optionPreserve,
  recommendationRationale:
    'A local inspection tool benefits from showing additive provider changes.',
  relatedConceptNames: ['runtime validation'],
  sourceReferences: [codeReference],
  independentWorkCanContinue: false,
  requestedAt: seededAt,
  source: { kind: 'AGENT', role: 'BUILDER' },
  redactionStatus: 'VERIFIED_REDACTED',
})
const priorEvent = activityEventSchema.parse({
  schemaVersion: 1,
  id: ids.event,
  projectId: ids.project,
  taskId: ids.task,
  conversationId: ids.conversation,
  correlationId: ids.correlation,
  sequence: 1,
  actor: { kind: 'USER' },
  occurredAt: seededAt,
  payload: {
    type: 'USER_MESSAGE',
    conversationId: ids.conversation,
    messageId: ids.message,
    redactedExcerpt: 'Boundary validation should catch malformed required fields before rendering.',
  },
  sourceReferences: [
    { kind: 'USER_MESSAGE', conversationId: ids.conversation, messageId: ids.message },
  ],
  redactionStatus: 'VERIFIED_REDACTED',
})
const priorEpisode = episodeSchema.parse({
  schemaVersion: 1,
  id: ids.episode,
  projectId: ids.project,
  taskId: ids.task,
  conversationId: ids.conversation,
  correlationId: ids.correlation,
  revision: 1,
  type: 'BUILD_TASK',
  status: 'ANALYZED',
  eventIds: [ids.event],
  conceptCandidates: [{ conceptId: ids.concept, originalExpression: 'runtime validation' }],
  contextReferences: [codeReference],
  startedAt: seededAt,
  endedAt: seededAt,
  closeReason: 'The earlier validation boundary explanation was analyzed.',
  source: { kind: 'CORE' },
  redactionStatus: 'VERIFIED_REDACTED',
})
const concept = canonicalConceptSchema.parse({
  schemaVersion: 1,
  id: ids.concept,
  canonicalName: 'runtime validation',
  description: 'Checking unknown external data against an executable contract.',
  revision: 1,
  createdAt: seededAt,
  updatedAt: seededAt,
  source: { kind: 'CORE' },
})
const evidenceProposal = evidenceProposalSchema.parse({
  schemaVersion: 1,
  id: ids.evidenceProposal,
  projectId: ids.project,
  taskId: ids.task,
  episodeId: ids.episode,
  correlationId: ids.correlation,
  concept: {
    canonicalConceptId: ids.concept,
    originalExpression: 'boundary validation',
    proposedCanonicalName: 'runtime validation',
  },
  signal: 'APPLICATION',
  strength: 'STRONG',
  promptDependence: 'INDEPENDENT',
  userEvidenceSources: [
    { kind: 'USER_MESSAGE', conversationId: ids.conversation, messageId: ids.message },
  ],
  contextSources: [codeReference],
  redactedEvidenceExcerpt:
    'Boundary validation should catch malformed required fields before rendering.',
  rationale: 'The user applied validation to a concrete external input boundary.',
  maximumSupportedState: 'DEMONSTRATED',
  misconception: { action: 'NONE' },
  proposedAt: seededAt,
  source: { kind: 'AGENT', role: 'EVIDENCE_ANALYST' },
  redactionStatus: 'VERIFIED_REDACTED',
})
const evidenceDecision = evidenceDecisionSchema.parse({
  schemaVersion: 1,
  id: ids.evidenceDecision,
  evidenceProposalId: ids.evidenceProposal,
  correlationId: ids.correlation,
  outcome: 'ACCEPTED',
  reasonCode: 'VALID_USER_EVIDENCE',
  explanation: 'The user-authored application supports DEMONSTRATED state.',
  decidedAt: seededAt,
  source: { kind: 'CORE' },
})
const evidence = acceptedEvidenceSchema.parse({
  schemaVersion: 1,
  id: ids.evidence,
  kind: 'USER_UNDERSTANDING',
  projectId: ids.project,
  taskId: ids.task,
  episodeId: ids.episode,
  conceptId: ids.concept,
  correlationId: ids.correlation,
  evidenceProposalId: ids.evidenceProposal,
  evidenceDecisionId: ids.evidenceDecision,
  signal: 'APPLICATION',
  strength: 'STRONG',
  promptDependence: 'INDEPENDENT',
  supportsState: 'DEMONSTRATED',
  userEvidenceSources: [
    { kind: 'USER_MESSAGE', conversationId: ids.conversation, messageId: ids.message },
  ],
  acceptedAt: seededAt,
  source: { kind: 'CORE' },
  redactionStatus: 'VERIFIED_REDACTED',
})
const ledger = conceptLedgerEntrySchema.parse({
  schemaVersion: 1,
  id: ids.ledger,
  concept,
  acceptedAliases: ['input boundary validation'],
  state: {
    conceptId: ids.concept,
    state: 'DEMONSTRATED',
    acceptedEvidenceIds: [ids.evidence],
    reducerVersion: '1.0.0',
    revision: 1,
    updatedAt: seededAt,
  },
  openIssues: [],
  relatedProjectIds: [ids.project],
  relatedTaskIds: [ids.task],
  revision: 1,
  updatedAt: seededAt,
  source: { kind: 'CORE' },
})

storage.transaction((repository) => {
  repository.appendProject(project)
  repository.appendDiscoverySession(discoverySession)
  repository.appendCandidate(candidate)
  repository.appendLearningSpec(learningSpec)
  repository.appendTask(task)
  repository.appendLiveContext(context)
  repository.appendDecisionRequest(decision)
  repository.appendActivityEvent(priorEvent)
  repository.appendEpisode(priorEpisode)
  repository.appendCanonicalConcept(concept)
  repository.appendEvidenceProposal(evidenceProposal)
  repository.appendEvidenceDecision(evidenceDecision)
  repository.appendAcceptedEvidence(evidence)
  repository.appendConceptLedger(ledger)
})

const projectWorkspace = await workspacePolicy.resolveProjectWorkspace(project, ids.correlation)
await mkdir(join(projectWorkspace, 'src'), { recursive: true })
const secretSentinel = 'synthetic-helper-secret-400'
await writeFile(
  join(projectWorkspace, 'src', 'events.ts'),
  [
    `const apiKey = '${secretSentinel}'`,
    '',
    "type Event = { type: 'created'; id: string }",
    '',
    'export function parseEvent(input: unknown): Event {',
    "  if (typeof input !== 'object' || input === null) throw new Error('invalid event')",
    "  if (!('type' in input) || input.type !== 'created') throw new Error('invalid type')",
    "  if (!('id' in input) || typeof input.id !== 'string') throw new Error('invalid id')",
    '  return { type: input.type, id: input.id }',
    '}',
    '',
    'void apiKey',
    '',
  ].join('\n'),
  'utf8',
)

const preflight = await application.executeAgent('HELPER', {
  schemaVersion: 1,
  kind: 'HELPER_GET_CONTEXT',
  correlationId: ids.correlation,
  actor: { kind: 'AGENT', role: 'HELPER' },
  projectId: ids.project,
  taskId: ids.task,
  decisionId: ids.decision,
  question:
    'DB 모델은 엑셀 열이고 실제 데이터는 행이라고 보면 되나요? 그리고 PostgreSQL보다 SQLite가 낫지 않나요?',
  relatedConceptNames: ['runtime validation'],
  observedContextVersion: 1,
})
if (
  !preflight.success ||
  preflight.data.freshness.status !== 'CURRENT' ||
  preflight.data.focusedDecision?.id !== ids.decision ||
  preflight.data.relevantLedgerEntries[0]?.state.state !== 'DEMONSTRATED' ||
  preflight.data.personalization.mode !== 'EVIDENCE_AWARE' ||
  preflight.data.personalization.basis[0]?.conceptName !== 'runtime validation' ||
  preflight.data.recentEpisodes[0]?.episodeId !== ids.episode ||
  preflight.data.sourceExcerpts[0]?.reference.path !== 'src/events.ts' ||
  JSON.stringify(preflight).includes(secretSentinel)
) {
  storage.close()
  throw new Error('The seeded Helper context is not current, bounded, demonstrated, or redacted.')
}

const definition = await loadHelperAgentDefinition(repositoryRoot)
const agentConfig = {
  name: definition.name,
  description: definition.description,
  prompt: definition.prompt,
  includeMcpJson: definition.includeMcpJson,
  mcpServers: {
    'vibe-helper-helper-core': {
      command: process.execPath,
      args: [join(repositoryRoot, 'apps/mcp-server/dist/main.js')],
      timeout: 60_000,
      requestTimeout: 600_000,
      env: {
        VIBE_HELPER_AGENT_ROLE: 'HELPER',
        VIBE_HELPER_DATA_DIR: dataDirectory,
        VIBE_HELPER_WORKSPACE_ROOT: workspaceRoot,
      },
    },
  },
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
  throw new Error(`Helper Agent config is invalid: ${validation.stderr.toString('utf8')}`)
}

const turn = [
  '실제 합성 Helper 회귀를 한 번 실행하세요.',
  `먼저 get_helper_context를 schemaVersion=1, kind=HELPER_GET_CONTEXT, correlationId=${ids.correlation}, actor={kind:AGENT,role:HELPER}, projectId=${ids.project}, taskId=${ids.task}, decisionId=${ids.decision}, question="DB 모델은 엑셀 열이고 실제 데이터는 행이라고 보면 되나요? 현재 unknown field 선택지는 어떻게 다르고, confirmed Spec의 PostgreSQL보다 SQLite가 낫지 않나요?", relatedConceptNames=["runtime validation"], observedContextVersion=1로 정확히 한 번 호출하세요.`,
  'freshness가 CURRENT이므로 refresh는 요청하지 마세요.',
  '도구가 돌려준 현재 Decision, DEMONSTRATED Concept State, 과거 Episode, 실제 source excerpt만 사용하세요.',
  '답변은 한국어로 짧게 하고, 아래 다섯 제목을 정확히 한 번씩 사용하세요: 현재 선택, Spec 변경, 비유, 높은 상태에서도 질문 가능, 다음 행동.',
  '현재 선택에서는 reject와 preserve의 실제 차이와 Builder 추천의 이유·한계를 비교하세요.',
  '비유에서는 데이터 한 건=행 대응의 맞는 부분과 모델=열 대응의 틀린 부분을 claim 단위로 나누고, 모델의 필드가 열에 더 가깝다는 한계까지 설명하세요.',
  'Spec 변경에서는 PostgreSQL이 confirmed 시작 기준이라는 사실과 사용자가 언제든 SQLite로 바꿀 수 있다는 권한을 함께 말하세요. 로컬 MVP의 SQLite 장점, PostgreSQL의 동시 접근·운영 장점과 현재 구현 변경 비용을 비교하고, 사용자가 Builder composer에 보낼 짧은 변경 지시를 제안하세요. 사용자가 결정할 범위가 아니라는 표현은 금지합니다.',
  'DEMONSTRATED 상태여도 질문과 더 깊은 설명이 계속 가능하다고 말하고, 퀴즈나 다시 말하기를 요구하지 마세요.',
  '다음 행동에는 더 쉽게, 더 자세히, 현재 코드로 예시, 선택지 비교를 자유 입력보다 앞세우지 않는 선택지로 제시하세요.',
].join('\n')
process.stdout.write(
  `${JSON.stringify({ phase: 'STARTED', runtimeRoot, promptVersion: definition.promptVersion, liveModel, liveEffort, timeoutMs })}\n`,
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
    '--require-mcp-startup',
    '--trust-tools=@vibe-helper-helper-core',
    '--output-format',
    'stream-json',
    '--verbose',
    turn,
  ],
  { detached: true, timeoutMs },
)
const rawStream = run.stdout.toString('utf8')
const redactedStream = redactSensitiveText(rawStream, projectWorkspace)
const redactedError = redactSensitiveText(run.stderr.toString('utf8'), projectWorkspace)
const streamPath = join(runtimeRoot, 'helper-stream-redacted.jsonl')
const errorPath = join(runtimeRoot, 'helper-stderr-redacted.log')
await Promise.all([
  writeFile(streamPath, redactedStream, 'utf8'),
  writeFile(errorPath, redactedError, 'utf8'),
])
if (run.timedOut || run.code !== 0) {
  storage.close()
  throw new Error(
    `Live Helper ${run.timedOut ? `exceeded ${String(timeoutMs)} milliseconds` : `exited with ${String(run.code)}`}. Inspect ${errorPath} and ${streamPath}.`,
  )
}

let answer = ''
let getContextCalls = 0
let refreshCalls = 0
for (const line of rawStream.split(/\r?\n/u).filter(Boolean)) {
  let event
  try {
    event = JSON.parse(line)
  } catch {
    continue
  }
  const update = event?.data?.update
  if (update?.sessionUpdate === 'tool_call') {
    answer = ''
    const toolName = update?._meta?.kiro?.toolName ?? update?.title ?? ''
    if (String(toolName).includes('get_helper_context')) getContextCalls += 1
    if (String(toolName).includes('request_builder_context_refresh')) refreshCalls += 1
  }
  if (
    update?.sessionUpdate === 'agent_message_chunk' &&
    update?.content?.type === 'text' &&
    typeof update.content.text === 'string'
  ) {
    answer += update.content.text
  }
}
const requiredHeadings = [
  '현재 선택',
  'Spec 변경',
  '비유',
  '높은 상태에서도 질문 가능',
  '다음 행동',
]
if (
  getContextCalls !== 1 ||
  refreshCalls !== 0 ||
  requiredHeadings.some((heading) => !answer.includes(heading)) ||
  !/(거절|reject)/iu.test(answer) ||
  !/(보존|preserve)/iu.test(answer) ||
  !/행/u.test(answer) ||
  !/(필드|field)/iu.test(answer) ||
  !/열/u.test(answer) ||
  !/(질문|설명)/u.test(answer) ||
  !/SQLite/iu.test(answer) ||
  !/PostgreSQL/iu.test(answer) ||
  !/(바꿀 수|변경할 수|다시 선택|바꿀 권한|변경 권한)/u.test(answer) ||
  !/(Builder|빌더).*(입력|composer|보내)/iu.test(answer) ||
  /사용자가 결정할 범위가 아니/u.test(answer) ||
  /(?:퀴즈를 풀|시험을 보|다시 말해 보)/u.test(answer) ||
  answer.includes(secretSentinel)
) {
  storage.close()
  throw new Error(`Helper answer failed semantic checks. Inspect ${streamPath}.`)
}

const aggregate = storage.repository.readBuilderTaskAggregate(ids.project, ids.task)
if (
  aggregate === null ||
  aggregate.task.revision !== 1 ||
  aggregate.liveContext?.contextVersion !== 1 ||
  aggregate.decisionRequests.length !== 1 ||
  aggregate.contextRefreshRequests.length !== 0
) {
  storage.close()
  throw new Error('Helper changed Builder-owned state or created an unnecessary refresh request.')
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
    helperToolCalls: getContextCalls,
    refreshCalls,
    contextVersion: aggregate.liveContext.contextVersion,
    conceptState: preflight.data.relevantLedgerEntries[0].state.state,
    focusedDecisionId: preflight.data.focusedDecision.id,
    sourceExcerptCount: preflight.data.sourceExcerpts.length,
    recentEpisodeCount: preflight.data.recentEpisodes.length,
    builderStateUnchanged: true,
    secretRedacted: true,
  })}\n`,
)
