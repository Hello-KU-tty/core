const { mkdtemp, writeFile } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { createHash } = require('node:crypto')

const fixture = require('../../../tests/eval/fixtures/prompt-regressions/evidence-analyst-v1.0.8-source-first.json')
const heldOutFixture = require('../../../tests/eval/fixtures/prompt-regressions/evidence-analyst-v1.0.8-held-out.json')
const pairedUnseenFixture = require('../../../tests/eval/fixtures/prompt-regressions/evidence-analyst-paired-unseen-20260928.json')
const contracts = require('../../../packages/contracts/dist/index.js')
const { composeNativeProtectedAnalystPrompt } =
  require('../../../apps/local-backend/src/native-protected-prompt.ts')
const { runNativeAnalystCleanSemantics } =
  require('./native-analyst-clean-semantics.cjs')

const COMMAND_ID = 'vibeHelper.nativeCleanEvaluationRun'
const CELL_COUNT = fixture.cases.length
const RUN_LABEL = `Run ${CELL_COUNT} synthetic Analyst cells`
const ARTIFACT_KIND = 'NATIVE_ANALYST_V1_0_8_SOURCE_FIRST_8_CELL'
const ARCHIVED_BASELINE_SHA256 = '0d0c7f132f75f36246b87447d57ff5c6d0b7b9ed4d1eb368e792bdc25cea149c'
const CORPORA = [
  { corpusId: 'SOURCE_FIRST_REGRESSION', label: 'Source-first regression (8 cells)', fixture },
  { corpusId: 'HELD_OUT_COLLECTIONS_REQUESTS', label: 'Held-out collections and requests (8 cells)',
    fixture: heldOutFixture },
  { corpusId: 'PAIRED_LIFETIMES_ORDER_NORMALIZATION', label: 'New paired lifetimes, order and normalization (8 cells)',
    fixture: pairedUnseenFixture },
]
const EXPECTED_PROMPT_VERSIONS = {
  EVIDENCE_ANALYST: '1.0.8',
}
const HUMAN_REVIEW_CRITERIA = [
  'A timeless definition must not become a separate future prediction',
  'A completed action and past observation must not become a separate future prediction',
  'A reasoned choice must rely on the user rationale rather than Agent-authored tradeoffs',
  'A bare recommendation click without user-authored words must produce no Proposal',
  'A concrete independent not-yet-observed result may retain STRONG PREDICTION and ' +
    'DEMONSTRATED support',
  'Claim-profile matches are a fixture oracle, not general model accuracy or human learning',
]

function fail(code) { return Object.assign(new Error(code), { code }) }

function safeCode(error) {
  const value = error?.code ?? error?.message
  return typeof value === 'string' && /^[A-Z][A-Z0-9_]{0,79}$/.test(value) ?
    value : 'NATIVE_CLEAN_EVALUATION_FAILED'
}

function escapeHtml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')
}

function boundedRedacted(value, redact) {
  const text = redact(typeof value === 'string' ? value : '')
  return text.length <= 20_000 ? text : `${text.slice(0, 20_000)}\n[TRUNCATED]`
}

