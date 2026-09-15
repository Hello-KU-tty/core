const { createHash } = require('node:crypto')

const HELPER_CELLS = ['L0_R0', 'L1_R0', 'L0_R1', 'L1_R1']
const DISCOVERY_CELLS = ['DISCOVERY_LEDGER_OFF', 'DISCOVERY_LEDGER_ON']
const MAX_TURNS = 6
const COMBINED_PLAN_MAX_TURNS = 13
const SOFT_TIMEOUT_MS = 60_000
const NATIVE_PROMPT_RPC_TIMEOUT_MS = 240_000
const PROMPT_MAX_BYTES = 400_000
const SYNTHETIC_PROVENANCE = 'SYNTHETIC_REDACTED_EVAL_INPUT'

function fail(code) { return Object.assign(new Error(code), { code }) }

function digest(value) {
  return createHash('sha256').update(value).digest('hex')
}

function safeCode(error) {
  const value = error?.code ?? error?.message
  return typeof value === 'string' && /^[A-Z][A-Z0-9_]{0,79}$/.test(value) ?
    value : 'PERSONALIZATION_MATRIX_CELL_FAILED'
}

function entityId(prefix, number) {
  return `${prefix}_63000000-0000-4000-8000-${number.toString(16).padStart(12, '0')}`
}

function clone(value) { return JSON.parse(JSON.stringify(value)) }

function withoutKeys(value, keys) {
  const copy = clone(value)
  for (const key of keys) delete copy[key]
  return copy
}

function parseJson(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > 1024 * 1024)
    return { form: 'INVALID', value: null }
  const trimmed = text.trim()
  try { return { form: 'JSON', value: JSON.parse(trimmed) } }
  catch {
    const blocks = [...trimmed.matchAll(/```(?:json)?\s*\n([\s\S]*?)\n```/gi)]
    if (blocks.length !== 1) return { form: 'INVALID', value: null }
    try { return { form: 'FENCED_JSON', value: JSON.parse(blocks[0][1].trim()) } }
    catch { return { form: 'INVALID', value: null } }
  }
}

function validateFixture(fixture) {
  const evaluation = fixture?.cleanPersonalizationEvaluation
  if (fixture?.promptVersion !== '1.0.6' ||
      evaluation?.provenance !== SYNTHETIC_PROVENANCE ||
      evaluation.liveModelStatus !== 'NOT_RUN' ||
      evaluation.humanLearningClaimAllowed !== false ||
      evaluation.helperMatrix?.map(cell => cell.id).join('|') !== HELPER_CELLS.join('|') ||
      evaluation.discoveryPair?.map(cell => cell.id).join('|') !== DISCOVERY_CELLS.join('|') ||
      !evaluation.commonInput?.helperQuestion ||
      !evaluation.commonInput?.unseenDiscoveryInput?.learningGoal ||
      !evaluation.commonInput?.unseenDiscoveryInput?.personalNeed)
    throw fail('PERSONALIZATION_MATRIX_FIXTURE_INVALID')
  return evaluation
}

