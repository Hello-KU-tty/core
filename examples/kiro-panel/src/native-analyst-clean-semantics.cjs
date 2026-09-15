const { createHash } = require('node:crypto')

const MAX_TURNS = 7
const SOFT_TIMEOUT_MS = 60_000
const NATIVE_PROMPT_RPC_TIMEOUT_MS = 240_000
const PROMPT_MAX_BYTES = 400_000
const EXPECTED_CASE_IDS = [
  'request_only',
  'future_plan_after_light_hint',
  'own_explanation_independent',
  'actual_reasoned_choice',
  'actual_performed_application',
  'directly_led_repeat',
  'unseen_cache_future_rule_not_application',
]
const EXPECTED_CASE_IDS_V1_0_7 = [
  'request_only',
  'future_plan_after_light_hint',
  'own_explanation_independent',
  'actual_reasoned_choice',
  'actual_performed_application',
  'directly_led_repeat',
  'independent_future_prediction',
]

function fail(code) { return Object.assign(new Error(code), { code }) }

function digest(value) {
  return createHash('sha256').update(value).digest('hex')
}

function safeCode(error) {
  const value = error?.code ?? error?.message
  return typeof value === 'string' && /^[A-Z][A-Z0-9_]{0,79}$/.test(value) ?
    value : 'ANALYST_CLEAN_CELL_FAILED'
}

function entityId(prefix, number) {
  return `${prefix}_62000000-0000-4000-8000-${number.toString(16).padStart(12, '0')}`
}

function sourceKey(source) {
  if (source?.kind === 'USER_MESSAGE' || source?.kind === 'AGENT_MESSAGE')
    return `${source.kind}:${source.conversationId}:${source.messageId}`
  if (source?.kind === 'USER_DECISION') return `${source.kind}:${source.decisionId}`
  if (source?.kind === 'USER_ACTION' || source?.kind === 'EVENT')
    return `${source.kind}:${source.eventId}`
  if (source?.kind === 'CODE')
    return `${source.kind}:${source.path}:${JSON.stringify(source.lineRange ?? null)}`
  if (source?.kind === 'DIFF') return `${source.kind}:${source.diffId}`
  if (source?.kind === 'TEST_RESULT') return `${source.kind}:${source.testResultId}`
  if (source?.kind === 'TOOL_CALL') return `${source.kind}:${source.toolCallId}`
  return null
}

function sameSourceSet(actual, expected) {
  const actualKeys = actual.map(sourceKey)
  const expectedKeys = expected.map(sourceKey)
  return !actualKeys.includes(null) && actualKeys.length === new Set(actualKeys).size &&
    actualKeys.length === expectedKeys.length &&
    expectedKeys.every(key => actualKeys.includes(key))
}

function allowedSourceSubset(proposal, expected) {
  const actualKeys = proposal.userEvidenceSources.map(sourceKey)
  const expectedKeys = new Set(expected.map(sourceKey))
  if (actualKeys.length === 0 || actualKeys.includes(null) ||
      actualKeys.length !== new Set(actualKeys).size ||
      actualKeys.some(key => !expectedKeys.has(key))) return false
  if (proposal.signal !== 'JUSTIFIED_DECISION') return true
  const expectedDecisionKeys = new Set(expected
    .filter(source => source.kind === 'USER_DECISION').map(sourceKey))
  return actualKeys.some(key => expectedDecisionKeys.has(key))
}

function validateFixture(fixture) {
  const expectedCaseIds = fixture?.promptVersion === '1.0.6' ? EXPECTED_CASE_IDS :
    fixture?.promptVersion === '1.0.7' ? EXPECTED_CASE_IDS_V1_0_7 : null
  if (!fixture || expectedCaseIds === null ||
      fixture.fixtureProvenance !== 'SYNTHETIC_UI_TRANSCRIPT' ||
      fixture.modelRunStatus !== 'NOT_RUN' || fixture.containsPersonalData !== false ||
      !Array.isArray(fixture.cases) || fixture.cases.length !== MAX_TURNS ||
      fixture.cases.some((item, index) => item?.id !== expectedCaseIds[index]))
    throw fail('ANALYST_CLEAN_FIXTURE_INVALID')
}

