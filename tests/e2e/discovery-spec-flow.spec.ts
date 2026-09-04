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
  return executeBackend(request, applicationPath, { ...input, clientProtocolVersion: 2 })
}

async function executeDiscoveryAgent(
  request: APIRequestContext,
  input: Readonly<Record<string, unknown>>,
) {
  return executeBackend(request, testAgentPath, { role: 'DISCOVERY', request: input })
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
  const agentPhase = String(dispatch.agent).replace('vibe-helper-discovery-', '')
  expect(['round', 'merge', 'spec']).toContain(agentPhase)
  expect(dispatch.slot).toBe(
    `vibe-helper-discovery-${agentPhase}-${snapshot.discoverySession.id}-${snapshot.discoverySession.revision}`,
  )
  if (snapshot.discoverySession.status === 'SELECTED') {
    await submitLearningSpec(request, snapshot)
  } else {
    await submitCandidateRound(request, snapshot)
  }
  await route.fulfill({
    status: 200,
    contentType: 'text/event-stream',
    body: 'data: {"type":"done"}\n\n',
  })
}

function projectIdFromRoute(route: Route): string {
  const body = route.request().postDataJSON()
  const message = typeof body.message === 'string' ? body.message : ''
  const match = message.match(/projectId=(project_[0-9a-f-]{36})/)
  if (match?.[1] === undefined) throw new TypeError('Discovery tool context project is invalid')
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

test('runs list selection, Agent refinement, visual Spec review, and Builder preparation through durable Core state', async ({
  page,
  request,
}) => {
  const pageErrors: Error[] = []
  let agentDispatches = 0
  page.on('pageerror', (error) => pageErrors.push(error))
  await page.route('**/api/chat', async (route) => {
    agentDispatches += 1
    await fulfillAgentTurn(route, request, projectIdFromRoute(route))
  })

  await page.goto('/#/discovery')
  await expect(page.getByRole('heading', { name: /배우고 싶은 것을/ })).toBeVisible()
  await expect(page.getByRole('button', { name: '프로젝트 후보 만나기' })).toBeDisabled()
  await startFromKeyboard(page)

  const firstCandidate = page.getByRole('listitem').filter({
    has: page.getByRole('heading', { name: 'Safe Config Lab', exact: true }),
  })
  await expect(firstCandidate).toBeVisible()
  await expect(page.getByText('4개 후보')).toBeVisible()
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
    return {
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
      markWidth: mark?.width ?? 0,
      markHeight: mark?.height ?? 0,
      cardWidth: card?.width ?? 0,
      checkboxPosition: input === null ? '' : getComputedStyle(input).position,
      checkboxWidth: input?.getBoundingClientRect().width ?? 0,
      checkboxHeight: input?.getBoundingClientRect().height ?? 0,
    }
  })
  expect(mobileMetrics.documentWidth).toBeLessThanOrEqual(mobileMetrics.viewportWidth)
  expect(mobileMetrics.markWidth).toBeGreaterThanOrEqual(24)
  expect(mobileMetrics.markHeight).toBeGreaterThanOrEqual(24)
  expect(mobileMetrics.cardWidth).toBeLessThanOrEqual(mobileMetrics.viewportWidth)
  expect(mobileMetrics.checkboxPosition).not.toBe('absolute')
  expect(mobileMetrics.checkboxWidth).toBeGreaterThanOrEqual(24)
  expect(mobileMetrics.checkboxHeight).toBeGreaterThanOrEqual(24)
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
  await expect(page.getByText('8개 후보')).toBeVisible()
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
  expect(agentDispatches).toBe(5)
  await page.getByRole('button', { name: 'Spec으로 돌아가기' }).click()
  expect(agentDispatches).toBe(5)
  const prepare = page.getByRole('button', { name: '이대로 시작' })
  await expect(prepare).toBeVisible()
  await expect(prepare).toBeEnabled()
  await prepare.focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/#\/build\?project=/)
  await expect(
    page.getByRole('heading', { name: 'TypeScript runtime validation', exact: true }),
  ).toBeVisible()
  await expect(page.getByText('PENDING', { exact: true })).toBeVisible()
  expect(pageErrors).toEqual([])
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
  expect(attempts).toBe(2)
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
  expect(agentDispatches).toBe(2)

  await page.getByRole('button', { name: /다른 주제로 돌아가기/ }).click()
  await expect(page.getByText('이전 후보를 그대로 보고 있어요.')).toBeVisible()
  expect(agentDispatches).toBe(2)

  const nextGoal = 'TypeScript runtime validation으로 로컬 CSV 검사기 만들기'
  await page.getByLabel(/무엇을 배우고 싶나요/).fill(nextGoal)
  await page.getByRole('button', { name: '새 후보 받기' }).click()
  await expect(page.getByRole('heading', { name: nextGoal, exact: true })).toBeVisible()
  await expect(page.getByText('4개 후보')).toBeVisible()
  expect(agentDispatches).toBe(3)

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
    expect(dispatch.slot).toBe(
      `vibe-helper-discovery-round-${snapshot.discoverySession?.id}-${snapshot.discoverySession?.revision}`,
    )
    void new Promise<void>((resolve) => setTimeout(resolve, 1_600))
      .then(() => submitCandidateRound(request, snapshot))
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
      key: `vibe-helper-discovery-round-${initial.discoverySession?.id}-${initial.discoverySession?.revision}`,
      agent: 'vibe-helper-discovery-round',
    },
  )
  await page.goto(`/#/discovery?project=${projectId}`)

  await expect(page.getByText('이전에 시작한 Agent 작업을 다시 연결했습니다.')).toBeVisible()
  expect(agentDispatches).toBe(0)
  await submitCandidateRound(request, initial)
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
    if (agentDispatches !== 3) {
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
  expect(agentDispatches).toBe(4)
})

test('shows a refresh instruction when the backend rejects a stale UI protocol', async ({
  page,
}) => {
  await page.route('**/apps/vibe-helper/api/application', async (route) => {
    await route.fulfill({
      status: 409,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'ui protocol mismatch', expectedProtocolVersion: 2 }),
    })
  })

  await page.goto('/#/history')
  await expect(page.getByText(/Vibe Helper가 업데이트되었습니다/)).toBeVisible()
  await expect(page.getByText(/페이지를 새로고침한 뒤 다시 시도/)).toBeVisible()
})
