const assert = require('node:assert/strict')
const { test } = require('node:test')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { createHash } = require('node:crypto')
const {
  COMMAND_ID, RUN_LABEL, confirmedModels, executeNativeCleanEvaluation,
  renderNativeCleanEvaluationHtml,
} = require('../src/native-clean-evaluation-command.cjs')

const WINDOW_ID = 17
const SONNET = 'claude-sonnet-4.5'

function prompt(role, version) {
  return `# ${role}\n\n> Prompt version: \`${version}\`\n`
}

function harness(overrides = {}) {
  let busy = false
  let idleChecks = 0
  let coreIdleChecks = 0
  let released = null
  let inspectionClosed = false
  const written = []
  const messages = []
  const panels = []
  const lease = { signal: new AbortController().signal, assertIdle: () => true,
    release: value => { released = value } }
  const vscode = {
    ProgressLocation: { Notification: 1 }, ViewColumn: { Beside: 2 },
    commands: { registerCommand: (_id, callback) => ({ callback, dispose: () => undefined }) },
    window: {
      showQuickPick: async items => {
        if (items[0].corpusId) return items[0]
        assert.equal(items[0].modelId, SONNET)
        return items[0]
      },
      showWarningMessage: async (message, options, label) => {
        assert.match(message, /8 synthetic/)
        assert.equal(options.modal, true)
        assert.match(options.detail, /retry 0/)
        assert.equal(label, RUN_LABEL)
        return label
      },
      withProgress: async (options, callback) => {
        assert.match(options.title, /8-cell native Analyst/)
        return callback({ report: () => undefined }, {
        isCancellationRequested: false,
        onCancellationRequested: () => ({ dispose: () => undefined }),
        })
      },
      createWebviewPanel: (...args) => {
        const panel = { args, webview: { html: '' } }
        panels.push(panel)
        return panel
      },
      showInformationMessage: async message => { messages.push(message) },
    },
  }
  const deps = {
    isBusy: () => busy,
    setBusy: value => { busy = value },
    getNativeWorker: () => ({ acquireIsolatedEvaluation: async () => lease }),
    packagedRuntime: async () => ({ prompts: {
      EVIDENCE_ANALYST: { text: prompt('Analyst', '1.0.8') },
    } }),
    connectLocalCore: async () => ({ restoreProject: async () => ({
      currentTask: { id: 'task_runtime' },
    }) }),
    configuredConnection: '/synthetic/connection.json',
    currentApprovedBuiltinHelperScope: () => ({ projectId: 'project_runtime',
      workspace: '/synthetic/W', helper: '/synthetic/H' }),
    openProtectedBuiltinH: async (_vscode, options) => {
      assert.equal(options.inspectAnalystModels, true)
      return { modelId: null, windowId: WINDOW_ID,
        analystModels: ['claude-haiku-4.5', SONNET],
        close: () => { inspectionClosed = true } }
    },
    openProtectedHLogBarrier: async () => ({ windowId: WINDOW_ID,
      sessionIdForBarrier: 'sess_barrier' }),
    assertNativeCoreIdle: async () => { coreIdleChecks += 1 },
    assertNativeHelperAblationIdle: async () => { idleChecks += 1
      return { workerIdle: true, backendIdle: true } },
    uiMetadata: () => ({ schemaVersion: 1 }), redactText: value => value,
    createArtifact: async () => ({ path: '/private/tmp/synthetic-metadata.json',
      writeMetadata: async value => { written.push(value) } }),
    runAnalyst: async input => {
      assert.equal(input.model.id, SONNET)
      assert.equal(input.expectedWindowId, WINDOW_ID)
      assert.equal(input.fixture.promptVersion, '1.0.8')
      return { metadata: { status: 'PLAN_FINISHED', deterministicStatus: 'FAILED',
        turns: 8, windowId: WINDOW_ID, promptSha256: 'a'.repeat(64),
        fixtureSha256: 'f'.repeat(64) },
      display: { request_only: 'RAW_ANALYST_MODEL_ANSWER' } }
    },
    ...overrides,
  }
  return { vscode, deps, written, messages, panels,
    get busy() { return busy }, get idleChecks() { return idleChecks },
    get coreIdleChecks() { return coreIdleChecks },
    get released() { return released },
    get inspectionClosed() { return inspectionClosed } }
}

