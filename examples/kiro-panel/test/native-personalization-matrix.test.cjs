const assert = require('node:assert/strict')
const { readFile } = require('node:fs/promises')
const { test } = require('node:test')
const { join } = require('node:path')
const fixture = require('../../../tests/eval/fixtures/prompt-regressions/evidence-analyst-v1.0.6-clean-semantics.json')
const {
  HELPER_CELLS, DISCOVERY_CELLS, MAX_TURNS, COMBINED_PLAN_MAX_TURNS,
  buildSyntheticPersonalizationInputs, buildMatrixInputs, runNativePersonalizationMatrix,
} = require('../src/native-personalization-matrix.cjs')

const MODEL_ID = 'catalog-confirmed-model'
const WINDOW_ID = 17
const HELPER_CONTEXT_MARKER = '\n\nSynthetic Helper context: '
const DISCOVERY_CONTEXT_MARKER = '\n\nSynthetic Discovery context: '
const POLLUTED_TOKEN = 'evidence_polluted-must-not-appear'

async function sample() {
  const [contracts, fixtures, discovery, helperRolePrompt, discoveryRolePrompt] =
    await Promise.all([
      import('../../../packages/contracts/dist/index.js'),
      import('../../../packages/contracts/test/fixtures.ts'),
      import('../../../packages/kiro-adapter/dist/crew-app-client.js'),
      readFile(join(__dirname, '..', '..', '..', 'docs', 'agent-prompts', 'helper.md'), 'utf8'),
      readFile(join(__dirname, '..', '..', '..', 'docs', 'agent-prompts', 'discovery.md'),
        'utf8'),
    ])
  const cleanCase = fixture.cases.find(item => item.id === 'own_explanation_independent')
  const ledger = contracts.conceptLedgerEntrySchema.parse({
    ...fixtures.conceptLedgerFixture,
    concept: { ...fixtures.conceptLedgerFixture.concept,
      canonicalName: '경계 불변식', description: '좌표와 크기의 경계 관계입니다.' },
    state: { ...fixtures.conceptLedgerFixture.state, state: 'EXPLAINED' },
    acceptedAliases: ['가구 경계'],
  })
  const commonBasis = {
    conceptId: ledger.concept.id, conceptName: ledger.concept.canonicalName,
    ledgerRevision: ledger.revision, state: 'EXPLAINED',
    evidenceIds: ledger.state.acceptedEvidenceIds,
    episodeIds: [fixtures.ids.episode], sourceProjectIds: [fixtures.ids.project],
    sourceProjectTitles: [fixtures.projectFixture.title], openIssueIds: [],
    redactedEvidenceExcerpt: cleanCase.userMessage,
  }
  const helperBaseContext = contracts.helperContextSchema.parse({
    schemaVersion: 1, correlationId: fixtures.ids.correlation,
    project: fixtures.projectFixture, learningSpec: fixtures.confirmedLearningSpecFixture,
    task: fixtures.builderTaskFixture, liveContext: null,
    activeDecisions: [], focusedDecision: null, relevantLedgerEntries: [],
    personalization: { ...fixtures.helperPersonalizationFixture,
      mode: 'NO_RELEVANT_EVIDENCE', basis: [], fallbackReason: 'NO_RELEVANT_CONCEPT' },
    recentEpisodes: [], contextReferences: [], referenceDetails: [], sourceExcerpts: [],
    pendingContextRefreshRequests: [],
    freshness: { currentContextVersion: null, observedContextVersion: null,
      status: 'MISSING', stale: false, refreshRequired: false },
  })
  const recentEpisode = contracts.helperEpisodeSummarySchema.parse({
    episodeId: 'episode_62000000-0000-4000-8000-000000000101',
    type: 'HELPER_CONVERSATION', endedAt: '2026-09-15T00:00:00.000Z',
    conceptNames: ['경계 불변식'],
    redactedUserExcerpts: [fixture.cleanPersonalizationEvaluation
      .recentEpisodeHistory.userExcerpt],
    helperResponseSummaries: [fixture.cleanPersonalizationEvaluation
      .recentEpisodeHistory.helperSummary],
    contextReferences: [{ kind: 'AGENT_MESSAGE',
      conversationId: 'conversation_62000000-0000-4000-8000-000000000102',
      messageId: 'message_62000000-0000-4000-8000-000000000103' }],
  })
  const discoveryProject = contracts.projectSchema.parse({ ...fixtures.projectFixture,
    title: '공간 경계 프로젝트',
    learningGoal: fixture.cleanPersonalizationEvaluation.commonInput
      .unseenDiscoveryInput.learningGoal,
    status: 'DISCOVERY', generatedWorkspacePath: undefined })
  const discoverySession = contracts.discoverySessionSchema.parse({
    ...fixtures.discoverySessionFixture, projectId: discoveryProject.id,
    input: { learningGoal: discoveryProject.learningGoal,
      personalNeed: fixture.cleanPersonalizationEvaluation.commonInput
        .unseenDiscoveryInput.personalNeed,
      currentLevel: 'BEGINNER' },
  })
  const discoveryPersonalization = contracts.personalizationTraceSchema.parse({
    ...fixtures.discoveryPersonalizationFixture,
    projectId: discoveryProject.id,
    target: { kind: 'DISCOVERY_SESSION', discoverySessionId: discoverySession.id },
    mode: 'NO_RELEVANT_EVIDENCE', basis: [], fallbackReason: 'NO_RELEVANT_CONCEPT',
  })
  const discoveryContext = contracts.discoveryContextSchema.parse({
    schemaVersion: 1, correlationId: fixtures.ids.correlation,
    project: discoveryProject, session: discoverySession, rounds: [], candidates: [],
    feedback: [], learningSpec: null, previewRound: null, candidateEnrichments: [],
    relevantLedgerEntries: [], personalization: discoveryPersonalization,
  })
  const discoveryBaseSnapshot = contracts.projectSessionSnapshotSchema.parse({
    schemaVersion: 1, correlationId: fixtures.ids.correlation,
    project: discoveryProject, suggestedSurface: 'DISCOVERY',
    discoverySession, discoveryContext, selectedCandidate: null, learningSpec: null,
    activeTask: null, currentTask: null, liveContext: null, pendingDecisions: [],
    decisions: [], completionReport: null, helperConversations: [],
  })
  return {
    fixture, contracts, helperRolePrompt, discoveryRolePrompt,
    helperBaseContext, discoveryBaseSnapshot, cleanLedgerEntry: ledger,
    helperBasis: contracts.personalizationBasisSchema.parse({ ...commonBasis,
      purpose: 'HELPER_EXPLANATION_START' }),
    discoveryBasis: contracts.personalizationBasisSchema.parse({ ...commonBasis,
      purpose: 'DISCOVERY_TIE_BREAK' }),
    recentEpisode,
    cleanEvidenceAttestation: {
      signal: 'REPHRASE', state: 'EXPLAINED', promptDependence: 'INDEPENDENT',
      acceptanceStatus: 'VERIFIED_BY_EXACT_CLEAN_APPLICATION_FIXTURE',
    },
    forbiddenProvenanceTokens: [POLLUTED_TOKEN],
    createDiscoveryContext: discovery.createDiscoveryEphemeralContext,
    composeHelperPrompt: ({ rolePrompt, question, refreshStatus, context, provenance }) =>
      `${rolePrompt}\n\nStandalone ${provenance}; no Core query or mutation occurred.` +
      `\n\nExact user question: ${question}\n\nRefresh: ${refreshStatus}.` +
      `${HELPER_CONTEXT_MARKER}${JSON.stringify(context)}`,
    composeDiscoveryPrompt: ({ rolePrompt, context, toolMetadata, provenance }) =>
      `${rolePrompt}\n\nStandalone ${provenance}; return preview JSON without submitting.` +
      `\n\nTool metadata: ${JSON.stringify(toolMetadata)}` +
      `${DISCOVERY_CONTEXT_MARKER}${context}`,
    model: { id: MODEL_ID, confirmed: true, source: 'IDE_CONFIG_OPTION',
      configuration: 'NOT_EXPOSED' },
    expectedWindowId: WINDOW_ID,
    scope: { projectId: fixtures.ids.project, workspace: '/synthetic/W',
      helper: '/synthetic/H' },
  }
}