function buildDecisionContext(item, scope, resolutionId, userReference) {
  const decisionId = item.decisionEvent?.decisionId
  if (typeof decisionId !== 'string' ||
      item.decisionResolution?.source !== 'USER' ||
      typeof item.decisionResolution.rationale !== 'string')
    throw fail('ANALYST_CLEAN_DECISION_FIXTURE_INVALID')
  const optionA = entityId('decision_option', 1)
  const optionB = entityId('decision_option', 2)
  const optionIds = [optionA, optionB]
  const specified = item.decisionRequest
  if (specified !== undefined &&
      (!Array.isArray(specified.options) || specified.options.length !== optionIds.length ||
        !Number.isInteger(specified.recommendedOptionIndex) ||
        !optionIds[specified.recommendedOptionIndex] ||
        !Number.isInteger(item.decisionResolution.selectedOptionIndex) ||
        !optionIds[item.decisionResolution.selectedOptionIndex]))
    throw fail('ANALYST_CLEAN_DECISION_FIXTURE_INVALID')
  const options = specified === undefined ? [
    { id: optionA, label: '자동 축소', description: '가구를 방 크기에 맞춥니다.',
      impacts: ['배치는 항상 저장됩니다.'], tradeoffs: ['사용자 비율이 달라질 수 있습니다.'] },
    { id: optionB, label: '저장 거절', description: '경계를 넘는 배치를 거절합니다.',
      impacts: ['사용자 비율을 보존합니다.'], tradeoffs: ['배치를 다시 조정해야 합니다.'] },
  ] : specified.options.map((option, index) => ({ id: optionIds[index], ...option }))
  const request = {
    schemaVersion: 1, id: decisionId, projectId: scope.projectId,
    taskId: scope.taskId, correlationId: scope.correlationId,
    contextVersion: 1, category: 'PRODUCT_BEHAVIOR',
    question: specified?.question ??
      '방보다 큰 가구 배치를 자동 축소할까요, 저장을 거절할까요?',
    reasonRequiredNow: specified?.reasonRequiredNow ??
      '배치 저장 동작이 이 선택에 따라 달라집니다.',
    options,
    recommendedOptionId: optionIds[specified?.recommendedOptionIndex ?? 1],
    recommendationRationale: specified?.recommendationRationale ??
      '사용자 입력 비율을 임의로 바꾸지 않습니다.',
    relatedConceptNames: ['경계 불변식'], sourceReferences: [userReference],
    independentWorkCanContinue: false, requestedAt: '2026-09-15T00:00:00.000Z',
    source: { kind: 'AGENT', role: 'BUILDER' },
    redactionStatus: 'VERIFIED_REDACTED',
  }
  if ((specified?.agentHintMustNotContain ?? []).some(value =>
    JSON.stringify(request).includes(value)))
    throw fail('ANALYST_CLEAN_DECISION_HINT_CONTAMINATED')
  return {
    request,
    resolution: {
      schemaVersion: 1, id: resolutionId, decisionId,
      projectId: scope.projectId, taskId: scope.taskId,
      correlationId: scope.correlationId, expectedContextVersion: 1,
      selectionKind: 'OPTION',
      selectedOptionId: optionIds[item.decisionResolution.selectedOptionIndex ?? 1],
      rationale: item.decisionResolution.rationale, helperUsed: true,
      resolvedAt: '2026-09-15T00:00:03.000Z', source: { kind: 'USER' },
      redactionStatus: 'VERIFIED_REDACTED',
    },
  }
}