function buildSyntheticPersonalizationInputs(fixture, contracts) {
  const evaluation = validateFixture(fixture)
  if (typeof contracts?.helperContextSchema?.parse !== 'function' ||
      typeof contracts?.projectSessionSnapshotSchema?.parse !== 'function' ||
      typeof contracts?.conceptLedgerEntrySchema?.parse !== 'function' ||
      typeof contracts?.personalizationBasisSchema?.parse !== 'function' ||
      typeof contracts?.helperEpisodeSummarySchema?.parse !== 'function')
    throw fail('PERSONALIZATION_MATRIX_CONTRACTS_INVALID')
  const cleanCase = fixture.cases.find(item =>
    item.id === evaluation.cleanCuratedEvidence.sourceCaseId)
  if (!cleanCase?.userMessage)
    throw fail('PERSONALIZATION_MATRIX_CLEAN_CASE_INVALID')
  const timestamp = '2026-09-15T00:00:00.000Z'
  const correlationId = entityId('corr', 1)
  const helperProjectId = entityId('project', 1)
  const discoveryProjectId = entityId('project', 2)
  const sourceProjectId = entityId('project', 3)
  const sourceTaskId = entityId('task', 3)
  const taskId = entityId('task', 1)
  const learningSpecId = entityId('learning_spec', 1)
  const discoverySessionId = entityId('discovery_session', 1)
  const conceptId = entityId('concept', 1)
  const evidenceId = entityId('evidence', 1)
  const sourceEpisodeId = entityId('episode', 1)
  const concept = {
    schemaVersion: 1, id: conceptId, canonicalName: '경계 불변식',
    description: '위치와 크기의 합을 컨테이너 경계와 비교하는 상태 규칙입니다.',
    revision: 1, createdAt: timestamp, updatedAt: timestamp,
    source: { kind: 'CORE' },
  }
  const cleanLedgerEntry = contracts.conceptLedgerEntrySchema.parse({
    schemaVersion: 1, id: entityId('concept_ledger', 1), concept,
    acceptedAliases: ['가구 경계 검사'],
    state: { conceptId, state: 'EXPLAINED', acceptedEvidenceIds: [evidenceId],
      reducerVersion: '1.0.0', revision: 1, updatedAt: timestamp },
    openIssues: [], relatedProjectIds: [sourceProjectId], relatedTaskIds: [sourceTaskId],
    revision: 1, updatedAt: timestamp, source: { kind: 'CORE' },
  })
  const commonBasis = {
    conceptId, conceptName: concept.canonicalName, ledgerRevision: 1,
    state: 'EXPLAINED', evidenceIds: [evidenceId], episodeIds: [sourceEpisodeId],
    sourceProjectIds: [sourceProjectId], sourceProjectTitles: ['이전 공간 배치 도구'],
    openIssueIds: [], redactedEvidenceExcerpt: cleanCase.userMessage,
  }
  const helperBasis = contracts.personalizationBasisSchema.parse({
    ...commonBasis, purpose: 'HELPER_EXPLANATION_START',
  })
  const discoveryBasis = contracts.personalizationBasisSchema.parse({
    ...commonBasis, purpose: 'DISCOVERY_TIE_BREAK',
  })
  const helperProject = {
    schemaVersion: 1, id: helperProjectId, correlationId, revision: 1,
    title: '가구 배치 경계 도구', learningGoal: '상태 불변식과 경계 검증',
    status: 'BUILDING', generatedWorkspacePath: 'generated/furniture-boundary-tool',
    createdAt: timestamp, updatedAt: timestamp, source: { kind: 'USER' },
    redactionStatus: 'VERIFIED_REDACTED',
  }
  const learningSpec = {
    schemaVersion: 1, id: learningSpecId, projectId: helperProjectId,
    correlationId, revision: 2, parentRevision: 1,
    selectedCandidate: { candidateId: entityId('candidate', 1), revision: 1 },
    productPurpose: '방 크기 변경 뒤 가구가 경계를 넘는지 확인합니다.',
    targetUsers: ['작은 공간의 가구 배치를 계획하는 사용자'],
    primaryUsageMoment: '방 크기나 가구 위치를 바꾼 직후',
    successMoment: '경계를 넘는 가구와 복구 방법을 바로 확인합니다.',
    mvpFeatures: ['방과 가구 크기 입력', '경계 초과 표시와 Undo'],
    scope: [
      { category: 'LEARNER_FOCUS', title: '경계 불변식',
        rationale: '제품의 핵심 검증 동작입니다.', conceptNames: ['경계 불변식'] },
      { category: 'AGENT_SUPPORT', title: '로컬 화면 구성',
        rationale: '동작 확인에 필요하지만 학습 목표는 아닙니다.', conceptNames: [] },
      { category: 'EXCLUDED', title: '클라우드 동기화',
        rationale: '합성 로컬 MVP 범위를 벗어납니다.', conceptNames: [] },
    ],
    expectedDecisions: [], runtimeConstraint: 'TYPESCRIPT',
    deploymentConstraints: ['로컬 실행만 지원'], status: 'CONFIRMED',
    confirmation: { confirmedAt: timestamp, confirmedBy: { kind: 'USER' } },
    createdAt: timestamp, updatedAt: timestamp, source: { kind: 'USER' },
    redactionStatus: 'VERIFIED_REDACTED',
  }
  const task = {
    schemaVersion: 1, id: taskId, projectId: helperProjectId, learningSpecId,
    learningSpecRevision: 2, correlationId, revision: 1,
    title: '가구 경계 검증 구현',
    productGoal: '방 크기가 바뀌어도 잘못된 가구 배치를 놓치지 않습니다.',
    requirements: ['오른쪽 경계가 방 너비를 넘는 가구를 표시합니다.'],
    acceptanceCriteria: [{ key: 'boundary_change',
      description: '방 너비 변경 뒤 모든 기존 가구를 다시 검사합니다.' }],
    expectedConcepts: ['경계 불변식'], excludedWork: ['클라우드 저장'],
    prerequisiteTaskIds: [], expectedDecisionCategories: ['PRODUCT_BEHAVIOR'],
    sequence: 1, status: 'ACTIVE', createdAt: timestamp, updatedAt: timestamp,
    source: { kind: 'CORE' }, redactionStatus: 'VERIFIED_REDACTED',
  }
  const helperBaseContext = contracts.helperContextSchema.parse({
    schemaVersion: 1, correlationId, project: helperProject, learningSpec, task,
    liveContext: null, activeDecisions: [], focusedDecision: null,
    relevantLedgerEntries: [],
    personalization: {
      schemaVersion: 1, id: entityId('personalization', 1),
      projectId: helperProjectId, correlationId,
      target: { kind: 'HELPER_TURN', taskId }, mode: 'NO_RELEVANT_EVIDENCE',
      basis: [], fallbackReason: 'NO_RELEVANT_CONCEPT', createdAt: timestamp,
      source: { kind: 'CORE' }, redactionStatus: 'VERIFIED_REDACTED',
    },
    recentEpisodes: [], contextReferences: [], referenceDetails: [], sourceExcerpts: [],
    pendingContextRefreshRequests: [],
    freshness: { currentContextVersion: null, observedContextVersion: null,
      status: 'MISSING', stale: false, refreshRequired: false },
  })
  const recentEpisode = contracts.helperEpisodeSummarySchema.parse({
    episodeId: entityId('episode', 2), type: 'HELPER_CONVERSATION', endedAt: timestamp,
    conceptNames: ['경계 불변식'],
    redactedUserExcerpts: [evaluation.recentEpisodeHistory.userExcerpt],
    helperResponseSummaries: [evaluation.recentEpisodeHistory.helperSummary],
    contextReferences: [{ kind: 'AGENT_MESSAGE',
      conversationId: entityId('conversation', 1), messageId: entityId('message', 1) }],
  })
  const discoveryProject = {
    schemaVersion: 1, id: discoveryProjectId, correlationId, revision: 1,
    title: '새 경계 검증 프로젝트',
    learningGoal: evaluation.commonInput.unseenDiscoveryInput.learningGoal,
    status: 'DISCOVERY', createdAt: timestamp, updatedAt: timestamp,
    source: { kind: 'USER' }, redactionStatus: 'VERIFIED_REDACTED',
  }
  const discoverySession = {
    schemaVersion: 1, id: discoverySessionId, projectId: discoveryProjectId,
    correlationId, revision: 1,
    input: { learningGoal: evaluation.commonInput.unseenDiscoveryInput.learningGoal,
      personalNeed: evaluation.commonInput.unseenDiscoveryInput.personalNeed,
      currentLevel: 'BEGINNER' },
    status: 'ACTIVE', openedAt: timestamp, updatedAt: timestamp,
    source: { kind: 'USER' }, redactionStatus: 'VERIFIED_REDACTED',
  }
  const discoveryPersonalization = {
    schemaVersion: 1, id: entityId('personalization', 2),
    projectId: discoveryProjectId, correlationId,
    target: { kind: 'DISCOVERY_SESSION', discoverySessionId },
    mode: 'NO_RELEVANT_EVIDENCE', basis: [], fallbackReason: 'NO_RELEVANT_CONCEPT',
    createdAt: timestamp, source: { kind: 'CORE' },
    redactionStatus: 'VERIFIED_REDACTED',
  }
  const discoveryContext = {
    schemaVersion: 1, correlationId, project: discoveryProject,
    session: discoverySession, rounds: [], candidates: [], feedback: [],
    learningSpec: null, previewRound: null, candidateEnrichments: [],
    relevantLedgerEntries: [], personalization: discoveryPersonalization,
  }
  const discoveryBaseSnapshot = contracts.projectSessionSnapshotSchema.parse({
    schemaVersion: 1, correlationId, project: discoveryProject,
    suggestedSurface: 'DISCOVERY', discoverySession, discoveryContext,
    selectedCandidate: null, learningSpec: null, activeTask: null, currentTask: null,
    liveContext: null, pendingDecisions: [], decisions: [], completionReport: null,
    helperConversations: [],
  })
  return {
    helperBaseContext, discoveryBaseSnapshot, cleanLedgerEntry,
    helperBasis, discoveryBasis, recentEpisode,
    cleanEvidenceAttestation: {
      signal: 'REPHRASE', state: 'EXPLAINED', promptDependence: 'INDEPENDENT',
      acceptanceStatus: 'VERIFIED_BY_EXACT_CLEAN_APPLICATION_FIXTURE',
    },
  }
}

