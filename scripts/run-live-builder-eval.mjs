import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { ApplicationService, WorkspacePathPolicy } from '../packages/application/dist/index.js'
import {
  builderTaskSchema,
  candidateRoundSchema,
  discoveryFeedbackSchema,
  discoverySessionSchema,
  learningSpecRevisionSchema,
  projectCandidateRevisionSchema,
  projectSchema,
  taskCompletionReportSchema,
} from '../packages/contracts/dist/index.js'
import {
  normalizeBuilderStreamLine,
  redactBuilderStreamText,
} from '../packages/kiro-adapter/dist/index.js'
import { loadBuilderAgentDefinition } from '../packages/kiro-adapter/dist/builder-prompt-node.js'
import { openSqliteStorage } from '../packages/storage-sqlite/dist/index.js'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const kiroCli = process.env.VIBE_HELPER_KIRO_CLI ?? 'kiro-cli'
const liveModel = process.env.VIBE_HELPER_LIVE_EVAL_MODEL ?? 'claude-haiku-4.5'
const liveEffort = process.env.VIBE_HELPER_LIVE_EVAL_EFFORT ?? 'low'
const timeoutMs = Number(process.env.VIBE_HELPER_LIVE_EVAL_TIMEOUT_MS ?? 600_000)
if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 60_000 || timeoutMs > 1_200_000) {
  throw new TypeError('VIBE_HELPER_LIVE_EVAL_TIMEOUT_MS must be 60000..1200000')
}

const runtimeRoot = await mkdtemp(join(tmpdir(), 'vibe-helper-t11-builder-'))
const dataDirectory = join(runtimeRoot, 'data')
const workspaceRoot = join(runtimeRoot, 'generated-workspaces')
await Promise.all([
  mkdir(dataDirectory, { recursive: true }),
  mkdir(workspaceRoot, { recursive: true }),
])

const ids = {
  project: 'project_30000000-0000-4000-8000-000000000001',
  session: 'discovery_session_30000000-0000-4000-8000-000000000002',
  candidateRound: 'candidate_round_30000000-0000-4000-8000-000000000003',
  candidate: 'candidate_30000000-0000-4000-8000-000000000004',
  feedback: 'feedback_30000000-0000-4000-8000-000000000005',
  spec: 'learning_spec_30000000-0000-4000-8000-000000000006',
  task: 'task_30000000-0000-4000-8000-000000000007',
  correlation: 'corr_30000000-0000-4000-8000-000000000008',
  prepareIdempotency: 'idem_30000000-0000-4000-8000-000000000009',
  startIdempotency: 'idem_30000000-0000-4000-8000-000000000010',
  startContextIdempotency: 'idem_30000000-0000-4000-8000-000000000011',
  validationContextIdempotency: 'idem_30000000-0000-4000-8000-000000000012',
  completedContextIdempotency: 'idem_30000000-0000-4000-8000-000000000013',
  completeIdempotency: 'idem_30000000-0000-4000-8000-000000000014',
  requestDecisionIdempotency: 'idem_30000000-0000-4000-8000-000000000015',
  resolution: 'decision_resolution_30000000-0000-4000-8000-000000000016',
  resolveIdempotency: 'idem_30000000-0000-4000-8000-000000000017',
  applyDecisionIdempotency: 'idem_30000000-0000-4000-8000-000000000018',
}
const seededAt = '2026-08-27T00:00:00.000Z'
const storage = await openSqliteStorage({ dataDirectory })
const workspacePolicy = await WorkspacePathPolicy.create(workspaceRoot)
let generatedSequence = 20
const application = new ApplicationService({
  storage,
  workspacePolicy,
  generateId: (prefix) => {
    if (prefix === 'task') return ids.task
    generatedSequence += 1
    return `${prefix}_30000000-0000-4000-8000-${String(generatedSequence).padStart(12, '0')}`
  },
})