function renderNativeCleanEvaluationHtml(result, redact) {
  const metadata = result?.metadata ?? {}
  const cells = Object.entries(result?.display?.analyst ?? {}).map(([id, text]) =>
    ({ phase: 'Analyst', id, text }))
  const sections = cells.map(cell => `<section><h2>${escapeHtml(cell.phase)} · ` +
    `${escapeHtml(cell.id)}</h2><pre>${escapeHtml(boundedRedacted(cell.text, redact))}</pre>` +
    '<p>Semantic interpretation: NEEDS_REVIEW</p></section>').join('')
  const rubric = (metadata.humanReviewCriteria ?? []).map(item =>
    `<li>${escapeHtml(item)} — NEEDS_REVIEW</li>`).join('')
  return '<!doctype html><html><head><meta charset="utf-8">' +
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; ' +
    'style-src \'unsafe-inline\';"><style>' +
    'body{font-family:system-ui,sans-serif;padding:16px;line-height:1.45}' +
    'pre{white-space:pre-wrap;border:1px solid #888;padding:12px}' +
    'code{word-break:break-all}</style></head><body>' +
    '<h1>Native Analyst claim-temporality evaluation</h1>' +
    `<p><strong>Execution status:</strong> ${escapeHtml(
      metadata.status ?? 'UNKNOWN')}</p>` +
    `<p><strong>Deterministic quality verdict:</strong> ${escapeHtml(
      metadata.deterministicStatus ?? 'UNKNOWN')}</p>` +
    `<p><strong>Review status:</strong> ${escapeHtml(
      metadata.humanReviewStatus ?? 'UNKNOWN')}</p>` +
    `<p>Model: <code>${escapeHtml(metadata.model?.id ?? 'UNCONFIRMED')}</code>; ` +
    `source: ${escapeHtml(metadata.model?.source ?? 'UNCONFIRMED')}; ` +
    `configuration: ${escapeHtml(metadata.model?.configuration ?? 'NOT_EXPOSED')}</p>` +
    `<p>Fixture SHA-256: <code>${escapeHtml(metadata.fixtureSha256 ?? '')}</code></p>` +
    `<p>Corpus: <code>${escapeHtml(metadata.corpusId ?? 'HISTORICAL_FIXED_CORPUS')}</code></p>` +
    `<p>Prompt version/source: <code>${escapeHtml(metadata.promptVersion ?? 'HISTORICAL')} / ` +
    `${escapeHtml(metadata.promptSource ?? 'PACKAGED_CANONICAL')}</code></p>` +
    `<p>Analyst prompt SHA-256: <code>${escapeHtml(
      metadata.analystPromptSha256 ?? '')}</code></p>` +
    '<p>Inputs are synthetic and redacted. Core mutation count is zero. ' +
    'These outputs are not durable Evidence or proof of human learning.</p>' +
    `<h2>Human review rubric</h2><ul>${rubric}</ul>${sections}</body></html>`
}

function composeSyntheticDiscoveryPrompt({ rolePrompt, context, toolMetadata, provenance }) {
  return [
    rolePrompt,
    'Transport adaptation: standalone-native-discovery-clean-eval/0.1.0. ' +
      `${provenance} follows for a read-only, no-tool PREVIEW comparison. ` +
      'Core did not create, query, accept, or store this synthetic Discovery input. ' +
      'Do not call a tool or claim a durable submission. Return exactly one strict JSON ' +
      'object matching the submit_candidate_previews tool input contract.',
    `Synthetic validated Discovery context JSON: ${context}`,
    `Synthetic tool metadata JSON: ${JSON.stringify(toolMetadata)}`,
    'Generate exactly 10 previews under the canonical PREVIEW policy. Copy the synthetic ' +
      'tool metadata fields exactly into the result. Do not wrap the object in inputJson.',
  ].join('\n\n')
}