function assertNoForbiddenTokens(value, forbiddenProvenanceTokens) {
  const serialized = JSON.stringify(value)
  if (forbiddenProvenanceTokens.some(token => serialized.includes(token)))
    throw fail('PERSONALIZATION_MATRIX_POLLUTED_SOURCE_PRESENT')
}

function buildHelperCells(input, evaluation) {
  const { contracts, helperBaseContext, cleanLedgerEntry, helperBasis,
    recentEpisode, cleanEvidenceAttestation, forbiddenProvenanceTokens } = input
  const base = contracts.helperContextSchema.parse(helperBaseContext)
  const ledger = contracts.conceptLedgerEntrySchema.parse(cleanLedgerEntry)
  const episode = contracts.helperEpisodeSummarySchema.parse(recentEpisode)
  const cleanCase = input.fixture.cases.find(item =>
    item.id === evaluation.cleanCuratedEvidence.sourceCaseId)
  if (base.relevantLedgerEntries.length !== 0 || base.recentEpisodes.length !== 0 ||
      base.personalization.mode !== 'NO_RELEVANT_EVIDENCE' ||
      base.personalization.basis.length !== 0 || !base.personalization.fallbackReason ||
      helperBasis?.conceptId !== ledger.concept.id ||
      helperBasis?.state !== 'EXPLAINED' ||
      helperBasis?.redactedEvidenceExcerpt !== cleanCase?.userMessage ||
      !helperBasis.evidenceIds?.every(id => ledger.state.acceptedEvidenceIds.includes(id)) ||
      helperBasis.purpose !== 'HELPER_EXPLANATION_START' ||
      episode.redactedUserExcerpts.join('\n').includes(
        evaluation.recentEpisodeHistory.userExcerpt) === false ||
      episode.helperResponseSummaries.join('\n').includes(
        evaluation.recentEpisodeHistory.helperSummary) === false ||
      evaluation.recentEpisodeHistory.containsAcceptedEvidence !== false ||
      cleanEvidenceAttestation?.signal !== 'REPHRASE' ||
      cleanEvidenceAttestation?.state !== 'EXPLAINED' ||
      cleanEvidenceAttestation?.promptDependence !== 'INDEPENDENT' ||
      cleanEvidenceAttestation?.acceptanceStatus !==
        'VERIFIED_BY_EXACT_CLEAN_APPLICATION_FIXTURE')
    throw fail('PERSONALIZATION_MATRIX_HELPER_INPUT_INVALID')
  const expected = new Map(evaluation.helperMatrix.map(cell => [cell.id, cell]))
  const cells = HELPER_CELLS.map(id => {
    const plan = expected.get(id)
    const context = clone(base)
    if (plan.curatedLedgerIncluded) {
      context.relevantLedgerEntries = [ledger]
      context.personalization = {
        ...context.personalization, mode: 'EVIDENCE_AWARE', basis: [helperBasis],
      }
      delete context.personalization.fallbackReason
    }
    if (plan.recentEpisodesIncluded) context.recentEpisodes = [episode]
    const parsed = contracts.helperContextSchema.parse(context)
    if (parsed.personalization.mode !== plan.expectedPersonalizationMode ||
        (parsed.relevantLedgerEntries.length > 0) !== plan.curatedLedgerIncluded ||
        (parsed.recentEpisodes.length > 0) !== plan.recentEpisodesIncluded)
      throw fail('PERSONALIZATION_MATRIX_HELPER_TOGGLE_INVALID')
    assertNoForbiddenTokens(parsed, forbiddenProvenanceTokens)
    return { id, role: 'HELPER', context: parsed,
      curatedLedgerIncluded: plan.curatedLedgerIncluded,
      recentEpisodesIncluded: plan.recentEpisodesIncluded }
  })
  const invariantHashes = new Set(cells.map(cell => digest(JSON.stringify(withoutKeys(
    cell.context, ['relevantLedgerEntries', 'personalization', 'recentEpisodes'])))))
  if (invariantHashes.size !== 1)
    throw fail('PERSONALIZATION_MATRIX_HELPER_COMMON_INPUT_CHANGED')
  return { cells, invariantSha256: [...invariantHashes][0] }
}