function previewResult(context) {
  return JSON.stringify({
    schemaVersion: 1, projectId: context.project.id,
    discoverySessionId: context.session.id,
    correlationId: context.session.correlationId,
    idempotencyKey: 'idem_62000000-0000-4000-8000-000000000001',
    expectedSessionRevision: context.expectedSessionRevision,
    previews: Array.from({ length: 10 }, (_, index) => ({
      title: `경계 도구 ${index + 1}`,
      summary: `경계 입력을 안전하게 확인하는 합성 후보 ${index + 1}`,
      coreInteraction: `값을 바꾸고 경계 결과 ${index + 1}을 확인합니다.`,
      appeal: `실수를 줄이는 후보 ${index + 1}입니다.`,
      technologyNecessity: `상태 불변식으로 후보 ${index + 1}의 경계를 검증합니다.`,
      generationTags: [index % 2 === 0 ? 'DIRECT' : 'DISCOVER'],
    })),
    generationRationale: '같은 합성 입력에서 서로 다른 제품 사용 순간을 탐색했습니다.',
  })
}

function fakeHost() {
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
        attestAfterBarrier: async () => { session.attested = true },
        prompt: async (prompt, _onUpdate, signal) => {
          assert.equal(session.attested, true)
          assert.equal(signal.aborted, false)
          prompts.push(prompt)
          if (!prompt.includes(DISCOVERY_CONTEXT_MARKER))
            return { stopReason: 'end_turn', text: '합성 Helper 비교 답변입니다.' }
          const context = JSON.parse(prompt.slice(prompt.lastIndexOf(DISCOVERY_CONTEXT_MARKER) +
            DISCOVERY_CONTEXT_MARKER.length))
          return { stopReason: 'end_turn', text: previewResult(context) }
        },
        close: () => { session.closed = true },
      }
      sessions.push(session)
      return session
    },
  }
}

