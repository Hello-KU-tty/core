// Current-machine consumer check: actual program adapter + HTTP/SSE + SQLite/Core.
// The Agent boundary is a deterministic delayed fixture, never a claimed model run.
import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { build } from 'esbuild'
import { createLocalServer } from '../apps/local-backend/dist/server.js'
import { ApplicationService, WorkspacePathPolicy } from '../packages/application/dist/index.js'
import { entityId, LocalCoreClient, uiMetadata } from '../packages/frontend-client/dist/index.js'
import { WorkflowRuntime } from '../packages/runtime/dist/workflow-runtime.js'
import { openSqliteStorage } from '../packages/storage-sqlite/dist/index.js'

const program = resolve(process.argv[2] ?? '')
await mkdir(resolve('.data/frontend-handoff'), { recursive: true })
const root = await mkdtemp(join(resolve('.data/frontend-handoff'), 'consumer-'))
const require = createRequire(import.meta.url)
for (const [entry, name] of [
  [join(program, 'src/adapter/flow/local-core-port.ts'), 'port'],
  [resolve('packages/contracts/test/fixtures.ts'), 'fixtures'],
  [join(program, 'src/core/flow/flow-controller.ts'), 'controller'],
  [join(program, 'src/adapter/agent/managed-agent-port.ts'), 'agent-port'],
  [join(program, 'src/core/agent/agent-controller.ts'), 'agent-controller'],
  [join(program, 'src/webview/agent/agent-dispatcher.ts'), 'agent-dispatcher'],
  [join(program, 'src/agent-panel-view-provider.ts'), 'provider'],
  [join(program, 'src/webview/main.ts'), 'webview'],
  [join(program, 'src/webview/client-messaging.ts'), 'webview-client'],
  [join(program, 'test/support/fake-dom.ts'), 'webview-dom'],
])
  await build({
    entryPoints: [entry],
    outfile: join(root, `${name}.cjs`),
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node24',
    plugins: [
      {
        name: 'consumer-vscode-surface',
        setup(builder) {
          builder.onResolve({ filter: /^vscode$/ }, () => ({
            path: 'vscode',
            namespace: 'consumer',
          }))
          builder.onLoad({ filter: /.*/, namespace: 'consumer' }, () => ({
            contents:
              'module.exports = { commands: { executeCommand: async () => {} }, env: { openExternal: async () => {} }, Uri: { file: fsPath => ({fsPath}), parse: value => value } }',
            loader: 'js',
          }))
        },
      },
    ],
  })
