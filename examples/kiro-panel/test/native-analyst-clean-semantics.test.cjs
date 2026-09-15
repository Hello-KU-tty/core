const assert = require('node:assert/strict')
const { readFile } = require('node:fs/promises')
const { test } = require('node:test')
const { join } = require('node:path')
const fixture = require('../../../tests/eval/fixtures/prompt-regressions/evidence-analyst-v1.0.6-clean-semantics.json')
const fixtureV107 = require('../../../tests/eval/fixtures/prompt-regressions/evidence-analyst-v1.0.7-claim-temporality.json')
const {
  MAX_TURNS, EXPECTED_CASE_IDS, EXPECTED_CASE_IDS_V1_0_7,
  buildSyntheticCase, evaluateText,
  runNativeAnalystCleanSemantics,
} = require('../src/native-analyst-clean-semantics.cjs')

const MODEL_ID = 'catalog-confirmed-model'
const WINDOW_ID = 17
const MESSAGE_MARKER = '\n\nSynthetic Episode context: '

async function dependencies(selectedFixture = fixture) {
  const contracts = await import('../../../packages/contracts/dist/index.js')
  const canonicalRolePrompt = await readFile(join(__dirname, '..', '..', '..', 'docs',
    'agent-prompts', 'evidence-analyst.md'), 'utf8')
  const rolePrompt = selectedFixture.promptVersion === '1.0.6' ?
    canonicalRolePrompt.replace('> Prompt version: `1.0.7`',
      '> Prompt version: `1.0.6`') : canonicalRolePrompt
  return {
    fixture: selectedFixture, contracts, rolePrompt,
    model: { id: MODEL_ID, confirmed: true, source: 'IDE_CONFIG_OPTION',
      configuration: 'NOT_EXPOSED' },
    expectedWindowId: WINDOW_ID,
    scope: { projectId: 'project_scope', workspace: '/synthetic/W', helper: '/synthetic/H' },
    composeAnalystPrompt: ({ rolePrompt: prompt, message, provenance }) =>
      `${prompt}\n\nStandalone ${provenance}. No Core query or mutation occurred.` +
      `${MESSAGE_MARKER}${message}`,
  }
}

function draftFor(item, context) {
  if (item.id === 'request_only') return null
  const settings = {
    future_plan_after_light_hint: ['PREDICTION', 'STRONG', 'LIGHT_HINT', 'EXPLAINED'],
    own_explanation_independent: ['REPHRASE', 'STRONG', 'INDEPENDENT', 'EXPLAINED'],
    actual_reasoned_choice: ['JUSTIFIED_DECISION', 'STRONG', 'LIGHT_HINT', 'DEMONSTRATED'],
    actual_performed_application: ['APPLICATION', 'STRONG', 'INDEPENDENT', 'DEMONSTRATED'],
    directly_led_repeat: ['REPHRASE', 'WEAK', 'DIRECTLY_LED', null],
    unseen_cache_future_rule_not_application: ['PREDICTION', 'STRONG', 'LIGHT_HINT', 'EXPLAINED'],
  }[item.id]
  const expression = item.userClaimExcerpt ?? item.userMessage.slice(0, 20)
  return {
    concept: { originalExpression: expression, proposedCanonicalName: '합성 경계 개념' },
    signal: settings[0], strength: settings[1], promptDependence: settings[2],
    userEvidenceSources: item.userEvidenceSources, contextSources: [],
    redactedEvidenceExcerpt: expression,
    rationale: 'The synthetic user-authored source supports this bounded classification.',
    maximumSupportedState: settings[3], misconception: { action: 'NONE' },
  }
}

function resultFor(item, context) {
  const draft = draftFor(item, context)
  return JSON.stringify({
    schemaVersion: 1, episodeId: context.episode.id,
    episodeRevision: context.episode.revision, correlationId: context.correlationId,
    proposals: draft === null ? [] : [draft],
    ...(draft === null ? { noEvidenceReason: 'The user only requested an explanation.' } : {}),
  })
}

