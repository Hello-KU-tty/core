import { randomUUID } from 'node:crypto'

import {
  CrewCoreClient,
  CrewDiscoveryClient,
  createDiscoveryEphemeralContext,
} from '../packages/kiro-adapter/dist/crew-app-client.js'

const gatewayUrl = new URL(process.env.VIBE_HELPER_TARGET_GATEWAY_URL ?? 'http://127.0.0.1:5476')
if (
  gatewayUrl.protocol !== 'http:' ||
  !['127.0.0.1', 'localhost'].includes(gatewayUrl.hostname) ||
  gatewayUrl.pathname !== '/'
) {
  throw new TypeError('VIBE_HELPER_TARGET_GATEWAY_URL must be a loopback HTTP origin')
}

const dashboardToken = process.env.VIBE_HELPER_TARGET_DASHBOARD_TOKEN ?? ''
const appToken = process.env.VIBE_HELPER_TARGET_APP_TOKEN ?? ''
if (dashboardToken.length < 20 || appToken.length < 20) {
  throw new TypeError('Target dashboard and app tokens are required')
}

const timeoutMs = Number(process.env.VIBE_HELPER_TARGET_PERF_TIMEOUT_MS ?? 180_000)
if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 30_000 || timeoutMs > 420_000) {
  throw new TypeError('VIBE_HELPER_TARGET_PERF_TIMEOUT_MS must be 30000..420000')
}

const cookieName = `mc_token_${gatewayUrl.port || '80'}`

function id(prefix) {
  return `${prefix}_${randomUUID()}`
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

async function readJson(response, label) {
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const error =
      payload !== null && typeof payload === 'object' && typeof payload.error === 'string'
        ? payload.error
        : `HTTP ${String(response.status)}`
    throw new Error(`${label}: ${error}`)
  }
  return payload
}

const applicationApi = {
  async post(path, body) {
    let lastError = null
    for (let attempt = 0; attempt < 30; attempt += 1) {
      try {
        const response = await fetch(new URL(path, gatewayUrl), {
          method: 'POST',
          signal: AbortSignal.timeout(5_000),
          headers: {
            'content-type': 'application/json',
            cookie: `${cookieName}=${dashboardToken}`,
          },
          body: JSON.stringify(body),
        })
        if ([502, 503, 504].includes(response.status)) {
          lastError = new Error(`Core proxy returned HTTP ${String(response.status)}`)
          await delay(500)
          continue
        }
        return readJson(response, 'Core proxy')
      } catch (error) {
        lastError = error
        await delay(500)
      }
    }
    throw lastError ?? new Error('Core proxy did not become ready')
  },
}

function appUrl(path) {
  const url = new URL(path, gatewayUrl)
  url.searchParams.set('token', appToken)
  return url
}

const chatApi = {
  async get(path) {
    return readJson(
      await fetch(appUrl(path), { signal: AbortSignal.timeout(5_000) }),
      'Crew App API',
    )
  },
  async post(path, body) {
    return readJson(
      await fetch(appUrl(path), {
        method: 'POST',
        signal: AbortSignal.timeout(5_000),
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
      'Crew App API',
    )
  },
}

const coreClient = new CrewCoreClient(applicationApi)
const discoveryClient = new CrewDiscoveryClient(chatApi, {
  fetch: (path, init) => fetch(appUrl(path), init),
})

async function restore(projectId) {
  return coreClient.restoreProjectSession(id('corr'), projectId)
}

async function waitForSnapshot(projectId, predicate) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const snapshot = await restore(projectId)
    if (predicate(snapshot)) return snapshot
    await delay(250)
  }
  throw new Error(`Target Core did not reach the expected durable state within ${timeoutMs}ms`)
}

function toolIdentifiers(snapshot) {
  const session = snapshot.discoverySession
  if (session === null || session === undefined) throw new Error('Discovery Session is missing')
  return `Core tool identifiers: schemaVersion=1, projectId=${snapshot.project.id}, discoverySessionId=${session.id}, correlationId=${session.correlationId}, expectedSessionRevision=${String(session.revision)}, idempotencyKey=${id('idem')}.`
}

async function dispatch(snapshot, phase, message) {
  const session = snapshot.discoverySession
  if (session === null || session === undefined) throw new Error('Discovery Session is missing')
  return discoveryClient.dispatch(
    session.id,
    session.revision,
    `${message}\n\n${toolIdentifiers(snapshot)}`,
    createDiscoveryEphemeralContext(snapshot, phase),
    phase,
  )
}

async function waitForDurableOrCompleted(projectId, predicate, completions) {
  return Promise.race([
    waitForSnapshot(projectId, predicate),
    Promise.all(completions).then(async (outcomes) => {
      await delay(500)
      const snapshot = await restore(projectId)
      if (predicate(snapshot)) return snapshot
      throw new Error(`Agent streams finished as ${outcomes.join(',')} without durable Core state`)
    }),
  ])
}

async function observedCompletion(completion) {
  return Promise.race([completion, delay(250).then(() => 'PENDING_AFTER_DURABLE')])
}

