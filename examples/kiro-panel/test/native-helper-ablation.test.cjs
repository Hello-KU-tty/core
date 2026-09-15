const assert = require('node:assert/strict')
const { test } = require('node:test')
const { MODEL_ID, parseCapturedPrompt, runNativeHelperAblation } =
  require('../src/native-helper-ablation.cjs')

const CONTEXT_MARKER = '\n\nValidated Core Helper context JSON: '
const PAIRED_MARKER = '\n\nPaired evaluation Helper context JSON: '
const SOURCE_JOB = 'native_00000000-0000-4000-8000-000000000101'
const WINDOW_ID = 4

async function sample() {
  const [contracts, fixtures] = await Promise.all([
    import('../../../packages/contracts/dist/index.js'),
    import('../../../packages/contracts/test/fixtures.ts'),
  ])
  const basis = {
    conceptId: fixtures.ids.concept, conceptName: 'Discriminated union',
    ledgerRevision: 1, state: 'DEMONSTRATED',
    evidenceIds: [fixtures.ids.evidence], episodeIds: [fixtures.ids.episode],
    sourceProjectIds: [fixtures.ids.project],
    sourceProjectTitles: [fixtures.projectFixture.title], openIssueIds: [],
    purpose: 'HELPER_TASK_USER_EVIDENCE_CONNECTION',
    redactedEvidenceExcerpt: 'The user explained how the variant narrows.',
  }
  const context = contracts.helperContextSchema.parse({
    schemaVersion: 1, correlationId: fixtures.ids.correlation,
    project: fixtures.projectFixture,
    learningSpec: fixtures.confirmedLearningSpecFixture,
    task: fixtures.builderTaskFixture, liveContext: null,
    activeDecisions: [], focusedDecision: null,
    relevantLedgerEntries: [fixtures.conceptLedgerFixture],
    personalization: {
      ...fixtures.helperPersonalizationFixture, mode: 'EVIDENCE_AWARE',
      basis: [basis], fallbackReason: undefined,
    },
    recentEpisodes: [], contextReferences: [], referenceDetails: [],
    sourceExcerpts: [], pendingContextRefreshRequests: [],
    freshness: { currentContextVersion: null, observedContextVersion: null,
      status: 'MISSING', stale: false, refreshRequired: false },
  })
  const question = '왜 이 코드에서 variant가 좁혀지나요?'
  const prompt = `# Helper role\n\nTransport adaptation: native-builtin-helper/0.1.0. ` +
    `Core supplied context.\n\nExact user question: ${question}` +
    '\n\nContext refresh request status: NOT_NEEDED.' +
    `${CONTEXT_MARKER}${JSON.stringify(context)}`
  const now = Date.now()
  const capture = {
    projectId: fixtures.ids.project, taskId: fixtures.ids.task,
    correlationId: fixtures.ids.correlation, nativeJobId: SOURCE_JOB,
    prompt, uiWindowId: WINDOW_ID,
    capturedAt: new Date(now - 1000).toISOString(),
    expiresAt: new Date(now + 10 * 60_000).toISOString(),
  }
  return { contracts, context, question, prompt, capture,
    scope: { projectId: fixtures.ids.project, workspace: '/synthetic/W',
      helper: '/synthetic/H' } }
}

function fakeHost(responses = ['A answer', 'B answer']) {
  const prompts = []
  const sessions = []
  let idleChecks = 0
  return {
    prompts, sessions, get idleChecks() { return idleChecks },
    openSession: async (_scope, modelId) => {
      assert.equal(modelId, MODEL_ID)
      const index = sessions.length
      const session = {
        modelId, windowId: WINDOW_ID, closed: false, attested: false,
        attestAfterBarrier: async id => {
          assert.match(id, /^sess_/)
          session.attested = true
        },
        prompt: async (text, _onUpdate, signal) => {
          assert.equal(session.attested, true)
          assert.equal(signal.aborted, false)
          prompts.push(text)
          return { text: responses[index], stopReason: 'end_turn' }
        },
        close: () => { session.closed = true },
      }
      sessions.push(session)
      return session
    },
    openBarrier: async () => ({ windowId: WINDOW_ID,
      sessionIdForBarrier: 'sess_00000000-0000-4000-8000-000000000102' }),
    assertIdle: async () => { idleChecks += 1
      return { workerIdle: true, backendIdle: true } },
  }
}