function claimProfileDraft(item, profile) {
  const expression = profile.claimExcerpts[0]
  return {
    concept: { originalExpression: expression, proposedCanonicalName: '합성 claim 개념' },
    signal: profile.allowedSignals[0], strength: profile.allowedStrengths[0],
    promptDependence: profile.allowedPromptDependence[0],
    userEvidenceSources: item.userEvidenceSources, contextSources: [],
    redactedEvidenceExcerpt: expression,
    rationale: 'The exact synthetic user claim matches the fixture claim profile.',
    maximumSupportedState: profile.allowedMaximumSupportedStates[0],
    misconception: { action: 'NONE' },
  }
}

function resultForV107(item, context) {
  const profiles = item.expected.claimProfiles ?? []
  const proposals = profiles.map(profile => claimProfileDraft(item, profile))
  return JSON.stringify({
    schemaVersion: 1, episodeId: context.episode.id,
    episodeRevision: context.episode.revision, correlationId: context.correlationId,
    proposals,
    ...(proposals.length === 0 ?
      { noEvidenceReason: 'No state-supporting user claim is present.' } : {}),
  })
}

function fakeHost(cases, responseFor = resultFor) {
  const sessions = []
  const prompts = []
  let idleChecks = 0
  let barriers = 0
  return {
    sessions, prompts,
    get idleChecks() { return idleChecks },
    get barriers() { return barriers },
    assertIdle: async () => { idleChecks += 1
      return { workerIdle: true, backendIdle: true } },
    openBarrier: async () => { barriers += 1
      return { windowId: WINDOW_ID,
        sessionIdForBarrier: `sess_62000000-0000-4000-8000-${String(barriers).padStart(12, '0')}` } },
    openSession: async (_scope, modelId) => {
      assert.equal(modelId, MODEL_ID)
      const session = {
        modelId, windowId: WINDOW_ID, attested: false, closed: false,
        attestAfterBarrier: async id => {
          assert.match(id, /^sess_/)
          session.attested = true
        },
        prompt: async (prompt, _onUpdate, signal) => {
          assert.equal(session.attested, true)
          assert.equal(signal.aborted, false)
          prompts.push(prompt)
          const context = JSON.parse(prompt.slice(prompt.lastIndexOf(MESSAGE_MARKER) +
            MESSAGE_MARKER.length))
          const item = cases.find(candidate =>
            candidate.userMessage === context.events.find(event =>
              event.payload.type === 'USER_MESSAGE').payload.redactedExcerpt)
          return { stopReason: 'end_turn', text: responseFor(item, context) }
        },
        close: () => { session.closed = true },
      }
      sessions.push(session)
      return session
    },
  }
}

test('builds all seven schema-valid synthetic contexts with explicit hint and Decision provenance', async () => {
  const { contracts } = await dependencies()
  assert.deepEqual(fixture.cases.map(item => item.id), EXPECTED_CASE_IDS)
  const contexts = fixture.cases.map((item, index) =>
    buildSyntheticCase(item, index, contracts))
  assert.equal(contexts.length, MAX_TURNS)
  for (const [index, context] of contexts.entries()) {
    assert.equal(contracts.episodeContextSchema.safeParse(context).success, true)
    assert.equal(context.relevantLedgerEntries.length, 0)
    const item = fixture.cases[index]
    const helperEvents = context.events.filter(event =>
      event.payload.type === 'HELPER_RESPONSE')
    assert.equal(helperEvents.length, item.precedingAgentContribution === null ? 0 : 1)
    assert.ok(context.events.some(event => event.payload.type === 'USER_MESSAGE'))
  }
  const choice = contexts[fixture.cases.findIndex(item =>
    item.id === 'actual_reasoned_choice')]
  assert.equal(choice.episode.type, 'DECISION')
  assert.equal(choice.decisionContext.resolution.source.kind, 'USER')
  assert.equal(choice.decisionContext.resolution.rationale,
    fixture.cases.find(item => item.id === 'actual_reasoned_choice')
      .decisionResolution.rationale)
  assert.ok(choice.events.some(event =>
    event.payload.type === 'DECISION_RESOLVED' && event.payload.rationaleProvided))
})