test('materializes a schema-valid 2x2 Helper matrix and Need-present Discovery pair', async () => {
  const input = await sample()
  const plan = buildMatrixInputs(input)
  assert.deepEqual(plan.cells.map(cell => cell.id), HELPER_CELLS.concat(DISCOVERY_CELLS))
  assert.equal(new Set(plan.cells.map(cell => cell.id)).size, MAX_TURNS)
  const helper = plan.cells.filter(cell => cell.role === 'HELPER')
  assert.deepEqual(helper.map(cell => [cell.curatedLedgerIncluded,
    cell.recentEpisodesIncluded]), [[false, false], [true, false], [false, true], [true, true]])
  for (const cell of helper) {
    assert.equal(input.contracts.helperContextSchema.safeParse(cell.context).success, true)
    assert.equal(cell.context.personalization.mode,
      cell.curatedLedgerIncluded ? 'EVIDENCE_AWARE' : 'NO_RELEVANT_EVIDENCE')
  }
  const discovery = plan.cells.filter(cell => cell.role === 'DISCOVERY')
  assert.deepEqual(discovery.map(cell => cell.curatedLedgerIncluded), [false, true])
  assert.ok(discovery.every(cell => cell.context.session.input.personalNeed ===
    fixture.cleanPersonalizationEvaluation.commonInput.unseenDiscoveryInput.personalNeed))
  assert.ok(plan.helperInvariantSha256)
  assert.ok(plan.discoveryInvariantSha256)
})

test('builds furniture-boundary synthetic inputs without importing Campus Drop or runtime DB data', async () => {
  const input = await sample()
  const synthetic = buildSyntheticPersonalizationInputs(fixture, input.contracts)
  const plan = buildMatrixInputs({ ...input, ...synthetic })
  assert.equal(plan.cells.length, MAX_TURNS)
  assert.equal(synthetic.helperBaseContext.project.title, '가구 배치 경계 도구')
  assert.equal(synthetic.helperBaseContext.task.expectedConcepts[0], '경계 불변식')
  assert.equal(synthetic.discoveryBaseSnapshot.discoverySession.input.personalNeed,
    fixture.cleanPersonalizationEvaluation.commonInput.unseenDiscoveryInput.personalNeed)
  assert.equal(synthetic.cleanLedgerEntry.state.state, 'EXPLAINED')
  assert.equal(synthetic.helperBasis.redactedEvidenceExcerpt,
    fixture.cases.find(item => item.id === 'own_explanation_independent').userMessage)
  assert.equal(JSON.stringify(synthetic).includes('Campus Drop'), false)
})

