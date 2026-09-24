import { createHash, createHmac, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'

import { type APIRequestContext, expect, type Page, type Route, test } from '@playwright/test'
import {
  type CandidateRevisionReference,
  type ProjectCandidateRevision,
  type ProjectSessionSnapshot,
  projectEvidenceTraceSchema,
  projectCandidateRevisionSchema,
  projectSessionSnapshotSchema,
} from '../../packages/contracts/dist/index.js'

const applicationPath = '/api/application'
const analystContextPath = '/api/analyst-context'
const testAgentPath = '/api/test/agent'
const proxySecret = 'test-proxy-secret-with-at-least-thirty-two-bytes'
const campusDropFixture = JSON.parse(
  readFileSync(new URL('./campus-drop-session.fixture.json', import.meta.url), 'utf8'),
) as {
  readonly discoveryInput: {
    readonly learningGoal: string
    readonly personalNeed: string
  }
  readonly decision: {
    readonly question: string
    readonly acceptedOption: string
  }
  readonly learningScope: {
    readonly learnerFocus: readonly string[]
    readonly agentSupport: readonly string[]
    readonly excluded: readonly string[]
  }
  readonly helperUserMessage: string
  readonly helperUserConceptQuote: string
  readonly finalUpgradeUserGoal: string
  readonly allowedEvidence: {
    readonly builderOutputMaximum: string
    readonly userExplanationMaximum: string
    readonly independentDecisionOrApplicationMaximum: string
    readonly sameSessionTransferredAllowed: boolean
  }
  readonly containsPersonalData: boolean
}

function isCampusDrop(snapshot: ProjectSessionSnapshot): boolean {
  return (
    snapshot.discoverySession?.input.learningGoal === campusDropFixture.discoveryInput.learningGoal
  )
}

function id(prefix: string): string {
  return `${prefix}_${randomUUID()}`
}

async function executeBackend(
  request: APIRequestContext,
  target: string,
  input: Readonly<Record<string, unknown>>,
) {
  const body = JSON.stringify(input)
  const timestamp = Math.floor(Date.now() / 1_000).toString()
  const hash = createHash('sha256').update(body).digest('hex')
  const signature = createHmac('sha256', proxySecret)
    .update(`${timestamp}:POST:${target}:${hash}`)
    .digest('hex')
  return request.post(`http://127.0.0.1:4174${target}`, {
    headers: {
      'content-type': 'application/json',
      'x-kirocrew-proxy': `${timestamp}:${signature}`,
    },
    data: body,
  })
}

async function executeUi(request: APIRequestContext, input: Readonly<Record<string, unknown>>) {
  return executeBackend(request, applicationPath, { ...input, clientProtocolVersion: 9 })
}

async function executeDiscoveryAgent(
  request: APIRequestContext,
  input: Readonly<Record<string, unknown>>,
) {
  return executeBackend(request, testAgentPath, { role: 'DISCOVERY', request: input })
}

async function executeBuilderAgent(
  request: APIRequestContext,
  input: Readonly<Record<string, unknown>>,
) {
  const response = await executeBackend(request, testAgentPath, { role: 'BUILDER', request: input })
  expect(response.ok()).toBe(true)
  const payload = await response.json()
  expect(payload, JSON.stringify(payload)).toMatchObject({ success: true })
  return payload.data as Readonly<Record<string, unknown>>
}

const evaluationCriteria = [
  'CONCEPT_NECESSITY',
  'PERSONAL_UTILITY',
  'ADOPTION_FEASIBILITY',
  'LEARNER_FIT',
  'SCOPE_FEASIBILITY',
  'ADJACENT_COMPLEXITY',
  'DEPLOYABILITY',
  'DISTINCTIVENESS',
] as const

function candidateContent(title: string, summary: string, campusDrop = false) {
  if (campusDrop) {
    return {
      title,
      summary,
      targetUsers: ['공용 PC와 개인 기기 사이에서 작은 파일을 옮기는 사용자'],
      coreInteraction: '작은 파일과 만료 시간을 고르고 일회용 다운로드 링크를 만든다.',
      usageMoment: '로그인이나 USB 없이 개인 기기로 작은 파일 하나를 가져올 때',
      appeal: '링크의 생성·만료·소비 상태가 실제 다운로드 결과로 바로 보인다.',
      personalNeedRelationship: '공용 PC에서 개인 기기로 작은 파일을 안전하게 옮길 수 있다.',
      technologyNecessity:
        'TypeScript runtime validation과 명시적 상태 분기로 만료·소비 경계를 검증해야 한다.',
      coreConcepts: ['TypeScript runtime boundary', 'access token expiry state'],
      mvpFeatures: ['작은 파일 업로드', '만료 링크 생성', '일회 다운로드'],
      suggestedScope: {
        learnerFocus: ['runtime boundary와 token 상태 전이'],
        agentSupport: ['HTTP parsing과 local filesystem 권한'],
        excluded: ['로그인', '영구·대용량·hosted storage'],
      },
      risks: ['token과 blob 보관 경계를 섞으면 링크 원문이나 파일이 과도하게 노출될 수 있다.'],
      generationTags: ['DIRECT'] as const,
      evaluation: evaluationCriteria.map((criterion) => ({
        criterion,
        assessment: 'POSITIVE' as const,
        rationale: `${criterion} 기준에서 작은 local TypeScript MVP로 검증 가능하다.`,
      })),
    }
  }
  return {
    title,
    summary,
    targetUsers: ['개인 도구를 만드는 초보 개발자'],
    coreInteraction: '알 수 없는 설정 값을 넣고 검증 결과와 안전한 분기를 비교한다.',
    usageMoment: '작은 도구에 외부 설정 파일을 연결하기 전',
    appeal: '눈에 보이지 않던 타입 경계를 직접 깨뜨리고 고치는 재미가 있다.',
    personalNeedRelationship: '작은 도구의 잘못된 설정을 실행 전에 찾는 데 바로 쓸 수 있다.',
    technologyNecessity: 'TypeScript 타입만으로 확인할 수 없는 실행 시점 입력을 검증해야 한다.',
    coreConcepts: ['runtime validation', 'discriminated union'],
    mvpFeatures: ['샘플 입력 편집', '검증 결과 비교', '안전한 오류 설명'],
    suggestedScope: {
      learnerFocus: ['검증 schema와 성공·실패 분기'],
      agentSupport: ['로컬 화면 shell과 테스트 설정'],
      excluded: ['로그인', 'cloud sync'],
    },
    risks: ['샘플 입력 종류가 많아지면 첫 MVP 범위가 커질 수 있다.'],
    generationTags: ['DIRECT'] as const,
    evaluation: evaluationCriteria.map((criterion) => ({
      criterion,
      assessment: 'POSITIVE' as const,
      rationale: `${criterion} 기준에서 작은 로컬 MVP로 검증 가능하다.`,
    })),
  }
}

async function restoreProject(request: APIRequestContext, projectId: string) {
  const response = await executeUi(request, {
    schemaVersion: 1,
    kind: 'UI_RESTORE_PROJECT_SESSION',
    correlationId: id('corr'),
    actor: { kind: 'UI' },
    projectId,
    helperConversationLimit: 20,
  })
  expect(response.ok()).toBe(true)
  const payload = await response.json()
  expect(payload).toMatchObject({ success: true })
  return projectSessionSnapshotSchema.parse(payload.data)
}

async function readEvidenceTrace(request: APIRequestContext, projectId: string) {
  const response = await executeUi(request, {
    schemaVersion: 1,
    kind: 'UI_READ_EVIDENCE_TRACE',
    correlationId: id('corr'),
    actor: { kind: 'UI' },
    projectId,
  })
  expect(response.ok()).toBe(true)
  const payload = await response.json()
  expect(payload).toMatchObject({ success: true })
  return projectEvidenceTraceSchema.parse(payload.data)
}

async function fulfillAnalystTurn(
  route: Route,
  request: APIRequestContext,
  projectId: string,
): Promise<void> {
  const response = await executeUi(request, {
    schemaVersion: 1,
    kind: 'UI_READ_ANALYSIS_JOBS',
    correlationId: id('corr'),
    actor: { kind: 'UI' },
    projectId,
    status: 'RUNNING',
    limit: 100,
  })
  const payload = await response.json()
  const jobs = payload.success === true && Array.isArray(payload.data) ? payload.data : []
  const job = jobs.at(-1)
  if (
    typeof job !== 'object' ||
    job === null ||
    typeof job.episodeId !== 'string' ||
    typeof job.episodeRevision !== 'number' ||
    typeof job.correlationId !== 'string'
  ) {
    throw new TypeError('Running Evidence Analyst job is missing')
  }
  const contextResponse = await executeBackend(request, analystContextPath, {
    schemaVersion: 1,
    kind: 'ANALYST_GET_EPISODE_CONTEXT',
    correlationId: job.correlationId,
    actor: { kind: 'AGENT', role: 'EVIDENCE_ANALYST' },
    projectId,
    episodeId: job.episodeId,
    expectedEpisodeRevision: job.episodeRevision,
    clientProtocolVersion: 9,
  })
  const contextPayload = (await contextResponse.json()) as {
    readonly success?: boolean
    readonly data?: {
      readonly episode?: {
        readonly type?: string
        readonly conceptCandidates?: readonly { readonly originalExpression?: string }[]
      }
      readonly events?: readonly {
        readonly payload?: {
          readonly type?: string
          readonly redactedExcerpt?: string
        }
        readonly sourceReferences?: readonly Readonly<Record<string, unknown>>[]
      }[]
      readonly decisionContext?: {
        readonly request?: {
          readonly relatedConceptNames?: readonly string[]
        }
        readonly resolution?: {
          readonly decisionId?: string
          readonly customProposal?: string
        } | null
      } | null
    }
  }
  expect(contextPayload.success).toBe(true)
  const userMessageEvent = contextPayload.data?.events?.find(
    (event) => event.payload?.type === 'USER_MESSAGE',
  )
  const userMessageSource = userMessageEvent?.sourceReferences?.find(
    (source) => source.kind === 'USER_MESSAGE',
  )
  const evidenceExcerpt = userMessageEvent?.payload?.redactedExcerpt
  const conceptName = contextPayload.data?.episode?.conceptCandidates?.find((candidate) =>
    candidate.originalExpression?.toLowerCase().includes('token'),
  )?.originalExpression
  const hasUserExplanation =
    contextPayload.data?.episode?.type === 'HELPER_CONVERSATION' &&
    userMessageSource !== undefined &&
    typeof evidenceExcerpt === 'string'
  if (hasUserExplanation) {
    expect(evidenceExcerpt).toContain(campusDropFixture.helperUserConceptQuote)
  }
  const semanticResult = {
    schemaVersion: 1,
    episodeId: job.episodeId,
    episodeRevision: job.episodeRevision,
    correlationId: job.correlationId,
    proposals: hasUserExplanation
      ? [
          {
            concept: {
              originalExpression: campusDropFixture.helperUserConceptQuote,
              proposedCanonicalName: conceptName ?? 'access token and expiry state transition',
            },
            signal: 'REPHRASE',
            strength: 'STRONG',
            promptDependence: 'LIGHT_HINT',
            userEvidenceSources: userMessageSource === undefined ? [] : [userMessageSource],
            contextSources: [],
            redactedEvidenceExcerpt: evidenceExcerpt ?? 'The user explained the token boundary.',
            rationale:
              'The user connected token digest storage and the consumed transition in their own follow-up question.',
            maximumSupportedState: 'EXPLAINED',
            misconception: { action: 'NONE' },
          },
        ]
      : [],
    ...(hasUserExplanation
      ? {}
      : {
          noEvidenceReason:
            'This Episode contains no independent user explanation or justified decision.',
        }),
  }
  await route.fulfill({
    status: 200,
    contentType: 'text/event-stream',
    body: [
      `data: ${JSON.stringify({
        type: 'message',
        content: JSON.stringify(semanticResult),
      })}`,
      'data: [DONE]',
    ].join('\n\n'),
  })
}

async function submitCandidateRound(
  request: APIRequestContext,
  snapshot: ProjectSessionSnapshot,
): Promise<void> {
  const context = snapshot.discoveryContext
  const session = snapshot.discoverySession
  if (context === null || session === null) throw new TypeError('Discovery context is missing')
  const currentRound = context.rounds.at(-1)
  const pendingFeedback = context.feedback.filter(
    (feedback) => !currentRound?.appliedFeedbackIds.includes(feedback.id),
  )
  const campusDrop = isCampusDrop(snapshot)
  const now = new Date().toISOString()
  let candidates: ProjectCandidateRevision[]
  let references: CandidateRevisionReference[]
  if (currentRound === undefined) {
    candidates = (
      campusDrop
        ? [
            ['Campus Drop', '작은 파일을 만료·일회용 링크로 개인 기기에 옮기는 local 도구'],
            ['QR Note Relay', '짧은 텍스트를 만료 QR로 다른 기기에 넘기는 도구'],
            ['Clipboard Capsule', '한 번만 열리는 작은 clipboard payload를 만드는 도구'],
            ['Local Token Lab', 'token 생성·만료·소비 상태를 직접 비교하는 실험실'],
          ]
        : [
            [
              'Safe Config Lab',
              '잘못된 설정을 직접 넣어 보며 runtime validation의 역할을 확인하는 로컬 실험실',
            ],
            [
              'API Shape Detective',
              '여러 API 응답 모양을 비교하고 안전하게 좁히는 탐정형 playground',
            ],
            [
              'Webhook Replay Desk',
              '서로 다른 webhook payload를 재생하고 분기 결과를 비교하는 도구',
            ],
            ['Form State Theater', '복잡한 폼 상태를 명시적 variant로 바꾸며 흐름을 확인하는 도구'],
          ]
    ).map(([title, summary]) =>
      projectCandidateRevisionSchema.parse({
        schemaVersion: 1,
        id: id('candidate'),
        discoverySessionId: session.id,
        correlationId: session.correlationId,
        revision: 1,
        parentRevisions: [],
        ...candidateContent(
          title ?? 'Untitled Candidate',
          summary ?? 'Candidate summary',
          campusDrop,
        ),
        createdAt: now,
        source: { kind: 'AGENT', role: 'DISCOVERY' },
        redactionStatus: 'NOT_REQUIRED',
      }),
    )
    references = candidates.map((candidate) => ({
      candidateId: candidate.id,
      revision: candidate.revision,
    }))
  } else {
    const feedback = pendingFeedback.at(-1)
    expect(feedback).toBeDefined()
    if (feedback?.intent === 'MORE') {
      candidates = (
        campusDrop
          ? [
              ['Expiry State Board', '같은 token의 유효·만료·소비 상태를 비교하는 local board'],
              ['Tiny Blob Locker', '작은 blob과 metadata 보관 경계를 비교하는 도구'],
              ['One-time Inbox', '한 번 수신하면 닫히는 local message inbox'],
              ['Transfer Audit Map', '파일 이동 event와 상태 전이를 따라가는 local map'],
            ]
          : [
              ['CLI Output Triage', '여러 command 결과를 성공과 실패 variant로 분류하는 로컬 도구'],
              [
                'Import Contract Gate',
                '가져온 JSON 파일의 shape를 검사하고 안전한 부분만 여는 도구',
              ],
              [
                'Plugin Message Router',
                'plugin message 종류별 처리 흐름을 시각적으로 추적하는 도구',
              ],
              [
                'Database Row Guard',
                'nullable query 결과를 명시적 상태로 바꾸고 안전하게 표시하는 도구',
              ],
            ]
      ).map(([title, summary]) =>
        projectCandidateRevisionSchema.parse({
          schemaVersion: 1,
          id: id('candidate'),
          discoverySessionId: session.id,
          correlationId: session.correlationId,
          revision: 1,
          parentRevisions: [],
          ...candidateContent(
            title ?? 'Untitled Candidate',
            summary ?? 'Candidate summary',
            campusDrop,
          ),
          createdAt: now,
          source: { kind: 'AGENT', role: 'DISCOVERY' },
          redactionStatus: 'NOT_REQUIRED',
        }),
      )
      references = [
        ...currentRound.candidates,
        ...candidates.map((candidate) => ({
          candidateId: candidate.id,
          revision: candidate.revision,
        })),
      ]
    } else {
      const target = feedback?.targets[0]
      const previous = context.candidates.find(
        (candidate) =>
          candidate.id === target?.candidateId && candidate.revision === target?.revision,
      )
      expect(previous).toBeDefined()
      const revised = projectCandidateRevisionSchema.parse({
        ...previous,
        revision: previous.revision + 1,
        parentRevisions:
          feedback?.intent === 'MERGE'
            ? feedback.targets
            : [{ candidateId: previous.id, revision: previous.revision }],
        title: `${previous.title} · 작은 MVP`,
        summary: '핵심 검증 경험만 남기고 한 화면에서 완주할 수 있도록 줄인 revision',
        createdAt: now,
      })
      candidates = [revised]
      references = [{ candidateId: revised.id, revision: revised.revision }]
    }
  }
  const response = await executeDiscoveryAgent(request, {
    schemaVersion: 1,
    kind: 'DISCOVERY_SUBMIT_CANDIDATE_ROUND',
    correlationId: session.correlationId,
    actor: { kind: 'AGENT', role: 'DISCOVERY' },
    idempotencyKey: id('idem'),
    expectedSessionRevision: session.revision,
    round: {
      schemaVersion: 1,
      id: id('candidate_round'),
      discoverySessionId: session.id,
      correlationId: session.correlationId,
      roundIndex: context.rounds.length + 1,
      inputSnapshot: session.input,
      appliedFeedbackIds: pendingFeedback.map((feedback) => feedback.id),
      candidates: references,
      generationRationale:
        currentRound === undefined
          ? '학습 목표에 필요한 실행 시점 경계를 서로 다른 상호작용으로 탐색했다.'
          : '사용자가 요청한 작은 범위를 새 revision으로 만들고 나머지 방향은 유지했다.',
      diversityCheck: {
        dimensionsReviewed: [
          'PROBLEM_DOMAIN',
          'TARGET_USER',
          'CORE_INTERACTION',
          'DATA_SHAPE',
          'USER_APPEAL',
        ],
        modeCollapseDetected: false,
        rationale: '실험실과 탐정형 비교 도구는 핵심 상호작용이 다르다.',
      },
      createdAt: now,
      source: { kind: 'AGENT', role: 'DISCOVERY' },
      redactionStatus: 'NOT_REQUIRED',
    },
    candidates,
  })
  expect(await response.json()).toMatchObject({ success: true })
}

const initialPreviewDirections = [
  [
    'Safe Config Lab',
    '잘못된 설정을 직접 넣어 보며 runtime validation의 역할을 확인하는 로컬 실험실',
  ],
  ['API Shape Detective', '여러 API 응답 모양을 비교하고 안전하게 좁히는 탐정형 playground'],
  ['Webhook Replay Desk', '서로 다른 webhook payload를 재생하고 분기 결과를 비교하는 도구'],
  ['Form State Theater', '복잡한 폼 상태를 명시적 variant로 바꾸며 흐름을 확인하는 도구'],
  ['CLI Result Sorter', '명령 결과를 성공과 실패 상태로 분류하며 안전한 분기를 연습하는 도구'],
  ['Import Guard', '가져온 JSON의 모양을 검사하고 유효한 데이터만 여는 작은 도구'],
  ['Plugin Signal Map', 'plugin message 종류별 처리 흐름을 눈으로 따라가는 도구'],
  ['Nullable Row Lab', '비어 있을 수 있는 query 결과를 명시적 상태로 바꾸는 실험실'],
  ['Event Variant Board', '여러 event variant가 화면 상태로 바뀌는 과정을 비교하는 보드'],
  ['Schema Error Coach', '검증 오류를 초보자용 설명으로 바꾸는 로컬 코치'],
] as const

const campusDropPreviewDirections = [
  ['Campus Drop', '작은 파일을 만료·일회용 링크로 개인 기기에 옮기는 local 도구'],
  ['QR Note Relay', '짧은 텍스트를 만료 QR로 다른 기기에 넘기는 도구'],
  ['Clipboard Capsule', '한 번만 열리는 작은 clipboard payload를 만드는 도구'],
  ['Local Token Lab', 'token 생성·만료·소비 상태를 직접 비교하는 실험실'],
  ['Expiry State Board', '같은 token의 유효·만료·소비 상태를 비교하는 local board'],
  ['Tiny Blob Locker', '작은 blob과 metadata 보관 경계를 비교하는 도구'],
  ['One-time Inbox', '한 번 수신하면 닫히는 local message inbox'],
  ['Transfer Audit Map', '파일 이동 event와 상태 전이를 따라가는 local map'],
  ['Pocket File Ferry', '같은 Wi-Fi 안에서 작은 파일을 잠깐 건네는 local 도구'],
  ['Link Lifecycle Coach', '공유 link lifecycle을 단계별로 설명하는 local coach'],
] as const

async function submitCandidatePreviews(
  request: APIRequestContext,
  snapshot: ProjectSessionSnapshot,
): Promise<void> {
  const session = snapshot.discoverySession
  if (session === null) throw new TypeError('Discovery session is missing')
  const previewDirections = isCampusDrop(snapshot)
    ? campusDropPreviewDirections
    : initialPreviewDirections
  const response = await executeDiscoveryAgent(request, {
    schemaVersion: 1,
    kind: 'DISCOVERY_SUBMIT_CANDIDATE_PREVIEWS',
    correlationId: session.correlationId,
    actor: { kind: 'AGENT', role: 'DISCOVERY' },
    idempotencyKey: id('idem'),
    expectedSessionRevision: session.revision,
    previewRound: {
      schemaVersion: 1,
      id: id('candidate_preview_round'),
      finalRoundId: id('candidate_round'),
      discoverySessionId: session.id,
      correlationId: session.correlationId,
      inputSnapshot: session.input,
      previews: previewDirections.map(([title, summary], index) => ({
        candidateId: id('candidate'),
        position: index + 1,
        title,
        summary,
        coreInteraction: isCampusDrop(snapshot)
          ? `작은 payload ${String(index + 1)}의 생성·만료·소비 흐름을 비교한다.`
          : `샘플 ${String(index + 1)}을 입력하고 타입이 좁혀지는 결과를 비교한다.`,
        appeal: isCampusDrop(snapshot)
          ? `일시적인 전달 상태 ${String(index + 1)}을 실제 결과로 확인할 수 있다.`
          : `보이지 않던 경계 ${String(index + 1)}을 직접 깨뜨리고 고칠 수 있다.`,
        technologyNecessity: isCampusDrop(snapshot)
          ? '실행 시점 token과 만료 상태를 TypeScript의 명시적 분기로 바꿔야 한다.'
          : '실행 시점 입력을 TypeScript의 안전한 상태로 바꿔야 한다.',
        generationTags: ['DIRECT'],
      })),
      generationRationale: '서로 다른 입력과 상호작용을 가진 10개 방향을 먼저 비교했다.',
      createdAt: new Date().toISOString(),
      source: { kind: 'AGENT', role: 'DISCOVERY' },
      redactionStatus: 'NOT_REQUIRED',
    },
  })
  expect(await response.json()).toMatchObject({ success: true })
}

async function submitCandidateEnrichment(
  request: APIRequestContext,
  snapshot: ProjectSessionSnapshot,
  batch: 'FIRST' | 'SECOND' | 'SELECTED',
  selectedCandidateIds: readonly string[] = [],
): Promise<void> {
  const session = snapshot.discoverySession
  const previewRound = snapshot.discoveryContext?.previewRound
  if (session === null || previewRound === null || previewRound === undefined) {
    throw new TypeError('Candidate preview context is missing')
  }
  const selectedCandidateIdSet = new Set(selectedCandidateIds)
  const previews = previewRound.previews.filter((preview) => {
    if (batch === 'FIRST') return preview.position <= 5
    if (batch === 'SECOND') return preview.position > 5
    return selectedCandidateIdSet.has(preview.candidateId)
  })
  const now = new Date().toISOString()
  const response = await executeDiscoveryAgent(request, {
    schemaVersion: 1,
    kind: 'DISCOVERY_SUBMIT_CANDIDATE_ENRICHMENTS',
    correlationId: session.correlationId,
    actor: { kind: 'AGENT', role: 'DISCOVERY' },
    idempotencyKey: id('idem'),
    expectedSessionRevision: session.revision,
    previewRoundId: previewRound.id,
    batch,
    enrichments: previews.map((preview) => {
      const details = candidateContent(preview.title, preview.summary, isCampusDrop(snapshot))
      return {
        schemaVersion: 1,
        previewRoundId: previewRound.id,
        discoverySessionId: session.id,
        correlationId: session.correlationId,
        candidate: {
          schemaVersion: 1,
          id: preview.candidateId,
          discoverySessionId: session.id,
          correlationId: session.correlationId,
          revision: 1,
          parentRevisions: [],
          ...details,
          coreInteraction: preview.coreInteraction,
          appeal: preview.appeal,
          technologyNecessity: preview.technologyNecessity,
          generationTags: preview.generationTags,
          createdAt: now,
          source: { kind: 'AGENT', role: 'DISCOVERY' },
          redactionStatus: 'NOT_REQUIRED',
        },
        createdAt: now,
        source: { kind: 'AGENT', role: 'DISCOVERY' },
        redactionStatus: 'NOT_REQUIRED',
      }
    }),
  })
  expect(await response.json()).toMatchObject({ success: true })
}

async function submitLearningSpec(
  request: APIRequestContext,
  snapshot: ProjectSessionSnapshot,
): Promise<void> {
  const session = snapshot.discoverySession
  const selected = snapshot.selectedCandidate
  if (session === null || selected === null) throw new TypeError('Selected Discovery is missing')
  const current = snapshot.learningSpec
  const campusDrop = isCampusDrop(snapshot)
  const now = new Date().toISOString()
  const response = await executeDiscoveryAgent(request, {
    schemaVersion: 1,
    kind: 'DISCOVERY_SUBMIT_LEARNING_SPEC',
    correlationId: session.correlationId,
    actor: { kind: 'AGENT', role: 'DISCOVERY' },
    idempotencyKey: id('idem'),
    expectedSessionRevision: session.revision,
    expectedSpecRevision: current?.revision ?? 0,
    learningSpec: {
      schemaVersion: 1,
      id: current?.id ?? id('learning_spec'),
      projectId: snapshot.project.id,
      correlationId: session.correlationId,
      revision: (current?.revision ?? 0) + 1,
      ...(current === null ? {} : { parentRevision: current.revision }),
      selectedCandidate: { candidateId: selected.id, revision: selected.revision },
      productPurpose:
        current === null
          ? campusDrop
            ? '작은 파일을 만료되는 일회용 링크로 개인 기기에 옮기는 local 도구를 만든다.'
            : '잘못된 외부 설정을 실행 전에 발견하는 로컬 validation 도구를 만든다.'
          : campusDrop
            ? '로그인 없이 작은 파일을 만료·일회용 링크로 옮기는 local 도구를 만든다.'
            : '로그인 없이 한 화면에서 외부 설정을 안전하게 검증하는 로컬 도구를 만든다.',
      targetUsers:
        current?.targetUsers ??
        (campusDrop
          ? ['공용 PC와 개인 기기 사이에서 작은 파일을 옮기는 사용자']
          : ['작은 TypeScript 도구를 만드는 초보 개발자']),
      primaryUsageMoment:
        current?.primaryUsageMoment ??
        (campusDrop
          ? '로그인이나 USB 없이 개인 기기로 작은 파일 하나를 가져올 때'
          : '새 설정 파일이나 API payload를 연결하기 전'),
      successMoment:
        current?.successMoment ??
        (campusDrop
          ? '첫 다운로드는 성공하고 같은 링크의 두 번째 다운로드는 소비된 상태로 거절된다.'
          : '잘못된 입력이 안전한 오류로 바뀌고 올바른 입력만 다음 단계로 전달된다.'),
      mvpFeatures:
        current?.mvpFeatures ??
        (campusDrop
          ? ['작은 파일 업로드', '만료 링크 생성', '일회 다운로드']
          : ['샘플 입력 편집', 'schema 검증', '성공·실패 분기 비교']),
      scope:
        current?.scope ??
        (campusDrop
          ? [
              {
                category: 'LEARNER_FOCUS',
                title: 'TypeScript runtime과 상태 경계',
                rationale: '파일 전달의 안전한 상태 전이가 학습 목표와 직접 만난다.',
                conceptNames: [
                  'TypeScript runtime boundary',
                  'SQLite metadata and filesystem blob separation',
                  'access token and expiry state transition',
                ],
              },
              {
                category: 'AGENT_SUPPORT',
                title: 'HTTP와 local file 처리',
                rationale: '제품에는 필요하지만 이번 판단의 중심이 아닌 구현 지원이다.',
                conceptNames: [],
              },
              {
                category: 'EXCLUDED',
                title: '운영 인프라와 대용량 전송',
                rationale: 'local Golden Path 없이 운영 범위만 키운다.',
                conceptNames: [],
              },
            ]
          : [
              {
                category: 'LEARNER_FOCUS',
                title: '실행 시점 검증 판단',
                rationale: '이번 학습 목표와 제품의 핵심 동작이 직접 만난다.',
                conceptNames: ['runtime validation', 'discriminated union'],
              },
              {
                category: 'AGENT_SUPPORT',
                title: '로컬 앱 shell',
                rationale: '제품에는 필요하지만 이번 목표 밖의 반복 구현이다.',
                conceptNames: [],
              },
              {
                category: 'EXCLUDED',
                title: '계정과 cloud sync',
                rationale: '핵심 검증 경험 없이 운영 범위만 키운다.',
                conceptNames: [],
              },
            ]),
      expectedDecisions:
        current?.expectedDecisions ??
        (campusDrop
          ? [
              {
                category: 'PRODUCT_BEHAVIOR',
                description: campusDropFixture.decision.question,
                whyUserInputMatters: '링크의 실제 재사용 가능성과 상태 모델을 결정한다.',
              },
            ]
          : [
              {
                category: 'PRODUCT_BEHAVIOR',
                description: '검증 실패를 한 번에 보여줄지 단계별로 보여줄지 정한다.',
                whyUserInputMatters: '사용자가 배우고 싶은 비교 방식과 직접 연결된다.',
              },
            ]),
      runtimeConstraint: 'TYPESCRIPT',
      deploymentConstraints: current?.deploymentConstraints ?? ['첫 MVP는 로컬에서 실행한다.'],
      status: 'DRAFT',
      createdAt: current?.createdAt ?? now,
      updatedAt: now,
      source: { kind: 'AGENT', role: 'DISCOVERY' },
      redactionStatus: 'NOT_REQUIRED',
    },
  })
  expect(await response.json()).toMatchObject({ success: true })
}

async function fulfillAgentTurn(
  route: Route,
  request: APIRequestContext,
  projectId: string,
): Promise<void> {
  const snapshot = await restoreProject(request, projectId)
  const dispatch = route.request().postDataJSON()
  expect(dispatch.message).toContain('schemaVersion=1')
  expect(dispatch.message).toContain(`projectId=${projectId}`)
  expect(dispatch.message).toContain(`discoverySessionId=${snapshot.discoverySession.id}`)
  expect(dispatch.message).toContain(`correlationId=${snapshot.discoverySession.correlationId}`)
  expect(dispatch.message).toContain(
    `expectedSessionRevision=${snapshot.discoverySession.revision}`,
  )
  expect(dispatch.message).toMatch(/idempotencyKey=idem_[0-9a-f-]{36}/)
  const agentName = String(dispatch.agent)
  const slot = String(dispatch.slot)
  const agentPhase = agentName.replace('vibe-helper-discovery-', '')
  expect(['preview', 'enrichment', 'round', 'merge', 'spec']).toContain(agentPhase)
  const slotPhase = slot.includes('-enrich-first-')
    ? 'enrich-first'
    : slot.includes('-enrich-second-')
      ? 'enrich-second'
      : slot.includes('-enrich-selected-')
        ? 'enrich-selected'
        : agentPhase
  expect(dispatch.slot).toBe(
    `vibe-helper-discovery-${slotPhase}-${snapshot.discoverySession.id}-${snapshot.discoverySession.revision}`,
  )
  if (snapshot.discoverySession.status === 'SELECTED') {
    await submitLearningSpec(request, snapshot)
  } else if (agentPhase === 'preview') {
    await submitCandidatePreviews(request, snapshot)
  } else if (agentPhase === 'enrichment') {
    const selectedCandidateId = snapshot.discoveryContext?.previewRound?.previews[0]?.candidateId
    await submitCandidateEnrichment(
      request,
      snapshot,
      slotPhase === 'enrich-first'
        ? 'FIRST'
        : slotPhase === 'enrich-second'
          ? 'SECOND'
          : 'SELECTED',
      selectedCandidateId === undefined ? [] : [selectedCandidateId],
    )
  } else {
    await submitCandidateRound(request, snapshot)
  }
  await route.fulfill({
    status: 200,
    contentType: 'text/event-stream',
    body: 'data: {"type":"done"}\n\n',
  })
}

async function fulfillInitialBuilderTurn(
  route: Route,
  request: APIRequestContext,
  projectId: string,
): Promise<void> {
  const snapshot = await restoreProject(request, projectId)
  const task = snapshot.currentTask
  if (task === null) throw new TypeError('Builder Task is missing')
  const campusDrop = isCampusDrop(snapshot)
  await executeBuilderAgent(request, {
    schemaVersion: 1,
    kind: 'BUILDER_START_TASK',
    correlationId: task.correlationId,
    actor: { kind: 'AGENT', role: 'BUILDER' },
    idempotencyKey: id('idem'),
    projectId,
    taskId: task.id,
    expectedTaskRevision: task.revision,
  })
  const now = new Date().toISOString()
  await executeBuilderAgent(request, {
    schemaVersion: 1,
    kind: 'BUILDER_UPDATE_LIVE_CONTEXT',
    correlationId: task.correlationId,
    actor: { kind: 'AGENT', role: 'BUILDER' },
    idempotencyKey: id('idem'),
    context: {
      schemaVersion: 1,
      id: id('context'),
      projectId,
      taskId: task.id,
      correlationId: task.correlationId,
      contextVersion: 1,
      expectedPreviousVersion: 0,
      checkpoint: 'TASK_STARTED',
      stage: campusDrop
        ? 'Implementing the local one-time transfer flow'
        : 'Implementing the local validation flow',
      currentGoal: campusDrop
        ? 'Store a small blob separately and enforce token expiry and consume-once state.'
        : 'Render a safe success and failure result from unknown input.',
      recentChanges: campusDrop
        ? ['Created the metadata and blob storage boundary.']
        : ['Created the parser boundary and result shell.'],
      activeDecisionIds: [],
      activeConceptNames: task.expectedConcepts,
      relatedFiles: [],
      nextActions: [
        campusDrop
          ? 'Choose whether a successful download consumes the link.'
          : 'Choose how validation failures should be presented.',
      ],
      updatedAt: now,
      source: { kind: 'AGENT', role: 'BUILDER' },
      redactionStatus: 'VERIFIED_REDACTED',
    },
  })
  await executeBuilderAgent(request, {
    schemaVersion: 1,
    kind: 'BUILDER_REQUEST_DECISION',
    correlationId: task.correlationId,
    actor: { kind: 'AGENT', role: 'BUILDER' },
    idempotencyKey: id('idem'),
    projectId,
    taskId: task.id,
    expectedTaskRevision: task.revision + 1,
    expectedContextVersion: 1,
    decision: {
      category: 'PRODUCT_BEHAVIOR',
      question: campusDrop
        ? campusDropFixture.decision.question
        : '검증 오류를 한 번에 보여줄까요, 첫 오류부터 단계별로 보여줄까요?',
      reasonRequiredNow: campusDrop
        ? 'download handler와 token 상태 전이가 이 선택에 따라 달라집니다.'
        : '오류 결과 화면과 parser 반환 형식이 이 선택에 따라 달라집니다.',
      options: campusDrop
        ? [
            {
              key: 'consume',
              label: '첫 다운로드 뒤 소비',
              description: '첫 성공 직후 token을 소비해 같은 링크의 재사용을 막습니다.',
              impacts: ['공용 PC에 남은 링크가 다시 사용될 가능성을 줄입니다.'],
              tradeoffs: ['다운로드가 끝난 뒤 같은 링크로 다시 받을 수 없습니다.'],
            },
            {
              key: 'reuse',
              label: '만료 전까지 재사용',
              description: '만료 전에는 같은 token으로 여러 번 다운로드할 수 있습니다.',
              impacts: ['여러 개인 기기에서 같은 파일을 받기 쉽습니다.'],
              tradeoffs: ['노출된 링크의 재사용 가능 시간이 길어집니다.'],
            },
          ]
        : [
            {
              key: 'all',
              label: '오류를 한 번에 표시',
              description: '발견한 모든 validation 오류를 같은 결과 카드에 보여줍니다.',
              impacts: ['사용자가 입력 전체를 한 번에 고칠 수 있습니다.'],
              tradeoffs: ['처음 보는 사용자에게 정보가 많을 수 있습니다.'],
            },
            {
              key: 'first',
              label: '첫 오류부터 단계별 표시',
              description: '가장 먼저 발견한 오류 하나만 안내합니다.',
              impacts: ['한 번에 집중할 내용이 줄어듭니다.'],
              tradeoffs: ['여러 번 수정해야 전체 오류를 확인할 수 있습니다.'],
            },
          ],
      recommendedOptionKey: campusDrop ? 'consume' : 'all',
      recommendationRationale: campusDrop
        ? '공용 PC에서 개인 파일을 옮기는 목적에는 링크 재사용을 막는 쪽이 더 안전합니다.'
        : '작은 설정 파일은 모든 오류를 함께 고치는 흐름이 더 빠릅니다.',
      relatedConceptNames: campusDrop
        ? ['access token and expiry state transition']
        : ['runtime validation'],
      sourceReferences: [],
      independentWorkCanContinue: false,
    },
    context: {
      stage: campusDrop
        ? 'Waiting for the download consumption policy'
        : 'Waiting for validation error presentation',
      currentGoal: campusDrop
        ? 'Choose the token transition before finishing the download handler.'
        : 'Choose the result shape before finishing the parser UI.',
      recentChanges: campusDrop
        ? ['Created the metadata and blob storage boundary.']
        : ['Created the parser boundary and result shell.'],
      activeConceptNames: task.expectedConcepts,
      relatedFiles: [],
      nextActions: [
        campusDrop ? 'Apply the selected consume policy.' : 'Apply the selected presentation.',
        'Run the acceptance tests.',
      ],
      blockingReason: campusDrop
        ? 'The token update and second download response depend on the user choice.'
        : 'The result component depends on the user choice.',
    },
  })
  await route.fulfill({
    status: 200,
    contentType: 'text/event-stream',
    body: [
      'data: {"type":"chunk","cls":"chunk","content":"noisy-fragment"}',
      `data: ${JSON.stringify({
        type: 'message',
        content: JSON.stringify({
          slot: `vibe-helper-builder-${projectId}`,
          used_tokens: 120,
          window_tokens: 1_000,
        }),
      })}`,
      'data: {"type":"tool_call","command":"get_builder_task"}',
      `data: ${JSON.stringify({
        type: 'file_change',
        summary: campusDrop ? 'Updated src/core.ts' : 'Updated src/parser.ts',
      })}`,
      'data: {"type":"status","command":"pnpm test"}',
      'data: {"type":"error","summary":"token=synthetic-e2e-secret was rejected and fixed"}',
      'data: {"type":"message","content":"Decision input is required before continuing."}',
      'data: [DONE]',
    ].join('\n\n'),
  })
}

async function fulfillResumedBuilderTurn(
  route: Route,
  request: APIRequestContext,
  projectId: string,
): Promise<void> {
  const resolved = await restoreProject(request, projectId)
  const task = resolved.currentTask
  const context = resolved.liveContext
  const decision = resolved.decisions.find(
    (item) => item.resolution !== null && item.application === null,
  )
  if (task === null || context === null || decision === undefined || decision.resolution === null) {
    throw new TypeError('Resolved Builder context is missing')
  }
  const campusDrop = isCampusDrop(resolved)
  await executeBuilderAgent(request, {
    schemaVersion: 1,
    kind: 'BUILDER_APPLY_DECISION',
    correlationId: task.correlationId,
    actor: { kind: 'AGENT', role: 'BUILDER' },
    idempotencyKey: id('idem'),
    projectId,
    taskId: task.id,
    decisionId: decision.request.id,
    expectedTaskRevision: task.revision,
    expectedContextVersion: context.contextVersion,
    appliedResult: campusDrop
      ? '첫 다운로드가 성공한 뒤 token을 consumed 상태로 전이해 두 번째 요청을 거절하도록 적용했습니다.'
      : '\\ubaa8\\ub4e0 validation \\uc624\\ub958\\ub97c \\ud55c \\uacb0\\uacfc \\uce74\\ub4dc\\uc5d0 \\ud45c\\uc2dc\\ud558\\ub3c4\\ub85d \\uc801\\uc6a9\\ud588\\uc2b5\\ub2c8\\ub2e4.',
    sourceReferences: [],
    context: {
      stage: campusDrop
        ? 'Applied the consume-after-first-download policy'
        : 'Applied the validation error presentation',
      currentGoal: campusDrop
        ? 'Validate the one-time local transfer result.'
        : 'Validate the completed local result.',
      recentChanges: campusDrop
        ? ['Stored only the token digest and made the consume transition atomic.']
        : ['Rendered all validation errors in one result card.'],
      activeConceptNames: task.expectedConcepts,
      relatedFiles: [],
      nextActions: ['Run the acceptance tests.'],
    },
  })
  const applied = await restoreProject(request, projectId)
  if (applied.liveContext === null || applied.currentTask === null) {
    throw new TypeError('Applied Builder context is missing')
  }
  const completedAt = new Date().toISOString()
  await executeBuilderAgent(request, {
    schemaVersion: 1,
    kind: 'BUILDER_UPDATE_LIVE_CONTEXT',
    correlationId: task.correlationId,
    actor: { kind: 'AGENT', role: 'BUILDER' },
    idempotencyKey: id('idem'),
    context: {
      ...applied.liveContext,
      contextVersion: applied.liveContext.contextVersion + 1,
      expectedPreviousVersion: applied.liveContext.contextVersion,
      checkpoint: 'TASK_COMPLETED',
      stage: 'Completed and validated',
      currentGoal: campusDrop
        ? 'Open the generated Campus Drop result.'
        : 'Open the generated local result.',
      recentChanges: campusDrop
        ? ['Implemented the selected one-time download policy.', 'Passed all acceptance checks.']
        : ['Implemented the selected error view.', 'Passed all acceptance checks.'],
      activeDecisionIds: [],
      nextActions: ['Open the generated result.'],
      updatedAt: completedAt,
    },
  })
  await executeBuilderAgent(request, {
    schemaVersion: 1,
    kind: 'BUILDER_COMPLETE_TASK',
    correlationId: task.correlationId,
    actor: { kind: 'AGENT', role: 'BUILDER' },
    idempotencyKey: id('idem'),
    report: {
      schemaVersion: 1,
      id: id('completion_report'),
      projectId,
      taskId: task.id,
      correlationId: task.correlationId,
      expectedTaskRevision: applied.currentTask.revision,
      implementedFeatures: campusDrop
        ? ['Small-file upload, expiring token, and one-time download flow']
        : ['Unknown input validation and result comparison flow'],
      acceptanceResults: applied.currentTask.acceptanceCriteria.map((criterion) => ({
        criterionKey: criterion.key,
        status: 'PASSED',
        evidence: [],
      })),
      validationResults: [
        {
          name: campusDrop ? 'Campus Drop Build E2E' : 'Build Agent E2E',
          status: 'PASSED',
          summary: campusDrop
            ? 'Build, tests, and consume-once flow completed.'
            : 'The local flow completed.',
        },
      ],
      conceptUsage: task.expectedConcepts.map((conceptName) => ({
        conceptName,
        scope: 'LEARNER_FOCUS',
        importance: 'CORE',
        usageReason: campusDrop
          ? 'The runtime separates metadata, blob bytes, expiry, and consumed token states.'
          : 'The parser narrows unknown input into safe success and failure states.',
        codeReferences: [],
      })),
      appliedDecisionIds: [decision.request.id],
      codeReferences: [],
      diffReferences: [],
      specDeviations: [],
      remainingIssues: [],
      limitations: [],
      completedAt,
      source: { kind: 'AGENT', role: 'BUILDER' },
      redactionStatus: 'VERIFIED_REDACTED',
    },
  })
  await route.fulfill({
    status: 200,
    contentType: 'text/event-stream',
    body: [
      'data: {"type":"tool_call","command":"get_decision_result"}',
      `data: ${JSON.stringify({
        type: 'file_change',
        summary: campusDrop ? 'Updated src/core.ts and src/server.ts' : 'Updated src/result.ts',
      })}`,
      'data: {"type":"status","command":"pnpm test"}',
      'data: {"type":"message","content":"Implementation and validation completed."}',
      'data: [DONE]',
    ].join('\n\n'),
  })
}

async function fulfillFinalUpgradeBuilderTurn(
  route: Route,
  request: APIRequestContext,
  projectId: string,
): Promise<void> {
  const restored = await restoreProject(request, projectId)
  const task = restored.currentTask
  if (task === null || task.status !== 'PENDING' || task.finalUpgrade === undefined) {
    throw new TypeError('Final Upgrade Builder Task is missing')
  }
  await executeBuilderAgent(request, {
    schemaVersion: 1,
    kind: 'BUILDER_START_TASK',
    correlationId: task.correlationId,
    actor: { kind: 'AGENT', role: 'BUILDER' },
    idempotencyKey: id('idem'),
    projectId,
    taskId: task.id,
    expectedTaskRevision: task.revision,
  })
  const startedAt = new Date().toISOString()
  const contextId = id('context')
  await executeBuilderAgent(request, {
    schemaVersion: 1,
    kind: 'BUILDER_UPDATE_LIVE_CONTEXT',
    correlationId: task.correlationId,
    actor: { kind: 'AGENT', role: 'BUILDER' },
    idempotencyKey: id('idem'),
    context: {
      schemaVersion: 1,
      id: contextId,
      projectId,
      taskId: task.id,
      correlationId: task.correlationId,
      contextVersion: 1,
      expectedPreviousVersion: 0,
      checkpoint: 'TASK_STARTED',
      stage: 'Implementing the user-selected Final Upgrade',
      currentGoal: task.finalUpgrade.userGoal,
      recentChanges: [],
      activeDecisionIds: [],
      activeConceptNames: task.expectedConcepts,
      relatedFiles: [],
      nextActions: ['Implement the selected distinction.', 'Run regression tests.'],
      updatedAt: startedAt,
      source: { kind: 'AGENT', role: 'BUILDER' },
      redactionStatus: 'VERIFIED_REDACTED',
    },
  })
  const completedAt = new Date(Date.now() + 1).toISOString()
  await executeBuilderAgent(request, {
    schemaVersion: 1,
    kind: 'BUILDER_UPDATE_LIVE_CONTEXT',
    correlationId: task.correlationId,
    actor: { kind: 'AGENT', role: 'BUILDER' },
    idempotencyKey: id('idem'),
    context: {
      schemaVersion: 1,
      id: contextId,
      projectId,
      taskId: task.id,
      correlationId: task.correlationId,
      contextVersion: 2,
      expectedPreviousVersion: 1,
      checkpoint: 'TASK_COMPLETED',
      stage: 'Final Upgrade completed',
      currentGoal: task.finalUpgrade.userGoal,
      recentChanges: ['Distinguished the two requested result states.'],
      activeDecisionIds: [],
      activeConceptNames: task.expectedConcepts,
      relatedFiles: [],
      nextActions: ['Open the updated result.'],
      updatedAt: completedAt,
      source: { kind: 'AGENT', role: 'BUILDER' },
      redactionStatus: 'VERIFIED_REDACTED',
    },
  })
  await executeBuilderAgent(request, {
    schemaVersion: 1,
    kind: 'BUILDER_COMPLETE_TASK',
    correlationId: task.correlationId,
    actor: { kind: 'AGENT', role: 'BUILDER' },
    idempotencyKey: id('idem'),
    report: {
      schemaVersion: 1,
      id: id('completion_report'),
      projectId,
      taskId: task.id,
      correlationId: task.correlationId,
      expectedTaskRevision: 2,
      implementedFeatures: [task.finalUpgrade.userGoal],
      acceptanceResults: task.acceptanceCriteria.map((criterion) => ({
        criterionKey: criterion.key,
        status: 'PASSED',
        evidence: [],
      })),
      validationResults: [
        { name: 'Final Upgrade E2E', status: 'PASSED', summary: 'Updated flow passed.' },
      ],
      conceptUsage: task.expectedConcepts.map((conceptName) => ({
        conceptName,
        scope: 'LEARNER_FOCUS',
        importance: 'CORE',
        usageReason: 'The selected improvement makes the state transition visible.',
        codeReferences: [],
      })),
      appliedDecisionIds: [],
      codeReferences: [],
      diffReferences: [],
      specDeviations: [],
      remainingIssues: [],
      limitations: [],
      completedAt,
      source: { kind: 'AGENT', role: 'BUILDER' },
      redactionStatus: 'VERIFIED_REDACTED',
    },
  })
  await route.fulfill({
    status: 200,
    contentType: 'text/event-stream',
    body: [
      'data: {"type":"status","command":"pnpm test"}',
      'data: {"type":"message","content":"The user-selected Final Upgrade is implemented and tested."}',
      'data: [DONE]',
    ].join('\n\n'),
  })
}

function projectIdFromRoute(route: Route): string {
  const body = route.request().postDataJSON()
  const slot = typeof body.slot === 'string' ? body.slot : ''
  const message = typeof body.message === 'string' ? body.message : ''
  const match = `${slot}\n${message}`.match(/(project_[0-9a-f-]{36})/)
  if (match?.[1] === undefined) throw new TypeError('Discovery tool context project is invalid')
  return match[1]
}

async function appendTestCrewMessage(
  page: Page,
  slotKey: string,
  role: 'user' | 'assistant',
  content: string,
): Promise<void> {
  await page.evaluate(
    ({ slotKey, role, content }) => {
      const storageKey = 'vibe-helper.test.slots'
      const parsed: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '[]')
      const slots = Array.isArray(parsed) ? parsed : []
      const next = slots.map((slot) => {
        if (typeof slot !== 'object' || slot === null || !('key' in slot) || slot.key !== slotKey) {
          return slot
        }
        const messages = 'messages' in slot && Array.isArray(slot.messages) ? slot.messages : []
        return {
          ...slot,
          messages: [...messages, { id: `test-${role}-${crypto.randomUUID()}`, role, content }],
        }
      })
      localStorage.setItem(storageKey, JSON.stringify(next))
    },
    { slotKey, role, content },
  )
}

