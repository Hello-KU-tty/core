const MODEL_ID = 'claude-sonnet-4.5'
const MAX_TURNS = 2
const SOFT_TIMEOUT_MS = 60_000
// The native client separately bounds prompt RPC at 240 s. This is a soft
// cancellation deadline, not a 60 s hard wall-clock guarantee.
const NATIVE_PROMPT_RPC_TIMEOUT_MS = 240_000
const CAPTURE_MAX_AGE_MS = 15 * 60_000
const PROMPT_MAX_BYTES = 400_000
const QUESTION_MARKER = '\n\nExact user question: '
const REFRESH_MARKER = '\n\nContext refresh request status: '
const CONTEXT_MARKER = '\n\nValidated Core Helper context JSON: '
const PAIRED_CONTEXT_MARKER = '\n\nPaired evaluation Helper context JSON: '
const PAIRED_NOTICE = '\n\nStandalone paired evaluation: this context derives from the ' +
  'completed UI Helper turn. An omitted field, if any, is an evaluation-only ' +
  'ablation, not a new Core query or a Core no-evidence finding.'

function fail(code) { return Object.assign(new Error(code), { code }) }

function safeCode(error) {
  const value = error?.code ?? error?.message
  return typeof value === 'string' && /^[A-Z][A-Z0-9_]{0,79}$/.test(value) ?
    value : 'HELPER_ABLATION_CELL_FAILED'
}

function strictTime(value) {
  if (typeof value !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value))
    return NaN
  const time = Date.parse(value)
  return Number.isFinite(time) && new Date(time).toISOString() === value ? time : NaN
}

function validateCapture(capture, scope, now = Date.now()) {
  if (!capture || typeof capture !== 'object' || Array.isArray(capture) ||
      typeof scope?.projectId !== 'string' ||
      capture.projectId !== scope.projectId ||
      typeof capture.taskId !== 'string' ||
      typeof capture.correlationId !== 'string' ||
      typeof capture.nativeJobId !== 'string' ||
      !/^native_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
        capture.nativeJobId) ||
      !Number.isInteger(capture.uiWindowId) || capture.uiWindowId <= 0 ||
      typeof capture.prompt !== 'string' || !capture.prompt.trim() ||
      Buffer.byteLength(capture.prompt, 'utf8') > PROMPT_MAX_BYTES)
    throw fail('HELPER_ABLATION_CAPTURE_INVALID')
  const capturedAt = strictTime(capture.capturedAt)
  const expiresAt = strictTime(capture.expiresAt)
  if (!Number.isFinite(capturedAt) || !Number.isFinite(expiresAt) ||
      capturedAt > now + 5000 || expiresAt <= capturedAt ||
      expiresAt - capturedAt > CAPTURE_MAX_AGE_MS || now >= expiresAt)
    throw fail('HELPER_ABLATION_CAPTURE_EXPIRED')
}

