import { createHash, createHmac, randomUUID } from 'node:crypto'

import { type APIRequestContext, expect, type Page, type Route, test } from '@playwright/test'
import {
  type CandidateRevisionReference,
  type ProjectCandidateRevision,
  type ProjectSessionSnapshot,
  projectCandidateRevisionSchema,
  projectSessionSnapshotSchema,
} from '../../packages/contracts/dist/index.js'

const applicationPath = '/api/application'
const testAgentPath = '/api/test/agent'
const proxySecret = 'test-proxy-secret-with-at-least-thirty-two-bytes'

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
  return executeBackend(request, applicationPath, { ...input, clientProtocolVersion: 7 })
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

function candidateContent(title: string, summary: string) {
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
  const now = new Date().toISOString()
  let candidates: ProjectCandidateRevision[]
  let references: CandidateRevisionReference[]
  if (currentRound === undefined) {
    candidates = [
      [
        'Safe Config Lab',
        '잘못된 설정을 직접 넣어 보며 runtime validation의 역할을 확인하는 로컬 실험실',
      ],
      ['API Shape Detective', '여러 API 응답 모양을 비교하고 안전하게 좁히는 탐정형 playground'],
      ['Webhook Replay Desk', '서로 다른 webhook payload를 재생하고 분기 결과를 비교하는 도구'],
      ['Form State Theater', '복잡한 폼 상태를 명시적 variant로 바꾸며 흐름을 확인하는 도구'],
    ].map(([title, summary]) =>
      projectCandidateRevisionSchema.parse({
        schemaVersion: 1,
        id: id('candidate'),
        discoverySessionId: session.id,
        correlationId: session.correlationId,
        revision: 1,
        parentRevisions: [],
        ...candidateContent(title ?? 'Untitled Candidate', summary ?? 'Candidate summary'),
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
      candidates = [
        ['CLI Output Triage', '여러 command 결과를 성공과 실패 variant로 분류하는 로컬 도구'],
        ['Import Contract Gate', '가져온 JSON 파일의 shape를 검사하고 안전한 부분만 여는 도구'],
        ['Plugin Message Router', 'plugin message 종류별 처리 흐름을 시각적으로 추적하는 도구'],
        ['Database Row Guard', 'nullable query 결과를 명시적 상태로 바꾸고 안전하게 표시하는 도구'],
      ].map(([title, summary]) =>
        projectCandidateRevisionSchema.parse({
          schemaVersion: 1,
          id: id('candidate'),
          discoverySessionId: session.id,
          correlationId: session.correlationId,
          revision: 1,
          parentRevisions: [],
          ...candidateContent(title ?? 'Untitled Candidate', summary ?? 'Candidate summary'),
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

async function submitCandidatePreviews(
  request: APIRequestContext,
  snapshot: ProjectSessionSnapshot,
): Promise<void> {
  const session = snapshot.discoverySession
  if (session === null) throw new TypeError('Discovery session is missing')
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
      previews: initialPreviewDirections.map(([title, summary], index) => ({
        candidateId: id('candidate'),
        position: index + 1,
        title,
        summary,
        coreInteraction: `샘플 ${String(index + 1)}을 입력하고 타입이 좁혀지는 결과를 비교한다.`,
        appeal: `보이지 않던 경계 ${String(index + 1)}을 직접 깨뜨리고 고칠 수 있다.`,
        technologyNecessity: '실행 시점 입력을 TypeScript의 안전한 상태로 바꿔야 한다.',
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
      const details = candidateContent(preview.title, preview.summary)
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
          ? '잘못된 외부 설정을 실행 전에 발견하는 로컬 validation 도구를 만든다.'
          : '로그인 없이 한 화면에서 외부 설정을 안전하게 검증하는 로컬 도구를 만든다.',
      targetUsers: current?.targetUsers ?? ['작은 TypeScript 도구를 만드는 초보 개발자'],
      primaryUsageMoment:
        current?.primaryUsageMoment ?? '새 설정 파일이나 API payload를 연결하기 전',
      successMoment:
        current?.successMoment ??
        '잘못된 입력이 안전한 오류로 바뀌고 올바른 입력만 다음 단계로 전달된다.',
      mvpFeatures: current?.mvpFeatures ?? ['샘플 입력 편집', 'schema 검증', '성공·실패 분기 비교'],
      scope: current?.scope ?? [
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
      ],
      expectedDecisions: current?.expectedDecisions ?? [
        {
          category: 'PRODUCT_BEHAVIOR',
          description: '검증 실패를 한 번에 보여줄지 단계별로 보여줄지 정한다.',
          whyUserInputMatters: '사용자가 배우고 싶은 비교 방식과 직접 연결된다.',
        },
      ],
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
      stage: 'Implementing the local validation flow',
      currentGoal: 'Render a safe success and failure result from unknown input.',
      recentChanges: ['Created the parser boundary and result shell.'],
      activeDecisionIds: [],
      activeConceptNames: task.expectedConcepts,
      relatedFiles: [],
      nextActions: ['Choose how validation failures should be presented.'],
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
      question: '검증 오류를 한 번에 보여줄까요, 첫 오류부터 단계별로 보여줄까요?',
      reasonRequiredNow: '오류 결과 화면과 parser 반환 형식이 이 선택에 따라 달라집니다.',
      options: [
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
      recommendedOptionKey: 'all',
      recommendationRationale: '작은 설정 파일은 모든 오류를 함께 고치는 흐름이 더 빠릅니다.',
      relatedConceptNames: ['runtime validation'],
      sourceReferences: [],
      independentWorkCanContinue: false,
    },
    context: {
      stage: 'Waiting for validation error presentation',
      currentGoal: 'Choose the result shape before finishing the parser UI.',
      recentChanges: ['Created the parser boundary and result shell.'],
      activeConceptNames: task.expectedConcepts,
      relatedFiles: [],
      nextActions: ['Apply the selected presentation.', 'Run the acceptance tests.'],
      blockingReason: 'The result component depends on the user choice.',
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
      'data: {"type":"file_change","summary":"Updated src/parser.ts"}',
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
    appliedResult:
      '\\ubaa8\\ub4e0 validation \\uc624\\ub958\\ub97c \\ud55c \\uacb0\\uacfc \\uce74\\ub4dc\\uc5d0 \\ud45c\\uc2dc\\ud558\\ub3c4\\ub85d \\uc801\\uc6a9\\ud588\\uc2b5\\ub2c8\\ub2e4.',
    sourceReferences: [],
    context: {
      stage: 'Applied the validation error presentation',
      currentGoal: 'Validate the completed local result.',
      recentChanges: ['Rendered all validation errors in one result card.'],
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
      currentGoal: 'Open the generated local result.',
      recentChanges: ['Implemented the selected error view.', 'Passed all acceptance checks.'],
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
      implementedFeatures: ['Unknown input validation and result comparison flow'],
      acceptanceResults: applied.currentTask.acceptanceCriteria.map((criterion) => ({
        criterionKey: criterion.key,
        status: 'PASSED',
        evidence: [],
      })),
      validationResults: [
        { name: 'Build Agent E2E', status: 'PASSED', summary: 'The local flow completed.' },
      ],
      conceptUsage: task.expectedConcepts.map((conceptName) => ({
        conceptName,
        scope: 'LEARNER_FOCUS',
        importance: 'CORE',
        usageReason: 'The parser narrows unknown input into safe success and failure states.',
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
      'data: {"type":"file_change","summary":"Updated src/result.ts"}',
      'data: {"type":"status","command":"pnpm test"}',
      'data: {"type":"message","content":"Implementation and validation completed."}',
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

async function startFromKeyboard(page: Page): Promise<void> {
  await page.getByLabel(/무엇을 배우고 싶나요/).fill('TypeScript runtime validation')
  await page
    .getByLabel(/요즘 직접 해결하고 싶은 일이 있나요/)
    .fill('작은 도구의 설정 오류를 실행 전에 찾고 싶어요.')
  const startButton = page.getByRole('button', { name: '프로젝트 후보 만나기' })
  await startButton.focus()
  await page.keyboard.press('Enter')
}

test('runs Discovery, Spec, Builder stream, Helper, Decision, and completion through durable Core state', async ({
  page,
  request,
}) => {
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
            'parser 흐름을 만들고 실제 Decision이 필요한 지점까지 진행했습니다.',
            ...Array.from(
              { length: 24 },
              (_, index) => `진행 로그 ${String(index + 1)}: parser 경계를 검증했습니다.`,
            ),
            '```diff',
            '--- a/src/parser.ts',
            '+++ b/src/parser.ts',
            '+export const parseInput = (value: unknown) => value',
            '```',
            '[OPTIONS: 오류를 한 번에 표시 | 첫 오류부터 단계별 표시]',
          ].join('\n'),
        )
      } else {
        await builderResumeGate
        await fulfillResumedBuilderTurn(route, request, dispatchedProjectId)
        await appendTestCrewMessage(page, slotKey, 'user', String(dispatch.message))
        await appendTestCrewMessage(
          page,
          slotKey,
          'assistant',
          '선택한 결과 표시 방식을 반영했고 모든 검증을 통과했습니다.',
        )
      }
      return
    }
    if (agent === 'vibe-helper-helper') {
      helperDispatches += 1
      const longHelperAnswer = `한 번에 표시하면 모든 오류를 함께 고칠 수 있지만 처음에는 정보가 더 많습니다. ${'각 오류는 같은 입력에서 독립적으로 발견되며 사용자는 수정 우선순위를 직접 정할 수 있습니다. '.repeat(8)}이 문장이 240자 뒤에도 온전히 보이면 전체 답변 렌더링이 정상입니다.`
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
  await startFromKeyboard(page)

  const firstCandidate = page.getByRole('listitem').filter({
    has: page.getByRole('heading', { name: 'Safe Config Lab', exact: true }),
  })
  await expect(firstCandidate).toBeVisible()
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
    name: 'Safe Config Lab 관심 목록에 담기',
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

  await page.getByRole('button', { name: '다른 후보 4개 더 보기' }).click()
  await expect(page.getByText('14개 후보')).toBeVisible()
  await interestCheckbox.focus()
  await page.keyboard.press('Space')
  await expect(interestCheckbox).toBeChecked()
  const secondInterestCheckbox = page.getByRole('checkbox', {
    name: 'API Shape Detective 관심 목록에 담기',
  })
  await secondInterestCheckbox.check()
  await expect(page.getByText('2개 담음')).toBeVisible()
  await page
    .getByLabel('Agent에게 원하는 방향 말하기')
    .fill('핵심은 유지하고 하루 안에 만들 수 있도록 범위를 줄여 주세요.')
  await page.getByRole('button', { name: '선택한 주제로 합치기' }).focus()
  await page.keyboard.press('Enter')
  const revisedCandidate = page.getByRole('listitem').filter({
    has: page.getByRole('heading', { name: 'Safe Config Lab · 작은 MVP', exact: true }),
  })
  await expect(revisedCandidate).toBeVisible()
  await expect(page.locator('.candidate-list > .candidate-card')).toHaveCount(1)
  await expect(page.getByRole('heading', { name: 'API Shape Detective', exact: true })).toHaveCount(
    0,
  )
  await revisedCandidate.getByRole('button', { name: '이 방향 선택' }).focus()
  await page.keyboard.press('Enter')

  await expect(
    page.getByRole('heading', { name: '이 범위라면 바로 시작할 수 있어요.' }),
  ).toBeVisible()
  await expect(page.getByLabel('제품 목적')).toHaveCount(0)
  await expect(page.getByText('누가 쓰나요?')).toBeVisible()
  await page
    .getByLabel('바꾸고 싶은 점을 Agent에게 말하기')
    .fill('로그인은 빼고 한 화면에서 완성하도록 다시 정리해 주세요.')
  await page.getByRole('button', { name: 'Agent에게 다시 정리해달라고 하기' }).click()
  await expect(page.getByText('권장 Learning Spec · revision 2')).toBeVisible()
  await expect(
    page.getByText('로그인 없이 한 화면에서 외부 설정을 안전하게 검증하는 로컬 도구를 만든다.'),
  ).toBeVisible()

  await page.getByRole('button', { name: /다른 주제로 돌아가기/ }).click()
  await expect(page).toHaveURL(/#\/discovery\?project=/)
  await expect(page.getByText('이전 후보를 그대로 보고 있어요.')).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Safe Config Lab · 작은 MVP', exact: true }),
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
    page.getByRole('heading', { name: 'TypeScript runtime validation', exact: true }),
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
    .getByRole('button', { name: /TypeScript runtime validation.*Open Build →/ })
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
    page.getByText('parser 흐름을 만들고 실제 Decision이 필요한 지점까지 진행했습니다.'),
  ).toBeVisible()
  await expect(page.locator('body')).not.toContainText('synthetic-e2e-secret')
  await expect(page.locator('body')).not.toContainText('noisy-fragment')
  await expect(page.locator('body')).not.toContainText('used_tokens')
  const decisionHeading = page.getByRole('heading', {
    name: '검증 오류를 한 번에 보여줄까요, 첫 오류부터 단계별로 보여줄까요?',
  })
  await expect(decisionHeading).toBeVisible()
  await expect(page.getByText('Builder recommendation')).toBeVisible()
  await expect(page.getByText('오류를 한 번에 표시', { exact: true }).first()).toBeVisible()
  const recommendationButton = page.getByRole('button', {
    name: '오류를 한 번에 표시 · 추천',
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

  await page.getByRole('button', { name: 'Helper에게 비교 요청' }).click()
  await expect(
    page.getByText('한 번에 표시하면 모든 오류를 함께 고칠 수 있지만 처음에는 정보가 더 많습니다.'),
  ).toBeVisible()
  await expect(
    page.getByText('이 문장이 240자 뒤에도 온전히 보이면 전체 답변 렌더링이 정상입니다.'),
  ).toBeVisible()
  await expect
    .poll(async () => {
      const restored = await restoreProject(request, projectIdFromUrl(page.url()))
      return restored.helperConversations[0]?.redactedUserExcerpts ?? null
    })
    .toEqual([])
  expect(helperDispatches).toBe(1)

  await page
    .getByLabel('Builder message')
    .fill(
      '첫 오류부터 단계별로 보여주는 방향으로 진행해줘. 초보자가 수정 순서를 따라가기 쉬웠으면 해.',
    )
  await page.getByRole('button', { name: 'Builder에게 보내기' }).click()
  await expect(page.getByText('APPLY PENDING', { exact: true })).toBeVisible()
  releaseBuilderResume?.()
  await expect(
    page.getByRole('heading', { name: 'TypeScript runtime validation 완성' }),
  ).toBeVisible()
  await expect(
    page.getByText('모든 validation 오류를 한 결과 카드에 표시하도록 적용했습니다.'),
  ).toBeVisible()
  await expect(page.locator('body')).not.toContainText('\\ubaa8')
  await expect(page.getByRole('log', { name: 'Builder transcript' })).toContainText(
    '선택한 결과 표시 방식을 반영했고 모든 검증을 통과했습니다.',
  )
  await expect(page.getByLabel('Builder message')).toBeVisible()
  await expect(page.getByText('Unknown input validation and result comparison flow')).toBeVisible()
  await expect(page.getByText('Build Agent E2E')).toBeVisible()
  await page.getByRole('button', { name: '생성 결과 열기' }).click()
  await expect(page.getByText(/실행 준비 완료 · projects\/project_/)).toBeVisible()
  expect(builderDispatches).toBe(2)
  expect(pageErrors).toEqual([])
})

test('shows durable previews and keeps the basket usable while fixed Candidate details are still loading', async ({
  page,
  request,
}) => {
  await page.route('**/api/chat', async (route) => {
    const dispatch = route.request().postDataJSON()
    const projectId = projectIdFromRoute(route)
    if (dispatch.agent !== 'vibe-helper-discovery-enrichment') {
      await fulfillAgentTurn(route, request, projectId)
      return
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 1_200))
    const snapshot = await restoreProject(request, projectId)
    const slot = String(dispatch.slot)
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

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/#/discovery')
  await startFromKeyboard(page)
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

  await expect(page.getByRole('heading', { name: '상세 5/10 준비됨' })).toBeVisible()
  const firstCandidate = page
    .getByRole('listitem')
    .filter({ has: page.getByRole('heading', { name: 'Safe Config Lab', exact: true }) })
  await firstCandidate.getByText('세부 범위 미리 보기', { exact: true }).click()
  await expect(firstCandidate.locator('details')).toHaveAttribute('open', '')

  await expect(page.getByText('10개 후보')).toBeVisible()
  await expect(previewCheckbox).toBeChecked()
  await expect(firstCandidate.getByText('세부 범위와 변경 이력', { exact: true })).toBeVisible()
  await expect(firstCandidate.locator('details')).toHaveAttribute('open', '')
  await expect(page.getByRole('button', { name: '이 방향 선택' }).first()).toBeEnabled()
})

test('selects a preview immediately by enriching only that direction', async ({
  page,
  request,
}) => {
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
      await new Promise<void>((resolve) => setTimeout(resolve, 1_200))
      const snapshot = await restoreProject(request, projectId)
      if (
        snapshot.discoverySession?.status === 'ACTIVE' &&
        (snapshot.discoveryContext?.rounds.length ?? 0) === 0
      ) {
        await submitCandidateEnrichment(
          request,
          snapshot,
          slot.includes('-enrich-first-') ? 'FIRST' : 'SECOND',
        )
      }
    }
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: 'data: {"type":"done"}\n\n',
    })
  })

  await page.goto('/#/discovery')
  await startFromKeyboard(page)
  await expect(page.getByRole('heading', { name: '상세 0/10 준비됨' })).toBeVisible()
  const firstPreview = page.getByRole('listitem').filter({
    has: page.getByRole('heading', { name: 'Safe Config Lab', exact: true }),
  })
  await firstPreview.getByRole('button', { name: '이 방향 선택' }).click()
  await expect(
    page.getByRole('heading', { name: '이 범위라면 바로 시작할 수 있어요.' }),
  ).toBeVisible()

  const projectId = projectIdFromUrl(page.url())
  const selected = await restoreProject(request, projectId)
  expect(selected.discoverySession?.status).toBe('SELECTED')
  expect(selected.discoveryContext?.candidateEnrichments.length ?? 10).toBeLessThan(10)
  expect(selected.discoveryContext?.rounds[0]?.candidates).toHaveLength(1)
  expect(selected.selectedCandidate?.title).toBe('Safe Config Lab')
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
  let agentDispatches = 0
  await page.route('**/api/chat', async (route) => {
    agentDispatches += 1
    await fulfillAgentTurn(route, request, projectIdFromRoute(route))
  })

  await page.goto('/#/discovery')
  await startFromKeyboard(page)
  await page
    .getByRole('listitem')
    .filter({ has: page.getByRole('heading', { name: 'Safe Config Lab', exact: true }) })
    .getByRole('button', { name: '이 방향 선택' })
    .click()
  await expect(
    page.getByRole('heading', { name: '이 범위라면 바로 시작할 수 있어요.' }),
  ).toBeVisible()
  expect(agentDispatches).toBe(3)

  await page.getByRole('button', { name: /다른 주제로 돌아가기/ }).click()
  await expect(page.getByText('이전 후보를 그대로 보고 있어요.')).toBeVisible()
  expect(agentDispatches).toBe(3)

  const nextGoal = 'TypeScript runtime validation으로 로컬 CSV 검사기 만들기'
  await page.getByLabel(/무엇을 배우고 싶나요/).fill(nextGoal)
  await page.getByRole('button', { name: '새 후보 받기' }).click()
  await expect(page.getByRole('heading', { name: nextGoal, exact: true })).toBeVisible()
  await expect(page.getByText('10개 후보')).toBeVisible()
  expect(agentDispatches).toBe(6)

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
  await startFromKeyboard(page)
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
  await startFromKeyboard(page)
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
  let agentDispatches = 0
  await page.route('**/api/chat', async (route) => {
    agentDispatches += 1
    if (agentDispatches !== 4) {
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
  await startFromKeyboard(page)
  await page
    .getByRole('listitem')
    .filter({ has: page.getByRole('heading', { name: 'Safe Config Lab', exact: true }) })
    .getByRole('button', { name: '이 방향 선택' })
    .click()
  await expect(page.getByText('권장 Learning Spec · revision 1')).toBeVisible()

  await page
    .getByLabel('바꾸고 싶은 점을 Agent에게 말하기')
    .fill('로그인 기능은 제외하고 한 화면 흐름으로 바꿔 주세요.')
  await page.getByRole('button', { name: 'Agent에게 다시 정리해달라고 하기' }).click()

  await expect(page.getByText('권장 Learning Spec · revision 2')).toBeVisible()
  expect(agentDispatches).toBe(5)
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