test('runs one fresh attested read-only H session per case with no retry or Core mutation', async () => {
  const deps = await dependencies()
  const host = fakeHost(fixture.cases)
  const progress = []
  const result = await runNativeAnalystCleanSemantics({ ...deps, ...host,
    onCell: cell => progress.push(cell) })
  assert.equal(host.sessions.length, MAX_TURNS)
  assert.equal(new Set(host.sessions).size, MAX_TURNS)
  assert.ok(host.sessions.every(session => session.attested && session.closed))
  assert.equal(host.idleChecks, MAX_TURNS * 2)
  assert.equal(host.barriers, MAX_TURNS)
  assert.equal(host.prompts.length, MAX_TURNS)
  assert.ok(host.prompts.every(prompt =>
    prompt.includes('SYNTHETIC_REDACTED_EVAL_INPUT') &&
    !prompt.includes('already executed the exact read-only get_helper_context')))
  assert.equal(result.metadata.status, 'PLAN_FINISHED')
  assert.equal(result.metadata.deterministicStatus, 'PASSED')
  assert.equal(result.metadata.contractOracleHumanReviewStatus, 'NOT_REQUIRED')
  assert.equal(result.metadata.semanticInterpretationReviewStatus, 'NEEDS_REVIEW')
  assert.equal(result.metadata.humanReviewStatus, 'NEEDS_REVIEW')
  assert.equal(result.metadata.turns, MAX_TURNS)
  assert.equal(result.metadata.cellRetryCount, 0)
  assert.equal(result.metadata.coreMutationCount, 0)
  assert.equal(result.metadata.model.id, MODEL_ID)
  assert.equal(result.metadata.model.configuration, 'NOT_EXPOSED')
  assert.equal(result.metadata.cells.length, MAX_TURNS)
  assert.ok(result.metadata.cells.every(cell =>
    cell.status === 'COMPLETE' && cell.deterministicStatus === 'PASSED'))
  assert.equal(Object.keys(result.display).length, MAX_TURNS)
  const metadata = JSON.stringify(result.metadata)
  for (const item of fixture.cases) assert.equal(metadata.includes(item.userMessage), false)
  assert.equal(JSON.stringify(progress).includes(fixture.cases[0].userMessage), false)
})

test('fails a future-plan APPLICATION even when its schema and exact quote are valid', async () => {
  const { contracts } = await dependencies()
  const item = fixture.cases.find(candidate => candidate.id ===
    'unseen_cache_future_rule_not_application')
  const context = buildSyntheticCase(item, 6, contracts)
  const wrong = draftFor(item, context)
  wrong.signal = 'APPLICATION'
  wrong.maximumSupportedState = 'DEMONSTRATED'
  const output = JSON.stringify({ schemaVersion: 1, episodeId: context.episode.id,
    episodeRevision: 1, correlationId: context.correlationId, proposals: [wrong] })
  const evaluated = evaluateText(output, context, item, contracts)
  assert.equal(evaluated.schemaValid, true)
  assert.equal(evaluated.sourceReferencesValid, true)
  assert.equal(evaluated.quoteProvenanceValid, true)
  assert.equal(evaluated.deterministicStatus, 'FAILED')
  assert.equal(evaluated.failureCode, 'ANALYST_CLEAN_EXPECTATION_MISMATCH')
})