function parseCapturedPrompt(capture, contracts) {
  if (typeof contracts?.helperContextSchema?.parse !== 'function')
    throw fail('HELPER_ABLATION_CONTRACT_UNAVAILABLE')
  const prompt = capture.prompt
  const questionAt = prompt.lastIndexOf(QUESTION_MARKER)
  const refreshAt = prompt.lastIndexOf(REFRESH_MARKER)
  const contextAt = prompt.lastIndexOf(CONTEXT_MARKER)
  if (questionAt < 0 || refreshAt <= questionAt || contextAt <= refreshAt ||
      prompt.indexOf(CONTEXT_MARKER, contextAt + CONTEXT_MARKER.length) !== -1)
    throw fail('HELPER_ABLATION_PROMPT_BOUNDARY_INVALID')
  const question = prompt.slice(questionAt + QUESTION_MARKER.length, refreshAt)
  const refresh = prompt.slice(refreshAt + REFRESH_MARKER.length, contextAt)
  if (!question.trim() || !/^(NOT_NEEDED|REQUESTED|UNAVAILABLE)\.$/.test(refresh))
    throw fail('HELPER_ABLATION_PROMPT_BOUNDARY_INVALID')
  const contextJson = prompt.slice(contextAt + CONTEXT_MARKER.length)
  let rawContext
  let context
  try {
    rawContext = JSON.parse(contextJson)
    context = contracts.helperContextSchema.parse(rawContext)
  } catch { throw fail('HELPER_ABLATION_CONTEXT_SCHEMA_INVALID') }
  if (context.project.id !== capture.projectId ||
      context.task.id !== capture.taskId ||
      context.task.projectId !== capture.projectId ||
      context.learningSpec.projectId !== capture.projectId ||
      context.correlationId !== capture.correlationId ||
      context.personalization.projectId !== capture.projectId ||
      context.personalization.target.kind !== 'HELPER_TURN' ||
      context.personalization.target.taskId !== capture.taskId)
    throw fail('HELPER_ABLATION_CONTEXT_SCOPE_MISMATCH')
  if (context.personalization.mode !== 'EVIDENCE_AWARE' ||
      context.personalization.basis.length === 0 ||
      context.relevantLedgerEntries.length === 0)
    throw fail('HELPER_ABLATION_NO_RELEVANT_BASIS')
  const { personalization, relevantLedgerEntries } = context
  // Work from the validated source JSON, not a schema-normalized projection,
  // so A' retains the captured Core context and B changes only two fields.
  const withoutEvidence = { ...rawContext }
  delete withoutEvidence.personalization
  delete withoutEvidence.relevantLedgerEntries
  // Core issues this purpose only for task-lineage USER_UNDERSTANDING evidence.
  // The prompt alone cannot classify evidence kinds for other basis purposes.
  const lineageBasisCount = personalization.basis.filter(basis =>
    basis.purpose === 'HELPER_TASK_USER_EVIDENCE_CONNECTION').length
  if (lineageBasisCount === 0)
    throw fail('HELPER_ABLATION_NO_TASK_LINEAGE_BASIS')
  const sharedPrefix = `${prompt.slice(0, contextAt)}${PAIRED_NOTICE}` +
    PAIRED_CONTEXT_MARKER
  const aPrime = sharedPrefix + contextJson
  const ablated = sharedPrefix + JSON.stringify(withoutEvidence)
  if (Buffer.byteLength(aPrime, 'utf8') > PROMPT_MAX_BYTES ||
      Buffer.byteLength(ablated, 'utf8') > PROMPT_MAX_BYTES)
    throw fail('HELPER_ABLATION_PROMPT_TOO_LARGE')
  return {
    prompts: [aPrime, ablated],
    metadata: {
      questionSame: true,
      contextFieldAblation: ['personalization', 'relevantLedgerEntries'],
      originalBasisCount: personalization.basis.length,
      lineageBasisCount,
      otherBasisCountUnclassified: personalization.basis.length - lineageBasisCount,
      originalLedgerCount: relevantLedgerEntries.length,
      freshnessStatus: context.freshness.status,
      refreshStatus: refresh.slice(0, -1),
    },
  }
}

function emit(onCell, cell) {
  try { onCell?.(cell) }
  catch { /* Progress UI cannot change a protected evaluation verdict. */ }
}