test('runs six fresh attested H cells with one confirmed model and leaves review semantic', async () => {
  const input = await sample()
  const host = fakeHost()
  const progress = []
  const result = await runNativePersonalizationMatrix({ ...input, ...host,
    onCell: cell => progress.push(cell) })
  assert.equal(host.sessions.length, MAX_TURNS)
  assert.equal(new Set(host.sessions).size, MAX_TURNS)
  assert.ok(host.sessions.every(session => session.attested && session.closed))
  assert.equal(host.idleChecks, MAX_TURNS * 2)
  assert.equal(host.barriers, MAX_TURNS)
  assert.equal(host.prompts.length, MAX_TURNS)
  assert.ok(host.prompts.every(prompt =>
    prompt.includes('SYNTHETIC_REDACTED_EVAL_INPUT')))
  assert.equal(result.metadata.status, 'PLAN_FINISHED')
  assert.equal(result.metadata.deterministicStatus, 'PASSED')
  assert.equal(result.metadata.humanReviewStatus, 'NEEDS_REVIEW')
  assert.equal(result.metadata.turns, MAX_TURNS)
  assert.equal(result.metadata.combinedPlanMaxTurns, COMBINED_PLAN_MAX_TURNS)
  assert.equal(result.metadata.cellRetryCount, 0)
  assert.equal(result.metadata.coreMutationCount, 0)
  assert.equal(result.metadata.model.id, MODEL_ID)
  assert.equal(result.metadata.model.configuration, 'NOT_EXPOSED')
  assert.equal(result.metadata.personalNeedPresent, true)
  assert.ok(result.metadata.cells.every(cell =>
    cell.status === 'COMPLETE' && cell.deterministicStatus === 'PASSED' &&
    cell.humanReviewStatus === 'NEEDS_REVIEW'))
  assert.deepEqual(Object.keys(result.display.helper), HELPER_CELLS)
  assert.deepEqual(Object.keys(result.display.discovery), DISCOVERY_CELLS)
  assert.equal(JSON.stringify(result.metadata).includes('합성 Helper 비교 답변'), false)
  assert.equal(JSON.stringify(progress).includes('합성 Helper 비교 답변'), false)
})

test('rejects polluted source material before opening any model session', async () => {
  const input = await sample()
  let opens = 0
  await assert.rejects(runNativePersonalizationMatrix({ ...input,
    cleanLedgerEntry: { ...input.cleanLedgerEntry,
      acceptedAliases: [POLLUTED_TOKEN] },
    assertIdle: async () => ({ workerIdle: true, backendIdle: true }),
    openBarrier: async () => ({ windowId: WINDOW_ID, sessionIdForBarrier: 'sess_barrier' }),
    openSession: async () => { opens += 1 },
  }), /PERSONALIZATION_MATRIX_POLLUTED_SOURCE_PRESENT/)
  assert.equal(opens, 0)
})

test('keeps invalid Discovery output separate from human review and does not relabel success', async () => {
  const input = await sample()
  const host = fakeHost()
  const result = await runNativePersonalizationMatrix({ ...input, ...host,
    composeDiscoveryPrompt: ({ rolePrompt, context, provenance }) =>
      `${rolePrompt}\n\n${provenance}${DISCOVERY_CONTEXT_MARKER}${context}`,
    openSession: async (...args) => {
      const session = await host.openSession(...args)
      const original = session.prompt
      session.prompt = async (prompt, onUpdate, signal) =>
        prompt.includes(DISCOVERY_CONTEXT_MARKER) ?
          { stopReason: 'end_turn', text: '{"previews":[]}' } :
          original(prompt, onUpdate, signal)
      return session
    },
  })
  assert.equal(result.metadata.status, 'PLAN_FINISHED')
  assert.equal(result.metadata.deterministicStatus, 'FAILED')
  assert.equal(result.metadata.humanReviewStatus, 'NEEDS_REVIEW')
  assert.equal(result.metadata.cells.filter(cell =>
    cell.role === 'DISCOVERY' && cell.deterministicStatus === 'FAILED').length, 2)
})

test('stops after the first host gate failure without retrying a cell', async () => {
  const input = await sample()
  let opens = 0
  const result = await runNativePersonalizationMatrix({ ...input,
    assertIdle: async () => ({ workerIdle: true, backendIdle: true }),
    openBarrier: async () => ({ windowId: WINDOW_ID, sessionIdForBarrier: 'sess_barrier' }),
    openSession: async () => {
      opens += 1
      return { modelId: MODEL_ID, windowId: 99,
        attestAfterBarrier: async () => undefined,
        prompt: async () => { throw new Error('SHOULD_NOT_PROMPT') }, close: () => undefined }
    },
  })
  assert.equal(opens, 1)
  assert.equal(result.metadata.turns, 0)
  assert.equal(result.metadata.cells.length, 1)
  assert.equal(result.metadata.cells[0].errorCode,
    'PERSONALIZATION_MATRIX_MODEL_OR_WINDOW_UNCONFIRMED')
  assert.equal(result.metadata.status, 'INCOMPLETE')
})