function projectIdFromUrl(url: string): string {
  const match = url.match(/[?&]project=(project_[0-9a-f-]{36})/)
  if (match?.[1] === undefined) throw new TypeError('Project URL is invalid')
  return match[1]
}

async function startFromKeyboard(
  page: Page,
  input: { readonly learningGoal: string; readonly personalNeed: string } = {
    learningGoal: 'TypeScript runtime validation',
    personalNeed: '작은 도구의 설정 오류를 실행 전에 찾고 싶어요.',
  },
): Promise<void> {
  await page.getByLabel(/무엇을 배우고 싶나요/).fill(input.learningGoal)
  await page.getByLabel(/요즘 직접 해결하고 싶은 일이 있나요/).fill(input.personalNeed)
  const startButton = page.getByRole('button', { name: '프로젝트 후보 만나기' })
  await startButton.focus()
  await page.keyboard.press('Enter')
}

// Functional flows wait for the fixture's real Core writes before asserting UI state.
// The default 5s UI assertion budget still starts after the corresponding response.
function waitForDiscoveryTurn(
  page: Page,
  phase: 'preview' | 'enrich-first' | 'enrich-second' | 'round' | 'merge' | 'spec',
  matchingResponses = 1,
): Promise<void> {
  let responses = 0
  return page
    .waitForResponse((response) => {
      if (!response.url().endsWith('/api/chat') || response.request().method() !== 'POST')
        return false
      const dispatch = response.request().postDataJSON()
      const matches = phase.startsWith('enrich-')
        ? dispatch.agent === 'vibe-helper-discovery-enrichment' &&
          String(dispatch.slot).includes(`-${phase}-`)
        : dispatch.agent === `vibe-helper-discovery-${phase}`
      return matches && ++responses === matchingResponses
    })
    .then((response) => {
      expect(response.ok()).toBe(true)
    })
}