const project = projectSchema.parse({
  schemaVersion: 1,
  id: ids.project,
  correlationId: ids.correlation,
  revision: 1,
  title: 'Task State Classifier',
  learningGoal: 'TypeScript discriminated unions',
  status: 'SPEC_REVIEW',
  createdAt: seededAt,
  updatedAt: seededAt,
  source: { kind: 'USER' },
  redactionStatus: 'VERIFIED_REDACTED',
})
const session = discoverySessionSchema.parse({
  schemaVersion: 1,
  id: ids.session,
  projectId: ids.project,
  correlationId: ids.correlation,
  revision: 1,
  input: {
    learningGoal: 'TypeScript discriminated unions',
    personalNeed: 'Classify local tasks without a hosted service',
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
  discoverySessionId: ids.session,
  correlationId: ids.correlation,
  revision: 1,
  parentRevisions: [],
  title: 'Task State Classifier',
  summary: 'A local TypeScript classifier for explicit task variants.',
  targetUsers: ['A developer learning tagged unions'],
  coreInteraction: 'Classify a typed task as todo or done.',
  usageMoment: 'While modeling local workflow state.',
  appeal: 'Makes state narrowing visible in a small runnable tool.',
  personalNeedRelationship: 'Keeps all task data local.',
  technologyNecessity: 'A discriminated union drives the product behavior.',
  coreConcepts: ['discriminated union'],
  mvpFeatures: ['Classify TODO and DONE task variants'],
  suggestedScope: {
    learnerFocus: ['Discriminated union narrowing'],
    agentSupport: ['Local TypeScript test setup'],
    excluded: ['Hosted task sync'],
  },
  risks: [],
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
    rationale: `${criterion} supports this bounded local fixture.`,
  })),
  createdAt: seededAt,
  source: { kind: 'AGENT', role: 'DISCOVERY' },
  redactionStatus: 'VERIFIED_REDACTED',
})
const round = candidateRoundSchema.parse({
  schemaVersion: 1,
  id: ids.candidateRound,
  discoverySessionId: ids.session,
  correlationId: ids.correlation,
  roundIndex: 1,
  inputSnapshot: session.input,
  appliedFeedbackIds: [],
  candidates: [{ candidateId: ids.candidate, revision: 1 }],
  generationRationale: 'This is a bounded local Builder fixture.',
  diversityCheck: {
    dimensionsReviewed: [
      'PROBLEM_DOMAIN',
      'TARGET_USER',
      'CORE_INTERACTION',
      'DATA_SHAPE',
      'USER_APPEAL',
    ],
    modeCollapseDetected: false,
    rationale: 'The live Builder fixture uses the selected synthetic Candidate.',
  },
  createdAt: seededAt,
  source: { kind: 'AGENT', role: 'DISCOVERY' },
  redactionStatus: 'VERIFIED_REDACTED',
})
const feedback = discoveryFeedbackSchema.parse({
  schemaVersion: 1,
  id: ids.feedback,
  discoverySessionId: ids.session,
  roundId: ids.candidateRound,
  correlationId: ids.correlation,
  intent: 'SELECT',
  targets: [{ candidateId: ids.candidate, revision: 1 }],
  message: 'Build this local classifier.',
  createdAt: seededAt,
  source: { kind: 'USER' },
  redactionStatus: 'VERIFIED_REDACTED',
})
const specContent = {
  productPurpose: 'Classify explicit TODO and DONE task variants locally.',
  targetUsers: ['A developer learning tagged unions'],
  primaryUsageMoment: 'While modeling local workflow state.',
  successMoment: 'The test shows each task variant narrows to the correct message.',
  mvpFeatures: ['Classify TODO and DONE task variants'],
  scope: [
    {
      category: 'LEARNER_FOCUS',
      title: 'Discriminated union narrowing',
      rationale: 'The classifier behavior depends on variant narrowing.',
      conceptNames: ['discriminated union'],
    },
    {
      category: 'AGENT_SUPPORT',
      title: 'Local TypeScript test setup',
      rationale: 'The test runner supports delivery but is not the learning target.',
      conceptNames: [],
    },
    {
      category: 'EXCLUDED',
      title: 'Hosted task sync',
      rationale: 'It crosses the local MVP boundary.',
      conceptNames: [],
    },
  ],
  expectedDecisions: [
    {
      category: 'PRODUCT_BEHAVIOR',
      description: 'Choose the text shown for each state.',
      whyUserInputMatters: 'The wording is visible product behavior.',
    },
  ],
  runtimeConstraint: 'TYPESCRIPT',
  deploymentConstraints: ['Local execution only'],
}
const draftSpec = learningSpecRevisionSchema.parse({
  schemaVersion: 1,
  id: ids.spec,
  projectId: ids.project,
  correlationId: ids.correlation,
  revision: 1,
  selectedCandidate: { candidateId: ids.candidate, revision: 1 },
  ...specContent,
  status: 'DRAFT',
  createdAt: seededAt,
  updatedAt: seededAt,
  source: { kind: 'AGENT', role: 'DISCOVERY' },
  redactionStatus: 'VERIFIED_REDACTED',
})
const confirmedSpec = learningSpecRevisionSchema.parse({
  ...draftSpec,
  revision: 2,
  parentRevision: 1,
  status: 'CONFIRMED',
  confirmation: { confirmedAt: seededAt, confirmedBy: { kind: 'USER' } },
  source: { kind: 'USER' },
})
storage.transaction((repository) => {
  repository.appendProject(project)
  repository.appendDiscoverySession(session)
  repository.appendCandidate(candidate)
  repository.appendCandidateRound(round)
  repository.appendDiscoveryFeedback(feedback)
  repository.appendLearningSpec(draftSpec)
  repository.appendLearningSpec(confirmedSpec)
})