function buildDiscoveryCells(input, evaluation) {
  const { contracts, discoveryBaseSnapshot, cleanLedgerEntry, discoveryBasis,
    createDiscoveryContext, forbiddenProvenanceTokens } = input
  const base = contracts.projectSessionSnapshotSchema.parse(discoveryBaseSnapshot)
  const ledger = contracts.conceptLedgerEntrySchema.parse(cleanLedgerEntry)
  const cleanCase = input.fixture.cases.find(item =>
    item.id === evaluation.cleanCuratedEvidence.sourceCaseId)
  if (base.discoveryContext === null || base.discoverySession === null ||
      base.discoveryContext.relevantLedgerEntries.length !== 0 ||
      base.discoveryContext.personalization.mode !== 'NO_RELEVANT_EVIDENCE' ||
      base.discoveryContext.personalization.basis.length !== 0 ||
      !base.discoveryContext.personalization.fallbackReason ||
      base.discoverySession.input.learningGoal !==
        evaluation.commonInput.unseenDiscoveryInput.learningGoal ||
      base.discoverySession.input.personalNeed !==
        evaluation.commonInput.unseenDiscoveryInput.personalNeed ||
      discoveryBasis?.conceptId !== ledger.concept.id ||
      discoveryBasis?.state !== 'EXPLAINED' ||
      discoveryBasis?.redactedEvidenceExcerpt !== cleanCase?.userMessage ||
      discoveryBasis?.purpose !== 'DISCOVERY_TIE_BREAK' ||
      !discoveryBasis.evidenceIds?.every(id => ledger.state.acceptedEvidenceIds.includes(id)))
    throw fail('PERSONALIZATION_MATRIX_DISCOVERY_INPUT_INVALID')
  const expected = new Map(evaluation.discoveryPair.map(cell => [cell.id, cell]))
  const cells = DISCOVERY_CELLS.map(id => {
    const plan = expected.get(id)
    const snapshot = clone(base)
    if (plan.curatedLedgerIncluded) {
      snapshot.discoveryContext.relevantLedgerEntries = [ledger]
      snapshot.discoveryContext.personalization = {
        ...snapshot.discoveryContext.personalization,
        mode: 'EVIDENCE_AWARE', basis: [discoveryBasis],
      }
      delete snapshot.discoveryContext.personalization.fallbackReason
    }
    const parsed = contracts.projectSessionSnapshotSchema.parse(snapshot)
    const contextJson = createDiscoveryContext(parsed, 'PREVIEW', [])
    if (typeof contextJson !== 'string' || !contextJson)
      throw fail('PERSONALIZATION_MATRIX_DISCOVERY_CONTEXT_INVALID')
    let context
    try { context = JSON.parse(contextJson) }
    catch { throw fail('PERSONALIZATION_MATRIX_DISCOVERY_CONTEXT_INVALID') }
    if (context.kind !== 'VIBE_HELPER_DISCOVERY_CONTEXT' ||
        context.purpose !== 'PREVIEW' ||
        (context.relevantLedgerEntries.length > 0) !== plan.curatedLedgerIncluded ||
        context.personalization.mode !==
          (plan.curatedLedgerIncluded ? 'EVIDENCE_AWARE' : 'NO_RELEVANT_EVIDENCE'))
      throw fail('PERSONALIZATION_MATRIX_DISCOVERY_TOGGLE_INVALID')
    assertNoForbiddenTokens(context, forbiddenProvenanceTokens)
    return { id, role: 'DISCOVERY', context,
      curatedLedgerIncluded: plan.curatedLedgerIncluded,
      recentEpisodesIncluded: false }
  })
  const invariantHashes = new Set(cells.map(cell => digest(JSON.stringify(withoutKeys(
    cell.context, ['relevantLedgerEntries', 'personalization'])))))
  if (invariantHashes.size !== 1)
    throw fail('PERSONALIZATION_MATRIX_DISCOVERY_COMMON_INPUT_CHANGED')
  return { cells, invariantSha256: [...invariantHashes][0] }
}

