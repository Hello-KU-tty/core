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

const runs = Number(process.env.VIBE_HELPER_TARGET_PERF_RUNS ?? 1)
if (!Number.isSafeInteger(runs) || runs < 1 || runs > 20) {
  throw new TypeError('VIBE_HELPER_TARGET_PERF_RUNS must be an integer from 1 through 20')
}
const targetModel = process.env.VIBE_HELPER_TARGET_MODEL ?? 'claude-haiku-4.5'

const timeoutMs = Number(process.env.VIBE_HELPER_TARGET_PERF_TIMEOUT_MS ?? 120_000)
if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 30_000 || timeoutMs > 420_000) {
  throw new TypeError('VIBE_HELPER_TARGET_PERF_TIMEOUT_MS must be 30000..420000')
}

const cookieName = `mc_token_${gatewayUrl.port || '80'}`
const applicationApi = {
  async post(path, body) {
    const response = await fetch(new URL(path, gatewayUrl), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: `${cookieName}=${dashboardToken}`,
      },
      body: JSON.stringify(body),
    })
    if (!response.ok) throw new Error(`Core proxy returned HTTP ${String(response.status)}`)
    return response.json()
  },
}

function appUrl(path) {
  const url = new URL(path, gatewayUrl)
  url.searchParams.set('token', appToken)
  return url
}

const chatApi = {
  async get(path) {
    const response = await fetch(appUrl(path))
    if (!response.ok) throw new Error(`Crew App API returned HTTP ${String(response.status)}`)
    return response.json()
  },
  async post(path, body) {
    const response = await fetch(appUrl(path), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!response.ok) throw new Error(`Crew App API returned HTTP ${String(response.status)}`)
    return response.json()
  },
}

const coreClient = new CrewCoreClient(applicationApi)
const discoveryClient = new CrewDiscoveryClient(chatApi, {
  fetch: (path, init) => fetch(appUrl(path), init),
})

function id(prefix) {
  return `${prefix}_${randomUUID()}`
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

async function waitForSnapshot(projectId, predicate) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const snapshot = await coreClient.restoreProjectSession(id('corr'), projectId)
    if (predicate(snapshot)) return snapshot
    await delay(250)
  }
  throw new Error(`Target Core did not reach the expected durable revision within ${timeoutMs}ms`)
}

function currentCandidates(snapshot) {
  const context = snapshot.discoveryContext
  const latestRound = context?.rounds.at(-1)
  if (context === null || context === undefined || latestRound === undefined) return []
  const keys = new Set(
    latestRound.candidates.map(
      (candidate) => `${candidate.candidateId}:${String(candidate.revision)}`,
    ),
  )
  return context.candidates.filter((candidate) => keys.has(`${candidate.id}:${candidate.revision}`))
}

function toolContext(snapshot) {
  const session = snapshot.discoverySession
  if (session === null || session === undefined) throw new Error('Discovery Session is missing')
  return `Core tool context: schemaVersion=1, projectId=${snapshot.project.id}, discoverySessionId=${session.id}, correlationId=${session.correlationId}, expectedSessionRevision=${session.revision}, idempotencyKey=${id('idem')}.`
}

async function dispatchAndMeasure(snapshot, purpose, message, predicate, phase = purpose) {
  const session = snapshot.discoverySession
  if (session === null || session === undefined) throw new Error('Discovery Session is missing')
  const startedAt = Date.now()
  const receipt = await discoveryClient.dispatch(
    session.id,
    session.revision,
    `${message}\n\n${toolContext(snapshot)}`,
    createDiscoveryEphemeralContext(snapshot, purpose),
    phase,
  )
  const completionPromise = receipt.completion
  const durable = await Promise.race([
    waitForSnapshot(snapshot.project.id, predicate),
    completionPromise.then(async (completion) => {
      await delay(250)
      const current = await coreClient.restoreProjectSession(id('corr'), snapshot.project.id)
      if (predicate(current)) return current
      throw new Error(`Discovery stream finished as ${completion} without a durable Core revision`)
    }),
  ])
  const durableAt = Date.now()
  const durableMilliseconds = durableAt - startedAt
  const completion = await completionPromise
  if (completion !== 'DONE') throw new Error(`Discovery stream finished as ${completion}`)
  return {
    snapshot: durable,
    durableAt,
    metric: {
      durableMilliseconds,
      dispatchMilliseconds: Math.round(receipt.dispatchMilliseconds),
      contextInjection: receipt.contextInjection,
      contextCharacters: receipt.contextCharacters,
    },
  }
}

