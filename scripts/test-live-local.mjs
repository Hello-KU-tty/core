// Real SDK -> local backend -> Kiro ACP -> Core, synthetic data only.
// The target must be a newly initialized test/local data root, not a user's Crew database.
import { resolve } from 'node:path'
import { connectLocalCore } from '../packages/frontend-client/dist/node.js'
import { entityId, uiMetadata } from '../packages/frontend-client/dist/index.js'
const client = await connectLocalCore(resolve(process.argv[2] ?? '.data/local/connection.json'))
const started = await client.startDiscovery(
  {
    learningGoal: 'TypeScript discriminated unions and exhaustive UI state transitions',
    ...(process.argv.includes('--personal-need')
      ? {
          personalNeed:
            'I want a tiny local one-page practice app for safely opening, submitting and closing a modal.',
        }
      : {}),
  },
  { enrichAfterPreview: false },
)
const projectId = started.projectId
const print = (value) => console.log(JSON.stringify({ projectId, ...value }))
async function finish(run) {
  const counters = { text: 0, tools: 0 }
  const result = await client.watchRun(run.id, (event) => {
    if (event.kind === 'TEXT') counters.text++
    if (event.kind === 'TOOL') counters.tools++
  })
  print({ phase: result.phase, status: result.status, error: result.errorCode, ...counters })
  if (result.status !== 'SUCCEEDED') throw new Error(result.errorCode ?? 'RUN_FAILED')
}
async function discovery(phase, extra = {}) {
  const s = await client.restoreProject(projectId)
  return client.startRun({
    kind: 'DISCOVERY',
    projectId,
    discoverySessionId: s.discoverySession.id,
    expectedSessionRevision: s.discoverySession.revision,
    idempotencyKey: entityId('idem'),
    phase,
    ...extra,
  })
}
async function feedback(intent, target, message) {
  const s = await client.restoreProject(projectId)
  const session = s.discoverySession
  const c = s.discoveryContext
  await client.execute({
    ...uiMetadata(session.correlationId),
    kind: 'UI_RECORD_DISCOVERY_FEEDBACK',
    expectedSessionRevision: session.revision,
    idempotencyKey: entityId('idem'),
    feedback: {
      schemaVersion: 1,
      id: entityId('feedback'),
      discoverySessionId: session.id,
      correlationId: session.correlationId,
      roundId: c.rounds.at(-1)?.id ?? c.previewRound.finalRoundId,
      intent,
      targets: [{ candidateId: target.id, revision: target.revision ?? 1 }],
      ...(message ? { message } : {}),
      createdAt: new Date().toISOString(),
      source: { kind: 'USER' },
      redactionStatus: 'NOT_REQUIRED',
    },
  })
}
try {
  await finish(started.run)
  let s = await client.restoreProject(projectId)
  if (s.discoveryContext.previewRound?.previews.length !== 10) throw new Error('PREVIEW_COUNT')
  const preview = s.discoveryContext.previewRound.previews[0]
  await finish(await discovery('ENRICH_SELECTED', { candidateIds: [preview.candidateId] }))
  await feedback(
    'REVISE',
    { id: preview.candidateId },
    'Keep this as a tiny local web app. Remove accounts, external APIs and hosted deployment; keep the discriminated-union interaction central.',
  )
  await finish(await discovery('ROUND'))
  s = await client.restoreProject(projectId)
  const ref = s.discoveryContext.rounds.at(-1).candidates[0]
  await feedback('SELECT', { id: ref.candidateId, revision: ref.revision })
  await finish(await discovery('SPEC'))
  s = await client.restoreProject(projectId)
  const prior = s.learningSpec.revision
  await finish(
    await discovery('SPEC', {
      expectedSpecRevision: prior,
      message:
        'Keep the interface to one browser page and explicitly exclude authentication, deployment, external services and database setup. Preserve the learning goal.',
    }),
  )
  s = await client.restoreProject(projectId)
  if (s.learningSpec.revision <= prior || s.learningSpec.status !== 'DRAFT')
    throw new Error('SPEC_REFINEMENT_NOT_STORED')
  await client.execute({
    ...uiMetadata(s.discoverySession.correlationId),
    kind: 'UI_CONFIRM_LEARNING_SPEC',
    projectId,
    learningSpecId: s.learningSpec.id,
    expectedSpecRevision: s.learningSpec.revision,
    idempotencyKey: entityId('idem'),
  })
  s = await client.restoreProject(projectId)
  await client.execute({
    ...uiMetadata(s.discoverySession.correlationId),
    kind: 'UI_PREPARE_BUILDER_TASK',
    projectId,
    learningSpecId: s.learningSpec.id,
    expectedSpecRevision: s.learningSpec.revision,
    idempotencyKey: entityId('idem'),
  })
  s = await client.restoreProject(projectId)
  print({
    status: 'SPEC_AND_TASK_READY',
    specRevision: s.learningSpec.revision,
    taskId: s.currentTask.id,
    historyContainsProject: (await client.listProjects()).projects.some(
      (p) => p.project.id === projectId,
    ),
  })
} catch (error) {
  print({ status: 'FAILED', code: error.code ?? error.message })
  process.exitCode = 1
}