function buildSyntheticCase(item, index, contracts) {
  const ordinal = index + 1
  const projectId = entityId('project', 1)
  const taskId = entityId('task', 1)
  const episodeId = entityId('episode', ordinal)
  const correlationId = entityId('corr', ordinal)
  const userReference = item.userEvidenceSources.find(source =>
    source.kind === 'USER_MESSAGE')
  if (!userReference || typeof item.userMessage !== 'string')
    throw fail('ANALYST_CLEAN_USER_SOURCE_INVALID')
  const events = []
  if (item.precedingAgentContribution !== null) {
    const agentMessageId = entityId('message', 0x100 + ordinal)
    const agentReference = { kind: 'AGENT_MESSAGE',
      conversationId: userReference.conversationId, messageId: agentMessageId }
    events.push({
      schemaVersion: 1, id: entityId('event', 0x100 + ordinal), projectId, taskId,
      conversationId: userReference.conversationId, correlationId,
      sequence: events.length, actor: { kind: 'AGENT', role: 'HELPER' },
      occurredAt: '2026-09-15T00:00:00.000Z',
      payload: { type: 'HELPER_RESPONSE', conversationId: userReference.conversationId,
        messageId: agentMessageId, summary: item.precedingAgentContribution },
      sourceReferences: [agentReference], redactionStatus: 'VERIFIED_REDACTED',
    })
  }
  events.push({
    schemaVersion: 1, id: entityId('event', 0x200 + ordinal), projectId, taskId,
    conversationId: userReference.conversationId, correlationId,
    sequence: events.length, actor: { kind: 'USER' },
    occurredAt: '2026-09-15T00:00:01.000Z',
    payload: { type: 'USER_MESSAGE', conversationId: userReference.conversationId,
      messageId: userReference.messageId, redactedExcerpt: item.userMessage },
    sourceReferences: [userReference], redactionStatus: 'VERIFIED_REDACTED',
  })
  let decisionContext = null
  let decisionId
  if (item.id === 'actual_reasoned_choice') {
    decisionId = item.decisionEvent?.decisionId
    const decisionReference = item.userEvidenceSources.find(source =>
      source.kind === 'USER_DECISION')
    if (!decisionReference || decisionReference.decisionId !== decisionId)
      throw fail('ANALYST_CLEAN_DECISION_SOURCE_INVALID')
    const resolutionId = entityId('decision_resolution', ordinal)
    decisionContext = buildDecisionContext(item,
      { projectId, taskId, correlationId }, resolutionId, userReference)
    events.push({
      schemaVersion: 1, id: entityId('event', 0x300 + ordinal), projectId, taskId,
      decisionId, correlationId, sequence: events.length, actor: { kind: 'USER' },
      occurredAt: '2026-09-15T00:00:03.000Z',
      payload: { type: 'DECISION_RESOLVED', decisionId, resolutionId,
        rationaleProvided: item.decisionEvent.rationaleProvided },
      sourceReferences: [decisionReference], redactionStatus: 'VERIFIED_REDACTED',
    })
  }
  const candidateExpressions = item.expected?.claimProfiles?.flatMap(profile =>
    profile.claimExcerpts) ?? (item.userClaimExcerpt === undefined ? [] :
    [item.userClaimExcerpt])
  const context = {
    schemaVersion: 1, correlationId,
    episode: {
      schemaVersion: 1, id: episodeId, projectId, taskId,
      ...(decisionId === undefined ? {} : { decisionId }),
      conversationId: userReference.conversationId, correlationId, revision: 1,
      type: decisionId === undefined ? 'HELPER_CONVERSATION' : 'DECISION',
      status: 'PENDING_ANALYSIS', eventIds: events.map(event => event.id),
      conceptCandidates: [...new Set(candidateExpressions)].map(originalExpression =>
        ({ originalExpression })),
      contextReferences: [], startedAt: '2026-09-15T00:00:00.000Z',
      endedAt: '2026-09-15T00:00:04.000Z',
      closeReason: 'Bounded synthetic semantic evaluation Episode.',
      source: { kind: 'CORE' }, redactionStatus: 'VERIFIED_REDACTED',
    },
    events, relevantLedgerEntries: [], analysisJob: null, decisionContext,
  }
  return contracts.episodeContextSchema.parse(context)
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

function allowedContextSources(context) {
  return context.events.flatMap(event => event.sourceReferences)
    .concat(context.episode.contextReferences)
    .concat(context.decisionContext?.request.sourceReferences ?? [])
}

function quotedUserTexts(proposal, context) {
  const cited = new Set(proposal.userEvidenceSources.map(sourceKey))
  const messages = context.events.flatMap(event =>
    event.actor.kind === 'USER' && event.payload.type === 'USER_MESSAGE' &&
    cited.has(sourceKey({ kind: 'USER_MESSAGE',
      conversationId: event.payload.conversationId, messageId: event.payload.messageId })) ?
      [event.payload.redactedExcerpt] : [])
  const resolution = context.decisionContext?.resolution
  if (resolution && cited.has(sourceKey({ kind: 'USER_DECISION',
    decisionId: resolution.decisionId }))) {
    if (resolution.rationale !== undefined) messages.push(resolution.rationale)
    if (resolution.customProposal !== undefined) messages.push(resolution.customProposal)
  }
  return messages
}

function claimProfileMatches(proposal, profile) {
  return Array.isArray(profile?.claimExcerpts) &&
    Array.isArray(profile.allowedSignals) &&
    Array.isArray(profile.allowedStrengths) &&
    Array.isArray(profile.allowedPromptDependence) &&
    Array.isArray(profile.allowedMaximumSupportedStates) &&
    profile.claimExcerpts.some(excerpt =>
    proposal.redactedEvidenceExcerpt.includes(excerpt)) &&
    profile.allowedSignals.includes(proposal.signal) &&
    profile.allowedStrengths.includes(proposal.strength) &&
    profile.allowedPromptDependence.includes(proposal.promptDependence) &&
    profile.allowedMaximumSupportedStates.includes(proposal.maximumSupportedState)
}

function claimProfileSemanticsValid(result, expected) {
  if (expected.oracleMode === 'NO_PROPOSALS')
    return result.proposals.length === 0 && Boolean(result.noEvidenceReason)
  const profiles = expected.claimProfiles
  if (expected.oracleMode !== 'CLAIM_PROFILES' || !Array.isArray(profiles) ||
      profiles.length === 0 || profiles.some(profile =>
        typeof profile.id !== 'string' || !Array.isArray(profile.claimExcerpts) ||
        profile.claimExcerpts.length === 0))
    return false
  const stateSupportingCount = result.proposals.filter(proposal =>
    proposal.maximumSupportedState !== null).length
  const minimum = expected.minimumStateSupportingProposals ?? 0
  const maximum = expected.maximumStateSupportingProposals ?? Number.POSITIVE_INFINITY
  return stateSupportingCount >= minimum && stateSupportingCount <= maximum &&
    result.proposals.every(proposal =>
      !(expected.forbiddenSignals ?? []).includes(proposal.signal) &&
      profiles.some(profile => claimProfileMatches(proposal, profile)))
}

function evaluateText(text, context, item, contracts) {
  const parsed = parseJson(text)
  const validation = contracts.analystSemanticResultSchema.safeParse(parsed.value)
  if (!validation.success) return {
    jsonForm: parsed.form, schemaValid: false, envelopeValid: false,
    sourceReferencesValid: false, quoteProvenanceValid: false,
    proposalCount: null, stateSupportingProposalCount: null,
    deterministicStatus: 'FAILED', failureCode: 'ANALYST_RESULT_SCHEMA_INVALID',
    proposals: [],
  }
  const result = validation.data
  const envelopeValid = result.episodeId === context.episode.id &&
    result.episodeRevision === context.episode.revision &&
    result.correlationId === context.correlationId
  const contextSourceAllowlist = allowedContextSources(context)
  const claimProfiles = item.expected?.claimProfiles ?? []
  const proposals = result.proposals.map(proposal => {
    const directSourcesValid = item.expected?.oracleMode === undefined ?
      sameSourceSet(proposal.userEvidenceSources, item.userEvidenceSources) :
      allowedSourceSubset(proposal, item.userEvidenceSources)
    const contextSourcesValid = proposal.contextSources.every(source =>
      contextSourceAllowlist.some(expected => sourceKey(expected) === sourceKey(source)))
    const texts = quotedUserTexts(proposal, context)
    const originalExpressionFromUser = texts.some(value =>
      value.includes(proposal.concept.originalExpression))
    const evidenceExcerptFromUser = texts.some(value =>
      value.includes(proposal.redactedEvidenceExcerpt))
    const claimExcerptPresent = item.userClaimExcerpt === undefined ? false :
      proposal.redactedEvidenceExcerpt.includes(item.userClaimExcerpt)
    const matchedClaimProfileIds = claimProfiles.filter(profile =>
      claimProfileMatches(proposal, profile)).map(profile => profile.id)
    return {
      signal: proposal.signal, strength: proposal.strength,
      maximumSupportedState: proposal.maximumSupportedState,
      promptDependence: proposal.promptDependence,
      directSourcesValid, contextSourcesValid, originalExpressionFromUser,
      evidenceExcerptFromUser, claimExcerptPresent, matchedClaimProfileIds,
    }
  })
  const sourceReferencesValid = proposals.every(proposal =>
    proposal.directSourcesValid && proposal.contextSourcesValid)
  const quoteProvenanceValid = proposals.every(proposal =>
    proposal.originalExpressionFromUser && proposal.evidenceExcerptFromUser)
  const stateSupportingProposalCount = proposals.filter(proposal =>
    proposal.maximumSupportedState !== null).length
  const expected = item.expected
  let semanticsValid
  if (expected.oracleMode !== undefined) {
    semanticsValid = claimProfileSemanticsValid(result, expected)
  } else if (expected.proposalCount === 0) {
    semanticsValid = proposals.length === 0 && Boolean(result.noEvidenceReason)
  } else if (expected.stateSupportingProposalCount === 0) {
    semanticsValid = stateSupportingProposalCount === 0 && proposals.every(proposal =>
      expected.allowedPromptDependence.includes(proposal.promptDependence) &&
      expected.allowedStrengths.includes(proposal.strength) &&
      proposal.maximumSupportedState === expected.maximumSupportedState)
  } else {
    semanticsValid = proposals.length === expected.proposalCount && proposals.every(proposal =>
      expected.allowedSignals.includes(proposal.signal) &&
      expected.allowedStrengths.includes(proposal.strength) &&
      expected.allowedPromptDependence.includes(proposal.promptDependence) &&
      expected.allowedMaximumSupportedStates.includes(proposal.maximumSupportedState) &&
      !(expected.forbiddenSignals ?? []).includes(proposal.signal) &&
      proposal.claimExcerptPresent)
  }
  const deterministicPass = envelopeValid && sourceReferencesValid &&
    quoteProvenanceValid && semanticsValid
  return {
    jsonForm: parsed.form, schemaValid: true, envelopeValid,
    sourceReferencesValid, quoteProvenanceValid,
    proposalCount: proposals.length, stateSupportingProposalCount,
    deterministicStatus: deterministicPass ? 'PASSED' : 'FAILED',
    ...(deterministicPass ? {} : { failureCode: 'ANALYST_CLEAN_EXPECTATION_MISMATCH' }),
    proposals,
  }
}

function validateDependencies(input) {
  const { fixture, rolePrompt, composeAnalystPrompt, contracts, model, scope,
    expectedWindowId, openSession, openBarrier, assertIdle, onCell } = input ?? {}
  validateFixture(fixture)
  if (typeof rolePrompt !== 'string' ||
      !rolePrompt.includes(`> Prompt version: \`${fixture.promptVersion}\``) ||
      typeof composeAnalystPrompt !== 'function' ||
      typeof contracts?.episodeContextSchema?.parse !== 'function' ||
      typeof contracts?.analystSemanticResultSchema?.safeParse !== 'function' ||
      !model || typeof model.id !== 'string' || !model.id || model.confirmed !== true ||
      typeof model.source !== 'string' || !model.source || !scope ||
      !Number.isInteger(expectedWindowId) || expectedWindowId <= 0 ||
      typeof openSession !== 'function' || typeof openBarrier !== 'function' ||
      typeof assertIdle !== 'function' ||
      (onCell !== undefined && typeof onCell !== 'function'))
    throw fail('ANALYST_CLEAN_DEPENDENCIES_INVALID')
}

function emit(onCell, cell) {
  try { onCell?.(cell) }
  catch { /* Progress output cannot change a deterministic verdict. */ }
}

async function runNativeAnalystCleanSemantics(input) {
  validateDependencies(input)
  const { fixture, rolePrompt, composeAnalystPrompt, contracts, model, scope,
    expectedWindowId, openSession, openBarrier, assertIdle, onCell, signal } = input
  const contexts = fixture.cases.map((item, index) =>
    ({ item, context: buildSyntheticCase(item, index, contracts) }))
  const armSoftTimeout = input.armSoftTimeout ?? (onTimeout => {
    const timer = setTimeout(onTimeout, SOFT_TIMEOUT_MS)
    return () => clearTimeout(timer)
  })
  if (typeof armSoftTimeout !== 'function')
    throw fail('ANALYST_CLEAN_DEADLINE_INVALID')
  const cells = []
  const display = {}
  const seenSessions = new Set()
  let turns = 0
  let windowId = null
  for (const { item, context } of contexts) {
    if (signal?.aborted) break
    if (turns >= MAX_TURNS) throw fail('ANALYST_CLEAN_TURN_BUDGET_EXCEEDED')
    const message = JSON.stringify(context)
    const prompt = composeAnalystPrompt({ rolePrompt, message,
      provenance: 'SYNTHETIC_REDACTED_EVAL_INPUT' })
    if (typeof prompt !== 'string' || !prompt.includes('SYNTHETIC_REDACTED_EVAL_INPUT') ||
        Buffer.byteLength(prompt, 'utf8') > PROMPT_MAX_BYTES)
      throw fail('ANALYST_CLEAN_PROMPT_INVALID')
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
        throw fail('ANALYST_CLEAN_NOT_IDLE')
      session = await openSession(scope, model.id)
      if (!session || seenSessions.has(session))
        throw fail('ANALYST_CLEAN_SESSION_REUSED')
      seenSessions.add(session)
      if (session.modelId !== model.id ||
          typeof session.attestAfterBarrier !== 'function' ||
          typeof session.prompt !== 'function' || typeof session.close !== 'function' ||
          !Number.isInteger(session.windowId) || session.windowId <= 0)
        throw fail('ANALYST_CLEAN_MODEL_OR_WINDOW_UNCONFIRMED')
      if (session.windowId !== expectedWindowId ||
          (windowId !== null && session.windowId !== windowId))
        throw fail('ANALYST_CLEAN_WINDOW_CHANGED')
      windowId = session.windowId
      const barrier = await openBarrier(scope)
      if (barrier?.windowId !== session.windowId ||
          typeof barrier.sessionIdForBarrier !== 'string')
        throw fail('ANALYST_CLEAN_BARRIER_INVALID')
      await session.attestAfterBarrier(barrier.sessionIdForBarrier)
      idle = await assertIdle()
      if (idle?.workerIdle !== true || idle?.backendIdle !== true)
        throw fail('ANALYST_CLEAN_NOT_IDLE')
      if (turnSignal.signal.aborted) throw fail('ANALYST_CLEAN_CANCELLED')
      promptStarted = Date.now()
      disarmSoftTimeout = armSoftTimeout(() => { softTimedOut = true; cancel() })
      if (typeof disarmSoftTimeout !== 'function')
        throw fail('ANALYST_CLEAN_DEADLINE_INVALID')
      turns += 1
      const response = await session.prompt(prompt, undefined, turnSignal.signal)
      if (softTimedOut || Date.now() - promptStarted >= SOFT_TIMEOUT_MS)
        throw fail('ANALYST_CLEAN_SOFT_TIMEOUT_RACED')
      if (signal?.aborted) throw fail('ANALYST_CLEAN_CANCEL_RACED')
      if (response?.stopReason !== 'end_turn' || typeof response.text !== 'string')
        throw fail('ANALYST_CLEAN_TURN_INCOMPLETE')
      const evaluation = evaluateText(response.text, context, item, contracts)
      const completed = { caseId: item.id, status: 'COMPLETE', modelId: model.id,
        windowId: session.windowId, elapsedMs: Math.max(0, Date.now() - started),
        modelElapsedMs: Math.max(0, Date.now() - promptStarted),
        inputSha256: digest(message), ...evaluation }
      cells.push(completed)
      display[item.id] = response.text
      emit(onCell, completed)
    } catch (error) {
      const code = safeCode(error)
      const failed = { caseId: item.id, status: softTimedOut &&
        code === 'NATIVE_H_CANCELLED_CONFIRMED' ? 'SOFT_TIMEOUT_CONFIRMED' : 'FAILED',
      modelId: model.id, windowId: session?.windowId ?? null,
      elapsedMs: Math.max(0, Date.now() - started),
      ...(promptStarted === null ? {} :
        { modelElapsedMs: Math.max(0, Date.now() - promptStarted) }),
      softDeadlineExceeded: softTimedOut, errorCode: code }
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
      kind: `STANDALONE_NATIVE_ANALYST_V${fixture.promptVersion.replaceAll('.', '_')}_` +
        'CLEAN_SEMANTICS',
      provenance: 'SYNTHETIC_REDACTED_EVAL_INPUT',
      interpretation: 'MODEL_PROMPT_COMPLIANCE_NOT_HUMAN_LEARNING',
      coreMutationCount: 0, cellRetryCount: 0, freshSessionPerCell: true,
      status: signal?.aborted ? 'CANCELLED' : finished ? 'PLAN_FINISHED' : 'INCOMPLETE',
      deterministicStatus: finished && cells.every(cell =>
        cell.deterministicStatus === 'PASSED') ? 'PASSED' : 'FAILED',
      contractOracleHumanReviewStatus: 'NOT_REQUIRED',
      semanticInterpretationReviewStatus: finished ? 'NEEDS_REVIEW' :
        'BLOCKED_BY_EXECUTION_FAILURE',
      humanReviewStatus: finished ? 'NEEDS_REVIEW' : 'BLOCKED_BY_EXECUTION_FAILURE',
      maxTurns: MAX_TURNS, turns, promptVersion: fixture.promptVersion,
      promptSha256: digest(rolePrompt), fixtureSha256: digest(JSON.stringify(fixture)),
      model: { id: model.id, confirmed: true, source: model.source,
        configuration: model.configuration ?? 'NOT_EXPOSED' },
      windowId, softTimeoutMs: SOFT_TIMEOUT_MS,
      nativePromptRpcTimeoutMs: NATIVE_PROMPT_RPC_TIMEOUT_MS, cells,
    },
    // Synthetic model text is kept separate from serializable progress metadata.
    display,
  }
}

module.exports = {
  MAX_TURNS, SOFT_TIMEOUT_MS, EXPECTED_CASE_IDS, EXPECTED_CASE_IDS_V1_0_7,
  buildSyntheticCase,
  evaluateText, runNativeAnalystCleanSemantics,
}