test('replays the captured Core context in a shared wrapper and removes only two fields for B', async () => {
  const { capture, scope, contracts, question, prompt } = await sample()
  const host = fakeHost()
  const progress = []
  const result = await runNativeHelperAblation({ capture, scope, contracts,
    ...host, onCell: cell => progress.push(cell) })
  assert.equal(host.prompts.length, 2)
  assert.notEqual(host.prompts[0], prompt)
  assert.equal(host.sessions.length, 2)
  assert.ok(host.sessions.every(session => session.closed && session.attested))
  assert.equal(host.idleChecks, 4)
  const pairedAtA = host.prompts[0].lastIndexOf(PAIRED_MARKER)
  const pairedAtB = host.prompts[1].lastIndexOf(PAIRED_MARKER)
  assert.ok(pairedAtA > 0 && pairedAtB > 0)
  const pairedPrefixA = host.prompts[0].slice(0, pairedAtA + PAIRED_MARKER.length)
  const pairedPrefixB = host.prompts[1].slice(0, pairedAtB + PAIRED_MARKER.length)
  assert.equal(pairedPrefixA, pairedPrefixB)
  assert.ok(pairedPrefixA.startsWith(prompt.split(CONTEXT_MARKER)[0]))
  assert.match(pairedPrefixA, /Standalone paired evaluation:/)
  assert.match(pairedPrefixA, /not a new Core query or a Core no-evidence finding/)
  assert.match(pairedPrefixA, new RegExp(`Exact user question: ${question}`))
  const sourceJson = prompt.split(CONTEXT_MARKER)[1]
  const aPrimeJson = host.prompts[0].slice(pairedAtA + PAIRED_MARKER.length)
  const bJson = host.prompts[1].slice(pairedAtB + PAIRED_MARKER.length)
  assert.equal(aPrimeJson, sourceJson)
  assert.deepEqual(JSON.parse(aPrimeJson), JSON.parse(sourceJson))
  const ablated = JSON.parse(bJson)
  const expected = { ...JSON.parse(aPrimeJson) }
  delete expected.personalization
  delete expected.relevantLedgerEntries
  assert.deepEqual(ablated, expected)
  assert.equal('personalization' in ablated, false)
  assert.equal('relevantLedgerEntries' in ablated, false)
  assert.equal(result.metadata.status, 'PAIR_FINISHED')
  assert.equal(result.metadata.turns, 2)
  assert.equal(result.metadata.originalBasisCount, 1)
  assert.equal(result.metadata.lineageBasisCount, 1)
  assert.equal(result.metadata.otherBasisCountUnclassified, 0)
  assert.equal(result.metadata.softTimeoutMs, 60_000)
  assert.equal(result.metadata.originalLedgerCount, 1)
  assert.equal(result.metadata.uiAModelSelection, 'NOT_CONTROLLED_BY_THIS_EVAL')
  assert.equal(result.metadata.interpretation, 'EXPLORATORY_COMPARISON_NOT_CAUSAL_PROOF')
  assert.equal(result.metadata.pairedWrapperIdentical, true)
  assert.equal(result.metadata.pairedPromptsDifferOnlyTwoContextFields, true)
  assert.equal(result.metadata.aPrimeCoreContextExact, true)
  assert.equal(result.metadata.uiAPromptByteExactReplayed, false)
  assert.deepEqual(result.display, { aPrimeText: 'A answer', bText: 'B answer' })
  assert.equal(JSON.stringify(result.metadata).includes('A answer'), false)
  assert.equal(JSON.stringify(progress).includes('B answer'), false)
  assert.equal(JSON.stringify(result.metadata).includes(question), false)
})