test('runs the Campus Drop Golden Path through Discovery, Decision, Evidence, Final Upgrade, and completion', async ({
  page,
  request,
}) => {
  // This is a complete multi-stage flow, not a per-response latency assertion.
  test.setTimeout(120_000)
  expect(campusDropFixture).toMatchObject({
    decision: { acceptedOption: 'CONSUME_AFTER_FIRST_DOWNLOAD' },
    allowedEvidence: {
      builderOutputMaximum: 'OBSERVED',
      userExplanationMaximum: 'EXPLAINED',
      independentDecisionOrApplicationMaximum: 'DEMONSTRATED',
      sameSessionTransferredAllowed: false,
    },
    containsPersonalData: false,
  })
  expect(campusDropFixture.learningScope.excluded).toEqual(
    expect.arrayContaining(['login', 'permanent storage', 'hosted deployment']),
  )
  const pageErrors: Error[] = []
  let agentDispatches = 0
  let builderDispatches = 0
  let firstBuilderMessage = ''
  let helperDispatches = 0
  let releaseBuilderResume: (() => void) | undefined
  const builderResumeGate = new Promise<void>((resolve) => {
    releaseBuilderResume = resolve
  })
  page.on('pageerror', (error) => pageErrors.push(error))
  await page.route('**/api/chat', async (route) => {
    const dispatch = route.request().postDataJSON()
    const agent = String(dispatch.agent)
    const dispatchedProjectId = projectIdFromRoute(route)
    const slotKey = String(dispatch.slot)
    if (agent === 'vibe-helper-evidence-analyst') {
      await fulfillAnalystTurn(route, request, dispatchedProjectId)
      return
    }
    if (agent === 'vibe-helper-builder') {
      builderDispatches += 1
      if (builderDispatches === 1) {
        firstBuilderMessage = String(dispatch.message)
        await fulfillInitialBuilderTurn(route, request, dispatchedProjectId)
        await appendTestCrewMessage(page, slotKey, 'user', firstBuilderMessage)
        await appendTestCrewMessage(
          page,
          slotKey,
          'assistant',
          [
            'Campus Drop의 metadata/blob 경계를 만들고 실제 Decision이 필요한 지점까지 진행했습니다.',
            ...Array.from(
              { length: 24 },
              (_, index) => `진행 로그 ${String(index + 1)}: token 상태 경계를 검증했습니다.`,
            ),
            '```diff',
            '--- a/src/core.ts',
            '+++ b/src/core.ts',
            '+export type DownloadState = "READY" | "EXPIRED" | "CONSUMED"',
            '```',
            '[OPTIONS: 첫 다운로드 뒤 소비 | 만료 전까지 재사용]',
          ].join('\n'),
        )
      } else if (builderDispatches === 2) {
        await builderResumeGate
        await fulfillResumedBuilderTurn(route, request, dispatchedProjectId)
        await appendTestCrewMessage(page, slotKey, 'user', String(dispatch.message))
        await appendTestCrewMessage(
          page,
          slotKey,
          'assistant',
          '선택한 consume-once 정책을 반영했고 모든 검증을 통과했습니다.',
        )
      } else {
        await fulfillFinalUpgradeBuilderTurn(route, request, dispatchedProjectId)
        await appendTestCrewMessage(page, slotKey, 'user', String(dispatch.message))
        await appendTestCrewMessage(
          page,
          slotKey,
          'assistant',
          '사용자가 선택한 Final Upgrade를 구현하고 검증했습니다.',
        )
      }
      return
    }
    if (agent === 'vibe-helper-helper') {
      helperDispatches += 1
      const longHelperAnswer = `첫 다운로드 뒤 소비하면 공용 PC에 남은 링크가 다시 쓰일 위험을 줄일 수 있고, 만료 전 재사용하면 여러 기기에서 받기 쉽습니다. ${'두 선택은 편의성과 링크 재사용 위험 사이의 tradeoff이며, 사용 목적에 맞춰 결정할 수 있습니다. '.repeat(8)}이 문장이 240자 뒤에도 온전히 보이면 전체 답변 렌더링이 정상입니다.`
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: [
          `data: ${JSON.stringify({ type: 'message', content: longHelperAnswer })}`,
          'data: [DONE]',
        ].join('\n\n'),
      })
      await appendTestCrewMessage(page, slotKey, 'user', String(dispatch.message))
      await appendTestCrewMessage(page, slotKey, 'assistant', longHelperAnswer)
      return
    }
    agentDispatches += 1
    await fulfillAgentTurn(route, request, dispatchedProjectId)
  })

  await page.goto('/#/discovery')
  await expect(page.getByRole('heading', { name: /배우고 싶은 것을/ })).toBeVisible()
  await expect(page.getByRole('button', { name: '프로젝트 후보 만나기' })).toBeDisabled()
  const initialDetails = waitForDiscoveryTurn(page, 'enrich-second')
  const preview = waitForDiscoveryTurn(page, 'preview')
  await startFromKeyboard(page, campusDropFixture.discoveryInput)
  await preview

  const firstCandidate = page.getByRole('listitem').filter({
    has: page.getByRole('heading', { name: 'Campus Drop', exact: true }),
  })
  await expect(firstCandidate).toBeVisible()
  await initialDetails
  await expect(page.getByText('10개 후보')).toBeVisible()
  const composerBox = await page.locator('.refinement-dock').boundingBox()
  const candidateListBox = await page.locator('.candidate-list').boundingBox()
  expect(composerBox).not.toBeNull()
  expect(candidateListBox).not.toBeNull()
  expect(composerBox?.y ?? Number.POSITIVE_INFINITY).toBeLessThan(
    candidateListBox?.y ?? Number.NEGATIVE_INFINITY,
  )
  const firstCandidateBox = await page.locator('.candidate-card').nth(0).boundingBox()
  const secondCandidateBox = await page.locator('.candidate-card').nth(1).boundingBox()
  expect(firstCandidateBox?.x).toBe(secondCandidateBox?.x)
  expect(secondCandidateBox?.y ?? 0).toBeGreaterThan(firstCandidateBox?.y ?? 0)
  await expect(firstCandidate.getByRole('button', { name: '범위 줄이기' })).toHaveCount(0)
  await expect(firstCandidate.getByRole('button', { name: '조금 키우기' })).toHaveCount(0)

  await page.setViewportSize({ width: 390, height: 844 })
  await page.evaluate(() => {
    const root = document.querySelector('#root')
    if (root === null) throw new TypeError('Crew App root is missing')
    const outer = document.createElement('div')
    outer.dataset.testKiroMobileOuter = 'true'
    outer.style.height = '844px'
    outer.style.overflow = 'hidden'
    const scroller = document.createElement('div')
    scroller.style.height = '802px'
    scroller.style.overflowY = 'auto'
    scroller.style.color = 'rgb(220, 218, 223)'
    scroller.style.backgroundColor = 'rgb(19, 16, 24)'
    const hostStyle = document.createElement('style')
    hostStyle.dataset.testKiroMobileStyle = 'true'
    hostStyle.textContent = 'main { height: 100%; }'
    root.before(outer)
    outer.append(scroller)
    scroller.append(root)
    document.head.append(hostStyle)
  })
  const mobileMetrics = await page.evaluate(() => {
    const mark = document.querySelector('.candidate-checkmark')?.getBoundingClientRect()
    const input = document.querySelector<HTMLInputElement>('.candidate-check input')
    const card = document.querySelector('.candidate-card')?.getBoundingClientRect()
    const shell = document.querySelector<HTMLElement>('.app-shell')
    const shellStyle = shell === null ? null : getComputedStyle(shell)
    return {
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
      markWidth: mark?.width ?? 0,
      markHeight: mark?.height ?? 0,
      cardWidth: card?.width ?? 0,
      checkboxPosition: input === null ? '' : getComputedStyle(input).position,
      checkboxWidth: input?.getBoundingClientRect().width ?? 0,
      checkboxHeight: input?.getBoundingClientRect().height ?? 0,
      shellColor: shellStyle?.color ?? '',
      shellBackground: shellStyle?.backgroundColor ?? '',
    }
  })
  expect(mobileMetrics.documentWidth).toBeLessThanOrEqual(mobileMetrics.viewportWidth)
  expect(mobileMetrics.markWidth).toBeGreaterThanOrEqual(24)
  expect(mobileMetrics.markHeight).toBeGreaterThanOrEqual(24)
  expect(mobileMetrics.cardWidth).toBeLessThanOrEqual(mobileMetrics.viewportWidth)
  expect(mobileMetrics.checkboxPosition).not.toBe('absolute')
  expect(mobileMetrics.checkboxWidth).toBeGreaterThanOrEqual(24)
  expect(mobileMetrics.checkboxHeight).toBeGreaterThanOrEqual(24)
  expect(mobileMetrics.shellColor).toBe('rgb(32, 33, 38)')
  expect(mobileMetrics.shellBackground).toBe('rgb(246, 246, 248)')
  const interestCheckbox = firstCandidate.getByRole('checkbox', {
    name: 'Campus Drop 관심 목록에 담기',
  })
  await interestCheckbox.click()
  await expect(interestCheckbox).toBeChecked()
  await expect(page.getByText('1개 담음')).toBeVisible()
  expect(
    await page.evaluate(
      () => document.querySelector<HTMLElement>('[data-test-kiro-mobile-outer]')?.scrollTop,
    ),
  ).toBe(0)
  await interestCheckbox.click()
  await expect(interestCheckbox).not.toBeChecked()
  await page.evaluate(() => {
    const root = document.querySelector('#root')
    const outer = document.querySelector('[data-test-kiro-mobile-outer]')
    if (root !== null && outer !== null) outer.before(root)
    outer?.remove()
    document.querySelector('[data-test-kiro-mobile-style]')?.remove()
  })
  await page.setViewportSize({ width: 1280, height: 720 })

  const moreCandidates = waitForDiscoveryTurn(page, 'round')
  await page.getByRole('button', { name: '다른 후보 4개 더 보기' }).click()
  await moreCandidates
  await expect(page.getByText('14개 후보')).toBeVisible()
  await interestCheckbox.focus()
  await page.keyboard.press('Space')
  await expect(interestCheckbox).toBeChecked()
  const secondInterestCheckbox = page.getByRole('checkbox', {
    name: 'QR Note Relay 관심 목록에 담기',
  })
  await secondInterestCheckbox.check()
  await expect(page.getByText('2개 담음')).toBeVisible()
  await page
    .getByLabel('Agent에게 원하는 방향 말하기')
    .fill('핵심은 유지하고 하루 안에 만들 수 있도록 범위를 줄여 주세요.')
  const mergedCandidates = waitForDiscoveryTurn(page, 'merge')
  await page.getByRole('button', { name: '선택한 주제로 합치기' }).focus()
  await page.keyboard.press('Enter')
  await mergedCandidates
  const revisedCandidate = page.getByRole('listitem').filter({
    has: page.getByRole('heading', { name: 'Campus Drop · 작은 MVP', exact: true }),
  })
  await expect(revisedCandidate).toBeVisible()
  await expect(page.locator('.candidate-list > .candidate-card')).toHaveCount(1)
  await expect(page.getByRole('heading', { name: 'QR Note Relay', exact: true })).toHaveCount(0)
  const initialSpec = waitForDiscoveryTurn(page, 'spec')
  await revisedCandidate.getByRole('button', { name: '이 방향 선택' }).focus()
  await page.keyboard.press('Enter')
  await initialSpec

  await expect(
    page.getByRole('heading', { name: '이 범위라면 바로 시작할 수 있어요.' }),
  ).toBeVisible()
  await expect(page.getByLabel('제품 목적')).toHaveCount(0)
  await expect(page.getByText('누가 쓰나요?')).toBeVisible()
  await page
    .getByLabel('바꾸고 싶은 점을 Agent에게 말하기')
    .fill('로그인은 빼고 한 화면에서 완성하도록 다시 정리해 주세요.')
  const revisedSpec = waitForDiscoveryTurn(page, 'spec')
  await page.getByRole('button', { name: 'Agent에게 다시 정리해달라고 하기' }).click()
  await revisedSpec
  await expect(page.getByText('권장 Learning Spec · revision 2')).toBeVisible()
  await expect(
    page.getByText('로그인 없이 작은 파일을 만료·일회용 링크로 옮기는 local 도구를 만든다.'),
  ).toBeVisible()

  await page.getByRole('button', { name: /다른 주제로 돌아가기/ }).click()
  await expect(page).toHaveURL(/#\/discovery\?project=/)
  await expect(page.getByText('이전 후보를 그대로 보고 있어요.')).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Campus Drop · 작은 MVP', exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: '새 후보 받기' })).toBeVisible()
  expect(agentDispatches).toBe(7)
  await page.getByRole('button', { name: 'Spec으로 돌아가기' }).click()
  expect(agentDispatches).toBe(7)
  const prepare = page.getByRole('button', { name: '이대로 시작' })
  await expect(prepare).toBeVisible()
  await expect(prepare).toBeEnabled()
  await prepare.focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/#\/build\?project=/)
  await expect(
    page.getByRole('heading', { name: campusDropFixture.discoveryInput.learningGoal, exact: true }),
  ).toBeVisible()
  await expect(page.locator('.builder-pane')).toBeVisible()
  await expect
    .poll(() => firstBuilderMessage)
    .toContain('확정한 Learning Spec을 기준으로 구현을 시작해줘.')
  expect(firstBuilderMessage).not.toContain('projectId=')
  expect(firstBuilderMessage).not.toContain('correlationId=')

  const preparedProjectId = projectIdFromUrl(page.url())
  await page.goto('/#/history')
  const preparedProject = page
    .getByRole('button', {
      name: new RegExp(`${campusDropFixture.discoveryInput.learningGoal}.*Open Build →`),
    })
    .first()
  await expect(preparedProject).toContainText('Open Build →')
  await preparedProject.click()
  await expect(page).toHaveURL(new RegExp(`#\\/build\\?project=${preparedProjectId}$`))

  await expect(page.locator('.builder-pane')).toBeVisible()
  await expect(page.locator('.helper-pane')).toBeVisible()
  await expect(page.getByRole('log', { name: 'Builder transcript' })).toBeVisible()
  await expect(page.getByLabel('Builder message')).toBeVisible()
  const lightChatTheme = await page
    .locator('.builder-pane .native-chat-frame')
    .evaluate((frame) => {
      const style = getComputedStyle(frame)
      return { background: style.backgroundColor, color: style.color }
    })
  expect(lightChatTheme).toEqual({
    background: 'rgb(249, 249, 251)',
    color: 'rgb(32, 33, 38)',
  })
  await page.emulateMedia({ colorScheme: 'dark' })
  const darkChatTheme = await page.locator('.builder-pane .native-chat-frame').evaluate((frame) => {
    const style = getComputedStyle(frame)
    return { background: style.backgroundColor, color: style.color }
  })
  expect(darkChatTheme).toEqual({
    background: 'rgb(21, 19, 26)',
    color: 'rgb(244, 241, 246)',
  })
  await page.emulateMedia({ colorScheme: 'light' })
  const builderScrollMetrics = await page.evaluate(() => {
    const pane = document.querySelector<HTMLElement>('.builder-pane')
    const transcript = pane?.querySelector<HTMLElement>('.native-message-list')
    const composer = pane?.querySelector<HTMLElement>('.native-chat-composer')
    const paneRect = pane?.getBoundingClientRect()
    const composerRect = composer?.getBoundingClientRect()
    return {
      paneHeight: paneRect?.height ?? Number.POSITIVE_INFINITY,
      transcriptClientHeight: transcript?.clientHeight ?? Number.POSITIVE_INFINITY,
      transcriptScrollHeight: transcript?.scrollHeight ?? 0,
      composerInsidePane:
        paneRect !== undefined && composerRect !== undefined
          ? composerRect.bottom <= paneRect.bottom + 1
          : false,
    }
  })
  expect(builderScrollMetrics.paneHeight).toBeLessThanOrEqual(760)
  expect(builderScrollMetrics.transcriptScrollHeight).toBeGreaterThan(
    builderScrollMetrics.transcriptClientHeight,
  )
  expect(builderScrollMetrics.composerInsidePane).toBe(true)
  await expect(page.locator('[data-native-diff]')).toBeVisible()
  await expect(page.locator('body')).not.toContainText('[OPTIONS:')
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.locator('.helper-pane')).toBeHidden()
  await page.getByRole('tab', { name: 'Helper' }).click()
  await expect(page.locator('.helper-pane')).toBeVisible()
  await expect(page.locator('.builder-pane')).toBeHidden()
  const mobileBuildMetrics = await page.evaluate(() => {
    const title = document.querySelector<HTMLElement>('.build-session-bar h2')
    const quickActions = document.querySelector<HTMLElement>('.quick-actions')
    return {
      titleFontSize:
        title === null ? Number.POSITIVE_INFINITY : parseFloat(getComputedStyle(title).fontSize),
      quickActionClientWidth: quickActions?.clientWidth ?? 0,
      quickActionScrollWidth: quickActions?.scrollWidth ?? Number.POSITIVE_INFINITY,
    }
  })
  expect(mobileBuildMetrics.titleFontSize).toBeLessThanOrEqual(26)
  expect(mobileBuildMetrics.quickActionScrollWidth).toBeLessThanOrEqual(
    mobileBuildMetrics.quickActionClientWidth,
  )
  await page.getByRole('tab', { name: 'Builder' }).click()
  await page.setViewportSize({ width: 1280, height: 720 })

  await expect(
    page.getByText(
      'Campus Drop의 metadata/blob 경계를 만들고 실제 Decision이 필요한 지점까지 진행했습니다.',
    ),
  ).toBeVisible()
  await expect(page.locator('body')).not.toContainText('synthetic-e2e-secret')
  await expect(page.locator('body')).not.toContainText('noisy-fragment')
  await expect(page.locator('body')).not.toContainText('used_tokens')
  const decisionHeading = page.getByRole('heading', {
    name: campusDropFixture.decision.question,
  })
  await expect(decisionHeading).toBeVisible()
  await expect(page.getByText('Builder recommendation')).toBeVisible()
  await expect(page.getByText('첫 다운로드 뒤 소비', { exact: true }).first()).toBeVisible()
  const recommendationButton = page.getByRole('button', {
    name: '첫 다운로드 뒤 소비 · 추천',
  })
  const recommendationButtonMetrics = await recommendationButton.evaluate((button) => {
    const rect = button.getBoundingClientRect()
    return {
      width: rect.width,
      height: rect.height,
      whiteSpace: getComputedStyle(button).whiteSpace,
    }
  })
  expect(recommendationButtonMetrics.width).toBeGreaterThanOrEqual(90)
  expect(recommendationButtonMetrics.height).toBeLessThan(60)
  expect(recommendationButtonMetrics.whiteSpace).toBe('nowrap')
  const decisionComposerOrder = await page.evaluate(() => {
    const suggestions = document.querySelector<HTMLElement>('.builder-pane .decision-reply-row')
    const composer = document.querySelector<HTMLElement>('.builder-pane .native-chat-composer')
    return {
      suggestionsBottom: suggestions?.getBoundingClientRect().bottom ?? Number.POSITIVE_INFINITY,
      composerTop: composer?.getBoundingClientRect().top ?? Number.NEGATIVE_INFINITY,
    }
  })
  expect(decisionComposerOrder.suggestionsBottom).toBeLessThanOrEqual(
    decisionComposerOrder.composerTop,
  )

  const evidenceSummary = page.locator('.evidence-trace-panel > summary')
  await evidenceSummary.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByText('Agent에 제공된 근거')).toBeVisible()
  const projectId = projectIdFromUrl(page.url())
  const evidenceBeforeHelper = await readEvidenceTrace(request, projectId)
  expect(evidenceBeforeHelper.personalization.length).toBeGreaterThan(0)
  await evidenceSummary.focus()
  await page.keyboard.press('Enter')

  await page.getByRole('button', { name: 'Helper에게 비교 요청' }).click()
  await expect(
    page.getByText(
      '첫 다운로드 뒤 소비하면 공용 PC에 남은 링크가 다시 쓰일 위험을 줄일 수 있고, 만료 전 재사용하면 여러 기기에서 받기 쉽습니다.',
    ),
  ).toBeVisible()
  await expect(
    page.getByText('이 문장이 240자 뒤에도 온전히 보이면 전체 답변 렌더링이 정상입니다.'),
  ).toBeVisible()
  await expect
    .poll(async () => {
      const restored = await restoreProject(request, projectId)
      return restored.helperConversations[0]?.redactedUserExcerpts ?? null
    })
    .toEqual([])
  expect(helperDispatches).toBe(1)
  const evidenceAfterHelper = await readEvidenceTrace(request, projectId)
  expect(evidenceAfterHelper.personalization).toHaveLength(
    evidenceBeforeHelper.personalization.length + 1,
  )

  await page.getByLabel('Helper message').fill(campusDropFixture.helperUserMessage)
  await page.getByRole('button', { name: 'Helper에게 보내기' }).click()
  await expect
    .poll(async () => {
      const restored = await restoreProject(request, projectId)
      return restored.helperConversations[0]?.redactedUserExcerpts ?? []
    })
    .toContain(campusDropFixture.helperUserMessage)
  expect(helperDispatches).toBe(2)
  const evidenceAfterExplanation = await readEvidenceTrace(request, projectId)
  await recommendationButton.click()
  await expect(page.getByText('APPLY PENDING', { exact: true })).toBeVisible()
  releaseBuilderResume?.()
  await expect(
    page.getByRole('heading', {
      name: `${campusDropFixture.discoveryInput.learningGoal} 완성`,
    }),
  ).toBeVisible()
  await expect(
    page.getByText(
      '첫 다운로드가 성공한 뒤 token을 consumed 상태로 전이해 두 번째 요청을 거절하도록 적용했습니다.',
    ),
  ).toBeVisible()
  await expect(page.locator('body')).not.toContainText('\\ubaa8')
  await expect(page.getByRole('log', { name: 'Builder transcript' })).toContainText(
    '선택한 consume-once 정책을 반영했고 모든 검증을 통과했습니다.',
  )
  await expect(page.getByLabel('Builder message')).toBeVisible()
  await expect(
    page.getByText('Small-file upload, expiring token, and one-time download flow'),
  ).toBeVisible()
  await expect(page.getByText('Campus Drop Build E2E')).toBeVisible()
  await evidenceSummary.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByText('코드·작업에서 개념 사용이 관찰됨').first()).toBeVisible()
  await expect(page.getByText('프로젝트에서 관찰됨').first()).toBeVisible()
  await expect(page.getByText('Agent에 제공된 근거')).toBeVisible()
  const latestPersonalization = evidenceAfterExplanation.personalization[0]
  if (latestPersonalization === undefined) throw new Error('missing personalization trace')
  const latestPersonalizationLabel =
    latestPersonalization.mode === 'NO_RELEVANT_EVIDENCE'
      ? '관련 Evidence 없이 일반 경로를 사용함'
      : latestPersonalization.basis
          .map((basis) => `${basis.conceptName} · ${basis.sourceProjectTitles.join(', ')}`)
          .join(' / ')
  const matchingPersonalizationLabels = evidenceAfterExplanation.personalization.filter((item) => {
    const label =
      item.mode === 'NO_RELEVANT_EVIDENCE'
        ? '관련 Evidence 없이 일반 경로를 사용함'
        : item.basis
            .map((basis) => `${basis.conceptName} · ${basis.sourceProjectTitles.join(', ')}`)
            .join(' / ')
    return label === latestPersonalizationLabel
  }).length
  await expect(page.getByText(latestPersonalizationLabel, { exact: true })).toHaveCount(
    matchingPersonalizationLabels,
  )
  await expect(page.locator('.evidence-trace-panel')).not.toContainText('%')
  await expect
    .poll(async () => {
      const trace = await readEvidenceTrace(request, projectId)
      return trace.analysis.filter((job) => job.status === 'SUCCEEDED').length
    })
    .toBeGreaterThan(0)
  await expect
    .poll(async () => {
      const trace = await readEvidenceTrace(request, projectId)
      return trace.concepts.some(
        (concept) =>
          concept.conceptName === 'access token and expiry state transition' &&
          concept.state === 'EXPLAINED' &&
          concept.evidence.some((evidence) => evidence.kind === 'USER_UNDERSTANDING'),
      )
    })
    .toBe(true)
  await page.getByRole('button', { name: 'Helper와 개선 방향 찾기' }).click()
  await expect(page.getByLabel('내가 선택한 개선 목표')).toBeVisible()
  await page.getByLabel('내가 선택한 개선 목표').fill(campusDropFixture.finalUpgradeUserGoal)
  await page.getByRole('button', { name: '이 목표로 개선 시작' }).click()
  await expect(page.getByRole('log', { name: 'Builder transcript' })).toContainText(
    '사용자가 선택한 Final Upgrade를 구현하고 검증했습니다.',
  )
  await expect(page.getByText('Final Upgrade E2E')).toBeVisible()
  await page.getByRole('button', { name: '생성 결과 열기' }).click()
  await expect(page.getByText(/실행 준비 완료 · projects\/project_/)).toBeVisible()
  const finalEvidence = await readEvidenceTrace(request, projectId)
  expect(finalEvidence.concepts.every((concept) => concept.state !== 'TRANSFERRED')).toBe(true)
  expect(builderDispatches).toBe(3)
  expect(helperDispatches).toBe(3)
  // The backend is shared across specs. Finish this fixture's automatic jobs
  // before the next page installs a Discovery-only Agent route.
  await expect
    .poll(
      async () => {
        const trace = await readEvidenceTrace(request, projectId)
        return trace.analysis.every((job) => job.status === 'SUCCEEDED')
      },
      { timeout: 15_000 },
    )
    .toBe(true)
  expect(pageErrors).toEqual([])
})