test('stops on the first operational gate failure and never retries or opens a later cell', async () => {
  const deps = await dependencies()
  let opens = 0
  const result = await runNativeAnalystCleanSemantics({ ...deps,
    assertIdle: async () => ({ workerIdle: true, backendIdle: true }),
    openBarrier: async () => ({ windowId: WINDOW_ID, sessionIdForBarrier: 'sess_barrier' }),
    openSession: async () => {
      opens += 1
      return { modelId: 'wrong-model', windowId: WINDOW_ID,
        attestAfterBarrier: async () => undefined,
        prompt: async () => { throw new Error('SHOULD_NOT_PROMPT') },
        close: () => undefined }
    },
  })
  assert.equal(opens, 1)
  assert.equal(result.metadata.turns, 0)
  assert.equal(result.metadata.cells.length, 1)
  assert.equal(result.metadata.cells[0].errorCode,
    'ANALYST_CLEAN_MODEL_OR_WINDOW_UNCONFIRMED')
  assert.equal(result.metadata.status, 'INCOMPLETE')
})

test('rejects an unconfirmed model and a non-v1.0.6 prompt before opening H', async () => {
  const deps = await dependencies()
  let opens = 0
  const host = { assertIdle: async () => ({ workerIdle: true, backendIdle: true }),
    openBarrier: async () => ({ windowId: WINDOW_ID, sessionIdForBarrier: 'sess_barrier' }),
    openSession: async () => { opens += 1 } }
  await assert.rejects(runNativeAnalystCleanSemantics({ ...deps, ...host,
    model: { ...deps.model, confirmed: false } }),
  /ANALYST_CLEAN_DEPENDENCIES_INVALID/)
  await assert.rejects(runNativeAnalystCleanSemantics({ ...deps, ...host,
    rolePrompt: '> Prompt version: `1.0.5`' }),
  /ANALYST_CLEAN_DEPENDENCIES_INVALID/)
  assert.equal(opens, 0)
})

test('builds v1.0.7 contexts without leaking the user choice rationale from Agent context', async () => {
  const { contracts } = await dependencies(fixtureV107)
  assert.deepEqual(fixtureV107.cases.map(item => item.id), EXPECTED_CASE_IDS_V1_0_7)
  const contexts = fixtureV107.cases.map((item, index) =>
    buildSyntheticCase(item, index, contracts))
  assert.ok(contexts.every(context =>
    contracts.episodeContextSchema.safeParse(context).success))
  const item = fixtureV107.cases.find(candidate => candidate.id ===
    'actual_reasoned_choice')
  const context = contexts[fixtureV107.cases.indexOf(item)]
  const agentContext = JSON.stringify({
    precedingAgentContribution: item.precedingAgentContribution,
    request: context.decisionContext.request,
  })
  for (const forbidden of item.decisionRequest.agentHintMustNotContain)
    assert.equal(agentContext.includes(forbidden), false)
  assert.notEqual(context.decisionContext.request.recommendedOptionId,
    context.decisionContext.resolution.selectedOptionId)
})

test('accepts merged, split, or conservative-subset claims within allowed profiles', async () => {
  const { contracts } = await dependencies(fixtureV107)
  for (const id of ['own_explanation_independent', 'actual_reasoned_choice',
    'actual_performed_application', 'independent_future_prediction']) {
    const item = fixtureV107.cases.find(candidate => candidate.id === id)
    const context = buildSyntheticCase(item, fixtureV107.cases.indexOf(item), contracts)
    const first = claimProfileDraft(item, item.expected.claimProfiles[0])
    first.redactedEvidenceExcerpt = item.userMessage
    const combined = JSON.stringify({ schemaVersion: 1, episodeId: context.episode.id,
      episodeRevision: 1, correlationId: context.correlationId, proposals: [first] })
    assert.equal(evaluateText(combined, context, item, contracts).deterministicStatus,
      'PASSED')
    const split = resultForV107(item, context)
    assert.equal(evaluateText(split, context, item, contracts).deterministicStatus,
      'PASSED')
    const subset = JSON.stringify({ schemaVersion: 1, episodeId: context.episode.id,
      episodeRevision: 1, correlationId: context.correlationId,
      proposals: [claimProfileDraft(item, item.expected.claimProfiles[0])] })
    assert.equal(evaluateText(subset, context, item, contracts).deterministicStatus,
      'PASSED')
  }
})