function buildMatrixInputs(input) {
  const evaluation = validateFixture(input?.fixture)
  const { contracts, forbiddenProvenanceTokens } = input ?? {}
  if (typeof contracts?.helperContextSchema?.parse !== 'function' ||
      typeof contracts?.helperEpisodeSummarySchema?.parse !== 'function' ||
      typeof contracts?.conceptLedgerEntrySchema?.parse !== 'function' ||
      typeof contracts?.projectSessionSnapshotSchema?.parse !== 'function' ||
      typeof input?.createDiscoveryContext !== 'function' ||
      !Array.isArray(forbiddenProvenanceTokens) ||
      forbiddenProvenanceTokens.length === 0 || forbiddenProvenanceTokens.some(token =>
        typeof token !== 'string' || token.length === 0))
    throw fail('PERSONALIZATION_MATRIX_DEPENDENCIES_INVALID')
  assertNoForbiddenTokens({ helperBaseContext: input.helperBaseContext,
    discoveryBaseSnapshot: input.discoveryBaseSnapshot,
    cleanLedgerEntry: input.cleanLedgerEntry,
    helperBasis: input.helperBasis, discoveryBasis: input.discoveryBasis,
    recentEpisode: input.recentEpisode }, forbiddenProvenanceTokens)
  const helper = buildHelperCells(input, evaluation)
  const discovery = buildDiscoveryCells(input, evaluation)
  return { evaluation, cells: helper.cells.concat(discovery.cells),
    helperInvariantSha256: helper.invariantSha256,
    discoveryInvariantSha256: discovery.invariantSha256 }
}