test('shows durable previews and keeps the basket usable while fixed Candidate details are still loading', async ({
  page,
  request,
}) => {
  test.setTimeout(60_000)
  let releaseFirst!: () => void
  let releaseSecond!: () => void
  const firstGate = new Promise<void>((resolve) => {
    releaseFirst = resolve
  })
  const secondGate = new Promise<void>((resolve) => {
    releaseSecond = resolve
  })
  await page.route('**/api/chat', async (route) => {
    const dispatch = route.request().postDataJSON()
    const projectId = projectIdFromRoute(route)
    if (dispatch.agent !== 'vibe-helper-discovery-enrichment') {
      await fulfillAgentTurn(route, request, projectId)
      return
    }
    const slot = String(dispatch.slot)
    await (slot.includes('-enrich-first-') ? firstGate : secondGate)
    const snapshot = await restoreProject(request, projectId)
    await submitCandidateEnrichment(
      request,
      snapshot,
      slot.includes('-enrich-first-') ? 'FIRST' : 'SECOND',
    )
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: 'data: {"type":"done"}\n\n',
    })
  })

  try {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/#/discovery')
    const preview = waitForDiscoveryTurn(page, 'preview')
    await startFromKeyboard(page)
    await preview
    await expect(page.getByText('10개 미리보기')).toBeVisible()
    await expect(page.getByRole('heading', { name: '상세 0/10 준비됨' })).toBeVisible()
    const previewCheckbox = page.getByRole('checkbox', {
      name: 'Safe Config Lab 관심 목록에 담기',
    })
    await previewCheckbox.click()
    await expect(previewCheckbox).toBeChecked()
    await expect(page.getByText('1개 담음')).toBeVisible()
    await expect(page.getByLabel('Agent에게 원하는 방향 말하기')).toBeEnabled()
    await expect(page.getByRole('button', { name: '이 방향 선택' }).first()).toBeEnabled()

    const firstDetails = waitForDiscoveryTurn(page, 'enrich-first')
    releaseFirst()
    await firstDetails
    await expect(page.getByRole('heading', { name: '상세 5/10 준비됨' })).toBeVisible()
    const firstCandidate = page
      .getByRole('listitem')
      .filter({ has: page.getByRole('heading', { name: 'Safe Config Lab', exact: true }) })
    await firstCandidate.getByText('세부 범위 미리 보기', { exact: true }).click()
    await expect(firstCandidate.locator('details')).toHaveAttribute('open', '')

    const secondDetails = waitForDiscoveryTurn(page, 'enrich-second')
    releaseSecond()
    await secondDetails
    await expect(page.getByText('10개 후보')).toBeVisible()
    await expect(previewCheckbox).toBeChecked()
    await expect(firstCandidate.getByText('세부 범위와 변경 이력', { exact: true })).toBeVisible()
    await expect(firstCandidate.locator('details')).toHaveAttribute('open', '')
    await expect(page.getByRole('button', { name: '이 방향 선택' }).first()).toBeEnabled()
  } finally {
    releaseFirst()
    releaseSecond()
  }
})