test('keeps the source Core JSON bytes in A prime when its formatting differs', async () => {
  const { capture, contracts, context } = await sample()
  const sourceJson = JSON.stringify(context, null, 2)
  const changed = { ...capture, prompt: capture.prompt.split(CONTEXT_MARKER)[0] +
    CONTEXT_MARKER + sourceJson }
  const { prompts } = parseCapturedPrompt(changed, contracts)
  const aAt = prompts[0].lastIndexOf(PAIRED_MARKER)
  const bAt = prompts[1].lastIndexOf(PAIRED_MARKER)
  assert.equal(prompts[0].slice(aAt + PAIRED_MARKER.length), sourceJson)
  assert.equal(prompts[0].slice(0, aAt), prompts[1].slice(0, bAt))
  const expected = JSON.parse(sourceJson)
  delete expected.personalization
  delete expected.relevantLedgerEntries
  assert.deepEqual(JSON.parse(prompts[1].slice(bAt + PAIRED_MARKER.length)), expected)
})

test('rejects expired and project, task, or correlation mismatches before any H session', async () => {
  const { capture, scope, contracts } = await sample()
  const host = fakeHost()
  const invalid = [
    [{ ...capture, projectId: 'project_other' }, 'CAPTURE_INVALID'],
    [{ ...capture, expiresAt: new Date(Date.now() - 1000).toISOString() },
      'CAPTURE_EXPIRED'],
    [{ ...capture, taskId: 'task_00000000-0000-4000-8000-000000000998' },
      'CONTEXT_SCOPE_MISMATCH'],
    [{ ...capture, correlationId: 'corr_00000000-0000-4000-8000-000000000999' },
      'CONTEXT_SCOPE_MISMATCH'],
  ]
  for (const [changed, code] of invalid) {
    await assert.rejects(runNativeHelperAblation({ capture: changed, scope,
      contracts, ...host }), new RegExp(`HELPER_ABLATION_${code}`))
  }
  assert.equal(host.sessions.length, 0)
})

test('refuses malformed or no-basis context rather than inventing a Core fallback trace', async () => {
  const { capture, scope, contracts, context } = await sample()
  const missing = { ...context,
    personalization: { ...context.personalization, mode: 'NO_RELEVANT_EVIDENCE',
      basis: [], fallbackReason: 'NO_RELEVANT_CONCEPT' },
    relevantLedgerEntries: [] }
  const noBasisCapture = { ...capture,
    prompt: capture.prompt.split(CONTEXT_MARKER)[0] +
      CONTEXT_MARKER + JSON.stringify(missing) }
  assert.throws(() => parseCapturedPrompt(noBasisCapture, contracts),
    /HELPER_ABLATION_NO_RELEVANT_BASIS/)
  const malformed = { ...capture, prompt: capture.prompt.replace('{"schemaVersion"', '{broken') }
  const host = fakeHost()
  await assert.rejects(runNativeHelperAblation({ capture: malformed, scope,
    contracts, ...host }), /HELPER_ABLATION_CONTEXT_SCHEMA_INVALID/)
  assert.equal(host.sessions.length, 0)
})

test('lexical-only basis does not spend turns in a task-lineage comparison', async () => {
  const { capture, scope, contracts, context } = await sample()
  const lexical = { ...context, personalization: {
    ...context.personalization,
    basis: [{ ...context.personalization.basis[0],
      purpose: 'HELPER_EXPLANATION_START' }],
  } }
  const changed = { ...capture, prompt: capture.prompt.split(CONTEXT_MARKER)[0] +
    CONTEXT_MARKER + JSON.stringify(lexical) }
  const host = fakeHost()
  await assert.rejects(runNativeHelperAblation({ capture: changed, scope,
    contracts, ...host }), /HELPER_ABLATION_NO_TASK_LINEAGE_BASIS/)
  assert.equal(host.sessions.length, 0)
})

test('fails closed on idle and model/window attestation without making a prompt', async () => {
  const { capture, scope, contracts } = await sample()
  const host = fakeHost()
  const idle = await runNativeHelperAblation({ capture, scope, contracts,
    ...host, assertIdle: async () => ({ workerIdle: true, backendIdle: false }) })
  assert.equal(idle.metadata.turns, 0)
  assert.equal(idle.metadata.cells[0].errorCode, 'HELPER_ABLATION_NOT_IDLE')
  assert.equal(host.sessions.length, 0)
  const wrongWindow = await runNativeHelperAblation({ capture, scope, contracts,
    ...host, openSession: async () => ({ modelId: MODEL_ID, windowId: 99,
      attestAfterBarrier: async () => {}, prompt: async () => {
        throw new Error('SHOULD_NOT_RUN') }, close: () => {} }) })
  assert.equal(wrongWindow.metadata.turns, 0)
  assert.equal(wrongWindow.metadata.cells[0].errorCode,
    'HELPER_ABLATION_MODEL_OR_WINDOW_UNCONFIRMED')
})