function evaluateDiscoveryText(text, cell, contracts) {
  const parsed = parseJson(text)
  const validation = contracts.discoverySubmitCandidatePreviewsToolInputSchema
    .safeParse(parsed.value)
  if (!validation.success) return { answerPresent: Boolean(text?.trim()),
    jsonForm: parsed.form, outputContractValid: false,
    outputScopeValid: false, deterministicStatus: 'FAILED',
    failureCode: 'DISCOVERY_PREVIEW_OUTPUT_INVALID' }
  const value = validation.data
  const context = cell.context
  const outputScopeValid = value.projectId === context.project.id &&
    value.discoverySessionId === context.session.id &&
    value.correlationId === context.session.correlationId &&
    value.expectedSessionRevision === context.expectedSessionRevision
  return { answerPresent: true, jsonForm: parsed.form, outputContractValid: true,
    outputScopeValid, deterministicStatus: outputScopeValid ? 'PASSED' : 'FAILED',
    ...(outputScopeValid ? {} : { failureCode: 'DISCOVERY_PREVIEW_SCOPE_MISMATCH' }) }
}

function validateRunDependencies(input) {
  const plan = buildMatrixInputs(input)
  const { helperRolePrompt, discoveryRolePrompt, composeHelperPrompt,
    composeDiscoveryPrompt, model, expectedWindowId, scope, openSession,
    openBarrier, assertIdle, onCell } = input
  if (typeof helperRolePrompt !== 'string' ||
      !helperRolePrompt.includes('> Prompt version: `1.2.0`') ||
      typeof discoveryRolePrompt !== 'string' ||
      !discoveryRolePrompt.includes('> Prompt version: `1.3.5`') ||
      typeof composeHelperPrompt !== 'function' ||
      typeof composeDiscoveryPrompt !== 'function' ||
      !model || typeof model.id !== 'string' || !model.id || model.confirmed !== true ||
      typeof model.source !== 'string' || !model.source ||
      !Number.isInteger(expectedWindowId) || expectedWindowId <= 0 || !scope ||
      typeof openSession !== 'function' || typeof openBarrier !== 'function' ||
      typeof assertIdle !== 'function' ||
      (onCell !== undefined && typeof onCell !== 'function'))
    throw fail('PERSONALIZATION_MATRIX_RUN_DEPENDENCIES_INVALID')
  return plan
}

function emit(onCell, cell) {
  try { onCell?.(cell) }
  catch { /* Progress output cannot change a deterministic verdict. */ }
}

