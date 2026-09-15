const { createHash } = require('node:crypto')
const { readFile } = require('node:fs/promises')
const { join } = require('node:path')

const fixture = require('../../../tests/eval/fixtures/prompt-regressions/evidence-analyst-v1.0.4-request-versus-claim.json')

const MAX_TURNS = 12
const TURN_TIMEOUT_MS = 30_000
// The protected native client separately bounds session/prompt RPC at 240 s.
// This 30 s deadline is a cancellation request, not a guaranteed terminal time.
const NATIVE_PROMPT_RPC_TIMEOUT_MS = 240_000
// v1.0.3 is reconstructed by reversing only the v1.0.4 semantic edits below.
// Its hash was pinned after reconstruction, not independently archived before editing.
const PROMPT_HASHES = {
  '1.0.3': 'fbf2f59a6e6e4bf6fda2363c295fca646de877851a23c66da07122b653b33903',
  '1.0.4': '157effa5142311acaf884b779a32f129c647212ed0420480d208d98e5b3dea8e',
}
const PROMPT_PATH = join(__dirname, '..', '..', '..', 'docs', 'agent-prompts',
  'evidence-analyst.md')
const TRANSPORT = [
  'Transport adaptation: standalone native Analyst semantic evaluation. This is a',
  'no-tool, bounded EpisodeContext. Return one strict JSON result using the role prompt.',
  'Use only the direct USER Event and the supplied source reference; do not add IDs,',
  'context, or external facts. Do not submit anything to Core.',
].join(' ')
const FINAL_SCHEMA = [
  'Final schema check: every proposal.concept.originalExpression is a required,',
  'nonempty short phrase copied from a direct USER Event (at most 120 characters).',
  'If no valid Proposal remains, return proposals: [] and noEvidenceReason.',
].join(' ')

function evalError(code) {
  return Object.assign(new Error(code), { code })
}

function exactlyOnce(text, from, to) {
  if (text.split(from).length !== 2) throw evalError('ANALYST_EVAL_PROMPT_DRIFT')
  return text.replace(from, to)
}

function derivePriorPrompt(current) {
  if (typeof current !== 'string' ||
      !current.includes('> Prompt version: `1.0.4`'))
    throw evalError('ANALYST_EVAL_PROMPT_VERSION_INVALID')
  let prior = exactlyOnce(current, '> Prompt version: `1.0.4`',
    '> Prompt version: `1.0.3`')
  const start = prior.indexOf('\n## 요청과 사용자가 실제로 제시한 내용 구분\n')
  const end = prior.indexOf('\n## Evidence 신호\n', start)
  if (start < 0 || end <= start || prior.indexOf('## 요청과 사용자가 실제로 제시한 내용 구분',
    end) !== -1) throw evalError('ANALYST_EVAL_PROMPT_DRIFT')
  prior = `${prior.slice(0, start)}\n${prior.slice(end)}`
  prior = exactlyOnce(prior,
    '- 사용자가 기술적으로 맞는 구체적 전제·원인·결과를 직접 진술한 후속 질문 (상황만 제시하고 답을 요청한 질문은 제외)',
    '- 올바른 전제를 포함한 후속 질문')
  prior = exactlyOnce(prior,
    '질문형이라는 이유만으로 모두 WEAK로 만들지 마라. 사용자가 직접 제시한 올바른 대응 관계가 충분히 구체적이면 MEDIUM 또는 STRONG REPHRASE가 될 수 있다. 대응 관계를 Agent에게 물었을 뿐이라면 사용자가 설명한 것으로 간주하지 마라.',
    '질문형이라는 이유만으로 모두 WEAK로 만들지 마라. 올바른 대응 관계가 충분히 구체적이면 MEDIUM 또는 STRONG REPHRASE가 될 수 있다.')
  prior = exactlyOnce(prior,
    '다만 Episode 전체에 사용자가 직접 제시한 검토 가능한 명제·이유·예측·적용 없이 요청·확인만 있다면 위 규칙대로 빈 결과를 반환하라. 질문형 안에 실제 사용자 주장이 있으면 그 주장만 별도로 평가하라.',
    '다만 Episode 전체가 질문·확인뿐이면 위 규칙대로 빈 결과를 반환하라.')
  if (prior.includes('## 요청과 사용자가 실제로 제시한 내용 구분') ||
      prior.includes('> Prompt version: `1.0.4`'))
    throw evalError('ANALYST_EVAL_PROMPT_DRIFT')
  return prior
}

function digest(text) {
  return createHash('sha256').update(text).digest('hex')
}