test('orders Sonnet first but accepts only an exact catalog-confirmed selection', () => {
  assert.deepEqual(confirmedModels({ modelId: null, windowId: WINDOW_ID,
    analystModels: ['model-z', SONNET, 'model-a'] }), [SONNET, 'model-a', 'model-z'])
  assert.throws(() => confirmedModels({ modelId: null, windowId: WINDOW_ID,
    analystModels: ['valid', 'bad model'] }), /NATIVE_CLEAN_MODEL_CATALOG_UNCONFIRMED/)
})

test('runs eight Analyst cells and exposes execution separately from a failed quality verdict', async () => {
  const state = harness()
  const result = await executeNativeCleanEvaluation(state.vscode, state.deps)
  assert.equal(result.status, 'PLAN_FINISHED')
  assert.equal(result.metadata.turns, 8)
  assert.equal(result.metadata.maxTurns, 8)
  assert.equal(result.metadata.corpusId, 'SOURCE_FIRST_REGRESSION')
  assert.equal(result.metadata.deterministicStatus, 'FAILED')
  assert.equal(result.metadata.humanReviewStatus, 'NEEDS_REVIEW')
  assert.equal(result.metadata.model.id, SONNET)
  assert.equal(result.metadata.model.configuration, 'NOT_EXPOSED')
  assert.equal(result.metadata.coreMutationCount, 0)
  assert.equal(result.metadata.cellRetryCount, 0)
  assert.equal(result.metadata.finalIdleConfirmed, true)
  assert.equal(state.coreIdleChecks, 1)
  assert.equal(state.idleChecks, 3)
  assert.equal(state.inspectionClosed, true)
  assert.deepEqual(state.released, { resume: false })
  assert.equal(state.busy, false)
  assert.equal(state.written.length, 1)
  assert.equal(JSON.stringify(state.written[0]).includes('RAW_ANALYST_MODEL_ANSWER'), false)
  assert.equal(state.panels.length, 1)
  assert.equal(state.panels[0].args[3].enableScripts, false)
  assert.deepEqual(state.panels[0].args[3].localResourceRoots, [])
  assert.match(state.panels[0].webview.html,
    /default-src &#39;none&#39;|default-src 'none'/)
  assert.match(state.panels[0].webview.html,
    /Execution status:<\/strong> PLAN_FINISHED/)
  assert.match(state.panels[0].webview.html,
    /Deterministic quality verdict:<\/strong> FAILED/)
  assert.match(state.panels[0].webview.html, /NEEDS_REVIEW/)
})

test('records an incomplete Analyst plan without inventing a later phase', async () => {
  const state = harness({ runAnalyst: async () => ({
    metadata: { status: 'INCOMPLETE', deterministicStatus: 'FAILED', turns: 1,
      windowId: WINDOW_ID, promptSha256: 'a'.repeat(64) },
    display: {},
  }) })
  const result = await executeNativeCleanEvaluation(state.vscode, state.deps)
  assert.equal(result.status, 'INCOMPLETE')
  assert.equal(result.metadata.deterministicStatus, 'FAILED')
  assert.equal(result.metadata.turns, 1)
  assert.equal(result.metadata.finalIdleConfirmed, true)
  assert.equal(state.idleChecks, 3)
  assert.deepEqual(state.released, { resume: false })
})

test('releases the lease without waiting for the final informational notification', async () => {
  const state = harness()
  state.vscode.window.showInformationMessage = () => new Promise(() => undefined)
  const timed = Symbol('timed')
  const result = await Promise.race([
    executeNativeCleanEvaluation(state.vscode, state.deps),
    new Promise(resolve => setTimeout(() => resolve(timed), 100)),
  ])
  assert.notEqual(result, timed)
  assert.equal(result.status, 'PLAN_FINISHED')
  assert.deepEqual(state.released, { resume: false })
  assert.equal(state.busy, false)
})

test('records final-idle failure without relabeling a completed plan as success', async () => {
  let checks = 0
  const state = harness({ assertNativeHelperAblationIdle: async () => {
    checks += 1
    if (checks === 3) throw Object.assign(new Error('FINAL_IDLE_FAILED'),
      { code: 'FINAL_IDLE_FAILED' })
    return { workerIdle: true, backendIdle: true }
  } })
  const result = await executeNativeCleanEvaluation(state.vscode, state.deps)
  assert.equal(result.status, 'FAILED')
  assert.equal(result.errorCode, 'FINAL_IDLE_FAILED')
  assert.equal(result.metadata.finalIdleConfirmed, false)
  assert.equal(result.metadata.finalIdleErrorCode, 'FINAL_IDLE_FAILED')
  assert.equal(result.metadata.reloadRequired, true)
  assert.equal(state.written.at(-1).status, 'FAILED')
  assert.deepEqual(state.released, { resume: false })
})

test('escapes and redacts temporary model output in a scripts-disabled-compatible document', () => {
  const html = renderNativeCleanEvaluationHtml({
    metadata: { status: 'PLAN_FINISHED', deterministicStatus: 'FAILED',
      humanReviewStatus: 'NEEDS_REVIEW', model: { id: SONNET,
      configuration: 'NOT_EXPOSED' }, humanReviewCriteria: ['useful difference'] },
    display: { analyst: { case: '<script>unsafe()</script> /private/secret' } },
  }, value => value.replace('/private/secret', '[PATH]'))
  assert.equal(html.includes('<script>'), false)
  assert.match(html, /&lt;script&gt;unsafe\(\)&lt;\/script&gt; \[PATH\]/)
  assert.match(html, /Deterministic quality verdict:<\/strong> FAILED/)
  assert.match(html, /NEEDS_REVIEW/)
})

test('exports the registration id for the P1-owned extension hook', () => {
  assert.equal(COMMAND_ID, 'vibeHelper.nativeCleanEvaluationRun')
})

test('selects only a fixed held-out corpus and includes its provenance in the result', async () => {
  const state = harness({ runAnalyst: async input => {
    assert.equal(input.fixture.fixtureId, 'source-first-held-out-collections-and-requests')
    assert.ok(input.fixture.cases.every(item => item.conceptCandidateMode === 'NONE'))
    return { metadata: { status: 'PLAN_FINISHED', deterministicStatus: 'PASSED', turns: 8,
      windowId: WINDOW_ID, promptSha256: 'a'.repeat(64), fixtureSha256: 'b'.repeat(64) },
    display: {} }
  } })
  state.vscode.window.showQuickPick = async items =>
    items[0].corpusId ? items[1] : items[0]
  const result = await executeNativeCleanEvaluation(state.vscode, state.deps)
  assert.equal(result.metadata.corpusId, 'HELD_OUT_COLLECTIONS_REQUESTS')
  assert.equal(result.metadata.fixtureSha256, 'b'.repeat(64))
  assert.equal(result.metadata.maxTurns, 8)
})

test('unknown corpus and corpus cancellation never acquire a worker or call a model', async () => {
  let workerRequests = 0
  for (const selection of [undefined, { corpusId: 'UNREVIEWED_CORPUS' }]) {
    const state = harness({ getNativeWorker: () => { workerRequests += 1 } })
    state.vscode.window.showQuickPick = async () => selection
    const result = await executeNativeCleanEvaluation(state.vscode, state.deps)
    assert.equal(result.status, selection === undefined ? 'CANCELLED_CORPUS_SELECTION' :
      'FAILED')
    if (selection) assert.equal(result.errorCode, 'NATIVE_CLEAN_CORPUS_UNCONFIRMED')
    assert.equal(state.busy, false)
  }
  assert.equal(workerRequests, 0)
})

test('selects the newly fixed paired corpus without changing the existing two', async () => {
  const state = harness({ runAnalyst: async input => {
    assert.equal(input.fixture.fixtureId, 'paired-held-out-lifetimes-order-and-normalization')
    assert.equal(input.fixture.cases.length, 8)
    return { metadata: { status: 'PLAN_FINISHED', deterministicStatus: 'PASSED', turns: 8,
      windowId: WINDOW_ID, promptSha256: 'a'.repeat(64), fixtureSha256: 'b'.repeat(64) }, display: {} }
  } })
  state.vscode.window.showQuickPick = async items => items[0].corpusId ? items[2] : items[0]
  const result = await executeNativeCleanEvaluation(state.vscode, state.deps)
  assert.equal(result.metadata.corpusId, 'PAIRED_LIFETIMES_ORDER_NORMALIZATION')
})

test('compares the exact archived baseline with the same eight held-out inputs and oracles', async () => {
  const archive = readFileSync(join(__dirname, '../../../tests/eval/fixtures/prompt-regressions/evidence-analyst-v1.0.7-canonical.md'), 'utf8')
  const original = require('../../../tests/eval/fixtures/prompt-regressions/evidence-analyst-v1.0.8-held-out.json')
  const state = harness({ archivedComparisonPrompt: archive, runAnalyst: async input => {
    assert.equal(input.rolePrompt, archive)
    assert.equal(input.fixture.promptVersion, '1.0.7')
    assert.equal(input.fixture.comparisonProtocol, 'SAME_EIGHT_CASES_V1')
    assert.deepEqual(input.fixture.cases, original.cases)
    assert.equal(original.promptVersion, '1.0.8')
    return { metadata: { status: 'PLAN_FINISHED', deterministicStatus: 'FAILED', turns: 8,
      windowId: WINDOW_ID, promptSha256: createHash('sha256').update(archive).digest('hex'),
      fixtureSha256: createHash('sha256').update(JSON.stringify(input.fixture)).digest('hex') }, display: {} }
  } })
  state.vscode.window.showQuickPick = async items => items[0].corpusId ? items[1] :
    items[0].variantId ? items[1] : items[0]
  const result = await executeNativeCleanEvaluation(state.vscode, state.deps)
  assert.equal(result.metadata.promptVersion, '1.0.7')
  assert.equal(result.metadata.promptSource, 'SHA_PINNED_ARCHIVE')
  assert.equal(result.metadata.caseSetSha256, createHash('sha256').update(JSON.stringify(original.cases)).digest('hex'))
  assert.equal(result.metadata.maxTurns, 8)
  assert.equal(result.metadata.finalIdleConfirmed, true)
  assert.equal(result.metadata.coreMutationCount, 0)
  assert.match(result.metadata.kind, /V1_0_7/)
  assert.deepEqual(state.released, { resume: false })
})

test('rejects archive drift and unknown prompt selection before leasing a worker', async () => {
  const archive = readFileSync(join(__dirname, '../../../tests/eval/fixtures/prompt-regressions/evidence-analyst-v1.0.7-canonical.md'), 'utf8')
  let workerRequests = 0
  for (const mode of ['drift', 'unknown', 'cancel']) {
    const state = harness({ archivedComparisonPrompt: mode === 'drift' ? archive + '\n' : archive,
      getNativeWorker: () => { workerRequests++ } })
    state.vscode.window.showQuickPick = async items => items[0].variantId ?
      mode === 'cancel' ? undefined : { variantId: 'UNREVIEWED_PROMPT' } : items[0]
    const result = await executeNativeCleanEvaluation(state.vscode, state.deps)
    assert.equal(result.status, mode === 'cancel' ? 'CANCELLED_PROMPT_SELECTION' : 'FAILED')
    if (mode === 'drift') assert.equal(result.errorCode, 'NATIVE_CLEAN_BASELINE_ARCHIVE_INVALID')
    if (mode === 'unknown') assert.equal(result.errorCode, 'NATIVE_CLEAN_PROMPT_SELECTION_UNCONFIRMED')
  }
  assert.equal(workerRequests, 0)
})