test('a changed backend state after barrier closes H before any prompt', async () => {
  const { capture, scope, contracts } = await sample()
  const host = fakeHost()
  let checks = 0
  const result = await runNativeHelperAblation({ capture, scope, contracts,
    ...host, assertIdle: async () => {
      checks += 1
      return { workerIdle: true, backendIdle: checks === 1 }
    } })
  assert.equal(checks, 2)
  assert.equal(host.sessions.length, 1)
  assert.equal(host.sessions[0].closed, true)
  assert.equal(host.prompts.length, 0)
  assert.equal(result.metadata.turns, 0)
  assert.equal(result.metadata.cells[0].errorCode, 'HELPER_ABLATION_NOT_IDLE')
})

test('capture expiry during fresh H attestation stops before the model prompt', async () => {
  const { capture, scope, contracts } = await sample()
  const host = fakeHost()
  let clock = Date.parse(capture.capturedAt) + 1000
  let checks = 0
  const result = await runNativeHelperAblation({ capture, scope, contracts,
    ...host, now: () => clock, assertIdle: async () => {
      checks += 1
      if (checks === 2) clock = Date.parse(capture.expiresAt)
      return { workerIdle: true, backendIdle: true }
    } })
  assert.equal(checks, 2)
  assert.equal(host.sessions.length, 1)
  assert.equal(host.sessions[0].closed, true)
  assert.equal(host.prompts.length, 0)
  assert.equal(result.metadata.turns, 0)
  assert.equal(result.metadata.cells[0].errorCode,
    'HELPER_ABLATION_CAPTURE_EXPIRED')
})

test('a confirmed soft cancellation also stops the pair and preserves no response text', async () => {
  const { capture, scope, contracts } = await sample()
  const host = fakeHost()
  let fireTimeout
  const result = await runNativeHelperAblation({ capture, scope, contracts,
    ...host, armSoftTimeout: onTimeout => {
      fireTimeout = onTimeout
      return () => {}
    }, openSession: async (...args) => {
      const session = await host.openSession(...args)
      session.prompt = async () => {
        fireTimeout()
        throw Object.assign(new Error('NATIVE_H_CANCELLED_CONFIRMED'),
          { code: 'NATIVE_H_CANCELLED_CONFIRMED' })
      }
      return session
    } })
  assert.equal(result.metadata.cells[0].status, 'SOFT_TIMEOUT_CONFIRMED')
  assert.equal(result.metadata.status, 'INCOMPLETE')
  assert.equal(result.metadata.turns, 1)
  assert.equal(host.sessions.length, 1)
  assert.deepEqual(result.display, { aPrimeText: null, bText: null })
})

test('a late end_turn after the soft cancellation is not accepted and B never starts', async () => {
  const { capture, scope, contracts } = await sample()
  const host = fakeHost()
  let fireTimeout
  const result = await runNativeHelperAblation({ capture, scope, contracts,
    ...host, armSoftTimeout: onTimeout => {
      fireTimeout = onTimeout
      return () => {}
    }, openSession: async (...args) => {
      const session = await host.openSession(...args)
      session.prompt = async () => {
        fireTimeout()
        return { text: 'late answer', stopReason: 'end_turn' }
      }
      return session
    } })
  assert.equal(result.metadata.turns, 1)
  assert.equal(result.metadata.status, 'INCOMPLETE')
  assert.equal(result.metadata.cells[0].errorCode,
    'HELPER_ABLATION_SOFT_TIMEOUT_RACED')
  assert.equal(host.sessions.length, 1)
  assert.deepEqual(result.display, { aPrimeText: null, bText: null })
})
