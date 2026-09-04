import { randomUUID } from 'node:crypto'
import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises'

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
const experimentRepeats = Number(process.env.VIBE_HELPER_TARGET_EXPERIMENT_REPEATS ?? 1)
if (!Number.isSafeInteger(experimentRepeats) || experimentRepeats < 1 || experimentRepeats > 10) {
  throw new TypeError('VIBE_HELPER_TARGET_EXPERIMENT_REPEATS must be 1..10')
}

const stablePackage = new URL('../dist/crew-package/', import.meta.url)
const updateUrl = new URL('/api/apps/vibe-helper/update', gatewayUrl)
const cookieName = `mc_token_${gatewayUrl.port || '80'}`

const variants = [
  {
    id: 'haiku-6-compact',
    model: 'claude-haiku-4.5',
    candidateCount: 6,
    detail: 'compact',
    parallelRuns: 1,
  },
  {
    id: 'haiku-10-compact',
    model: 'claude-haiku-4.5',
    candidateCount: 10,
    detail: 'compact',
    parallelRuns: 1,
  },
  {
    id: 'haiku-4-ultra',
    model: 'claude-haiku-4.5',
    candidateCount: 4,
    detail: 'ultra',
    parallelRuns: 1,
  },
  {
    id: 'luna-6-compact',
    model: 'gpt-5.6-luna',
    candidateCount: 6,
    detail: 'compact',
    parallelRuns: 1,
  },
  {
    id: 'luna-10-compact',
    model: 'gpt-5.6-luna',
    candidateCount: 10,
    detail: 'compact',
    parallelRuns: 1,
  },
  {
    id: 'haiku-5x2-parallel',
    model: 'claude-haiku-4.5',
    candidateCount: 5,
    detail: 'compact',
    parallelRuns: 2,
  },
  {
    id: 'haiku-6-explicit-envelope',
    model: 'claude-haiku-4.5',
    candidateCount: 6,
    detail: 'compact',
    parallelRuns: 1,
    explicitEnvelope: true,
  },
  {
    id: 'luna-6-explicit-envelope',
    model: 'gpt-5.6-luna',
    candidateCount: 6,
    detail: 'compact',
    parallelRuns: 1,
    explicitEnvelope: true,
  },
  {
    id: 'luna-10-explicit-envelope',
    model: 'gpt-5.6-luna',
    candidateCount: 10,
    detail: 'compact',
    parallelRuns: 1,
    explicitEnvelope: true,
  },
  {
    id: 'haiku-10-minimal-initial',
    model: 'claude-haiku-4.5',
    candidateCount: 10,
    detail: 'compact',
    parallelRuns: 1,
    minimalInitial: true,
  },
  {
    id: 'luna-10-minimal-initial',
    model: 'gpt-5.6-luna',
    candidateCount: 10,
    detail: 'compact',
    parallelRuns: 1,
    minimalInitial: true,
  },
  {
    id: 'luna-6-minimal-initial',
    model: 'gpt-5.6-luna',
    candidateCount: 6,
    detail: 'compact',
    parallelRuns: 1,
    minimalInitial: true,
  },
  {
    id: 'luna-haiku-6-hedged',
    model: 'gpt-5.6-luna + claude-haiku-4.5',
    hedgedModels: ['gpt-5.6-luna', 'claude-haiku-4.5'],
    candidateCount: 6,
    detail: 'compact',
    parallelRuns: 1,
    explicitEnvelope: true,
  },
  {
    id: 'haiku-5x2-partitioned',
    model: 'claude-haiku-4.5',
    candidateCount: 5,
    detail: 'compact',
    parallelRuns: 2,
    explicitEnvelope: true,
    partitioned: true,
  },
]