const { LocalCoreDiscoveryPort } = require(join(root, 'port.cjs'))
const {
  candidateFixture,
  candidateRoundFixture,
  draftLearningSpecFixture,
  canonicalConceptFixture,
  conceptLedgerFixture,
} = require(join(root, 'fixtures.cjs'))
const { FlowController } = require(join(root, 'controller.cjs'))
const { ManagedAgentPort } = require(join(root, 'agent-port.cjs'))
const { AgentSurfaceController } = require(join(root, 'agent-controller.cjs'))
const { AgentDispatcher } = require(join(root, 'agent-dispatcher.cjs'))
const { wireWebviewMessaging } = require(join(root, 'provider.cjs'))
const { bootstrap } = require(join(root, 'webview.cjs'))
const { WebviewClient } = require(join(root, 'webview-client.cjs'))
const { installFakeDom } = require(join(root, 'webview-dom.cjs'))
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
let heldPreview = null
const instanceId = randomUUID()
let client
const runtime = new WorkflowRuntime({
  application,
  instanceId,
  agents: {
    async invoke(request) {
      counts[request.mode] = (counts[request.mode] ?? 0) + 1
      if (request.mode === 'PREVIEW' && heldPreview) await heldPreview
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
      } else if (request.mode === 'MERGE' || request.mode === 'ROUND') {
        const context = snapshot.discoveryContext
        const previous = context.rounds.at(-1)
        const feedback = context.feedback.filter(
          (f) => f.roundId === previous.id && f.intent !== 'SELECT',
        )
        const merge = feedback.find((f) => f.intent === 'MERGE')
        assert.ok(merge || feedback.some((f) => f.intent === 'REGENERATE'))
        const primary =
          merge &&
          context.candidates.find(
            (c) =>
              c.id === merge.targets[0].candidateId && c.revision === merge.targets[0].revision,
          )
        const candidate = {
          ...(primary || candidateFixture),
          ...metadata(),
          id: primary?.id ?? entityId('candidate'),
          revision: primary ? primary.revision + 1 : 1,
          parentRevisions: merge?.targets ?? [],
          discoverySessionId: session.id,
          correlationId: session.correlationId,
          title: merge ? 'Merged synthetic candidate' : 'Regenerated synthetic candidate',
        }
        command = {
          ...base,
          kind: 'DISCOVERY_SUBMIT_CANDIDATE_ROUND',
          round: {
            ...candidateRoundFixture,
            ...metadata(),
            id: entityId('candidate_round'),
            discoverySessionId: session.id,
            correlationId: session.correlationId,
            roundIndex: previous.roundIndex + 1,
            inputSnapshot: session.input,
            appliedFeedbackIds: feedback.map((f) => f.id),
            candidates: [{ candidateId: candidate.id, revision: candidate.revision }],
          },
          candidates: [candidate],
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
let restoreDom
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
  // Frontend B1/B3: actual port recovery over HTTP/SSE and SQLite, with
  // injected Agent failures rather than paid RPC calls.
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
    const retried = await Promise.all([
      port.generatePreviewRound({ discoverySessionId: failedSession.id, retry: true }, envelope(0)),
      port.generatePreviewRound({ discoverySessionId: failedSession.id, retry: true }, envelope(0)),
    ])
    assert.ok(retried.every((result) => result.ok && result.value.previews.length === 10))
    const retry = (await client.listRuns(failedSession.projectId)).find(
      (run) => run.status === 'SUCCEEDED' && run.phase === 'PREVIEW',
    )
    assert.ok(retry)
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
    // The original port also sees the new durable result, never its old failure.
    const oldPort = await port.generatePreviewRound(
      { discoverySessionId: failedSession.id },
      envelope(0),
    )
    assert.equal(oldPort.ok, true)
    assert.equal(counts.PREVIEW, countBeforeRetry + 1)
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
  failNext = 'NATIVE_QUOTA_EXCEEDED'
  const controllerInput = { learningGoal: 'TypeScript small state machines' }
  await controller.startDiscovery(controllerInput)
  const failedControllerProject = controller.getProject().id
  const failedControllerSession = controller.getSession().id
  assert.equal(controller.getPreviewRound(), null)
  assert.match(controller.snapshot().notice.message, /사용량 한도/)
  await controller.startDiscovery(controllerInput)
  assert.equal(controller.getProject().id, failedControllerProject)
  assert.equal(controller.getSession().id, failedControllerSession)
  assert.equal(controller.getPreviewRound().previews.length, 10)
  assert.equal(controller.getProject().id, controller.getSession().projectId)
  await controller.submitFeedback({
    intent: 'SELECT',
    targets: [{ candidateId: controller.getPreviewRound().previews[0].candidateId, revision: 1 }],
  })
  assert.ok(controller.getSpec())
  const savedSpec = controller.getSpec()
  const selectedReference = controller.getSelectedCandidate()
  const savedBeforeReturn = await client.restoreProject(controller.getProject().id)
  const countsBeforeReturn = JSON.stringify(counts)
  await controller.returnToDiscovery()
  assert.equal(controller.snapshot().reviewingDiscovery, true)
  assert.equal(controller.getPreviewRound().previews.length, 10)
  const savedAfterReturn = await client.restoreProject(controller.getProject().id)
  // Read-request envelopes have fresh correlation IDs; durable records must not change.
  savedAfterReturn.correlationId = savedBeforeReturn.correlationId
  savedAfterReturn.discoveryContext.correlationId = savedBeforeReturn.discoveryContext.correlationId
  assert.deepEqual(savedAfterReturn, savedBeforeReturn)
  assert.equal(JSON.stringify(counts), countsBeforeReturn)
  await controller.submitFeedback({ intent: 'SELECT', targets: [selectedReference] })
  assert.equal(controller.snapshot().phase, 'spec_review')
  assert.deepEqual(controller.getSpec(), savedSpec)
  assert.equal(JSON.stringify(counts), countsBeforeReturn)
  await controller.returnToDiscovery()
  const previewsBeforeRegeneration = counts.PREVIEW
  await controller.startDiscovery({ learningGoal: 'TypeScript saved candidate navigation' })
  assert.equal(controller.getProject().id, failedControllerProject)
  assert.notEqual(controller.getSession().id, failedControllerSession)
  assert.equal(controller.getPreviewRound().previews.length, 10)
  assert.equal(counts.PREVIEW, previewsBeforeRegeneration + 1)
  // Product wiring must bind a *new* Discovery, not rely on a test-seeded
  // lastProjectId. Exercise the real provider against the same HTTP Core.
  const persisted = new Map()
  const posted = []
  let consumerWebview = null
  const hostClientCalls = []
  let heldEvidence = null
  const hostClient = new Proxy(client, {
    get(target, key) {
      const value = Reflect.get(target, key)
      if (typeof value !== 'function') return value
      return (...args) => {
        hostClientCalls.push(String(key))
        if (key === 'execute' && args[0]?.kind === 'UI_READ_EVIDENCE_TRACE' && heldEvidence) {
          const held = heldEvidence
          heldEvidence = null
          return value.apply(target, args).then(async (result) => {
            held.arrived()
            await held.release
            return result
          })
        }
        return value.apply(target, args)
      }
    },
  })
  const host = {
    client: hostClient,
    worker: inertWorker,
    prepare: async () => ({ client: hostClient }),
    getStatus: () => ({ phase: 'CORE_CONNECTED', native: 'WORKER_READY' }),
    subscribeStatus: () => () => {},
    onDidRotate: () => () => {},
  }
  let receive
  const wireProduct = () =>
    wireWebviewMessaging(
      {
        postMessage: (message) => {
          posted.push(message)
          consumerWebview?.dispatch(message)
        },
        onDidReceiveMessage: (listener) => {
          receive = listener
          return { dispose() {} }
        },
      },
      {
        managedHost: Promise.resolve(host),
        globalState: {
          get: (key) => persisted.get(key),
          update: async (key, value) => {
            persisted.set(key, value)
          },
        },
      },
    )
  const wired = wireProduct()
  const liveAgent = await wired.agentReady
  assert.ok(liveAgent)
  await wired.ready
  await liveAgent.controller.recover()
  const callsBeforeMalformed = hostClientCalls.length
  for (const malformed of [
    { type: 'startDiscovery' },
    { type: 'startDiscovery', input: { learningGoal: 42 } },
    { type: 'startDiscovery', input: { learningGoal: 'x'.repeat(241) } },
    { type: 'startDiscovery', input: { learningGoal: 'test', workspacePath: '/invalid' } },
    { type: 'toggleBasket', ref: null },
    { type: 'selectCandidate' },
    { type: 'submitRefinement', action: 'show_more', targets: [] },
    { type: 'refineSpec', message: [] },
    { type: 'confirmSpec', kind: 'builder/start', message: 'must not run' },
    { type: 'openHistoryProject', projectId: '../invalid' },
  ])
    await receive(malformed)
  assert.equal(
    hostClientCalls.length,
    callsBeforeMalformed,
    'malformed messages must call Core zero times',
  )
  await receive({
    type: 'startDiscovery',
    input: { learningGoal: 'New project binding without seeded state' },
  })
  const wiredProjectId = wired.flowController.getProject().id
  assert.equal(
    persisted.get('bhlr.lastProjectId'),
    wiredProjectId,
    'Discovery must persist its Core project for Builder and reload',
  )
  await wired.flowController.submitFeedback({
    intent: 'SELECT',
    targets: [
      { candidateId: wired.flowController.getPreviewRound().previews[0].candidateId, revision: 1 },
    ],
  })
  const buildsBeforeConfirm = counts.BUILDER
  await Promise.all([receive({ type: 'confirmSpec' }), receive({ type: 'confirmSpec' })])
  assert.equal(
    counts.BUILDER,
    buildsBeforeConfirm + 1,
    'one explicit confirm gesture starts Builder exactly once, even with duplicate clicks',
  )
  const wiredTask = (await client.restoreProject(wiredProjectId)).currentTask
  assert.ok(wiredTask)
  assert.ok(
    !JSON.stringify(posted).includes(root),
    'host workspace paths must not cross the webview boundary',
  )
  assert.ok(
    !JSON.stringify(posted).includes('"workspacePath"'),
    'host-only path fields must not be projected',
  )
  assert.ok(
    !JSON.stringify(posted).includes(token),
    'Core credentials must not cross the webview boundary',
  )
  const buildsBefore = counts.BUILDER
  await liveAgent.controller.resumeAfterDecision()
  assert.equal(counts.BUILDER, buildsBefore + 1)
  assert.equal(liveAgent.controller.getViewModel().builder.taskId, wiredTask.id)
  wired.messageSubscription.dispose()
  const beforeReload = JSON.stringify(counts)
  const reloaded = wireProduct()
  const reloadedAgent = await reloaded.agentReady
  await reloaded.ready
  assert.equal(reloaded.flowController.snapshot().phase, 'building')
  assert.equal(reloaded.flowController.getProject().id, wiredProjectId)
  assert.equal(reloadedAgent.controller.getViewModel().builder.taskId, wiredTask.id)
  assert.equal(JSON.stringify(counts), beforeReload, 'reload must be read-only')
  // A failed synthetic job exercises the real explicit retry -> HTTP -> SQLite
  // -> projected webview response, without launching an Analyst or model.
  const retryExchange = await client.execute({
    ...uiMetadata(),
    kind: 'UI_RECORD_HELPER_EXCHANGE',
    idempotencyKey: entityId('idem'),
    projectId: wiredProjectId,
    taskId: wiredTask.id,
    userMessage: 'Synthetic model-0 retry verification, not learner Evidence.',
    helperResponseSummary: 'Deterministic consumer fixture only.',
    closeConversation: true,
  })
  let retryJob = storage.repository.readAnalysisJobForEpisode(
    wiredProjectId,
    retryExchange.episodeId,
  )
  assert.ok(retryJob)
  for (let attempt = 1; attempt <= 2; attempt++) {
    const claimed = await application.executeAnalysis({
      schemaVersion: 1,
      kind: 'ANALYSIS_CLAIM_JOB',
      correlationId: retryExchange.correlationId,
      actor: { kind: 'KIRO_ADAPTER' },
      projectId: wiredProjectId,
      analysisJobId: retryJob.id,
      expectedJobRevision: retryJob.revision,
      runtimeHandle: `synthetic-consumer-${attempt}`,
    })
    assert.equal(claimed.success, true)
    const failed = await application.executeAnalysis({
      schemaVersion: 1,
      kind: 'ANALYSIS_FAIL_ATTEMPT',
      correlationId: retryExchange.correlationId,
      actor: { kind: 'KIRO_ADAPTER' },
      projectId: wiredProjectId,
      analysisJobId: retryJob.id,
      expectedJobRevision: claimed.data.revision,
      attempt: claimed.data.attempt,
      failure: { code: 'ANALYST_TIMEOUT', message: 'Synthetic fixture timeout.', retryable: true },
    })
    assert.equal(failed.success, true)
    retryJob = failed.data
  }
  assert.equal(retryJob.status, 'FAILED')
  const dom = installFakeDom()
  restoreDom = dom.restore
  const webviewRoot = dom.createElement('div')
  const buttonActions = []
  consumerWebview = new WebviewClient({
    postMessage: (message) => buttonActions.push(reloadedAgent.dispatcher.handle(message)),
  })
  bootstrap(webviewRoot, consumerWebview)
  reloadedAgent.dispatcher.hydrate()
  await reloadedAgent.dispatcher.handle({ kind: 'evidence/read' })
  assert.equal(
    posted.filter((message) => message.kind === 'agent/evidence').at(-1).view.analysis[0]
      .displayState,
    'ANALYSIS_FAILED',
  )
  const beforeRetryPosts = posted.filter((message) => message.kind === 'agent/evidence').length
  const beforeRetryCalls = hostClientCalls.length
  const retryButton = webviewRoot.queryAll(
    (element) => element.className === 'agent-evidence-retry',
  )[0]
  assert.ok(retryButton, 'the actual renderer must provide the failed Analysis retry button')
  retryButton.click()
  retryButton.click()
  await Promise.all(buttonActions)
  const retryPosts = posted.filter((message) => message.kind === 'agent/evidence')
  assert.equal(retryPosts.length, beforeRetryPosts + 1)
  assert.deepEqual(hostClientCalls.slice(beforeRetryCalls), [
    'execute',
    'execute',
    'execute',
    'restoreProject',
  ])
  assert.equal(retryPosts.at(-1).view.analysis[0].displayState, 'WAITING')
  assert.equal(
    webviewRoot.queryAll((element) => element.className === 'agent-evidence-retry').length,
    0,
  )
  assert.equal(
    webviewRoot.queryAll((element) => element.className === 'agent-evidence-analysis-job')[0]
      .dataset.displayState,
    'WAITING',
  )
  assert.equal(retryPosts.at(-1).view.userUnderstandingTotal, 0)
  assert.equal(
    storage.repository.readAnalysisJob(wiredProjectId, retryJob.id).revision,
    retryJob.revision + 1,
  )
  assert.equal(
    JSON.stringify(counts),
    beforeReload,
    'synthetic Analysis retry must not invoke a model',
  )
  let releaseEvidence
  let evidenceArrived
  const readArrived = new Promise((done) => {
    evidenceArrived = done
  })
  heldEvidence = {
    arrived: evidenceArrived,
    release: new Promise((done) => {
      releaseEvidence = done
    }),
  }
  const evidencePostsBefore = posted.filter((message) => message.kind === 'agent/evidence').length
  const oldRead = reloadedAgent.dispatcher.handle({ kind: 'evidence/read' })
  await readArrived
  await receive({ type: 'openHistoryProject', projectId: second.projectId })
  releaseEvidence()
  await oldRead
  assert.equal(
    posted.filter((message) => message.kind === 'agent/evidence').length,
    evidencePostsBefore,
    'a delayed real HTTP Evidence response must not leak into another History project',
  )
  assert.equal(reloaded.flowController.snapshot().phase, 'discovery_workspace')
  assert.equal(reloaded.flowController.getProject().id, second.projectId)
  assert.equal(JSON.stringify(counts), beforeReload, 'History navigation must not invoke an Agent')
  reloaded.messageSubscription.dispose()
  // Real native workspace switches reload the frontend before PREVIEW is
  // durable. Recreate that lifecycle with the actual provider and HTTP/SSE,
  // keeping only the Agent computation deterministic and explicitly gated.
  consumerWebview = null
  let releasePreview
  heldPreview = new Promise((done) => {
    releasePreview = done
  })
  const beforeInFlightReload = { ...counts }
  const beforeWindow = wireProduct()
  await beforeWindow.ready
  const startBeforeReload = receive({
    type: 'startDiscovery',
    input: { learningGoal: 'Read-only recovery after a native workspace window switch' },
  })
  const until = async (predicate) => {
    const deadline = Date.now() + 5000
    while (!predicate()) {
      assert.ok(Date.now() < deadline, 'consumer lifecycle did not settle')
      await new Promise((done) => setTimeout(done, 10))
    }
  }
  await until(
    () =>
      beforeWindow.flowController.getSession() !== null &&
      beforeWindow.flowController.getProject()?.id !== second.projectId,
  )
  const inFlightProject = beforeWindow.flowController.getProject().id
  assert.equal(persisted.get('bhlr.lastProjectId'), inFlightProject)
  beforeWindow.messageSubscription.dispose()
  const afterWindow = wireProduct()
  await afterWindow.ready
  assert.equal(afterWindow.flowController.getProject().id, inFlightProject)
  assert.equal(afterWindow.flowController.snapshot().discoveryInProgress, true)
  assert.equal(afterWindow.flowController.getPreviewRound(), null)
  releasePreview()
  heldPreview = null
  await until(
    () =>
      afterWindow.flowController.getPreviewRound()?.previews.length === 10 &&
      !afterWindow.flowController.snapshot().discoveryInProgress,
  )
  await startBeforeReload
  assert.equal(afterWindow.flowController.snapshot().phase, 'discovery_workspace')
  assert.deepEqual(
    counts,
    { ...beforeInFlightReload, PREVIEW: beforeInFlightReload.PREVIEW + 1 },
    'reload must read the existing PREVIEW, never replay or auto-start the next phase',
  )
  assert.ok(
    posted.some(
      (message) =>
        message.type === 'hydrateFlow' &&
        message.snapshot.project?.id === inFlightProject &&
        message.snapshot.previewRound?.previews.length === 10,
    ),
    'terminal completion must automatically reach the actual webview bridge',
  )
  afterWindow.messageSubscription.dispose()
  // Exercise fresh ROUND/MERGE completion without a History reload. The real
  // port must carry the saved details through the controller and webview bridge.
  const feedbackPort = new LocalCoreDiscoveryPort(client)
  const feedbackController = new FlowController(
    {
      discovery: feedbackPort,
      spec: feedbackPort,
      restore: feedbackPort,
    },
    {
      ids: {
        id: entityId,
        correlationId: () => entityId('corr'),
        idempotencyKey: () => entityId('idem'),
      },
    },
  )
  await feedbackController.startDiscovery({ learningGoal: 'Synthetic feedback display regression' })
  const feedbackTargets = feedbackController
    .snapshot()
    .previewRound.previews.slice(0, 2)
    .map((p) => ({ candidateId: p.candidateId, revision: 1 }))
  for (const target of feedbackTargets) feedbackController.toggleBasket(target)
  const feedbackInput = feedbackController.snapshot().input
  const feedbackBasket = feedbackController.snapshot().basket
  const feedbackRoot = dom.createElement('div')
  const feedbackWebview = new WebviewClient({ postMessage: () => {} })
  bootstrap(feedbackRoot, feedbackWebview)
  for (const intent of ['MERGE', 'REGENERATE']) {
    const beforeFeedback = { ...counts }
    await feedbackController.submitFeedback({
      intent,
      targets: intent === 'MERGE' ? feedbackTargets : [],
    })
    const snapshot = feedbackController.snapshot()
    assert.notEqual(
      snapshot.notice?.kind,
      'error',
      JSON.stringify({ notice: snapshot.notice, runs: await client.listRuns(snapshot.project.id) }),
    )
    const latest = snapshot.rounds.at(-1)
    assert.ok(latest)
    const expectedTitle =
      intent === 'MERGE' ? 'Merged synthetic candidate' : 'Regenerated synthetic candidate'
    feedbackWebview.dispatch({ type: 'hydrateFlow', snapshot })
    const titles = feedbackRoot
      .queryAll((e) => e.className === 'flow-candidate-title')
      .map((e) => e.textContent)
    assert.equal(titles.at(-1), expectedTitle)
    assert.equal(titles[0], 'Direction 1', 'a new revision must not replace its original preview')
    assert.equal(
      feedbackRoot
        .queryAll((e) => e.className === 'flow-candidate-summary')
        .some((e) => e.textContent === '세부 정보를 불러오는 중이에요.'),
      false,
    )
    assert.deepEqual(snapshot.input, feedbackInput)
    assert.deepEqual(snapshot.basket, feedbackBasket)
    assert.deepEqual(
      counts,
      {
        ...beforeFeedback,
        ...(intent === 'MERGE'
          ? { ENRICH_SELECTED: (beforeFeedback.ENRICH_SELECTED ?? 0) + 1 }
          : {}),
        [intent === 'MERGE' ? 'MERGE' : 'ROUND']:
          (beforeFeedback[intent === 'MERGE' ? 'MERGE' : 'ROUND'] ?? 0) + 1,
      },
      'rendering saved details must not call another enrichment or model',
    )
    const persisted = await client.restoreProject(snapshot.project.id)
    assert.ok(persisted.discoveryContext.candidates.some((c) => c.title === expectedTitle))
  }
  // A real Core-issued blocking Decision, resolved through the actual frontend
  // action. Synthetic fixture only: no native model or user data participates.
  const decisionTask = (await client.restoreProject(first.projectId)).currentTask
  const builderMetadata = {
    schemaVersion: 1,
    correlationId: decisionTask.correlationId,
    actor: { kind: 'AGENT', role: 'BUILDER' },
  }
  const startedTask = await application.executeAgent('BUILDER', {
    ...builderMetadata,
    kind: 'BUILDER_START_TASK',
    idempotencyKey: entityId('idem'),
    projectId: first.projectId,
    taskId: decisionTask.id,
    expectedTaskRevision: decisionTask.revision,
  })
  assert.equal(startedTask.success, true, JSON.stringify(startedTask))
  const activeTask = (await client.restoreProject(first.projectId)).currentTask
  const context = await application.executeAgent('BUILDER', {
    ...builderMetadata,
    kind: 'BUILDER_UPDATE_LIVE_CONTEXT',
    idempotencyKey: entityId('idem'),
    context: {
      schemaVersion: 1,
      id: entityId('context'),
      projectId: first.projectId,
      taskId: activeTask.id,
      correlationId: activeTask.correlationId,
      contextVersion: 1,
      expectedPreviousVersion: 0,
      checkpoint: 'TASK_STARTED',
      stage: 'Synthetic choice',
      currentGoal: 'Check explicit choice continuation.',
      recentChanges: [],
      activeDecisionIds: [],
      activeConceptNames: [],
      relatedFiles: [],
      nextActions: ['Choose behavior.'],
      updatedAt: new Date().toISOString(),
      source: { kind: 'AGENT', role: 'BUILDER' },
      redactionStatus: 'NOT_REQUIRED',
    },
  })
  assert.equal(context.success, true, JSON.stringify(context))
  const requested = await application.executeAgent('BUILDER', {
    ...builderMetadata,
    kind: 'BUILDER_REQUEST_DECISION',
    idempotencyKey: entityId('idem'),
    projectId: first.projectId,
    taskId: activeTask.id,
    expectedTaskRevision: activeTask.revision,
    expectedContextVersion: 1,
    decision: {
      category: 'PRODUCT_BEHAVIOR',
      question: 'Which synthetic behavior?',
      reasonRequiredNow: 'The next implementation depends on this choice.',
      options: ['first', 'second'].map((key) => ({
        key,
        label: key,
        description: key,
        impacts: ['Synthetic behavior changes.'],
        tradeoffs: [],
      })),
      recommendedOptionKey: 'first',
      recommendationRationale: 'Synthetic recommendation.',
      relatedConceptNames: [],
      sourceReferences: [],
      independentWorkCanContinue: false,
    },
    context: {
      stage: 'Synthetic choice',
      currentGoal: 'Wait for the choice.',
      recentChanges: [],
      activeConceptNames: [],
      relatedFiles: [],
      nextActions: ['Apply choice.'],
      blockingReason: 'Needs explicit user choice.',
    },
  })
  assert.equal(requested.success, true, JSON.stringify(requested))
  const continuation = new AgentSurfaceController({
    port: agentPort,
    globalState: { get: () => first.projectId, update: async () => {} },
    onChange: () => {},
    openFolder: async () => {},
    openExternal: async () => {},
  })
  const continuationDispatcher = new AgentDispatcher(continuation, () => {})
  const choose = {
    kind: 'decision/resolveAndContinue',
    decisionId: requested.data.decisionId,
    selection: { kind: 'RECOMMENDATION' },
    helperUsed: false,
  }
  const beforeChoice = counts.BUILDER
  await Promise.all([continuationDispatcher.handle(choose), continuationDispatcher.handle(choose)])
  assert.equal(counts.BUILDER, beforeChoice + 1, 'save success starts exactly one Builder')
  const afterChoice = await client.restoreProject(first.projectId)
  assert.equal(afterChoice.currentTask.status, 'ACTIVE')
  assert.ok(afterChoice.decisions.find((d) => d.request.id === choose.decisionId)?.resolution)
  assert.equal(afterChoice.pendingDecisions.length, 0)
  continuation.dispose()
  const report = {
    status: 'PASS',
    boundary: 'actual program controller/port + authenticated HTTP/SSE + SQLite',
    agent: 'DELAYED_DETERMINISTIC_FIXTURE',
    checks: [
      'explicit choose-and-continue persists a real blocking Core Decision and starts Builder once through the actual dispatcher; duplicate clicks coalesce',
      'explicit confirm through the real provider prepares and starts Builder once; duplicate clicks do not start a second run and reload remains read-only',
      'fresh MERGE and REGENERATE display durable candidate titles immediately through the actual webview bridge; exact revisions, input/basket preserved, no extra enrichment',
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
      'original port replaces failed-run cache and concurrent retries create one run',
      'controller retry preserves Project/Session and shows safe quota guidance',
      'cancelled run is not success',
      'controller uses Core project ID',
      'Spec back navigation preserves durable candidates and Spec with zero Agent calls; explicit regeneration creates one new Session/preview',
      'unseeded provider binds new Discovery to Builder and restores saved flow on reload',
      'provider reload during an active PREVIEW automatically refreshes the webview from durable HTTP/SSE; no replay or extra Agent',
      'malformed or mixed-protocol webview messages call Core zero times; valid messages still work',
      'History selection restores the existing screen without a new Agent run',
      'late authenticated Evidence read is detached after History project switching',
      'actual webview retry button resolves the failed job revision and updates to WAITING; duplicate clicks mutate once',
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
  restoreDom?.()
  await runtime.close()
  server.closeAllConnections()
  await new Promise((done) => server.close(done))
  storage.close()
}