async function runNativeHelperAblation(input) {
  const { capture, scope, openSession, openBarrier, assertIdle, onCell, signal } = input ?? {}
  if (typeof openSession !== 'function' || typeof openBarrier !== 'function' ||
      typeof assertIdle !== 'function' ||
      (onCell !== undefined && typeof onCell !== 'function'))
    throw fail('HELPER_ABLATION_DEPENDENCIES_INVALID')
  const now = input.now ?? Date.now
  if (typeof now !== 'function') throw fail('HELPER_ABLATION_CLOCK_INVALID')
  validateCapture(capture, scope, now())
  const contracts = input.contracts ?? await import('../../../packages/contracts/dist/index.js')
  const { prompts, metadata } = parseCapturedPrompt(capture, contracts)
  const armSoftTimeout = input.armSoftTimeout ?? (onTimeout => {
    const timer = setTimeout(onTimeout, SOFT_TIMEOUT_MS)
    return () => clearTimeout(timer)
  })
  if (typeof armSoftTimeout !== 'function')
    throw fail('HELPER_ABLATION_DEADLINE_INVALID')
  const cells = []
  const display = { aPrimeText: null, bText: null }
  let turns = 0
  for (const [index, variant] of ['A_PRIME', 'B_ABLATED'].entries()) {
    if (signal?.aborted) break
    if (turns >= MAX_TURNS) throw fail('HELPER_ABLATION_TURN_BUDGET_EXCEEDED')
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
        throw fail('HELPER_ABLATION_NOT_IDLE')
      if (now() >= strictTime(capture.expiresAt))
        throw fail('HELPER_ABLATION_CAPTURE_EXPIRED')
      session = await openSession(scope, MODEL_ID)
      if (session?.modelId !== MODEL_ID ||
          session?.windowId !== capture.uiWindowId ||
          typeof session?.attestAfterBarrier !== 'function' ||
          typeof session?.prompt !== 'function' ||
          typeof session?.close !== 'function')
        throw fail('HELPER_ABLATION_MODEL_OR_WINDOW_UNCONFIRMED')
      const barrier = await openBarrier(scope)
      if (barrier?.windowId !== session.windowId ||
          typeof barrier?.sessionIdForBarrier !== 'string')
        throw fail('HELPER_ABLATION_BARRIER_INVALID')
      await session.attestAfterBarrier(barrier.sessionIdForBarrier)
      idle = await assertIdle()
      if (idle?.workerIdle !== true || idle?.backendIdle !== true)
        throw fail('HELPER_ABLATION_NOT_IDLE')
      if (now() >= strictTime(capture.expiresAt))
        throw fail('HELPER_ABLATION_CAPTURE_EXPIRED')
      if (turnSignal.signal.aborted) throw fail('HELPER_ABLATION_CANCELLED')
      promptStarted = Date.now()
      disarmSoftTimeout = armSoftTimeout(() => { softTimedOut = true; cancel() })
      if (typeof disarmSoftTimeout !== 'function')
        throw fail('HELPER_ABLATION_DEADLINE_INVALID')
      if (turnSignal.signal.aborted)
        throw fail('HELPER_ABLATION_SOFT_TIMEOUT_PREPROMPT')
      turns += 1
      const response = await session.prompt(prompts[index], undefined, turnSignal.signal)
      if (softTimedOut || Date.now() - promptStarted >= SOFT_TIMEOUT_MS)
        throw fail('HELPER_ABLATION_SOFT_TIMEOUT_RACED')
      if (signal?.aborted) throw fail('HELPER_ABLATION_CANCEL_RACED')
      if (response?.stopReason !== 'end_turn' ||
          typeof response?.text !== 'string' || !response.text.trim())
        throw fail('HELPER_ABLATION_TURN_INCOMPLETE')
      if (index === 0) display.aPrimeText = response.text
      else display.bText = response.text
      const completed = { variant, status: 'COMPLETE', modelId: MODEL_ID,
        windowId: session.windowId, elapsedMs: Math.max(0, Date.now() - started),
        modelElapsedMs: Math.max(0, Date.now() - promptStarted),
        answerPresent: true }
      cells.push(completed)
      emit(onCell, completed)
    } catch (error) {
      const code = safeCode(error)
      const failed = { variant, status: softTimedOut &&
        code === 'NATIVE_H_CANCELLED_CONFIRMED' ? 'SOFT_TIMEOUT_CONFIRMED' : 'FAILED',
      modelId: MODEL_ID, windowId: session?.windowId ?? null,
      elapsedMs: Math.max(0, Date.now() - started),
      ...(promptStarted === null ? {} :
        { modelElapsedMs: Math.max(0, Date.now() - promptStarted) }),
      softDeadlineExceeded: softTimedOut, errorCode: code }
      cells.push(failed)
      emit(onCell, failed)
      // Even a confirmed cancellation stops this paired comparison.
      break
    } finally {
      disarmSoftTimeout?.()
      signal?.removeEventListener('abort', cancel)
      session?.close()
    }
  }
  return {
    metadata: {
      kind: 'STANDALONE_NATIVE_HELPER_CONTEXT_ABLATION',
      interpretation: 'EXPLORATORY_COMPARISON_NOT_CAUSAL_PROOF',
      pairedWrapperIdentical: true,
      pairedPromptsDifferOnlyTwoContextFields: true,
      aPrimeCoreContextExact: true,
      uiAPromptByteExactReplayed: false,
      status: signal?.aborted ? 'CANCELLED' :
        cells.length === MAX_TURNS && cells.every(cell => cell.status === 'COMPLETE') ?
          'PAIR_FINISHED' : 'INCOMPLETE',
      projectId: capture.projectId, taskId: capture.taskId,
      correlationId: capture.correlationId, sourceNativeJobId: capture.nativeJobId,
      sourceUiWindowId: capture.uiWindowId, sourceCapturedAt: capture.capturedAt,
      uiAModelSelection: 'NOT_CONTROLLED_BY_THIS_EVAL',
      pairedModelId: MODEL_ID, maxStandaloneTurns: MAX_TURNS, turns,
      softTimeoutMs: SOFT_TIMEOUT_MS,
      nativePromptRpcTimeoutMs: NATIVE_PROMPT_RPC_TIMEOUT_MS,
      ...metadata, cells,
    },
    // Display text is intentionally separate from artifact/progress metadata.
    // Callers may show it only in the same-window temporary read-only UI.
    display,
  }
}

module.exports = { MODEL_ID, MAX_TURNS, SOFT_TIMEOUT_MS, validateCapture,
  parseCapturedPrompt, runNativeHelperAblation }