function rolePrompts(current) {
  const prior = derivePriorPrompt(current)
  if (digest(prior) !== PROMPT_HASHES['1.0.3'] ||
      digest(current) !== PROMPT_HASHES['1.0.4'])
    throw evalError('ANALYST_EVAL_PROMPT_HASH_MISMATCH')
  return {
    '1.0.3': { prompt: prior, sha256: digest(prior) },
    '1.0.4': { prompt: current, sha256: digest(current) },
  }
}

function entityId(prefix, number) {
  return `${prefix}_77000000-0000-4000-8000-${number.toString(16).padStart(12, '0')}`
}

function syntheticContext(item, index) {
  const id = index + 1
  const projectId = entityId('project', 1)
  const conversationId = entityId('conversation', id)
  const messageId = entityId('message', id)
  const eventId = entityId('event', id)
  const episodeId = entityId('episode', id)
  const correlationId = entityId('corr', id)
  const sourceReference = { kind: 'USER_MESSAGE', conversationId, messageId }
  return {
    schemaVersion: 1,
    correlationId,
    episode: {
      schemaVersion: 1, id: episodeId, projectId, conversationId, correlationId,
      revision: 1, type: 'HELPER_CONVERSATION', status: 'PENDING_ANALYSIS',
      eventIds: [eventId], conceptCandidates: [], contextReferences: [],
      startedAt: '2026-09-14T00:00:00.000Z', endedAt: '2026-09-14T00:00:02.000Z',
      closeReason: 'One bounded user question', source: { kind: 'CORE' },
      redactionStatus: 'VERIFIED_REDACTED',
    },
    events: [{
      schemaVersion: 1, id: eventId, projectId, conversationId, correlationId,
      sequence: 1, actor: { kind: 'USER' }, occurredAt: '2026-09-14T00:00:01.000Z',
      payload: { type: 'USER_MESSAGE', conversationId, messageId,
        redactedExcerpt: item.userMessage },
      sourceReferences: [sourceReference], redactionStatus: 'VERIFIED_REDACTED',
    }],
    relevantLedgerEntries: [], analysisJob: null, decisionContext: null,
  }
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

function exactSource(source, expected) {
  return source?.kind === 'USER_MESSAGE' &&
    source.conversationId === expected.conversationId &&
    source.messageId === expected.messageId &&
    Object.keys(source).length === 3
}

function evaluateText(text, context, item, contracts) {
  const parsed = parseJson(text)
  const validation = contracts.analystSemanticResultSchema.safeParse(parsed.value)
  if (!validation.success) return {
    jsonForm: parsed.form, schemaValid: false, envelopeValid: false,
    sourceReferencesValid: false, proposalCount: null, noEvidenceReasonPresent: false,
    proposals: [], coarseExpectationMatch: false,
  }
  const result = validation.data
  const envelopeValid = result.episodeId === context.episode.id &&
    result.episodeRevision === context.episode.revision &&
    result.correlationId === context.correlationId
  const expectedSource = context.events[0].sourceReferences[0]
  const proposals = result.proposals.map(proposal => {
    const sourceReferencesValid = proposal.userEvidenceSources.length > 0 &&
      proposal.userEvidenceSources.every(source => exactSource(source, expectedSource)) &&
      proposal.contextSources.every(source => exactSource(source, expectedSource))
    const originalExpressionFromUser = context.events[0].payload.redactedExcerpt
      .includes(proposal.concept.originalExpression)
    const evidenceExcerptFromUser = context.events[0].payload.redactedExcerpt
      .includes(proposal.redactedEvidenceExcerpt)
    const claimExcerptPresent = item.userAuthoredClaimExcerpt === null ? false :
      proposal.redactedEvidenceExcerpt.includes(item.userAuthoredClaimExcerpt)
    return {
      signal: proposal.signal, strength: proposal.strength,
      maximumSupportedState: proposal.maximumSupportedState,
      promptDependence: proposal.promptDependence,
      sourceReferencesValid, originalExpressionFromUser,
      evidenceExcerptFromUser, claimExcerptPresent,
    }
  })
  const sourceReferencesValid = proposals.every(proposal =>
    proposal.sourceReferencesValid && proposal.originalExpressionFromUser &&
    proposal.evidenceExcerptFromUser)
  const coarseExpectationMatch = envelopeValid && sourceReferencesValid &&
    result.proposals.length === item.expected.proposalCount &&
    (item.userAuthoredClaimExcerpt === null ?
      result.proposals.length === 0 && Boolean(result.noEvidenceReason) :
      proposals.some(proposal => proposal.claimExcerptPresent &&
        item.expected.allowedSignals.includes(proposal.signal) &&
        item.expected.allowedStrengths.includes(proposal.strength) &&
        item.expected.allowedMaximumSupportedStates.includes(proposal.maximumSupportedState)))
  return {
    jsonForm: parsed.form, schemaValid: true, envelopeValid,
    sourceReferencesValid, proposalCount: result.proposals.length,
    noEvidenceReasonPresent: Boolean(result.noEvidenceReason),
    proposals, coarseExpectationMatch,
  }
}

function planCells(models) {
  if (fixture.promptVersion !== '1.0.4' || fixture.cases.length !== 3 ||
      !Array.isArray(models) || models.length !== 2 ||
      models[0]?.family !== 'HAIKU' || models[1]?.family !== 'SONNET' ||
      models[0].id !== 'claude-haiku-4.5' || models[0].confirmed !== true ||
      models[0].source !== 'IDE_CONFIG_OPTION' ||
      models[1].source !== 'IDE_CONFIG_OPTION' ||
      (models[1].id === null ? models[1].confirmed !== false :
        models[1].confirmed !== true || models[1].id !== 'claude-sonnet-4.5'))
    throw evalError('ANALYST_EVAL_MODEL_PLAN_INVALID')
  const cells = []
  for (const item of fixture.cases) {
    for (const promptVersion of ['1.0.3', '1.0.4']) {
      for (const model of models) cells.push({
        caseId: item.id, promptVersion, modelFamily: model.family,
        modelId: model.id,
      })
    }
  }
  if (cells.length !== MAX_TURNS) throw evalError('ANALYST_EVAL_TURN_BUDGET_INVALID')
  return cells
}

function safeErrorCode(error) {
  const candidate = error?.code ?? error?.message
  return typeof candidate === 'string' && /^[A-Z][A-Z0-9_]{0,79}$/.test(candidate) ?
    candidate : 'ANALYST_EVAL_CELL_FAILED'
}

function emitCell(onCell, cell) {
  try { onCell?.(cell) }
  catch { /* Progress UI must not alter the evaluation verdict. */ }
}

async function runNativeAnalystSemanticEval(input) {
  const { scope, models, openSession, openBarrier, onCell, signal } = input ?? {}
  if (!scope || typeof openSession !== 'function' || typeof openBarrier !== 'function' ||
      (onCell !== undefined && typeof onCell !== 'function'))
    throw evalError('ANALYST_EVAL_DEPENDENCIES_INVALID')
  const contracts = input.contracts ?? await import('../../../packages/contracts/dist/index.js')
  const currentPrompt = input.currentPrompt ?? await readFile(PROMPT_PATH, 'utf8')
  const prompts = rolePrompts(currentPrompt)
  const cases = new Map(fixture.cases.map((item, index) => {
    const context = syntheticContext(item, index)
    contracts.episodeContextSchema.parse(context)
    return [item.id, { item, context }]
  }))
  const plan = planCells(models)
  const armSoftTimeout = input.armSoftTimeout ?? (onTimeout => {
    const timer = setTimeout(onTimeout, TURN_TIMEOUT_MS)
    return () => clearTimeout(timer)
  })
  if (typeof armSoftTimeout !== 'function')
    throw evalError('ANALYST_EVAL_DEADLINE_INVALID')
  const cells = []
  let turns = 0
  let windowId = null
  for (const cell of plan) {
    if (signal?.aborted) break
    if (cell.modelId === null) {
      const skipped = { ...cell, status: 'SKIP_MODEL_UNCONFIRMED', elapsedMs: 0 }
      cells.push(skipped)
      emitCell(onCell, skipped)
      continue
    }
    if (turns >= MAX_TURNS) throw evalError('ANALYST_EVAL_TURN_BUDGET_EXCEEDED')
    const { item, context } = cases.get(cell.caseId)
    const text = [prompts[cell.promptVersion].prompt, TRANSPORT,
      `Bounded EpisodeContext JSON: ${JSON.stringify(context)}`, FINAL_SCHEMA].join('\n\n')
    if (Buffer.byteLength(text, 'utf8') > 400_000)
      throw evalError('ANALYST_EVAL_PROMPT_TOO_LARGE')
    let session
    const started = Date.now()
    let promptStarted = null
    let softTimedOut = false
    const turnSignal = new AbortController()
    const cancel = () => turnSignal.abort()
    signal?.addEventListener('abort', cancel, { once: true })
    let disarmSoftTimeout
    try {
      session = await openSession(scope, cell.modelId)
      if (session?.modelId !== cell.modelId ||
          typeof session?.attestAfterBarrier !== 'function' ||
          typeof session?.prompt !== 'function' ||
          typeof session?.close !== 'function' ||
          !Number.isInteger(session?.windowId) || session.windowId <= 0)
        throw evalError('ANALYST_EVAL_MODEL_ATTESTATION_FAILED')
      if (windowId !== null && windowId !== session.windowId)
        throw evalError('ANALYST_EVAL_WINDOW_CHANGED')
      windowId = session.windowId
      const barrier = await openBarrier(scope)
      if (!barrier || barrier.windowId !== session.windowId ||
          typeof barrier.sessionIdForBarrier !== 'string')
        throw evalError('ANALYST_EVAL_BARRIER_INVALID')
      await session.attestAfterBarrier(barrier.sessionIdForBarrier)
      if (turnSignal.signal.aborted) throw evalError('ANALYST_EVAL_CANCELLED')
      promptStarted = Date.now()
      disarmSoftTimeout = armSoftTimeout(() => { softTimedOut = true; cancel() })
      if (typeof disarmSoftTimeout !== 'function')
        throw evalError('ANALYST_EVAL_DEADLINE_INVALID')
      if (turnSignal.signal.aborted) throw evalError('ANALYST_EVAL_SOFT_TIMEOUT_PREPROMPT')
      turns += 1
      const response = await session.prompt(text, undefined, turnSignal.signal)
      // A terminal end_turn racing with a requested cancellation cannot
      // count as a response inside the 30 s soft budget.
      if (softTimedOut || Date.now() - promptStarted >= TURN_TIMEOUT_MS) {
        softTimedOut = true
        throw evalError('ANALYST_EVAL_SOFT_TIMEOUT_RACED')
      }
      if (signal?.aborted) throw evalError('ANALYST_EVAL_CANCEL_RACED')
      if (response?.stopReason !== 'end_turn')
        throw evalError('ANALYST_EVAL_TURN_INCOMPLETE')
      const evaluation = evaluateText(response.text, context, item, contracts)
      // elapsedMs includes fresh H setup/barrier; modelElapsedMs starts at prompt.
      const completed = { ...cell, status: 'COMPLETE',
        elapsedMs: Math.max(0, Date.now() - started),
        modelElapsedMs: Math.max(0, Date.now() - promptStarted), ...evaluation }
      cells.push(completed)
      emitCell(onCell, completed)
    } catch (error) {
      const code = safeErrorCode(error)
      const confirmedTimeout = softTimedOut && code === 'NATIVE_H_CANCELLED_CONFIRMED'
      const status = confirmedTimeout ? 'SOFT_TIMEOUT_CONFIRMED' : 'FAILED'
      const failed = { ...cell, status,
        elapsedMs: Math.max(0, Date.now() - started),
        ...(promptStarted === null ? {} :
          { modelElapsedMs: Math.max(0, Date.now() - promptStarted) }),
        softDeadlineExceeded: softTimedOut, errorCode: code }
      cells.push(failed)
      emitCell(onCell, failed)
      // A failed gate or interaction invalidates the protected local route;
      // never continue into another model turn on an uncertain session.
      if (!confirmedTimeout) break
    } finally {
      disarmSoftTimeout?.()
      signal?.removeEventListener('abort', cancel)
      session?.close()
    }
  }
  return {
    kind: 'STANDALONE_NATIVE_ANALYST_SEMANTIC_EVAL',
    status: signal?.aborted ? 'CANCELLED' : cells.some(cell =>
      cell.status !== 'COMPLETE' && cell.status !== 'SKIP_MODEL_UNCONFIRMED') ?
      'INCOMPLETE' : 'PLAN_FINISHED',
    maxTurns: MAX_TURNS, turns, cases: fixture.cases.length,
    fixtureSha256: digest(JSON.stringify(fixture)),
    softTimeoutMs: TURN_TIMEOUT_MS,
    nativePromptRpcTimeoutMs: NATIVE_PROMPT_RPC_TIMEOUT_MS,
    observedCells: cells.filter(cell => cell.status === 'COMPLETE').length,
    skippedCells: cells.filter(cell => cell.status === 'SKIP_MODEL_UNCONFIRMED').length,
    coarseExpectationMatches: cells.filter(cell =>
      cell.status === 'COMPLETE' && cell.coarseExpectationMatch === true).length,
    prompts: Object.fromEntries(Object.entries(prompts).map(([version, value]) =>
      [version, value.sha256])),
    models: models.map(model => ({ family: model.family, id: model.id,
      confirmed: model.confirmed, source: model.source })),
    cells,
  }
}

module.exports = { MAX_TURNS, TURN_TIMEOUT_MS, derivePriorPrompt, rolePrompts,
  syntheticContext, evaluateText, planCells, runNativeAnalystSemanticEval }