async function runNativePersonalizationMatrix(input) {
  const plan = validateRunDependencies(input)
  const { fixture, contracts, helperRolePrompt, discoveryRolePrompt,
    composeHelperPrompt, composeDiscoveryPrompt, model, expectedWindowId, scope,
    openSession, openBarrier, assertIdle, onCell, signal } = input
  const armSoftTimeout = input.armSoftTimeout ?? (onTimeout => {
    const timer = setTimeout(onTimeout, SOFT_TIMEOUT_MS)
    return () => clearTimeout(timer)
  })
  if (typeof armSoftTimeout !== 'function')
    throw fail('PERSONALIZATION_MATRIX_DEADLINE_INVALID')
  const cells = []
  const display = { helper: {}, discovery: {} }
  const seenSessions = new Set()
  let turns = 0
  for (const planned of plan.cells) {
    if (signal?.aborted) break
    if (turns >= MAX_TURNS) throw fail('PERSONALIZATION_MATRIX_TURN_BUDGET_EXCEEDED')
    const contextJson = JSON.stringify(planned.context)
    const prompt = planned.role === 'HELPER' ?
      composeHelperPrompt({ rolePrompt: helperRolePrompt,
        question: plan.evaluation.commonInput.helperQuestion,
        refreshStatus: 'NOT_NEEDED', context: planned.context,
        provenance: SYNTHETIC_PROVENANCE }) :
      composeDiscoveryPrompt({ rolePrompt: discoveryRolePrompt,
        context: contextJson,
        toolMetadata: { schemaVersion: 1, projectId: planned.context.project.id,
          discoverySessionId: planned.context.session.id,
          correlationId: planned.context.session.correlationId,
          expectedSessionRevision: planned.context.expectedSessionRevision,
          idempotencyKey: 'idem_62000000-0000-4000-8000-000000000001' },
        provenance: SYNTHETIC_PROVENANCE })
    if (typeof prompt !== 'string' || !prompt.includes(SYNTHETIC_PROVENANCE) ||
        Buffer.byteLength(prompt, 'utf8') > PROMPT_MAX_BYTES)
      throw fail('PERSONALIZATION_MATRIX_PROMPT_INVALID')
    let session
    let disarmSoftTimeout
    let promptStarted = null
    let softTimedOut = false
    const started = Date.now()
    const turnSignal = new AbortController()
    const cancel = () => turnSignal.abort()
    signal?.addEventListener('abort', cancel, { once: true })
    try {
      let idle = await assertIdle()
      if (idle?.workerIdle !== true || idle?.backendIdle !== true)
        throw fail('PERSONALIZATION_MATRIX_NOT_IDLE')
      session = await openSession(scope, model.id)
      if (!session || seenSessions.has(session))
        throw fail('PERSONALIZATION_MATRIX_SESSION_REUSED')
      seenSessions.add(session)
      if (session.modelId !== model.id || session.windowId !== expectedWindowId ||
          typeof session.attestAfterBarrier !== 'function' ||
          typeof session.prompt !== 'function' || typeof session.close !== 'function')
        throw fail('PERSONALIZATION_MATRIX_MODEL_OR_WINDOW_UNCONFIRMED')
      const barrier = await openBarrier(scope)
      if (barrier?.windowId !== session.windowId ||
          typeof barrier.sessionIdForBarrier !== 'string')
        throw fail('PERSONALIZATION_MATRIX_BARRIER_INVALID')
      await session.attestAfterBarrier(barrier.sessionIdForBarrier)
      idle = await assertIdle()
      if (idle?.workerIdle !== true || idle?.backendIdle !== true)
        throw fail('PERSONALIZATION_MATRIX_NOT_IDLE')
      if (turnSignal.signal.aborted) throw fail('PERSONALIZATION_MATRIX_CANCELLED')
      promptStarted = Date.now()
      disarmSoftTimeout = armSoftTimeout(() => { softTimedOut = true; cancel() })
      if (typeof disarmSoftTimeout !== 'function')
        throw fail('PERSONALIZATION_MATRIX_DEADLINE_INVALID')
      turns += 1
      const response = await session.prompt(prompt, undefined, turnSignal.signal)
      if (softTimedOut || Date.now() - promptStarted >= SOFT_TIMEOUT_MS)
        throw fail('PERSONALIZATION_MATRIX_SOFT_TIMEOUT_RACED')
      if (signal?.aborted) throw fail('PERSONALIZATION_MATRIX_CANCEL_RACED')
      if (response?.stopReason !== 'end_turn' ||
          typeof response.text !== 'string' || !response.text.trim())
        throw fail('PERSONALIZATION_MATRIX_TURN_INCOMPLETE')
      const output = planned.role === 'HELPER' ?
        { answerPresent: true, deterministicStatus: 'PASSED' } :
        evaluateDiscoveryText(response.text, planned, contracts)
      const completed = { id: planned.id, role: planned.role, status: 'COMPLETE',
        modelId: model.id, windowId: session.windowId,
        curatedLedgerIncluded: planned.curatedLedgerIncluded,
        recentEpisodesIncluded: planned.recentEpisodesIncluded,
        inputSha256: digest(contextJson), promptSha256: digest(prompt),
        elapsedMs: Math.max(0, Date.now() - started),
        modelElapsedMs: Math.max(0, Date.now() - promptStarted), ...output,
        humanReviewStatus: 'NEEDS_REVIEW' }
      cells.push(completed)
      display[planned.role === 'HELPER' ? 'helper' : 'discovery'][planned.id] =
        response.text
      emit(onCell, completed)
    } catch (error) {
      const code = safeCode(error)
      const failed = { id: planned.id, role: planned.role,
        status: softTimedOut && code === 'NATIVE_H_CANCELLED_CONFIRMED' ?
          'SOFT_TIMEOUT_CONFIRMED' : 'FAILED', modelId: model.id,
      windowId: session?.windowId ?? null,
      elapsedMs: Math.max(0, Date.now() - started),
      ...(promptStarted === null ? {} :
        { modelElapsedMs: Math.max(0, Date.now() - promptStarted) }),
      softDeadlineExceeded: softTimedOut, errorCode: code,
      humanReviewStatus: 'BLOCKED_BY_EXECUTION_FAILURE' }
      cells.push(failed)
      emit(onCell, failed)
      break
    } finally {
      disarmSoftTimeout?.()
      signal?.removeEventListener('abort', cancel)
      session?.close()
    }
  }
  const finished = cells.length === MAX_TURNS &&
    cells.every(cell => cell.status === 'COMPLETE')
  return {
    metadata: {
      kind: 'STANDALONE_NATIVE_CLEAN_PERSONALIZATION_MATRIX',
      provenance: SYNTHETIC_PROVENANCE,
      interpretation: 'EXPLORATORY_COMPARISON_NOT_CAUSAL_OR_HUMAN_LEARNING_PROOF',
      coreMutationCount: 0, cellRetryCount: 0, freshSessionPerCell: true,
      status: signal?.aborted ? 'CANCELLED' : finished ? 'PLAN_FINISHED' : 'INCOMPLETE',
      deterministicStatus: finished && cells.every(cell =>
        cell.deterministicStatus === 'PASSED') ? 'PASSED' : 'FAILED',
      humanReviewStatus: finished ? 'NEEDS_REVIEW' : 'BLOCKED_BY_EXECUTION_FAILURE',
      humanReviewCriteria: plan.evaluation.reviewBoundary.humanReviewRequired,
      maxTurns: MAX_TURNS, combinedPlanMaxTurns: COMBINED_PLAN_MAX_TURNS, turns,
      model: { id: model.id, confirmed: true, source: model.source,
        configuration: model.configuration ?? 'NOT_EXPOSED' },
      expectedWindowId, helperPromptVersion: '1.2.0',
      helperPromptSha256: digest(helperRolePrompt), discoveryPromptVersion: '1.3.5',
      discoveryPromptSha256: digest(discoveryRolePrompt),
      fixtureSha256: digest(JSON.stringify(fixture)),
      helperInvariantSha256: plan.helperInvariantSha256,
      discoveryInvariantSha256: plan.discoveryInvariantSha256,
      sourceAttestation: input.cleanEvidenceAttestation,
      recentEpisodeDependence: plan.evaluation.recentEpisodeHistory.expectedDependenceIfRepeated,
      personalNeedPresent: true, softTimeoutMs: SOFT_TIMEOUT_MS,
      nativePromptRpcTimeoutMs: NATIVE_PROMPT_RPC_TIMEOUT_MS, cells,
    },
    // Synthetic model text is kept separate from serializable progress metadata.
    display,
  }
}

module.exports = {
  HELPER_CELLS, DISCOVERY_CELLS, MAX_TURNS, COMBINED_PLAN_MAX_TURNS,
  buildSyntheticPersonalizationInputs, buildMatrixInputs, evaluateDiscoveryText,
  runNativePersonalizationMatrix,
}
