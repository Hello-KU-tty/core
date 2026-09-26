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
const { candidateFixture, draftLearningSpecFixture } = require(join(root, 'fixtures.cjs'))
const { FlowController } = require(join(root, 'controller.cjs'))
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
let failNext = false
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
        failNext = false
        throw Object.assign(new Error('FIXTURE_AGENT_FAILED'), { code: 'FIXTURE_AGENT_FAILED' })
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
  failNext = true
  const failed = unwrap(
    await port.startDiscovery(
      { projectId: 'ignored', input: { learningGoal: 'Synthetic failure check' } },
      envelope(0),
    ),
  )
  const failure = await port.generatePreviewRound({ discoverySessionId: failed.id }, envelope(0))
  assert.equal(failure.ok, false)
  assert.equal(failure.error.message, 'FIXTURE_AGENT_FAILED')
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
      'cancelled run is not success',
      'controller uses Core project ID',
      'selected candidate must match the requested revision',
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