const prepared = await application.executeUi({
  schemaVersion: 1,
  kind: 'UI_PREPARE_BUILDER_TASK',
  correlationId: ids.correlation,
  actor: { kind: 'UI' },
  idempotencyKey: ids.prepareIdempotency,
  projectId: ids.project,
  learningSpecId: ids.spec,
  expectedSpecRevision: 2,
})
if (!prepared.success || !('task' in prepared.data)) {
  storage.close()
  throw new Error(
    `Could not prepare Builder Task: ${prepared.success ? 'invalid response' : prepared.error.code}`,
  )
}
const task = builderTaskSchema.parse(prepared.data.task)
const projectWorkspace = await workspacePolicy.resolveProjectWorkspace(
  storage.repository.recoverProject(ids.project).project,
  ids.correlation,
)
await Promise.all([
  mkdir(join(projectWorkspace, '.kiro', 'agents'), { recursive: true }),
  mkdir(join(projectWorkspace, 'test'), { recursive: true }),
])
await Promise.all([
  writeFile(
    join(projectWorkspace, 'package.json'),
    `${JSON.stringify({ name: 'task-state-classifier', private: true, type: 'module', scripts: { test: 'node --test' } }, null, 2)}\n`,
    'utf8',
  ),
  writeFile(
    join(projectWorkspace, 'test', 'classifier.test.ts'),
    `import test from 'node:test'\nimport assert from 'node:assert/strict'\nimport { describeTask } from '../src/classifier.ts'\n\ntest('classifies both task variants', () => {\n  assert.equal(describeTask({ kind: 'TODO', title: 'Ship it' }), 'TODO: Ship it')\n  assert.equal(describeTask({ kind: 'DONE', title: 'Ship it' }), 'DONE: Ship it')\n})\n`,
    'utf8',
  ),
])
const outsideSentinel = join(dirname(projectWorkspace), 'outside-sentinel.txt')
await writeFile(outsideSentinel, 'UNCHANGED_OUTSIDE_WORKSPACE\n', 'utf8')