const projectId = id('project')
const interactionStartedAt = Date.now()
await coreClient.startDiscovery({
  schemaVersion: 1,
  kind: 'UI_START_DISCOVERY',
  correlationId: id('corr'),
  actor: { kind: 'UI' },
  idempotencyKey: id('idem'),
  projectId,
  input: {
    learningGoal: '[T15 최종 측정] WebRTC 연결 상태 머신을 배우고 싶어요',
    currentLevel: 'NEW',
  },
})

let snapshot = await restore(projectId)
const previewStartedAt = Date.now()
const previewReceipt = await dispatch(
  snapshot,
  'PREVIEW',
  '새 Discovery의 첫 단계입니다. 서로 다른 lightweight Candidate preview를 정확히 10개 제출해 주세요.',
)
snapshot = await waitForDurableOrCompleted(
  projectId,
  (current) => (current.discoveryContext?.previewRound?.previews.length ?? 0) === 10,
  [previewReceipt.completion],
)
const previewDurableAt = Date.now()
const previewRound = snapshot.discoveryContext?.previewRound
if (previewRound === null || previewRound === undefined) {
  throw new Error('Preview Agent did not store a Preview Round')
}
if (
  previewRound.previews.length !== 10 ||
  snapshot.discoverySession?.revision !== 1 ||
  (snapshot.discoveryContext?.rounds.length ?? 0) !== 0
) {
  throw new Error('Preview durable state violated count, revision, or pre-finalization invariants')
}

const previewCandidateIds = previewRound.previews.map((preview) => preview.candidateId)
const enrichmentStartedAt = Date.now()
const firstReceipt = await dispatch(
  snapshot,
  'ENRICH_FIRST',
  `Candidate preview의 FIRST batch를 상세화해 주세요. previewRoundId=${previewRound.id}, batch=FIRST. Candidate ID와 preview의 의미 필드는 그대로 복사하고 위치 1~5만 submit_candidate_enrichments로 제출하세요.`,
)
snapshot = await waitForDurableOrCompleted(
  projectId,
  (current) => (current.discoveryContext?.candidateEnrichments.length ?? 0) === 5,
  [firstReceipt.completion],
)
const firstEnrichmentAt = Date.now()
await Promise.race([firstReceipt.completion, delay(5_000)])

const secondReceipt = await dispatch(
  snapshot,
  'ENRICH_SECOND',
  `Candidate preview의 SECOND batch를 상세화해 주세요. previewRoundId=${previewRound.id}, batch=SECOND. Candidate ID와 preview의 의미 필드는 그대로 복사하고 위치 6~10만 submit_candidate_enrichments로 제출하세요.`,
)
snapshot = await waitForDurableOrCompleted(
  projectId,
  (current) => (current.discoveryContext?.rounds.length ?? 0) === 1,
  [secondReceipt.completion],
)
const completeRoundAt = Date.now()

const context = snapshot.discoveryContext
const finalRound = context?.rounds.at(-1)
if (context === null || context === undefined || finalRound === undefined) {
  throw new Error('Complete Candidate Round is missing')
}
const finalCandidateIds = finalRound.candidates.map((reference) => reference.candidateId)
if (
  context.candidateEnrichments.length !== 10 ||
  context.candidates.length !== 10 ||
  finalRound.candidates.length !== 10 ||
  snapshot.discoverySession?.revision !== 2 ||
  JSON.stringify(finalCandidateIds) !== JSON.stringify(previewCandidateIds)
) {
  throw new Error('Enrichment completion violated identity, count, revision, or stream invariants')
}

const [previewCompletion, firstCompletion, secondCompletion] = await Promise.all([
  observedCompletion(previewReceipt.completion),
  observedCompletion(firstReceipt.completion),
  observedCompletion(secondReceipt.completion),
])

const result = {
  phase: 'TARGET_PREVIEW_ENRICHMENT_COMPLETE',
  promptVersion: '1.1.9',
  model: 'claude-haiku-4.5',
  previewCount: previewRound.previews.length,
  completeCandidateCount: finalRound.candidates.length,
  previewSessionRevision: 1,
  completeSessionRevision: snapshot.discoverySession.revision,
  previewDurableMilliseconds: previewDurableAt - previewStartedAt,
  firstUsefulInteractionMilliseconds: previewDurableAt - interactionStartedAt,
  firstEnrichmentMilliseconds: firstEnrichmentAt - enrichmentStartedAt,
  enrichmentCompleteMilliseconds: completeRoundAt - enrichmentStartedAt,
  totalInteractionMilliseconds: completeRoundAt - interactionStartedAt,
  previewDispatchMilliseconds: Math.round(previewReceipt.dispatchMilliseconds),
  enrichmentDispatchMilliseconds: [
    Math.round(firstReceipt.dispatchMilliseconds),
    Math.round(secondReceipt.dispatchMilliseconds),
  ],
  contextInjection: [
    previewReceipt.contextInjection,
    firstReceipt.contextInjection,
    secondReceipt.contextInjection,
  ],
  completionObservedAtDurableState: [previewCompletion, firstCompletion, secondCompletion],
  previewWithinThirtySecondGate: previewDurableAt - previewStartedAt <= 30_000,
  identityPreserved: true,
  containsPersonalData: false,
}
process.stdout.write(`${JSON.stringify(result)}\n`)
// The durable Core state is the product completion boundary. Do not keep this
// one-shot measurement process alive solely for trailing Agent prose streams.
process.exit(0)