test('selects a preview immediately by enriching only that direction', async ({
  page,
  request,
}) => {
  test.setTimeout(60_000) // Preview, selected enrichment and Spec are separate Core transactions.
  let backgroundStarted = false
  let releaseBackground!: () => void
  const backgroundPending = new Promise<void>((resolve) => {
    releaseBackground = resolve
  })
  await page.route('**/api/chat', async (route) => {
    const dispatch = route.request().postDataJSON()
    const projectId = projectIdFromRoute(route)
    if (dispatch.agent !== 'vibe-helper-discovery-enrichment') {
      await fulfillAgentTurn(route, request, projectId)
      return
    }
    const slot = String(dispatch.slot)
    if (slot.includes('-enrich-selected-')) {
      const snapshot = await restoreProject(request, projectId)
      const selectedCandidateId = snapshot.discoveryContext?.previewRound?.previews[0]?.candidateId
      if (selectedCandidateId === undefined) throw new TypeError('Selected preview is missing')
      await submitCandidateEnrichment(request, snapshot, 'SELECTED', [selectedCandidateId])
    } else {
      // Keep the unrelated Agent turn pending until selection is proven. A wall-clock
      // delay raced the selected turn's state transition and submitted stale fixture data.
      backgroundStarted = true
      await backgroundPending
    }
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: 'data: {"type":"done"}\n\n',
    })
  })

  try {
    await page.goto('/#/discovery')
    const preview = waitForDiscoveryTurn(page, 'preview')
    await startFromKeyboard(page)
    await preview
    await expect.poll(() => backgroundStarted).toBe(true)
    await expect(page.getByRole('heading', { name: '상세 0/10 준비됨' })).toBeVisible()
    const firstPreview = page.getByRole('listitem').filter({
      has: page.getByRole('heading', { name: 'Safe Config Lab', exact: true }),
    })
    const initialSpec = waitForDiscoveryTurn(page, 'spec')
    await firstPreview.getByRole('button', { name: '이 방향 선택' }).click()
    await initialSpec
    await expect(
      page.getByRole('heading', { name: '이 범위라면 바로 시작할 수 있어요.' }),
    ).toBeVisible()

    const projectId = projectIdFromUrl(page.url())
    const selected = await restoreProject(request, projectId)
    expect(selected.discoverySession?.status).toBe('SELECTED')
    expect(selected.discoveryContext?.candidateEnrichments.length ?? 10).toBeLessThan(10)
    expect(selected.discoveryContext?.rounds[0]?.candidates).toHaveLength(1)
    expect(selected.selectedCandidate?.title).toBe('Safe Config Lab')
  } finally {
    releaseBackground()
  }
})