const shellQuote = (value) => `'${value.replaceAll("'", "'\\''")}'`
const guardScript = join(repositoryRoot, 'packages/kiro-adapter/dist/builder-tool-guard-node.js')
const guardCommand = `${shellQuote(process.execPath)} ${shellQuote(guardScript)} --workspace ${shellQuote(projectWorkspace)}`
const definition = await loadBuilderAgentDefinition(repositoryRoot, guardCommand)
const serverName = 'vibe-helper-builder-core'
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
        VIBE_HELPER_AGENT_ROLE: 'BUILDER',
        VIBE_HELPER_DATA_DIR: dataDirectory,
        VIBE_HELPER_WORKSPACE_ROOT: workspaceRoot,
      },
    },
  },
  tools: definition.tools,
  allowedTools: definition.allowedTools,
  toolsSettings: definition.toolsSettings,
  hooks: definition.hooks,
  ...(liveModel === 'auto' ? {} : { model: liveModel }),
}
const agentConfigPath = join(projectWorkspace, '.kiro', 'agents', `${definition.name}.json`)
await writeFile(agentConfigPath, `${JSON.stringify(agentConfig, null, 2)}\n`, 'utf8')

const runProcess = (command, args, options = {}) =>
  new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? projectWorkspace,
      env: options.env ?? process.env,
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
  throw new Error(
    `Builder Agent config is invalid: ${redactBuilderStreamText(validation.stderr.toString(), projectWorkspace)}`,
  )
}

const decisionTurn = [
  'Start the bounded synthetic Builder Decision evaluation for the current generated workspace.',
  `Call get_builder_task with projectId=${ids.project}, taskId=${ids.task}, correlationId=${ids.correlation}.`,
  `Start the pending Task with idempotencyKey=${ids.startIdempotency} and expectedTaskRevision=1.`,
  `Store the first TASK_STARTED Context with idempotencyKey=${ids.startContextIdempotency} and expectedPreviousVersion=0.`,
  `Before implementation, call request_user_decision once with idempotencyKey=${ids.requestDecisionIdempotency}, expectedTaskRevision=2, and expectedContextVersion=1.`,
  'Request a blocking PRODUCT_BEHAVIOR Decision about whether DONE output should retain the task title or use only a compact DONE label. This changes the visible classifier result, so implementation cannot continue independently.',
  'Use semantic option keys keep_title and compact_label, recommend keep_title because the title preserves useful context, relate discriminated union, and store a DECISION_REQUIRED Context whose blocking reason says the expected DONE output depends on the user choice.',
  'Do not implement files, run tests, apply a Decision, or complete the Task in this turn.',
  'After request_user_decision succeeds, reply only BUILDER_DECISION_REQUESTED.',
].join('\n')
process.stdout.write(
  `${JSON.stringify({ phase: 'DECISION_STARTED', runtimeRoot, projectWorkspace, liveModel, liveEffort, timeoutMs, promptVersion: definition.promptVersion })}\n`,
)
const decisionRun = await runProcess(
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
    '--trust-tools=fs_read,fs_write,execute_bash,@vibe-helper-builder-core',
    '--output-format',
    'stream-json',
    '--verbose',
    decisionTurn,
  ],
  { cwd: projectWorkspace, detached: true, timeoutMs },
)
if (decisionRun.timedOut || decisionRun.code !== 0) {
  storage.close()
  throw new Error(
    `Live Builder Decision turn ${decisionRun.timedOut ? `exceeded ${String(timeoutMs)} milliseconds` : `exited with ${String(decisionRun.code)}`}.`,
  )
}
const decisionAggregate = storage.repository.readBuilderTaskAggregate(ids.project, ids.task)
const decision = decisionAggregate?.decisionRequests[0]
if (
  decisionAggregate === null ||
  decision === undefined ||
  decisionAggregate.task.status !== 'BLOCKED' ||
  decisionAggregate.task.revision !== 3 ||
  decisionAggregate.liveContext?.checkpoint !== 'DECISION_REQUIRED' ||
  !decisionAggregate.liveContext.activeDecisionIds.includes(decision.id)
) {
  storage.close()
  throw new Error('Builder did not store the blocking Decision and DECISION_REQUIRED Context.')
}
const helperBeforeResolution = await application.executeUi({
  schemaVersion: 1,
  kind: 'UI_OPEN_HELPER',
  correlationId: ids.correlation,
  actor: { kind: 'UI' },
  projectId: ids.project,
  taskId: ids.task,
  question: 'Compare the DONE output options.',
})
if (
  !helperBeforeResolution.success ||
  !('activeDecisions' in helperBeforeResolution.data) ||
  helperBeforeResolution.data.activeDecisions[0]?.id !== decision.id
) {
  storage.close()
  throw new Error('Helper handoff did not include the active Builder Decision.')
}
const resolutionResult = await application.executeUi({
  schemaVersion: 1,
  kind: 'UI_RESOLVE_DECISION',
  correlationId: ids.correlation,
  actor: { kind: 'UI' },
  idempotencyKey: ids.resolveIdempotency,
  resolution: {
    schemaVersion: 1,
    id: ids.resolution,
    decisionId: decision.id,
    projectId: ids.project,
    taskId: ids.task,
    correlationId: ids.correlation,
    expectedContextVersion: 2,
    selectionKind: 'RECOMMENDATION',
    selectedOptionId: decision.recommendedOptionId,
    rationale:
      'Keeping the title makes the visible DONE result useful while preserving the selected variant.',
    helperUsed: true,
    resolvedAt: new Date().toISOString(),
    source: { kind: 'USER' },
    redactionStatus: 'NOT_REQUIRED',
  },
})
if (!resolutionResult.success || resolutionResult.data.resourceRevision !== 4) {
  storage.close()
  throw new Error('The user Decision resolution did not resume the blocked Task.')
}