function promptVersion(text) {
  return text.match(/^> Prompt version: `([^`]+)`$/m)?.[1] ?? null
}

function validateRuntimePrompts(runtime) {
  for (const [role, version] of Object.entries(EXPECTED_PROMPT_VERSIONS)) {
    if (typeof runtime?.prompts?.[role]?.text !== 'string' ||
        promptVersion(runtime.prompts[role].text) !== version)
      throw fail('NATIVE_CLEAN_PACKAGED_PROMPT_INVALID')
  }
}

function confirmedModels(inspection) {
  if (!inspection || inspection.modelId !== null ||
      !Number.isInteger(inspection.windowId) || inspection.windowId <= 0 ||
      !Array.isArray(inspection.analystModels))
    throw fail('NATIVE_CLEAN_MODEL_CATALOG_UNCONFIRMED')
  const unique = [...new Set(inspection.analystModels.filter(model =>
    typeof model === 'string' && /^[a-zA-Z0-9._-]{1,80}$/.test(model)))]
  if (unique.length === 0 || unique.length !== inspection.analystModels.length)
    throw fail('NATIVE_CLEAN_MODEL_CATALOG_UNCONFIRMED')
  return unique.sort((a, b) => {
    if (a === 'claude-sonnet-4.5') return -1
    if (b === 'claude-sonnet-4.5') return 1
    return a.localeCompare(b)
  })
}

async function createPrivateMetadataArtifact() {
  const directory = await mkdtemp(join(tmpdir(), 'vibe-native-clean-eval-'))
  const path = join(directory, 'metadata.json')
  await writeFile(path, JSON.stringify({ status: 'PREPARED' }),
    { flag: 'wx', mode: 0o600 })
  return { path, writeMetadata: value => writeFile(path,
    JSON.stringify(value, null, 2), { mode: 0o600 }) }
}

function validateDependencies(vscode, deps) {
  if (!vscode?.commands?.registerCommand || !vscode?.window?.showQuickPick ||
      !vscode?.window?.showWarningMessage || !vscode?.window?.withProgress ||
      !vscode?.window?.createWebviewPanel || !vscode?.window?.showInformationMessage ||
      vscode?.ProgressLocation?.Notification === undefined ||
      vscode?.ViewColumn?.Beside === undefined ||
      typeof deps?.isBusy !== 'function' || typeof deps?.setBusy !== 'function' ||
      typeof deps?.getNativeWorker !== 'function' ||
      typeof deps?.packagedRuntime !== 'function' ||
      typeof deps?.connectLocalCore !== 'function' ||
      typeof deps?.currentApprovedBuiltinHelperScope !== 'function' ||
      typeof deps?.openProtectedBuiltinH !== 'function' ||
      typeof deps?.openProtectedHLogBarrier !== 'function' ||
      typeof deps?.assertNativeCoreIdle !== 'function' ||
      typeof deps?.assertNativeHelperAblationIdle !== 'function' ||
      typeof deps?.uiMetadata !== 'function' || typeof deps?.redactText !== 'function')
    throw fail('NATIVE_CLEAN_COMMAND_DEPENDENCIES_INVALID')
}

async function executeNativeCleanEvaluation(vscode, deps) {
  validateDependencies(vscode, deps)
  if (deps.isBusy()) return { status: 'BUSY' }
  deps.setBusy(true)
  let lease
  let inspection
  let artifact
  let selectedModelId = null
  let catalogWindowId = null
  let partial = null
  let assertIdle
  let finalIdleAttempted = false
  let finalIdleConfirmed = false
  let corpus = null
  let variant = null
  try {
    const pickedCorpus = await vscode.window.showQuickPick(CORPORA.map(({ corpusId, label }) =>
      ({ corpusId, label })), { placeHolder: 'Choose a fixed synthetic Analyst corpus',
      ignoreFocusOut: true })
    if (!pickedCorpus) return { status: 'CANCELLED_CORPUS_SELECTION' }
    corpus = CORPORA.find(item => item.corpusId === pickedCorpus.corpusId)
    if (!corpus || corpus.fixture.cases.length !== CELL_COUNT ||
        corpus.fixture.promptVersion !== EXPECTED_PROMPT_VERSIONS.EVIDENCE_ANALYST)
      throw fail('NATIVE_CLEAN_CORPUS_UNCONFIRMED')
    const runtime = await deps.packagedRuntime()
    validateRuntimePrompts(runtime)
    variant = { variantId: 'PACKAGED', label: 'Current v1.0.8 (packaged; quality limitations remain)',
      version: '1.0.8', source: 'PACKAGED_CANONICAL', text: runtime.prompts.EVIDENCE_ANALYST.text }
    if (deps.archivedComparisonPrompt !== undefined) {
      const archived = deps.archivedComparisonPrompt
      if (typeof archived !== 'string' || promptVersion(archived) !== '1.0.7' ||
          createHash('sha256').update(archived).digest('hex') !== ARCHIVED_BASELINE_SHA256)
        throw fail('NATIVE_CLEAN_BASELINE_ARCHIVE_INVALID')
      const variants = [variant, { variantId: 'ARCHIVED_BASELINE',
        label: 'Baseline v1.0.7 (SHA-pinned archive; same 8 inputs)', version: '1.0.7',
        source: 'SHA_PINNED_ARCHIVE', text: archived }]
      const selected = await vscode.window.showQuickPick(variants.map(({ variantId, label }) =>
        ({ variantId, label })), { placeHolder: 'Choose one prompt; input/oracle stay unchanged',
        ignoreFocusOut: true })
      if (!selected) return { status: 'CANCELLED_PROMPT_SELECTION' }
      variant = variants.find(item => item.variantId === selected.variantId)
      if (!variant) throw fail('NATIVE_CLEAN_PROMPT_SELECTION_UNCONFIRMED')
    }
    const selectedFixture = variant.variantId === 'ARCHIVED_BASELINE' ? {
      ...corpus.fixture, promptVersion: variant.version,
      comparisonProtocol: 'SAME_EIGHT_CASES_V1',
    } : corpus.fixture
    const scope = deps.currentApprovedBuiltinHelperScope(vscode)
    const client = await deps.connectLocalCore(deps.configuredConnection)
    const snapshot = await client.restoreProject(scope.projectId)
    if (!snapshot?.currentTask?.id) throw fail('NATIVE_CLEAN_TASK_REQUIRED')
    await deps.assertNativeCoreIdle(client, scope.projectId, snapshot.currentTask.id,
      deps.uiMetadata)
    const worker = deps.getNativeWorker()
    if (!worker?.acquireIsolatedEvaluation)
      throw fail('NATIVE_CLEAN_WORKER_UNAVAILABLE')
    lease = await worker.acquireIsolatedEvaluation()
    assertIdle = () => deps.assertNativeHelperAblationIdle(client, lease,
      scope.projectId, snapshot.currentTask.id, deps.uiMetadata)
    await assertIdle()
    try {
      inspection = await deps.openProtectedBuiltinH(vscode, { ...scope,
        redactText: deps.redactText, inspectAnalystModels: true })
      const models = confirmedModels(inspection)
      catalogWindowId = inspection.windowId
      const picked = await vscode.window.showQuickPick(models.map(id => ({
        label: id, description: id === 'claude-sonnet-4.5' ? 'Preferred if selected' : undefined,
        modelId: id,
      })), { placeHolder: `Choose one exact catalog-confirmed model for all ${CELL_COUNT} cells`,
        ignoreFocusOut: true })
      if (picked) {
        selectedModelId = picked.modelId
        if (!models.includes(selectedModelId))
          throw fail('NATIVE_CLEAN_MODEL_SELECTION_UNCONFIRMED')
      }
    } finally { inspection?.close() }
    inspection = null
    await assertIdle()
    if (selectedModelId === null) return { status: 'CANCELLED_MODEL_SELECTION' }
    const confirmation = await vscode.window.showWarningMessage(
      `Run at most ${CELL_COUNT} synthetic, read-only native Analyst cells?`,
      { modal: true, detail: `${corpus.label}. ${variant.label}. One exact model; fresh protected H per cell; retry 0; ` +
        'Core mutation 0. Outputs require review and are not human Evidence.' }, RUN_LABEL)
    if (confirmation !== RUN_LABEL) return { status: 'CANCELLED_EXPLICIT_RUN' }
    artifact = await (deps.createArtifact ?? createPrivateMetadataArtifact)()
    const model = { id: selectedModelId, confirmed: true, source: 'IDE_CONFIG_OPTION',
      configuration: 'NOT_EXPOSED' }
    const result = await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: `Vibe Helper: ${CELL_COUNT}-cell native Analyst evaluation`, cancellable: true,
    }, async (progress, token) => {
      const cancelled = new AbortController()
      const cancel = () => cancelled.abort()
      const listener = token.onCancellationRequested(cancel)
      lease.signal.addEventListener('abort', cancel, { once: true })
      if (token.isCancellationRequested || lease.signal.aborted) cancel()
      const common = {
        model, expectedWindowId: catalogWindowId,
        scope, assertIdle,
        openSession: (ownedScope, modelId) => deps.openProtectedBuiltinH(vscode,
          { ...ownedScope, redactText: deps.redactText, analystModelId: modelId }),
        openBarrier: ownedScope => deps.openProtectedHLogBarrier(vscode, ownedScope),
        signal: cancelled.signal,
      }
      try {
        const analyst = await (deps.runAnalyst ?? runNativeAnalystCleanSemantics)({
          ...common, fixture: selectedFixture, contracts,
          rolePrompt: variant.text,
          composeAnalystPrompt: composeNativeProtectedAnalystPrompt,
          onCell: cell => progress.report({ message: `Analyst ${cell.caseId} ${cell.status}` }),
        })
        return { analyst }
      } finally {
        listener.dispose()
        lease.signal.removeEventListener('abort', cancel)
      }
    })
    partial = result
    finalIdleAttempted = true
    await assertIdle()
    finalIdleConfirmed = true
    const analystMetadata = result.analyst.metadata
    const metadata = {
      kind: variant.variantId === 'ARCHIVED_BASELINE' ? 'NATIVE_ANALYST_V1_0_7_PAIRED_8_CELL' : ARTIFACT_KIND,
      corpusId: corpus.corpusId,
      promptVersion: variant.version, promptSource: variant.source,
      sourceCorpusSha256: createHash('sha256').update(JSON.stringify(corpus.fixture)).digest('hex'),
      caseSetSha256: createHash('sha256').update(JSON.stringify(corpus.fixture.cases)).digest('hex'),
      status: analystMetadata.status,
      deterministicStatus: analystMetadata.deterministicStatus,
      humanReviewStatus: 'NEEDS_REVIEW',
      humanReviewCriteria: HUMAN_REVIEW_CRITERIA,
      provenance: 'SYNTHETIC_REDACTED_EVAL_INPUT', coreMutationCount: 0,
      cellRetryCount: 0, maxTurns: CELL_COUNT,
      turns: analystMetadata.turns, reloadRequired: true,
      model, windowId: analystMetadata.windowId,
      fixtureSha256: analystMetadata.fixtureSha256,
      analystPromptSha256: analystMetadata.promptSha256,
      analyst: analystMetadata,
      finalIdleConfirmed,
    }
    await artifact.writeMetadata(metadata)
    const display = { analyst: result.analyst.display }
    const panel = vscode.window.createWebviewPanel('vibeHelper.nativeCleanEvaluation',
      'Native Clean Evaluation', vscode.ViewColumn.Beside,
      { enableScripts: false, retainContextWhenHidden: false, localResourceRoots: [] })
    panel.webview.html = renderNativeCleanEvaluationHtml({ metadata, display }, deps.redactText)
    void vscode.window.showInformationMessage(`NATIVE_CLEAN_EVALUATION ` +
      `execution=${metadata.status} quality=${metadata.deterministicStatus} ` +
      `turns=${metadata.turns} review=${metadata.humanReviewStatus} ` +
      `reloadRequired=true artifact=${artifact.path}`)
    return { status: metadata.status, artifactPath: artifact.path, metadata }
  } catch (error) {
    const errorCode = safeCode(error)
    let finalIdleErrorCode = finalIdleAttempted && !finalIdleConfirmed ? errorCode : null
    if (!finalIdleAttempted && assertIdle) {
      finalIdleAttempted = true
      try {
        await assertIdle()
        finalIdleConfirmed = true
      } catch (idleError) {
        finalIdleErrorCode = safeCode(idleError)
      }
    }
    const metadata = { kind: ARTIFACT_KIND,
      corpusId: corpus?.corpusId ?? null,
      promptVersion: variant?.version ?? null, promptSource: variant?.source ?? null,
      status: 'FAILED', deterministicStatus: 'FAILED',
      errorCode, provenance: 'SYNTHETIC_REDACTED_EVAL_INPUT',
      coreMutationCount: 0, cellRetryCount: 0, maxTurns: CELL_COUNT,
      selectedModelId, humanReviewStatus: 'BLOCKED_BY_EXECUTION_FAILURE',
      reloadRequired: Boolean(lease), finalIdleConfirmed,
      ...(finalIdleErrorCode === null ? {} : { finalIdleErrorCode }),
      ...(partial === null ? {} : {
        analyst: partial.analyst?.metadata ?? null,
      }) }
    await artifact?.writeMetadata(metadata).catch(() => undefined)
    void vscode.window.showInformationMessage(`NATIVE_CLEAN_EVALUATION ${errorCode} ` +
      `reloadRequired=${Boolean(lease)}${artifact ? ` artifact=${artifact.path}` : ''}`)
    return { status: 'FAILED', errorCode, artifactPath: artifact?.path ?? null, metadata }
  } finally {
    inspection?.close()
    lease?.release({ resume: false })
    deps.setBusy(false)
  }
}

function registerNativeCleanEvaluationCommand(vscode, deps) {
  validateDependencies(vscode, deps)
  return vscode.commands.registerCommand(COMMAND_ID,
    () => executeNativeCleanEvaluation(vscode, deps))
}

module.exports = {
  COMMAND_ID, RUN_LABEL, HUMAN_REVIEW_CRITERIA,
  composeSyntheticDiscoveryPrompt, confirmedModels,
  createPrivateMetadataArtifact, executeNativeCleanEvaluation,
  registerNativeCleanEvaluationCommand, renderNativeCleanEvaluationHtml,
}