test('distinguishes a Crew host disconnect from saved Core state and retries safely', async ({
  page,
  request,
}) => {
  let attempts = 0
  await page.route('**/api/chat', async (route) => {
    attempts += 1
    if (attempts === 1) {
      await route.abort('connectionfailed')
      return
    }
    await fulfillAgentTurn(route, request, projectIdFromRoute(route))
  })

  await page.goto('/#/discovery')
  await startFromKeyboard(page)
  await expect(page.getByText('Crew 호스트와 연결이 끊겼어요.')).toBeVisible()
  await expect(page.getByText(/이미 Core에 저장된 프로젝트와 피드백은 유지/)).toBeVisible()
  await page.getByRole('button', { name: '상태 확인 후 다시 시도' }).click()
  await expect(page.getByRole('heading', { name: 'Safe Config Lab', exact: true })).toBeVisible()
  expect(attempts).toBeGreaterThanOrEqual(2)
})

test('starts a new Discovery only after the user edits or confirms the restored input', async ({
  page,
  request,
}) => {
  test.setTimeout(60_000) // Two Discovery sessions plus selection and Spec.
  let previewDispatches = 0
  await page.route('**/api/chat', async (route) => {
    if (route.request().postDataJSON().agent === 'vibe-helper-discovery-preview')
      previewDispatches += 1
    await fulfillAgentTurn(route, request, projectIdFromRoute(route))
  })

  await page.goto('/#/discovery')
  const preview = waitForDiscoveryTurn(page, 'preview')
  await startFromKeyboard(page)
  await preview
  const initialSpec = waitForDiscoveryTurn(page, 'spec')
  await page
    .getByRole('listitem')
    .filter({ has: page.getByRole('heading', { name: 'Safe Config Lab', exact: true }) })
    .getByRole('button', { name: '이 방향 선택' })
    .click()
  await initialSpec
  await expect(
    page.getByRole('heading', { name: '이 범위라면 바로 시작할 수 있어요.' }),
  ).toBeVisible()
  expect(previewDispatches).toBe(1)

  await page.getByRole('button', { name: /다른 주제로 돌아가기/ }).click()
  await expect(page.getByText('이전 후보를 그대로 보고 있어요.')).toBeVisible()
  expect(previewDispatches).toBe(1)

  const nextGoal = 'TypeScript runtime validation으로 로컬 CSV 검사기 만들기'
  await page.getByLabel(/무엇을 배우고 싶나요/).fill(nextGoal)
  const newDetails = waitForDiscoveryTurn(page, 'enrich-second')
  await page.getByRole('button', { name: '새 후보 받기' }).click()
  await expect(page.getByRole('heading', { name: nextGoal, exact: true })).toBeVisible()
  await newDetails
  await expect(page.getByText('10개 후보')).toBeVisible()
  expect(previewDispatches).toBe(2)

  const projectMatch = page.url().match(/project=(project_[0-9a-f-]{36})/)
  expect(projectMatch?.[1]).toBeDefined()
  const snapshot = await restoreProject(request, projectMatch?.[1] ?? '')
  expect(snapshot.project.learningGoal).toBe(nextGoal)
  expect(snapshot.discoverySession?.status).toBe('ACTIVE')
  expect(snapshot.learningSpec).toBeNull()
})