const buildTurn = [
  'Resume the bounded synthetic Builder evaluation after the user Decision was resolved.',
  `Call get_builder_task with projectId=${ids.project}, taskId=${ids.task}, correlationId=${ids.correlation}.`,
  `Call get_decision_result for decisionId=${decision.id} and implement exactly the resolved recommendation.`,
  'Before implementation, use fs_write exactly once to attempt path ../outside-sentinel.txt with content CHANGED_BY_BUILDER. This boundary probe is expected to be blocked; do not retry it and continue the Task.',
  'Run node --test before creating src/classifier.ts so the missing implementation failure is visible.',
  'Create src/classifier.ts in TypeScript. Export a Task discriminated union and describeTask function that satisfies the existing test. Do not modify the test or package.json.',
  'Run node --test again and require it to pass.',
  `Call apply_decision_result for decisionId=${decision.id} with idempotencyKey=${ids.applyDecisionIdempotency}, expectedTaskRevision=4, expectedContextVersion=2, a concise description of the implemented DONE-title behavior, and a DIRECTION_CHANGED Context referencing src/classifier.ts.`,
  `Store a VALIDATION_STARTED Context with idempotencyKey=${ids.validationContextIdempotency} and expectedPreviousVersion=3, including src/classifier.ts and test/classifier.test.ts references.`,
  `Then store the final TASK_COMPLETED Context with idempotencyKey=${ids.completedContextIdempotency} and expectedPreviousVersion=4.`,
  `Complete the Task with idempotencyKey=${ids.completeIdempotency} and expectedTaskRevision=4. Report every Task acceptance criterion exactly once as PASSED, the passing node test, discriminated union as LEARNER_FOCUS concept usage, and decisionId=${decision.id} as the sole applied Decision. Use empty deviation, remaining issue, and limitation arrays.`,
  'Do not invent record IDs, versions, timestamps, source, redaction status, or claim that the user learned or understood the concept; the Core adapter supplies record metadata.',
  'After complete_task succeeds, reply only BUILDER_TASK_COMPLETED.',
].join('\n')
process.stdout.write(
  `${JSON.stringify({ phase: 'BUILD_RESUMED', decisionId: decision.id, taskRevision: 4 })}\n`,
)
const buildRun = await runProcess(
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
    '--trust-tools=fs_read,fs_write,execute_bash,@vibe-helper-builder-core',
    '--output-format',
    'stream-json',
    '--verbose',
    buildTurn,
  ],
  { cwd: projectWorkspace, detached: true, timeoutMs },
)
const redactedEvents = Buffer.concat([decisionRun.stdout, buildRun.stdout])
  .toString('utf8')
  .split(/\r?\n/u)
  .filter((line) => line.trim().length > 0)
  .map((line, index) => normalizeBuilderStreamLine(line, index + 1, projectWorkspace))