const requestedVariantIds = new Set(
  (process.env.VIBE_HELPER_TARGET_EXPERIMENT_VARIANTS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
)
const selectedVariants =
  requestedVariantIds.size === 0
    ? variants
    : variants.filter((variant) => requestedVariantIds.has(variant.id))
if (selectedVariants.length === 0 || selectedVariants.length !== requestedVariantIds.size) {
  throw new TypeError('Requested experiment variant is unknown')
}

function id(prefix) {
  return `${prefix}_${randomUUID()}`
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function appUrl(path) {
  const url = new URL(path, gatewayUrl)
  url.searchParams.set('token', appToken)
  return url
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

const chatApi = {
  async get(path) {
    return readJson(await fetch(appUrl(path)), 'Crew App API')
  },
  async post(path, body) {
    return readJson(
      await fetch(appUrl(path), {
        method: 'POST',
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

function variantRule(variant) {
  const detailRule =
    variant.detail === 'ultra'
      ? '제목은 12자 이내, 각 서술 필드는 핵심만 25자 이내로 쓰고 targetUsers 1개, coreConcepts 2개, mvpFeatures 2개, scope별 1개만 제출하라.'
      : '모든 필수 상세 필드는 유지하되 제목은 18자 이내, 각 서술 필드는 짧은 한 문장으로 쓰고 targetUsers 1개, coreConcepts 2개, mvpFeatures 2개, scope별 1개만 제출하라.'
  const envelopeRule = variant.explicitEnvelope
    ? 'submit_candidate_round 최상위에는 schemaVersion, projectId, discoverySessionId, correlationId, idempotencyKey, expectedSessionRevision, appliedFeedbackIds, carriedCandidates, candidates, generationRationale, diversityCheck만 넣어라. 첫 Round의 appliedFeedbackIds와 carriedCandidates는 빈 배열이다. diversityCheck에는 dimensionsReviewed, modeCollapseDetected, rationale를 직접 넣어라. roundMetadata와 sessionRevision을 만들지 마라.'
    : ''
  return `\n\n## T15 controlled performance experiment\n\n이 실험에서는 앞의 초기 후보 개수 지시보다 이 절을 우선한다. 첫 Round에 정확히 ${String(variant.candidateCount)}개를 한 번의 submit_candidate_round로 제출하라. ${detailRule} evaluation과 risks는 생략한다. 필수 필드를 빠뜨리거나 설명을 먼저 만들지 마라. ${envelopeRule}\n`
}

function minimalInitialPrompt(variant) {
  return `# Vibe Discovery Initial Agent\n\n> Experimental prompt based on canonical version 1.1.6\n\n사용자가 배우고 싶은 기술로 실제 만들고 싶은 프로젝트를 찾도록 돕는다. 이 Agent는 첫 Candidate Round만 생성한다. 고정 카테고리를 순회하거나 이름만 다른 CRUD를 반복하지 말고, 문제·사용자·핵심 상호작용·데이터 흐름·만들고 싶은 이유가 분명히 다른 후보를 만든다. Personal Need와 자연스럽게 연결된 방향과 독립적인 흥미 방향을 섞되 억지로 할당하지 않는다.\n\n첫 Round에는 정확히 ${String(variant.candidateCount)}개를 제출한다. 모든 Candidate에 lineage {kind: "NEW"}, title, summary, targetUsers, coreInteraction, usageMoment, appeal, technologyNecessity, coreConcepts, mvpFeatures, suggestedScope {learnerFocus, agentSupport, excluded}, generationTags를 빠짐없이 넣는다. generationTags는 DIRECT, EXPAND, DISCOVER, UPGRADE만 사용한다. evaluation과 risks는 생략한다. 제목은 18자 이내, 각 서술은 짧은 한 문장, targetUsers 1개, coreConcepts 2개, mvpFeatures 2개, scope별 1개로 제한한다.\n\n주입된 VIBE_HELPER_DISCOVERY_CONTEXT의 project/session ID와 revision이 요청 metadata와 같으면 추가 조회 없이 사용한다. 사전 설명 없이 submit_candidate_round를 정확히 한 번 호출한다. 최상위에는 schemaVersion, projectId, discoverySessionId, correlationId, idempotencyKey, expectedSessionRevision, appliedFeedbackIds, carriedCandidates, candidates, generationRationale, diversityCheck만 넣는다. 첫 Round의 appliedFeedbackIds와 carriedCandidates는 빈 배열이다. diversityCheck에는 dimensionsReviewed, modeCollapseDetected, rationale를 직접 넣는다. roundMetadata와 sessionRevision을 만들지 마라. Core가 저장을 수락하기 전에는 제출했다고 말하지 말고, 성공 뒤 설명은 한 문장으로 끝낸다. 사용자 대신 후보를 선택하거나 Spec을 만들지 마라.\n`
}

async function buildVariantPackage(variant) {
  const target = await mkdtemp('/private/tmp/vibe-helper-t15-perf-')
  await cp(stablePackage, target, { recursive: true })
  const agentPath = new URL(`file://${target}/agents/vibe-helper-discovery-round.json`)
  const agent = JSON.parse(await readFile(agentPath, 'utf8'))
  agent.model = variant.hedgedModels?.[0] ?? variant.model
  agent.description = `${agent.description} T15 experiment ${variant.id}.`
  agent.prompt = variant.minimalInitial
    ? minimalInitialPrompt(variant)
    : `${agent.prompt.trimEnd()}${variantRule(variant)}`
  await writeFile(agentPath, `${JSON.stringify(agent, null, 2)}\n`, { mode: 0o600 })
  if (variant.hedgedModels !== undefined) {
    const hedgeName = 'vibe-helper-discovery-round-hedge'
    const hedgeAgent = {
      ...agent,
      model: variant.hedgedModels[1],
      name: hedgeName,
      description: `${agent.description} Hedged fallback.`,
    }
    await writeFile(
      new URL(`file://${target}/agents/${hedgeName}.json`),
      `${JSON.stringify(hedgeAgent, null, 2)}\n`,
      { mode: 0o600 },
    )
    const manifestPath = new URL(`file://${target}/app.json`)
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    manifest.agents.push(`agents/${hedgeName}.json`)
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 })
  }
  return target
}

async function updateApp(source) {
  const response = await fetch(updateUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: `${cookieName}=${dashboardToken}`,
    },
    body: JSON.stringify({ source }),
  })
  await readJson(response, 'App update')
}

async function waitForSnapshot(projectId, predicate) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const snapshot = await coreClient.restoreProjectSession(id('corr'), projectId)
    if (predicate(snapshot)) return snapshot
    await delay(250)
  }
  throw new Error(`Target Core did not store a Candidate Round within ${String(timeoutMs)}ms`)
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

function quality(candidates) {
  const uniqueTitles = new Set(candidates.map((candidate) => candidate.title.trim().toLowerCase()))
  const uniqueInteractions = new Set(
    candidates.map((candidate) => candidate.coreInteraction.trim().toLowerCase()),
  )
  const requiredDetailsComplete = candidates.every(
    (candidate) =>
      candidate.title.trim().length > 0 &&
      candidate.summary.trim().length > 0 &&
      candidate.targetUsers.length > 0 &&
      candidate.coreInteraction.trim().length > 0 &&
      candidate.usageMoment.trim().length > 0 &&
      candidate.appeal.trim().length > 0 &&
      candidate.technologyNecessity.trim().length > 0 &&
      candidate.coreConcepts.length > 0 &&
      candidate.mvpFeatures.length > 0 &&
      candidate.suggestedScope.learnerFocus.length > 0 &&
      candidate.suggestedScope.agentSupport.length > 0 &&
      candidate.suggestedScope.excluded.length > 0 &&
      candidate.generationTags.length > 0,
  )
  const payloadBytes = Buffer.byteLength(JSON.stringify(candidates))
  return {
    requiredDetailsComplete,
    uniqueTitleCount: uniqueTitles.size,
    uniqueInteractionCount: uniqueInteractions.size,
    titles: candidates.map((candidate) => candidate.title),
    payloadBytes,
    averageCandidateBytes: Math.round(payloadBytes / Math.max(1, candidates.length)),
  }
}

async function runHedgedFirstCandidate(variant, snapshot, projectId, startedAt, parallelIndex) {
  const session = snapshot.discoverySession
  if (session === null) throw new Error('Discovery Session is missing')
  const ephemeralContext = createDiscoveryEphemeralContext(snapshot, 'ROUND')
  const hedgeSlot = `vibe-helper-discovery-round-hedge-${session.id}-${String(session.revision)}`
  await chatApi.post('/api/chat/slots', {
    name: hedgeSlot,
    agent: 'vibe-helper-discovery-round-hedge',
    memory_mode: 'temporary',
  })
  await chatApi.post(`/api/chat/slots/${hedgeSlot}/context`, {
    content: ephemeralContext,
    source: 'vibe-helper-core',
    ephemeral: true,
    maxAge: 300,
  })
  const commonMessage = `새 Discovery를 시작합니다. 제공된 최신 Core context와 T15 실험 지시를 사용해 첫 Candidate Round를 제출해 주세요.\n\nCore tool context: schemaVersion=1, projectId=${projectId}, discoverySessionId=${session.id}, correlationId=${session.correlationId}, expectedSessionRevision=${String(session.revision)}`
  const primaryReceipt = await discoveryClient.dispatch(
    session.id,
    session.revision,
    `${commonMessage}, idempotencyKey=${id('idem')}.`,
    ephemeralContext,
    'ROUND',
  )
  const hedgeCompletion = fetch(appUrl('/api/chat'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      message: `The Crew host injected a validated VIBE_HELPER_DISCOVERY_CONTEXT snapshot for this exact project, session, and revision. Use that snapshot directly.\n\n${commonMessage}, idempotencyKey=${id('idem')}.`,
      slot: hedgeSlot,
      agent: 'vibe-helper-discovery-round-hedge',
    }),
  }).then(async (response) => {
    if (!response.ok) throw new Error(`Hedge dispatch returned HTTP ${String(response.status)}`)
    return response.text()
  })
  const allCompletions = Promise.allSettled([primaryReceipt.completion, hedgeCompletion])
  const durable = await Promise.race([
    waitForSnapshot(projectId, (current) => (current.discoveryContext?.rounds.length ?? 0) > 0),
    allCompletions.then(async () => {
      await delay(250)
      const current = await coreClient.restoreProjectSession(id('corr'), projectId)
      if ((current.discoveryContext?.rounds.length ?? 0) > 0) return current
      throw new Error('Both hedged Discovery streams ended without a durable Candidate Round')
    }),
  ])
  const durableMilliseconds = Date.now() - startedAt
  await allCompletions
  const candidates = currentCandidates(durable)
  if (candidates.length !== variant.candidateCount) {
    throw new Error(
      `${variant.id} stored ${String(candidates.length)} Candidates; expected ${String(variant.candidateCount)}`,
    )
  }
  return {
    parallelIndex,
    durableMilliseconds,
    dispatchMilliseconds: Math.round(primaryReceipt.dispatchMilliseconds),
    contextInjection: primaryReceipt.contextInjection,
    contextCharacters: primaryReceipt.contextCharacters,
    candidateCount: candidates.length,
    withinThirtySeconds: durableMilliseconds <= 30_000,
    hedgedAgentCount: 2,
    ...quality(candidates),
  }
}

async function runFirstCandidate(variant, parallelIndex) {
  const projectId = id('project')
  const correlationId = id('corr')
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
  const snapshot = await coreClient.restoreProjectSession(id('corr'), projectId)
  const session = snapshot.discoverySession
  if (session === null) throw new Error('Discovery Session is missing')
  const startedAt = Date.now()
  if (variant.hedgedModels !== undefined) {
    return runHedgedFirstCandidate(variant, snapshot, projectId, startedAt, parallelIndex)
  }
  const partitionInstruction = variant.partitioned
    ? parallelIndex === 1
      ? '이 batch는 친구들이 브라우저에서 실제 함께 연습하는 Personal Need에 직접 연결된 협력 경험만 만들되, 일반 채팅·단순 투표·할일 목록은 제외하세요.'
      : '이 batch는 Personal Need에 매이지 않은 독립 탐색으로 만들고, 협업 문서·채팅·투표·퀴즈·공동 드로잉을 제외한 색다른 실시간 제품 경험만 제안하세요.'
    : ''
  const receipt = await discoveryClient.dispatch(
    session.id,
    session.revision,
    `새 Discovery를 시작합니다. 제공된 최신 Core context와 T15 실험 지시를 사용해 첫 Candidate Round를 제출해 주세요. ${partitionInstruction}\n\nCore tool context: schemaVersion=1, projectId=${projectId}, discoverySessionId=${session.id}, correlationId=${session.correlationId}, expectedSessionRevision=${String(session.revision)}, idempotencyKey=${id('idem')}.`,
    createDiscoveryEphemeralContext(snapshot, 'ROUND'),
    'ROUND',
  )
  const completionPromise = receipt.completion
  const durable = await Promise.race([
    waitForSnapshot(projectId, (current) => (current.discoveryContext?.rounds.length ?? 0) > 0),
    completionPromise.then(async (completion) => {
      await delay(250)
      const current = await coreClient.restoreProjectSession(id('corr'), projectId)
      if ((current.discoveryContext?.rounds.length ?? 0) > 0) return current
      throw new Error(
        `Discovery stream finished as ${completion} without a durable Candidate Round`,
      )
    }),
  ])
  const durableMilliseconds = Date.now() - startedAt
  const completion = await completionPromise
  if (completion !== 'DONE') throw new Error(`Discovery stream finished as ${completion}`)
  const candidates = currentCandidates(durable)
  if (candidates.length !== variant.candidateCount) {
    throw new Error(
      `${variant.id} stored ${String(candidates.length)} Candidates; expected ${String(variant.candidateCount)}`,
    )
  }
  return {
    parallelIndex,
    durableMilliseconds,
    dispatchMilliseconds: Math.round(receipt.dispatchMilliseconds),
    contextInjection: receipt.contextInjection,
    contextCharacters: receipt.contextCharacters,
    candidateCount: candidates.length,
    withinThirtySeconds: durableMilliseconds <= 30_000,
    ...quality(candidates),
  }
}

const results = []
try {
  for (const variant of selectedVariants) {
    const source = await buildVariantPackage(variant)
    await updateApp(source)
    const startedAt = Date.now()
    try {
      const runs = []
      const failures = []
      for (let repeatIndex = 1; repeatIndex <= experimentRepeats; repeatIndex += 1) {
        try {
          const repeatedRuns = await Promise.all(
            Array.from({ length: variant.parallelRuns }, (_, index) =>
              runFirstCandidate(variant, index + 1),
            ),
          )
          const completedRuns = repeatedRuns.map((run) => ({ repeatIndex, ...run }))
          runs.push(...completedRuns)
          process.stdout.write(
            `${JSON.stringify({ phase: 'VARIANT_REPEAT_COMPLETE', variant: variant.id, repeatIndex, runs: completedRuns })}\n`,
          )
        } catch (error) {
          const failure = {
            repeatIndex,
            error: error instanceof Error ? error.message : String(error),
          }
          failures.push(failure)
          process.stdout.write(
            `${JSON.stringify({ phase: 'VARIANT_REPEAT_FAILED', variant: variant.id, ...failure })}\n`,
          )
        }
      }
      const result = {
        variant: variant.id,
        model: variant.model,
        requestedCandidates: variant.candidateCount * variant.parallelRuns,
        batchCandidateCount: variant.candidateCount,
        parallelRuns: variant.parallelRuns,
        experimentRepeats,
        wallClockMilliseconds: Date.now() - startedAt,
        runs,
        failures,
        combinedUniqueTitleCount: new Set(runs.flatMap((run) => run.titles)).size,
      }
      results.push(result)
      process.stdout.write(
        `${JSON.stringify({ phase: failures.length === 0 ? 'VARIANT_COMPLETE' : 'VARIANT_PARTIAL', ...result })}\n`,
      )
    } catch (error) {
      const result = {
        variant: variant.id,
        model: variant.model,
        requestedCandidates: variant.candidateCount * variant.parallelRuns,
        batchCandidateCount: variant.candidateCount,
        parallelRuns: variant.parallelRuns,
        experimentRepeats,
        wallClockMilliseconds: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      }
      results.push(result)
      process.stdout.write(`${JSON.stringify({ phase: 'VARIANT_FAILED', ...result })}\n`)
    }
  }
} finally {
  await updateApp(new URL(stablePackage).pathname)
  process.stdout.write(`${JSON.stringify({ phase: 'STABLE_PACKAGE_RESTORED' })}\n`)
}

process.stdout.write(`${JSON.stringify({ phase: 'EXPERIMENT_SUMMARY', results })}\n`)