function percentile95(values) {
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)]
}

const results = []
for (let runIndex = 1; runIndex <= runs; runIndex += 1) {
  const projectId = id('project')
  const correlationId = id('corr')
  const initialStartedAt = Date.now()
  await coreClient.startDiscovery({
    schemaVersion: 1,
    kind: 'UI_START_DISCOVERY',
    correlationId,
    actor: { kind: 'UI' },
    idempotencyKey: id('idem'),
    projectId,
    input: {
      learningGoal: '[T15 성능 측정] 실시간 상태 동기화를 배우고 싶어요',
      personalNeed: '친구들과 브라우저에서 함께 연습할 작은 도구를 만들고 싶어요',
      currentLevel: 'BEGINNER',
    },
  })
  let snapshot = await coreClient.restoreProjectSession(id('corr'), projectId)
  const initial = await dispatchAndMeasure(
    snapshot,
    'ROUND',
    '새 Discovery를 시작합니다. 제공된 최신 Core context를 사용해 첫 Candidate Round를 생성해 주세요.',
    (current) => (current.discoveryContext?.rounds.length ?? 0) > 0,
  )
  snapshot = initial.snapshot
  const initialCandidates = currentCandidates(snapshot)
  const initialMetric = {
    ...initial.metric,
    interactionMilliseconds: initial.durableAt - initialStartedAt,
    candidateCount: initialCandidates.length,
    payloadBytes: Buffer.byteLength(JSON.stringify(initialCandidates)),
  }
  if (initialCandidates.length !== 4) {
    throw new Error(`Initial target round stored ${String(initialCandidates.length)} Candidates`)
  }
  process.stdout.write(
    `${JSON.stringify({ phase: 'TARGET_PHASE_COMPLETE', runIndex, step: 'initial', metric: initialMetric })}\n`,
  )

  const mergeStartedAt = Date.now()
  const round = snapshot.discoveryContext?.rounds.at(-1)
  const session = snapshot.discoverySession
  if (round === undefined || session === null || session === undefined) {
    throw new Error('Initial target round or Discovery Session is missing')
  }
  await coreClient.recordDiscoveryFeedback({
    schemaVersion: 1,
    kind: 'UI_RECORD_DISCOVERY_FEEDBACK',
    correlationId: session.correlationId,
    actor: { kind: 'UI' },
    idempotencyKey: id('idem'),
    expectedSessionRevision: session.revision,
    feedback: {
      schemaVersion: 1,
      id: id('feedback'),
      discoverySessionId: session.id,
      roundId: round.id,
      correlationId: session.correlationId,
      intent: 'MERGE',
      targets: initialCandidates.slice(0, 2).map((candidate) => ({
        candidateId: candidate.id,
        revision: candidate.revision,
      })),
      message: '두 방향의 실시간 협업 장점만 합치고 하루 안에 만들 수 있게 줄여 주세요.',
      createdAt: new Date().toISOString(),
      source: { kind: 'USER' },
      redactionStatus: 'NOT_REQUIRED',
    },
  })
  snapshot = await coreClient.restoreProjectSession(id('corr'), projectId)
  const mergeBaseline = snapshot.discoveryContext?.rounds.length ?? 0
  const merge = await dispatchAndMeasure(
    snapshot,
    'MERGE',
    '제공된 최신 Core context의 user-authored Discovery Feedback을 모두 반영해 다음 Candidate Round를 제출해 주세요.',
    (current) => (current.discoveryContext?.rounds.length ?? 0) > mergeBaseline,
  )
  snapshot = merge.snapshot
  const mergeCandidates = currentCandidates(snapshot)
  const mergeMetric = {
    ...merge.metric,
    interactionMilliseconds: merge.durableAt - mergeStartedAt,
    candidateCount: mergeCandidates.length,
    payloadBytes: Buffer.byteLength(JSON.stringify(mergeCandidates)),
  }
  if (mergeCandidates.length !== 1) {
    throw new Error(`MERGE target round stored ${String(mergeCandidates.length)} Candidates`)
  }
  process.stdout.write(
    `${JSON.stringify({ phase: 'TARGET_PHASE_COMPLETE', runIndex, step: 'merge', metric: mergeMetric })}\n`,
  )

  const specStartedAt = Date.now()
  const mergeRound = snapshot.discoveryContext?.rounds.at(-1)
  const mergeSession = snapshot.discoverySession
  const selected = mergeCandidates[0]
  if (
    mergeRound === undefined ||
    mergeSession === null ||
    mergeSession === undefined ||
    !selected
  ) {
    throw new Error('MERGE target result is incomplete')
  }
  const specBaseline = snapshot.discoveryContext?.learningSpec?.revision ?? 0
  await coreClient.recordDiscoveryFeedback({
    schemaVersion: 1,
    kind: 'UI_RECORD_DISCOVERY_FEEDBACK',
    correlationId: mergeSession.correlationId,
    actor: { kind: 'UI' },
    idempotencyKey: id('idem'),
    expectedSessionRevision: mergeSession.revision,
    feedback: {
      schemaVersion: 1,
      id: id('feedback'),
      discoverySessionId: mergeSession.id,
      roundId: mergeRound.id,
      correlationId: mergeSession.correlationId,
      intent: 'SELECT',
      targets: [{ candidateId: selected.id, revision: selected.revision }],
      createdAt: new Date().toISOString(),
      source: { kind: 'USER' },
      redactionStatus: 'NOT_REQUIRED',
    },
  })
  snapshot = await coreClient.restoreProjectSession(id('corr'), projectId)
  const spec = await dispatchAndMeasure(
    snapshot,
    'SPEC',
    '사용자가 UI에서 후보를 선택했습니다. 제공된 최신 Core context를 사용하고 설명보다 먼저 submit_learning_spec을 호출해 낮은 부담의 권장 Learning Spec 초안을 저장해 주세요.',
    (current) => (current.discoveryContext?.learningSpec?.revision ?? 0) > specBaseline,
  )
  const learningSpec = spec.snapshot.discoveryContext?.learningSpec
  if (learningSpec === null || learningSpec === undefined) {
    throw new Error('Target Agent did not store a Learning Spec')
  }
  const specMetric = {
    ...spec.metric,
    interactionMilliseconds: spec.durableAt - specStartedAt,
    specRevision: learningSpec.revision,
    payloadBytes: Buffer.byteLength(JSON.stringify(learningSpec)),
  }

  const specRefineStartedAt = Date.now()
  snapshot = spec.snapshot
  const specRefineBaseline = learningSpec.revision
  const specRefine = await dispatchAndMeasure(
    snapshot,
    'SPEC',
    '사용자가 기존 Learning Spec 수정을 요청했습니다. current Spec의 나머지 내용을 보존하고 로그인 기능은 EXCLUDED로 명시한 완전한 다음 revision을 설명보다 먼저 submit_learning_spec으로 저장해 주세요.',
    (current) => (current.discoveryContext?.learningSpec?.revision ?? 0) > specRefineBaseline,
  )
  const refinedLearningSpec = specRefine.snapshot.discoveryContext?.learningSpec
  if (
    refinedLearningSpec === null ||
    refinedLearningSpec === undefined ||
    refinedLearningSpec.revision !== specRefineBaseline + 1
  ) {
    throw new Error('Target Agent did not store the next Learning Spec revision')
  }
  const specRefineMetric = {
    ...specRefine.metric,
    interactionMilliseconds: specRefine.durableAt - specRefineStartedAt,
    specRevision: refinedLearningSpec.revision,
    payloadBytes: Buffer.byteLength(JSON.stringify(refinedLearningSpec)),
  }
  process.stdout.write(
    `${JSON.stringify({ phase: 'TARGET_PHASE_COMPLETE', runIndex, step: 'specRefine', metric: specRefineMetric })}\n`,
  )

  const result = {
    runIndex,
    initial: initialMetric,
    merge: mergeMetric,
    spec: specMetric,
    specRefine: specRefineMetric,
  }
  results.push(result)
  process.stdout.write(`${JSON.stringify({ phase: 'TARGET_RUN_COMPLETE', ...result })}\n`)
}

const summary = Object.fromEntries(
  ['initial', 'merge', 'spec', 'specRefine'].map((phase) => {
    const durable = results.map((result) => result[phase].durableMilliseconds)
    const interaction = results.map((result) => result[phase].interactionMilliseconds)
    return [
      phase,
      {
        samples: durable.length,
        durableMilliseconds: durable,
        durableP95Milliseconds: percentile95(durable),
        interactionMilliseconds: interaction,
        interactionP95Milliseconds: percentile95(interaction),
      },
    ]
  }),
)
process.stdout.write(
  `${JSON.stringify({ phase: 'TARGET_SUMMARY', model: targetModel, ...summary })}\n`,
)