test('releases the UI after the foreground budget while Core completion continues', async ({
  page,
  request,
}) => {
  let delayedFailure: unknown
  await page.route('**/api/chat', async (route) => {
    const projectId = projectIdFromRoute(route)
    const snapshot = await restoreProject(request, projectId)
    const dispatch = route.request().postDataJSON()
    if (dispatch.agent !== 'vibe-helper-discovery-preview') {
      await fulfillAgentTurn(route, request, projectId)
      return
    }
    expect(dispatch.slot).toBe(
      `vibe-helper-discovery-preview-${snapshot.discoverySession?.id}-${snapshot.discoverySession?.revision}`,
    )
    void new Promise<void>((resolve) => setTimeout(resolve, 1_600))
      .then(() => submitCandidatePreviews(request, snapshot))
      .catch((error: unknown) => {
        delayedFailure = error
      })
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: 'data: {"type":"done"}\n\n',
    })
  })

  await page.goto('/#/discovery')
  await startFromKeyboard(page)
  await expect(page.getByText('백그라운드 Agent 작업을 확인하고 있어요.')).toBeVisible()
  const projectMatch = page.url().match(/project=(project_[0-9a-f-]{36})/)
  expect(projectMatch?.[1]).toBeDefined()

  await page.getByRole('link', { name: 'History', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Pick up where you left off.' })).toBeVisible()
  await page.waitForTimeout(1_800)
  await page.goto(`/#/discovery?project=${projectMatch?.[1] ?? ''}`)
  await expect(page.getByRole('heading', { name: 'Safe Config Lab', exact: true })).toBeVisible()
  expect(delayedFailure).toBeUndefined()
})

