// Current-machine consumer check: actual program adapter + HTTP/SSE + SQLite/Core.
// The Agent boundary is a deterministic delayed fixture, never a claimed model run.
import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { build } from 'esbuild'
import { ApplicationService, WorkspacePathPolicy } from '../packages/application/dist/index.js'
import { openSqliteStorage } from '../packages/storage-sqlite/dist/index.js'
import { WorkflowRuntime } from '../packages/runtime/dist/workflow-runtime.js'
import { createLocalServer } from '../apps/local-backend/dist/server.js'
import { LocalCoreClient, entityId, uiMetadata } from '../packages/frontend-client/dist/index.js'

const program = resolve(process.argv[2] ?? '')
const root = await mkdtemp(join(resolve('.data/frontend-handoff'), 'consumer-'))
const require = createRequire(import.meta.url)
for (const [entry, name] of [
  [join(program, 'src/adapter/flow/local-core-port.ts'), 'port'],
  [resolve('packages/contracts/test/fixtures.ts'), 'fixtures'],
  [join(program, 'src/core/flow/flow-controller.ts'), 'controller'],
  [join(program, 'src/adapter/agent/managed-agent-port.ts'), 'agent-port'],
  [join(program, 'src/core/agent/agent-controller.ts'), 'agent-controller'],
])
  await build({
    entryPoints: [entry],
    outfile: join(root, `${name}.cjs`),
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node24',
  })