test('accepts allowed source subsets but keeps USER_DECISION mandatory for a choice', async () => {
  const { contracts } = await dependencies(fixtureV107)
  const item = fixtureV107.cases.find(candidate => candidate.id ===
    'actual_reasoned_choice')
  const context = buildSyntheticCase(item, fixtureV107.cases.indexOf(item), contracts)
  const draft = claimProfileDraft(item, item.expected.claimProfiles[0])
  draft.userEvidenceSources = [item.userEvidenceSources.find(source =>
    source.kind === 'USER_DECISION')]
  const output = proposal => JSON.stringify({ schemaVersion: 1,
    episodeId: context.episode.id, episodeRevision: 1,
    correlationId: context.correlationId, proposals: [proposal] })
  assert.equal(evaluateText(output(draft), context, item, contracts).deterministicStatus,
    'PASSED')
  const missingDecision = { ...draft, userEvidenceSources: [item.userEvidenceSources.find(
    source => source.kind === 'USER_MESSAGE')] }
  assert.equal(evaluateText(output(missingDecision), context, item, contracts)
    .deterministicStatus, 'FAILED')
})

test('rejects temporal category errors while preserving a strong future prediction', async () => {
  const { contracts } = await dependencies(fixtureV107)
  for (const [id, wrongSignal] of [
    ['own_explanation_independent', 'PREDICTION'],
    ['actual_performed_application', 'PREDICTION'],
    ['future_plan_after_light_hint', 'APPLICATION'],
    ['independent_future_prediction', 'JUSTIFIED_DECISION'],
  ]) {
    const item = fixtureV107.cases.find(candidate => candidate.id === id)
    const context = buildSyntheticCase(item, fixtureV107.cases.indexOf(item), contracts)
    const wrong = claimProfileDraft(item, item.expected.claimProfiles[0])
    wrong.signal = wrongSignal
    const output = JSON.stringify({ schemaVersion: 1, episodeId: context.episode.id,
      episodeRevision: 1, correlationId: context.correlationId, proposals: [wrong] })
    assert.equal(evaluateText(output, context, item, contracts).deterministicStatus,
      'FAILED')
  }
  const prediction = fixtureV107.cases.find(item =>
    item.id === 'independent_future_prediction')
  const context = buildSyntheticCase(prediction, 6, contracts)
  const result = evaluateText(resultForV107(prediction, context), context,
    prediction, contracts)
  assert.equal(result.deterministicStatus, 'PASSED')
  assert.ok(result.proposals.every(proposal =>
    proposal.signal === 'PREDICTION' && proposal.strength === 'STRONG' &&
    proposal.maximumSupportedState === 'DEMONSTRATED'))
})

test('runs the v1.0.7 seven-cell plan with fresh sessions and no Core mutation', async () => {
  const deps = await dependencies(fixtureV107)
  const host = fakeHost(fixtureV107.cases, resultForV107)
  const result = await runNativeAnalystCleanSemantics({ ...deps, ...host })
  assert.equal(result.metadata.kind,
    'STANDALONE_NATIVE_ANALYST_V1_0_7_CLEAN_SEMANTICS')
  assert.equal(result.metadata.promptVersion, '1.0.7')
  assert.equal(result.metadata.status, 'PLAN_FINISHED')
  assert.equal(result.metadata.deterministicStatus, 'PASSED')
  assert.equal(result.metadata.turns, 7)
  assert.equal(result.metadata.coreMutationCount, 0)
  assert.equal(result.metadata.cellRetryCount, 0)
  assert.equal(host.sessions.length, 7)
  assert.equal(new Set(host.sessions).size, 7)
})