test('surfaces a terminal tool validation error before the polling timeout', async ({ page }) => {
  await page.route('**/api/chat', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: 'data: {"error":"Input validation error: synthetic"}\n\n',
    })
  })

  await page.goto('/#/discovery')
  const terminalResponse = waitForDiscoveryTurn(page, 'preview')
  await startFromKeyboard(page)
  await terminalResponse
  await expect(page.getByText('새 결과를 저장하지 못했어요.')).toBeVisible()
  await expect(page.getByText(/제출 형식을 거절/)).toBeVisible()
  await expect(page.getByRole('button', { name: '상태 확인 후 다시 시도' })).toBeVisible()
})

test('surfaces an Agent response that ends without a durable Core result', async ({ page }) => {
  await page.route('**/api/chat', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: 'data: {"done":true}\n\n',
    })
  })

  await page.goto('/#/discovery')
  const terminalResponse = waitForDiscoveryTurn(page, 'preview')
  await startFromKeyboard(page)
  await terminalResponse
  await expect(page.getByText('새 결과를 저장하지 못했어요.')).toBeVisible()
  await expect(page.getByText(/응답은 끝났지만 Core에 새 결과가 저장되지/)).toBeVisible()
  await expect(page.getByRole('button', { name: '상태 확인 후 다시 시도' })).toBeVisible()
})

test('restores an in-flight Discovery run after re-entry without dispatching it twice', async ({
  page,
  request,
}) => {
  const projectId = id('project')
  const sessionCorrelationId = id('corr')
  const started = await executeUi(request, {
    schemaVersion: 1,
    kind: 'UI_START_DISCOVERY',
    correlationId: sessionCorrelationId,
    actor: { kind: 'UI' },
    idempotencyKey: id('idem'),
    projectId,
    input: { learningGoal: 'TypeScript runtime validation' },
  })
  expect(await started.json()).toMatchObject({ success: true })
  const initial = await restoreProject(request, projectId)
  let agentDispatches = 0
  await page.route('**/api/chat', async (route) => {
    agentDispatches += 1
    await route.abort('failed')
  })

  await page.goto('/#/history')
  await page.evaluate(
    ({ key, agent }) => {
      localStorage.setItem(
        'vibe-helper.test.slots',
        JSON.stringify([{ key, agent, running: true, messages: [] }]),
      )
    },
    {
      key: `vibe-helper-discovery-preview-${initial.discoverySession?.id}-${initial.discoverySession?.revision}`,
      agent: 'vibe-helper-discovery-preview',
    },
  )
  await page.goto(`/#/discovery?project=${projectId}`)

  await expect(page.getByText('이전에 시작한 Agent 작업을 다시 연결했습니다.')).toBeVisible()
  expect(agentDispatches).toBe(0)
  await submitCandidatePreviews(request, initial)
  await expect(page.getByRole('heading', { name: 'Safe Config Lab', exact: true })).toBeVisible()
  expect(agentDispatches).toBe(0)
})

test('retries one Spec refinement when the first response skips its submit tool', async ({
  page,
  request,
}) => {
  test.setTimeout(60_000) // Initial Spec and two refinement responses, including recovery.
  let specDispatches = 0
  await page.route('**/api/chat', async (route) => {
    const spec = route.request().postDataJSON().agent === 'vibe-helper-discovery-spec'
    if (spec) specDispatches += 1
    if (!spec || specDispatches !== 2) {
      await fulfillAgentTurn(route, request, projectIdFromRoute(route))
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: 'data: {"type":"done"}\n\n',
    })
  })

  await page.goto('/#/discovery')
  const preview = waitForDiscoveryTurn(page, 'preview')
  await startFromKeyboard(page)
  await preview
  const initialSpec = waitForDiscoveryTurn(page, 'spec')
  await page
    .getByRole('listitem')
    .filter({ has: page.getByRole('heading', { name: 'Safe Config Lab', exact: true }) })
    .getByRole('button', { name: '이 방향 선택' })
    .click()
  await initialSpec
  await expect(page.getByText('권장 Learning Spec · revision 1')).toBeVisible()

  await page
    .getByLabel('바꾸고 싶은 점을 Agent에게 말하기')
    .fill('로그인 기능은 제외하고 한 화면 흐름으로 바꿔 주세요.')
  const recoveredSpec = waitForDiscoveryTurn(page, 'spec', 2)
  await page.getByRole('button', { name: 'Agent에게 다시 정리해달라고 하기' }).click()
  await recoveredSpec

  await expect(page.getByText('권장 Learning Spec · revision 2')).toBeVisible()
  expect(specDispatches).toBe(3)
})

test('shows a refresh instruction when the backend rejects a stale UI protocol', async ({
  page,
}) => {
  await page.route('**/apps/vibe-helper/api/application', async (route) => {
    await route.fulfill({
      status: 409,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'ui protocol mismatch', expectedProtocolVersion: 3 }),
    })
  })

  await page.goto('/#/history')
  await expect(page.getByText(/Vibe Helper가 업데이트되었습니다/)).toBeVisible()
  await expect(page.getByText(/페이지를 새로고침한 뒤 다시 시도/)).toBeVisible()
})