const { LocalCoreDiscoveryPort } = require(join(root, 'port.cjs'))
const {
  candidateFixture,
  draftLearningSpecFixture,
  canonicalConceptFixture,
  conceptLedgerFixture,
} = require(join(root, 'fixtures.cjs'))
const { FlowController } = require(join(root, 'controller.cjs'))
const { ManagedAgentPort } = require(join(root, 'agent-port.cjs'))
const { AgentSurfaceController } = require(join(root, 'agent-controller.cjs'))
await mkdir(join(root, 'workspaces'))
const storage = await openSqliteStorage({ dataDirectory: join(root, 'db') })
const application = new ApplicationService({
  storage,
  workspacePolicy: await WorkspacePathPolicy.create(join(root, 'workspaces')),
})
const metadata = () => ({
  schemaVersion: 1,
  createdAt: new Date().toISOString(),
  source: { kind: 'AGENT', role: 'DISCOVERY' },
  redactionStatus: 'NOT_REQUIRED',
})
const counts = {}
let failNext = null
const instanceId = randomUUID()
let client
const runtime = new WorkflowRuntime({
  application,
  instanceId,
  agents: {
    async invoke(request) {
      counts[request.mode] = (counts[request.mode] ?? 0) + 1
      await new Promise((done, reject) => {
        const timer = setTimeout(done, 80)
        request.signal.addEventListener(
          'abort',
          () => {
            clearTimeout(timer)
            reject(new Error('CANCELLED'))
          },
          { once: true },
        )
      })
      if (failNext) {
        const code = failNext
        failNext = null
        throw Object.assign(new Error(code), { code })
      }
      if (request.mode === 'BUILDER') {
        assert.ok(request.message.includes('No additional user message was provided'))
        assert.ok(!request.message.includes('Exact user message:'))
        return {
          text: 'Synthetic Builder resume transport checked; no code generated.',
          stopReason: 'end_turn',
        }
      }
      const snapshot = await client.restoreProject(request.projectId)
      const session = snapshot.discoverySession
      const base = {
        schemaVersion: 1,
        correlationId: session.correlationId,
        actor: { kind: 'AGENT', role: 'DISCOVERY' },
        idempotencyKey: entityId('idem'),
        expectedSessionRevision: session.revision,
      }
      let command
      if (request.mode === 'PREVIEW')
        command = {
          ...base,
          kind: 'DISCOVERY_SUBMIT_CANDIDATE_PREVIEWS',
          previewRound: {
            ...metadata(),
            id: entityId('candidate_preview_round'),
            finalRoundId: entityId('candidate_round'),
            discoverySessionId: session.id,
            correlationId: session.correlationId,
            inputSnapshot: session.input,
            previews: Array.from({ length: 10 }, (_, index) => ({
              candidateId: entityId('candidate'),
              position: index + 1,
              title: `Direction ${index + 1}`,
              summary: 'A synthetic consumer fixture.',
              coreInteraction: 'Inspect a state transition.',
              appeal: 'See the result.',
              technologyNecessity: 'TypeScript validates the input.',
              generationTags: ['DIRECT'],
            })),
            generationRationale: 'Ten synthetic directions for contract verification.',
          },
        }
      else if (request.mode === 'ENRICH_SELECTED') {
        const preview = snapshot.discoveryContext.previewRound
        command = {
          ...base,
          kind: 'DISCOVERY_SUBMIT_CANDIDATE_ENRICHMENTS',
          previewRoundId: preview.id,
          batch: 'SELECTED',
          enrichments: preview.previews
            .filter((p) => request.requestedCandidateIds.includes(p.candidateId))
            .map((p) => ({
              ...metadata(),
              previewRoundId: preview.id,
              discoverySessionId: session.id,
              correlationId: session.correlationId,
              candidate: {
                ...candidateFixture,
                ...metadata(),
                id: p.candidateId,
                discoverySessionId: session.id,
                correlationId: session.correlationId,
                revision: 1,
                parentRevisions: [],
                title: p.title,
                summary: p.summary,
                coreInteraction: p.coreInteraction,
                appeal: p.appeal,
                technologyNecessity: p.technologyNecessity,
                generationTags: p.generationTags,
              },
            })),
        }
      } else if (request.mode === 'SPEC') {
        const previous = snapshot.learningSpec
        command = {
          ...base,
          kind: 'DISCOVERY_SUBMIT_LEARNING_SPEC',
          expectedSpecRevision: previous?.revision ?? 0,
          learningSpec: {
            ...draftLearningSpecFixture,
            ...metadata(),
            id: previous?.id ?? entityId('learning_spec'),
            projectId: snapshot.project.id,
            correlationId: session.correlationId,
            revision: (previous?.revision ?? 0) + 1,
            createdAt: previous?.createdAt ?? new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            ...(previous ? { parentRevision: previous.revision } : {}),
            selectedCandidate: {
              candidateId: snapshot.selectedCandidate.id,
              revision: snapshot.selectedCandidate.revision,
            },
          },
        }
      } else throw new Error(`FIXTURE_PHASE_UNSUPPORTED_${request.mode}`)
      const result = await application.executeAgent('DISCOVERY', command)
      if (!result.success) console.error(JSON.stringify({ fixturePhase: request.mode, result }))
      assert.equal(result.success, true, JSON.stringify(result))
      return {
        text: 'Synthetic fixture submitted through deterministic Core.',
        stopReason: 'end_turn',
      }
    },
  },
})
const token = randomBytes(32).toString('hex')
const server = createLocalServer({ application, runtime, token, instanceId })
await new Promise((done) => server.listen(0, '127.0.0.1', done))
client = new LocalCoreClient({
  protocolVersion: 1,
  backendInstanceId: instanceId,
  baseUrl: `http://127.0.0.1:${server.address().port}`,
  token,
})
const envelope = (revision) => ({
  ...uiMetadata(),
  idempotencyKey: entityId('idem'),
  expectedRevision: revision,
})
const unwrap = (result) => {
  assert.equal(result.ok, true, JSON.stringify(result))
  return result.value
}
const port = new LocalCoreDiscoveryPort(client)
try {
  const first = unwrap(
    await port.startDiscovery(
      { projectId: 'ignored', input: { learningGoal: 'TypeScript state transitions' } },
      envelope(0),
    ),
  )
  const second = unwrap(
    await port.startDiscovery(
      { projectId: 'ignored', input: { learningGoal: 'TypeScript queue invariants' } },
      envelope(0),
    ),
  )
  assert.notEqual(first.projectId, second.projectId)
  const preview = unwrap(
    await port.generatePreviewRound({ discoverySessionId: first.id }, envelope(first.revision)),
  )
  const other = unwrap(
    await port.generatePreviewRound({ discoverySessionId: second.id }, envelope(second.revision)),
  )
  assert.equal(preview.previews.length, 10)
  assert.notEqual(preview.previews[0].candidateId, other.previews[0].candidateId)
  const target = { candidateId: preview.previews[0].candidateId, revision: 1 }
  unwrap(
    await port.submitFeedback(
      {
        discoverySessionId: first.id,
        feedback: { id: entityId('feedback'), intent: 'SELECT', targets: [target] },
      },
      envelope(first.revision),
    ),
  )
  assert.equal(counts.SPEC, undefined, 'SELECT must not also start a SPEC run')
  const spec = unwrap(
    await port.generateSpecDraft(
      { projectId: first.projectId, selectedCandidate: target },
      envelope(0),
    ),
  )
  assert.equal(spec.revision, 1)
  const before = await client.restoreProject(first.projectId)
  assert.notEqual(before.discoverySession.revision, spec.revision)
  const refined = unwrap(
    await port.refineSpec(
      { projectId: first.projectId, learningSpecId: spec.id, message: 'Keep the scope local.' },
      envelope(spec.revision),
    ),
  )
  assert.equal(refined.revision, 2)
  const stale = await port.refineSpec(
    { projectId: first.projectId, learningSpecId: spec.id, message: 'stale' },
    envelope(1),
  )
  assert.equal(stale.ok, false)
  assert.equal(stale.error.code, 'revision_conflict')
  const confirmed = unwrap(
    await port.confirmSpec({ projectId: first.projectId, learningSpecId: spec.id }, envelope(2)),
  )
  console.log(
    JSON.stringify({ confirmedStatus: confirmed.status, confirmedRevision: confirmed.revision }),
  )
  const task = unwrap(
    await port.prepareBuilderTask(
      { projectId: first.projectId, learningSpecId: spec.id },
      envelope(confirmed.revision),
    ),
  )
  assert.equal(task.projectId, first.projectId)
  // The real frontend resume button sends message="". A fake startRun would
  // miss the SDK/HTTP validation mismatch observed in the live native run.
  const inertWorker = {
    getStatus: () => 'WORKER_CONNECTED',
    listUserInputs: () => [],
    subscribeStatus: () => () => {},
    subscribeUserInputs: () => () => {},
  }
  const agentPort = new ManagedAgentPort(client, inertWorker)
  const agentController = new AgentSurfaceController({
    port: agentPort,
    globalState: {
      get: () => first.projectId,
      update: async (_key, value) => assert.equal(value, first.projectId),
    },
    onChange: () => {},
    openFolder: async () => {
      throw new Error('UNEXPECTED_FOLDER_OPEN')
    },
    openExternal: async () => {
      throw new Error('UNEXPECTED_EXTERNAL_OPEN')
    },
  })
  await agentController.resumeAfterDecision()
  assert.equal(counts.BUILDER, 1)
  assert.equal(agentController.getViewModel().builder.phase, 'TURN_ENDED')
  assert.equal((await client.restoreProject(first.projectId)).completionReport, null)
  const countBeforeEvidence = JSON.stringify(counts)
  const emptyEvidence = await agentController.readEvidence()
  assert.equal(emptyEvidence.userUnderstandingTotal, 0)
  assert.deepEqual(emptyEvidence.concepts, [])
  const currentTask = (await client.restoreProject(first.projectId)).currentTask
  const helper = await client.execute({
    ...uiMetadata(),
    kind: 'UI_RECORD_HELPER_EXCHANGE',
    idempotencyKey: entityId('idem'),
    projectId: first.projectId,
    taskId: currentTask.id,
    userMessage: 'Synthetic model-0 consumer question.',
    helperResponseSummary: 'Synthetic fixture answer; not user understanding.',
    closeConversation: false,
  })
  // Synthetic Core observations let the *actual* frontend projector exercise
  // nonempty/full/filtered views without fabricating learner Evidence.
  const observedConcepts = []
  storage.transaction((r) => {
    for (let n = 0; n < 2; n++) {
      const at = new Date().toISOString()
      const concept = {
        ...canonicalConceptFixture,
        id: entityId('concept'),
        canonicalName: `Synthetic consumer observation ${n}`,
        createdAt: at,
        updatedAt: at,
      }
      const evidence = {
        schemaVersion: 1,
        id: entityId('evidence'),
        kind: 'CONCEPT_OBSERVATION',
        projectId: first.projectId,
        taskId: currentTask.id,
        episodeId: helper.episodeId,
        conceptId: concept.id,
        correlationId: helper.correlationId,
        supportsState: 'OBSERVED',
        contextSources: [{ kind: 'CODE', path: 'src/synthetic.ts' }],
        acceptedAt: at,
        source: { kind: 'CORE' },
        redactionStatus: 'VERIFIED_REDACTED',
      }
      r.appendCanonicalConcept(concept)
      r.appendAcceptedEvidence(evidence)
      r.appendConceptLedger({
        ...conceptLedgerFixture,
        id: entityId('concept_ledger'),
        concept,
        acceptedAliases: [],
        relatedProjectIds: [first.projectId],
        relatedTaskIds: [currentTask.id],
        state: {
          ...conceptLedgerFixture.state,
          conceptId: concept.id,
          state: 'OBSERVED',
          acceptedEvidenceIds: [evidence.id],
          updatedAt: at,
        },
        updatedAt: at,
      })
      observedConcepts.push(concept.id)
    }
  })
  const allEvidence = await agentController.readEvidence()
  assert.equal(allEvidence.concepts.length, 2)
  assert.equal(allEvidence.userUnderstandingTotal, 0)
  assert.ok(
    allEvidence.concepts.every(
      (c) => c.displayState === 'OBSERVED_ONLY' && c.userUnderstandingCount === 0,
    ),
  )
  const filteredEvidence = await agentController.readEvidence(observedConcepts[0])
  assert.deepEqual(
    filteredEvidence.concepts,
    allEvidence.concepts.filter((c) => c.id === observedConcepts[0]),
  )
  assert.equal(await agentController.readEvidence(entityId('concept')), null)
  assert.equal(JSON.stringify(counts), countBeforeEvidence)
  agentController.dispose()
  const staleCandidate = await port.enrichCandidate(
    { discoverySessionId: first.id, target: { ...target, revision: 999 } },
    envelope(0),
  )
  assert.equal(staleCandidate.ok, false, 'a different selected revision cannot satisfy enrichment')
  const restoredPort = new LocalCoreDiscoveryPort(client)
  const countBeforeHistory = JSON.stringify(counts)
  unwrap(await restoredPort.restoreProject(second.projectId, envelope(0)))
  unwrap(await restoredPort.generatePreviewRound({ discoverySessionId: second.id }, envelope(0)))
  assert.equal(JSON.stringify(counts), countBeforeHistory)
  failNext = 'FIXTURE_AGENT_FAILED'
  const failed = unwrap(
    await port.startDiscovery(
      { projectId: 'ignored', input: { learningGoal: 'Synthetic failure check' } },
      envelope(0),
    ),
  )
  const failure = await port.generatePreviewRound({ discoverySessionId: failed.id }, envelope(0))
  assert.equal(failure.ok, false)
  assert.equal(failure.error.message, 'FIXTURE_AGENT_FAILED')
  // Frontend B1/B3: inspect the real port's failure projection and its existing
  // cached-run behavior. These are injected Agent failures, not paid RPC calls.
  for (const errorCode of [
    'NATIVE_QUOTA_EXCEEDED',
    'NATIVE_AUTH_REQUIRED',
    'NATIVE_MODEL_UNAVAILABLE',
    'NATIVE_RPC_REJECTED',
  ]) {
    failNext = errorCode
    const failedSession = unwrap(
      await port.startDiscovery(
        { projectId: 'ignored', input: { learningGoal: 'Synthetic classified failure recovery' } },
        envelope(0),
      ),
    )
    const observed = await port.generatePreviewRound(
      { discoverySessionId: failedSession.id },
      envelope(0),
    )
    assert.equal(observed.ok, false)
    assert.equal(observed.error.message, errorCode)
    const countBeforeRetry = counts.PREVIEW
    const cached = await port.generatePreviewRound(
      { discoverySessionId: failedSession.id },
      envelope(0),
    )
    assert.equal(cached.ok, false)
    assert.equal(cached.error.message, errorCode)
    assert.equal(counts.PREVIEW, countBeforeRetry, 're-reading a failed run is not a new attempt')
    const snapshot = await client.restoreProject(failedSession.projectId)
    const request = {
      kind: 'DISCOVERY',
      phase: 'PREVIEW',
      projectId: failedSession.projectId,
      discoverySessionId: snapshot.discoverySession.id,
      expectedSessionRevision: snapshot.discoverySession.revision,
      idempotencyKey: entityId('idem'),
      enrichAfterPreview: false,
    }
    const retry = await client.startRun(request)
    assert.equal((await client.startRun(request)).id, retry.id)
    const terminal = await client.watchRun(retry.id, () => {})
    assert.equal(terminal.status, 'SUCCEEDED')
    assert.equal(terminal.outcome, 'DURABLE_RESULT')
    assert.equal(counts.PREVIEW, countBeforeRetry + 1)
    const restored = new LocalCoreDiscoveryPort(client)
    unwrap(await restored.restoreProject(failedSession.projectId, envelope(0)))
    const recovered = unwrap(
      await restored.generatePreviewRound({ discoverySessionId: failedSession.id }, envelope(0)),
    )
    assert.equal(recovered.previews.length, 10)
    assert.equal(counts.PREVIEW, countBeforeRetry + 1, 'durable restore must not invoke an Agent')
    assert.equal(
      (await client.restoreProject(failedSession.projectId)).discoverySession.id,
      failedSession.id,
    )
    // Current frontend must replace/clear this cache when wiring a retry action.
    const oldPort = await port.generatePreviewRound(
      { discoverySessionId: failedSession.id },
      envelope(0),
    )
    assert.equal(oldPort.ok, false)
    assert.equal(oldPort.error.message, errorCode)
  }
  const cancel = unwrap(
    await port.startDiscovery(
      { projectId: 'ignored', input: { learningGoal: 'Synthetic cancellation check' } },
      envelope(0),
    ),
  )
  const runs = await client.listRuns(cancel.projectId)
  await client.cancelRun(runs[0].id)
  const cancelled = await port.generatePreviewRound({ discoverySessionId: cancel.id }, envelope(0))
  assert.equal(cancelled.ok, false)
  assert.equal(cancelled.error.code, 'unavailable')
  // Exercise the actual frontend controller too: its generated placeholder must
  // be replaced by Core's project ID before Spec requests.
  const controller = new FlowController(
    { discovery: port, spec: port, history: port },
    {
      timeoutMs: 60000,
      ids: {
        id: entityId,
        correlationId: () => entityId('corr'),
        idempotencyKey: () => entityId('idem'),
      },
    },
  )
  await controller.startDiscovery({ learningGoal: 'TypeScript small state machines' })
  assert.equal(controller.getProject().id, controller.getSession().projectId)
  await controller.submitFeedback({
    intent: 'SELECT',
    targets: [{ candidateId: controller.getPreviewRound().previews[0].candidateId, revision: 1 }],
  })
  assert.ok(controller.getSpec())
  const report = {
    status: 'PASS',
    boundary: 'actual program controller/port + authenticated HTTP/SSE + SQLite',
    agent: 'DELAYED_DETERMINISTIC_FIXTURE',
    checks: [
      'two project/session mappings',
      'wait for durable preview/JIT/spec',
      'one SPEC run after SELECT',
      'entity-specific revisions',
      'stale spec conflict',
      'confirm and prepare Task',
      'new port History restore without model',
      'original Agent failure',
      'classified native codes survive the actual port without automatic retry',
      'explicit same-Project PREVIEW retry succeeds exactly once and restores without model',
      'known frontend limitation: original port retains its old failed-run cache',
      'cancelled run is not success',
      'controller uses Core project ID',
      'selected candidate must match the requested revision',
      'actual agent controller empty-message resume reaches Core exactly once',
      'a successful Builder turn is not fabricated Task completion',
      'actual agent controller projects empty/full/filtered Evidence without model calls or false user understanding',
    ],
    counts,
  }
  await writeFile(resolve('dist/frontend-consumer-receipt.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report))
} finally {
  await runtime.close()
  server.closeAllConnections()
  await new Promise((done) => server.close(done))
  storage.close()
}