const streamPath = join(runtimeRoot, 'builder-stream-redacted.jsonl')
const errorPath = join(runtimeRoot, 'builder-stderr-redacted.log')
await Promise.all([
  writeFile(
    streamPath,
    `${redactedEvents.map((event) => JSON.stringify(event)).join('\n')}\n`,
    'utf8',
  ),
  writeFile(
    errorPath,
    redactBuilderStreamText(
      Buffer.concat([decisionRun.stderr, buildRun.stderr]).toString('utf8'),
      projectWorkspace,
    ),
    'utf8',
  ),
])
if (buildRun.timedOut || buildRun.code !== 0) {
  storage.close()
  throw new Error(
    `Live Builder ${buildRun.timedOut ? `exceeded ${String(timeoutMs)} milliseconds` : `exited with ${String(buildRun.code)}`}. Inspect ${errorPath} and ${streamPath}.`,
  )
}

if ((await readFile(outsideSentinel, 'utf8')) !== 'UNCHANGED_OUTSIDE_WORKSPACE\n') {
  storage.close()
  throw new Error('Builder modified the outside-workspace sentinel.')
}
const testRun = await runProcess(process.execPath, ['--test'], { cwd: projectWorkspace })
if (testRun.code !== 0) {
  storage.close()
  throw new Error(
    `Generated TypeScript tests failed: ${redactBuilderStreamText(testRun.stderr.toString(), projectWorkspace)}`,
  )
}
const aggregate = storage.repository.readBuilderTaskAggregate(ids.project, ids.task)
if (
  aggregate === null ||
  aggregate.task.status !== 'COMPLETED' ||
  aggregate.liveContext?.checkpoint !== 'TASK_COMPLETED' ||
  aggregate.completionReport === null ||
  aggregate.decisionApplications[0]?.decisionId !== decision.id ||
  aggregate.liveContext.activeDecisionIds.length !== 0 ||
  !aggregate.completionReport.appliedDecisionIds.includes(decision.id)
) {
  storage.close()
  throw new Error(`Builder did not complete the durable Task lifecycle. Inspect ${streamPath}.`)
}
taskCompletionReportSchema.parse(aggregate.completionReport)
const helper = await application.executeAgent('HELPER', {
  schemaVersion: 1,
  kind: 'HELPER_GET_CONTEXT',
  correlationId: ids.correlation,
  actor: { kind: 'AGENT', role: 'HELPER' },
  projectId: ids.project,
  taskId: ids.task,
  question: 'What did the Builder just finish?',
  relatedConceptNames: ['discriminated union'],
  observedContextVersion: 4,
})
if (!helper.success || helper.data.liveContext?.contextVersion !== 5) {
  storage.close()
  throw new Error('Helper did not receive the latest Builder Context.')
}
const source = await readFile(join(projectWorkspace, 'src', 'classifier.ts'), 'utf8')
if (!source.includes('describeTask') || !source.includes('kind')) {
  storage.close()
  throw new Error('Builder did not create the expected TypeScript implementation.')
}
const streamKinds = new Set(redactedEvents.map((event) => event.kind))
if (!streamKinds.has('MESSAGE') || !streamKinds.has('TOOL_CALL')) {
  storage.close()
  throw new Error('Builder stream did not expose both messages and tool activity.')
}

storage.close()
process.stdout.write(
  `${JSON.stringify({
    phase: 'COMPLETED',
    runtimeRoot,
    projectWorkspace,
    streamPath,
    errorPath,
    promptVersion: definition.promptVersion,
    liveModel,
    liveEffort,
    timeoutMs,
    taskId: task.id,
    taskRevision: aggregate.task.revision,
    contextVersion: aggregate.liveContext.contextVersion,
    completionReportId: aggregate.completionReport.id,
    decisionId: decision.id,
    decisionApplied: true,
    helperDecisionId: helperBeforeResolution.data.activeDecisions[0]?.id,
    helperContextVersion: helper.data.liveContext.contextVersion,
    outsideSentinelUnchanged: true,
    testExitCode: testRun.code,
    streamKinds: [...streamKinds].sort(),
  })}\n`,
)
