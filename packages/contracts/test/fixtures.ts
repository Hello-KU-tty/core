export const ids = {
  project: 'project_00000000-0000-4000-8000-000000000001',
  discoverySession: 'discovery_session_00000000-0000-4000-8000-000000000002',
  candidateRound: 'candidate_round_00000000-0000-4000-8000-000000000003',
  candidate: 'candidate_00000000-0000-4000-8000-000000000004',
  feedback: 'feedback_00000000-0000-4000-8000-000000000005',
  learningSpec: 'learning_spec_00000000-0000-4000-8000-000000000006',
  task: 'task_00000000-0000-4000-8000-000000000007',
  context: 'context_00000000-0000-4000-8000-000000000008',
  decision: 'decision_00000000-0000-4000-8000-000000000009',
  optionA: 'decision_option_00000000-0000-4000-8000-000000000010',
  optionB: 'decision_option_00000000-0000-4000-8000-000000000011',
  resolution: 'decision_resolution_00000000-0000-4000-8000-000000000012',
  decisionApplication: 'decision_application_00000000-0000-4000-8000-000000000033',
  completionReport: 'completion_report_00000000-0000-4000-8000-000000000013',
  conversation: 'conversation_00000000-0000-4000-8000-000000000014',
  userMessage: 'message_00000000-0000-4000-8000-000000000015',
  helperMessage: 'message_00000000-0000-4000-8000-000000000016',
  testResult: 'test_result_00000000-0000-4000-8000-000000000017',
  diff: 'diff_00000000-0000-4000-8000-000000000018',
  eventUser: 'event_00000000-0000-4000-8000-000000000019',
  eventDecision: 'event_00000000-0000-4000-8000-000000000020',
  episode: 'episode_00000000-0000-4000-8000-000000000021',
  analysisJob: 'analysis_job_00000000-0000-4000-8000-000000000034',
  concept: 'concept_00000000-0000-4000-8000-000000000022',
  evidenceProposal: 'evidence_proposal_00000000-0000-4000-8000-000000000023',
  evidenceDecision: 'evidence_decision_00000000-0000-4000-8000-000000000024',
  evidence: 'evidence_00000000-0000-4000-8000-000000000025',
  conceptLedger: 'concept_ledger_00000000-0000-4000-8000-000000000026',
  personalization: 'personalization_00000000-0000-4000-8000-000000000035',
  audit: 'audit_00000000-0000-4000-8000-000000000027',
  fixture: 'fixture_00000000-0000-4000-8000-000000000028',
  evaluationRun: 'evaluation_run_00000000-0000-4000-8000-000000000029',
  baselineResult: 'baseline_result_00000000-0000-4000-8000-000000000030',
  correlation: 'corr_00000000-0000-4000-8000-000000000031',
  idempotency: 'idem_00000000-0000-4000-8000-000000000032',
  contextRefresh: 'context_refresh_00000000-0000-4000-8000-000000000033',
} as const

export const timestamp = '2026-08-25T03:00:00.000Z'

export const discoveryPersonalizationFixture = {
  schemaVersion: 1,
  id: ids.personalization,
  projectId: ids.project,
  correlationId: ids.correlation,
  target: { kind: 'DISCOVERY_SESSION', discoverySessionId: ids.discoverySession },
  mode: 'NO_RELEVANT_EVIDENCE',
  basis: [],
  fallbackReason: 'NO_LEDGER',
  createdAt: timestamp,
  source: { kind: 'CORE' },
  redactionStatus: 'VERIFIED_REDACTED',
} as const

export const helperPersonalizationFixture = {
  ...discoveryPersonalizationFixture,
  target: { kind: 'HELPER_TURN', taskId: ids.task },
} as const

export const projectFixture = {
  schemaVersion: 1,
  id: ids.project,
  correlationId: ids.correlation,
  revision: 1,
  title: 'Webhook Lens',
  learningGoal: 'TypeScript discriminated unions',
  status: 'BUILDING',
  generatedWorkspacePath: 'generated/webhook-lens',
  createdAt: timestamp,
  updatedAt: timestamp,
  source: { kind: 'USER' },
  redactionStatus: 'NOT_REQUIRED',
} as const

export const discoveryInputFixture = {
  learningGoal: 'TypeScript discriminated unions',
  personalNeed: 'Inspect webhook payloads without uploading them',
  interestAreas: ['developer tools'],
  currentLevel: 'BEGINNER',
} as const

export const discoverySessionFixture = {
  schemaVersion: 1,
  id: ids.discoverySession,
  projectId: ids.project,
  correlationId: ids.correlation,
  revision: 1,
  input: discoveryInputFixture,
  status: 'ACTIVE',
  openedAt: timestamp,
  updatedAt: timestamp,
  source: { kind: 'USER' },
  redactionStatus: 'NOT_REQUIRED',
} as const

export const candidateEvaluationFixture = [
  ['CONCEPT_NECESSITY', 'POSITIVE'],
  ['PERSONAL_UTILITY', 'POSITIVE'],
  ['ADOPTION_FEASIBILITY', 'POSITIVE'],
  ['LEARNER_FIT', 'POSITIVE'],
  ['SCOPE_FEASIBILITY', 'POSITIVE'],
  ['ADJACENT_COMPLEXITY', 'MIXED'],
  ['DEPLOYABILITY', 'POSITIVE'],
  ['DISTINCTIVENESS', 'POSITIVE'],
].map(([criterion, assessment]) => ({
  criterion,
  assessment,
  rationale: `${criterion} was reviewed for this candidate.`,
}))

export const candidateFixture = {
  schemaVersion: 1,
  id: ids.candidate,
  discoverySessionId: ids.discoverySession,
  correlationId: ids.correlation,
  revision: 1,
  parentRevisions: [],
  title: 'Webhook Lens',
  summary: 'A local viewer that explains webhook payload variants.',
  targetUsers: ['Developers learning TypeScript APIs'],
  coreInteraction: 'Paste a redacted sample and inspect its typed event variant.',
  usageMoment: 'When integrating a webhook provider.',
  appeal: 'Makes invisible API contracts tangible without a hosted service.',
  personalNeedRelationship: 'Keeps sample payloads on the local machine.',
  technologyNecessity: 'Discriminated unions model provider event variants directly.',
  coreConcepts: ['discriminated union', 'runtime validation'],
  mvpFeatures: ['Parse one provider payload', 'Render variant-specific fields'],
  suggestedScope: {
    learnerFocus: ['Discriminated union narrowing'],
    agentSupport: ['Local application shell'],
    excluded: ['Hosted payload storage'],
  },
  risks: ['Provider payloads may contain secrets'],
  generationTags: ['DIRECT', 'DISCOVER'],
  evaluation: candidateEvaluationFixture,
  createdAt: timestamp,
  source: { kind: 'AGENT', role: 'DISCOVERY' },
  redactionStatus: 'VERIFIED_REDACTED',
} as const

export const candidateRoundFixture = {
  schemaVersion: 1,
  id: ids.candidateRound,
  discoverySessionId: ids.discoverySession,
  correlationId: ids.correlation,
  roundIndex: 1,
  inputSnapshot: discoveryInputFixture,
  appliedFeedbackIds: [],
  candidates: [{ candidateId: ids.candidate, revision: 1 }],
  generationRationale: 'The round explores a local developer-tool interaction.',
  diversityCheck: {
    dimensionsReviewed: [
      'PROBLEM_DOMAIN',
      'TARGET_USER',
      'CORE_INTERACTION',
      'DATA_SHAPE',
      'USER_APPEAL',
    ],
    modeCollapseDetected: false,
    rationale: 'The fixture represents one candidate; production rounds compare all candidates.',
  },
  createdAt: timestamp,
  source: { kind: 'AGENT', role: 'DISCOVERY' },
  redactionStatus: 'VERIFIED_REDACTED',
} as const

export const discoveryFeedbackFixture = {
  schemaVersion: 1,
  id: ids.feedback,
  discoverySessionId: ids.discoverySession,
  roundId: ids.candidateRound,
  correlationId: ids.correlation,
  intent: 'SELECT',
  targets: [{ candidateId: ids.candidate, revision: 1 }],
  message: 'Use this direction.',
  createdAt: timestamp,
  source: { kind: 'USER' },
  redactionStatus: 'NOT_REQUIRED',
} as const

export const learningSpecDraftContentFixture = {
  productPurpose: 'Inspect redacted webhook variants locally.',
  targetUsers: ['A developer learning typed API events'],
  primaryUsageMoment: 'While implementing a webhook endpoint.',
  successMoment: 'The user sees why one payload narrowed to a specific variant.',
  mvpFeatures: ['Validate a sample', 'Show narrowed event fields'],
  scope: [
    {
      category: 'LEARNER_FOCUS',
      title: 'Discriminated union narrowing',
      rationale: 'It is central to the product interaction.',
      conceptNames: ['discriminated union'],
    },
    {
      category: 'AGENT_SUPPORT',
      title: 'Local application shell',
      rationale: 'It is needed but not the learning target.',
      conceptNames: [],
    },
    {
      category: 'EXCLUDED',
      title: 'Hosted sample storage',
      rationale: 'It crosses the MVP data boundary.',
      conceptNames: [],
    },
  ],
  expectedDecisions: [
    {
      category: 'DATA_MODEL',
      description: 'Choose whether invalid fields are rejected or retained for inspection.',
      whyUserInputMatters: 'The choice changes the product behavior.',
    },
  ],
  runtimeConstraint: 'TYPESCRIPT',
  deploymentConstraints: ['Local execution for MVP'],
} as const

export const draftLearningSpecFixture = {
  schemaVersion: 1,
  id: ids.learningSpec,
  projectId: ids.project,
  correlationId: ids.correlation,
  revision: 1,
  selectedCandidate: { candidateId: ids.candidate, revision: 1 },
  ...learningSpecDraftContentFixture,
  status: 'DRAFT',
  createdAt: timestamp,
  updatedAt: timestamp,
  source: { kind: 'AGENT', role: 'DISCOVERY' },
  redactionStatus: 'VERIFIED_REDACTED',
} as const

export const confirmedLearningSpecFixture = {
  ...draftLearningSpecFixture,
  revision: 2,
  parentRevision: 1,
  status: 'CONFIRMED',
  confirmation: { confirmedAt: timestamp, confirmedBy: { kind: 'USER' } },
  source: { kind: 'USER' },
} as const

export const builderTaskFixture = {
  schemaVersion: 1,
  id: ids.task,
  projectId: ids.project,
  learningSpecId: ids.learningSpec,
  learningSpecRevision: 2,
  correlationId: ids.correlation,
  revision: 1,
  title: 'Implement event variant viewer',
  productGoal: 'Render validated webhook variants locally.',
  requirements: ['Validate the input before rendering it.'],
  acceptanceCriteria: [
    { key: 'valid_event', description: 'A valid event renders variant-specific fields.' },
  ],
  expectedConcepts: ['discriminated union'],
  excludedWork: ['Hosted sample storage'],
  prerequisiteTaskIds: [],
  expectedDecisionCategories: ['DATA_MODEL'],
  sequence: 1,
  status: 'ACTIVE',
  createdAt: timestamp,
  updatedAt: timestamp,
  source: { kind: 'CORE' },
  redactionStatus: 'NOT_REQUIRED',
} as const

export const codeReferenceFixture = {
  kind: 'CODE',
  path: 'src/events.ts',
  lineRange: { start: 1, end: 24 },
  revisionRef: 'task-start',
} as const

export const liveContextFixture = {
  schemaVersion: 1,
  id: ids.context,
  projectId: ids.project,
  taskId: ids.task,
  correlationId: ids.correlation,
  contextVersion: 1,
  expectedPreviousVersion: 0,
  checkpoint: 'DECISION_REQUIRED',
  stage: 'Modeling event variants',
  currentGoal: 'Choose invalid-field behavior before finalizing the parser.',
  recentChanges: ['Added the event variant types.'],
  activeDecisionIds: [ids.decision],
  activeConceptNames: ['discriminated union'],
  relatedFiles: [codeReferenceFixture],
  nextActions: ['Apply the user decision', 'Run parser tests'],
  updatedAt: timestamp,
  source: { kind: 'AGENT', role: 'BUILDER' },
  redactionStatus: 'VERIFIED_REDACTED',
} as const

export const contextRefreshRequestFixture = {
  schemaVersion: 1,
  id: ids.contextRefresh,
  projectId: ids.project,
  taskId: ids.task,
  correlationId: ids.correlation,
  revision: 1,
  observedContextVersion: 1,
  reason: 'The current Context no longer explains the Builder direction.',
  status: 'PENDING',
  requestedAt: timestamp,
  source: { kind: 'AGENT', role: 'HELPER' },
  redactionStatus: 'VERIFIED_REDACTED',
} as const

export const decisionRequestFixture = {
  schemaVersion: 1,
  id: ids.decision,
  projectId: ids.project,
  taskId: ids.task,
  correlationId: ids.correlation,
  contextVersion: 1,
  category: 'DATA_MODEL',
  question: 'Should unknown fields be rejected or retained for inspection?',
  reasonRequiredNow: 'The parser result type and UI behavior depend on this choice.',
  options: [
    {
      id: ids.optionA,
      label: 'Reject unknown fields',
      description: 'Keep the parser strict.',
      impacts: ['Typos fail early.'],
      tradeoffs: ['Provider additions require a schema update.'],
    },
    {
      id: ids.optionB,
      label: 'Retain unknown fields',
      description: 'Show unmodeled data in a separate section.',
      impacts: ['New provider fields remain visible.'],
      tradeoffs: ['Typos can be less obvious.'],
    },
  ],
  recommendedOptionId: ids.optionA,
  recommendationRationale: 'Strict parsing makes the learning target visible and catches mistakes.',
  relatedConceptNames: ['runtime validation'],
  sourceReferences: [codeReferenceFixture],
  independentWorkCanContinue: true,
  requestedAt: timestamp,
  source: { kind: 'AGENT', role: 'BUILDER' },
  redactionStatus: 'VERIFIED_REDACTED',
} as const

export const decisionResolutionFixture = {
  schemaVersion: 1,
  id: ids.resolution,
  decisionId: ids.decision,
  projectId: ids.project,
  taskId: ids.task,
  correlationId: ids.correlation,
  expectedContextVersion: 1,
  selectionKind: 'OPTION',
  selectedOptionId: ids.optionA,
  rationale: 'I want unexpected shapes to fail where they enter the app.',
  helperUsed: true,
  resolvedAt: timestamp,
  source: { kind: 'USER' },
  redactionStatus: 'NOT_REQUIRED',
} as const

export const decisionApplicationFixture = {
  schemaVersion: 1,
  id: ids.decisionApplication,
  decisionId: ids.decision,
  resolutionId: ids.resolution,
  projectId: ids.project,
  taskId: ids.task,
  correlationId: ids.correlation,
  appliedResult: 'Unknown fields are rejected at the parser boundary.',
  sourceReferences: [codeReferenceFixture],
  appliedAt: timestamp,
  source: { kind: 'AGENT', role: 'BUILDER' },
  redactionStatus: 'VERIFIED_REDACTED',
} as const

export const testResultReferenceFixture = {
  kind: 'TEST_RESULT',
  testResultId: ids.testResult,
  taskId: ids.task,
} as const

export const completionReportFixture = {
  schemaVersion: 1,
  id: ids.completionReport,
  projectId: ids.project,
  taskId: ids.task,
  correlationId: ids.correlation,
  expectedTaskRevision: 1,
  implementedFeatures: ['Validated and rendered event variants.'],
  acceptanceResults: [
    {
      criterionKey: 'valid_event',
      status: 'PASSED',
      evidence: [testResultReferenceFixture],
    },
  ],
  validationResults: [
    {
      name: 'event parser tests',
      status: 'PASSED',
      summary: 'All event variants passed.',
      reference: testResultReferenceFixture,
    },
  ],
  conceptUsage: [
    {
      conceptName: 'discriminated union',
      scope: 'LEARNER_FOCUS',
      importance: 'CORE',
      usageReason: 'Each event narrows using its type field.',
      codeReferences: [codeReferenceFixture],
    },
  ],
  appliedDecisionIds: [ids.decision],
  codeReferences: [codeReferenceFixture],
  diffReferences: [{ kind: 'DIFF', diffId: ids.diff, paths: ['src/events.ts'] }],
  specDeviations: [],
  remainingIssues: [],
  limitations: ['Only one provider is modeled.'],
  completedAt: timestamp,
  source: { kind: 'AGENT', role: 'BUILDER' },
  redactionStatus: 'VERIFIED_REDACTED',
} as const

export const userMessageReferenceFixture = {
  kind: 'USER_MESSAGE',
  conversationId: ids.conversation,
  messageId: ids.userMessage,
} as const

export const activityEventFixture = {
  schemaVersion: 1,
  id: ids.eventUser,
  projectId: ids.project,
  taskId: ids.task,
  conversationId: ids.conversation,
  correlationId: ids.correlation,
  sequence: 1,
  actor: { kind: 'USER' },
  occurredAt: timestamp,
  payload: {
    type: 'USER_MESSAGE',
    conversationId: ids.conversation,
    messageId: ids.userMessage,
    redactedExcerpt: 'Rejecting unknown fields should catch typos at the boundary.',
  },
  sourceReferences: [userMessageReferenceFixture],
  redactionStatus: 'VERIFIED_REDACTED',
} as const

export const episodeFixture = {
  schemaVersion: 1,
  id: ids.episode,
  projectId: ids.project,
  taskId: ids.task,
  decisionId: ids.decision,
  conversationId: ids.conversation,
  correlationId: ids.correlation,
  revision: 1,
  type: 'DECISION',
  status: 'PENDING_ANALYSIS',
  eventIds: [ids.eventUser],
  conceptCandidates: [{ conceptId: ids.concept, originalExpression: 'runtime validation' }],
  contextReferences: [codeReferenceFixture],
  startedAt: timestamp,
  endedAt: timestamp,
  closeReason: 'The user resolved the Decision.',
  source: { kind: 'CORE' },
  redactionStatus: 'VERIFIED_REDACTED',
} as const

export const analysisJobPendingFixture = {
  schemaVersion: 1,
  id: ids.analysisJob,
  projectId: ids.project,
  episodeId: ids.episode,
  episodeRevision: 1,
  correlationId: ids.correlation,
  revision: 1,
  status: 'PENDING',
  attempt: 0,
  maxAttempts: 2,
  timeoutMs: 30_000,
  createdAt: timestamp,
  updatedAt: timestamp,
  source: { kind: 'CORE' },
  redactionStatus: 'VERIFIED_REDACTED',
} as const

export const analysisJobFixture = {
  ...analysisJobPendingFixture,
  revision: 2,
  status: 'RUNNING',
  attempt: 1,
  runtimeHandle: 'analyst-slot-1',
  deadlineAt: '2026-08-25T03:00:30.000Z',
  startedAt: timestamp,
} as const

export const canonicalConceptFixture = {
  schemaVersion: 1,
  id: ids.concept,
  canonicalName: 'runtime validation',
  description: 'Checking unknown data against an executable schema at a system boundary.',
  revision: 1,
  createdAt: timestamp,
  updatedAt: timestamp,
  source: { kind: 'CORE' },
} as const

export const evidenceProposalFixture = {
  schemaVersion: 1,
  id: ids.evidenceProposal,
  projectId: ids.project,
  taskId: ids.task,
  episodeId: ids.episode,
  correlationId: ids.correlation,
  concept: {
    canonicalConceptId: ids.concept,
    originalExpression: 'catch typos at the boundary',
    proposedCanonicalName: 'runtime validation',
  },
  signal: 'JUSTIFIED_DECISION',
  strength: 'STRONG',
  promptDependence: 'INDEPENDENT',
  userEvidenceSources: [userMessageReferenceFixture],
  contextSources: [codeReferenceFixture],
  redactedEvidenceExcerpt: 'Rejecting unknown fields should catch typos at the boundary.',
  rationale: 'The user connected strict validation to a concrete failure mode.',
  maximumSupportedState: 'DEMONSTRATED',
  misconception: { action: 'NONE' },
  proposedAt: timestamp,
  source: { kind: 'AGENT', role: 'EVIDENCE_ANALYST' },
  redactionStatus: 'VERIFIED_REDACTED',
} as const

export const evidenceProposalBatchFixture = {
  schemaVersion: 1,
  projectId: ids.project,
  episodeId: ids.episode,
  correlationId: ids.correlation,
  episodeRevision: 1,
  proposals: [evidenceProposalFixture],
  submittedAt: timestamp,
  source: { kind: 'AGENT', role: 'EVIDENCE_ANALYST' },
} as const

export const acceptedEvidenceFixture = {
  schemaVersion: 1,
  id: ids.evidence,
  kind: 'USER_UNDERSTANDING',
  projectId: ids.project,
  taskId: ids.task,
  episodeId: ids.episode,
  conceptId: ids.concept,
  correlationId: ids.correlation,
  evidenceProposalId: ids.evidenceProposal,
  evidenceDecisionId: ids.evidenceDecision,
  signal: 'JUSTIFIED_DECISION',
  strength: 'STRONG',
  promptDependence: 'INDEPENDENT',
  supportsState: 'DEMONSTRATED',
  userEvidenceSources: [userMessageReferenceFixture],
  acceptedAt: timestamp,
  source: { kind: 'CORE' },
  redactionStatus: 'VERIFIED_REDACTED',
} as const

export const conceptLedgerFixture = {
  schemaVersion: 1,
  id: ids.conceptLedger,
  concept: canonicalConceptFixture,
  acceptedAliases: ['input validation'],
  state: {
    conceptId: ids.concept,
    state: 'DEMONSTRATED',
    acceptedEvidenceIds: [ids.evidence],
    reducerVersion: '1.0.0',
    revision: 1,
    updatedAt: timestamp,
  },
  openIssues: [],
  relatedProjectIds: [ids.project],
  relatedTaskIds: [ids.task],
  revision: 1,
  updatedAt: timestamp,
  source: { kind: 'CORE' },
} as const

export const auditRecordFixture = {
  schemaVersion: 1,
  id: ids.audit,
  correlationId: ids.correlation,
  actor: { kind: 'CORE' },
  action: 'ACCEPTED',
  resource: { type: 'EVIDENCE', id: ids.evidence, revision: 1 },
  outcome: 'SUCCEEDED',
  summary: 'Accepted user-authored Evidence after validation.',
  changedFields: ['state.acceptedEvidenceIds'],
  occurredAt: timestamp,
  redactionStatus: 'VERIFIED_REDACTED',
} as const

export const evaluationFixture = {
  schemaVersion: 1,
  id: ids.fixture,
  name: 'Unseen webhook learning goal',
  description: 'A redacted contract fixture outside the Campus Drop Golden Path.',
  kind: 'UNSEEN_DISCOVERY',
  inputPath: 'tests/eval/fixtures/inputs/webhook-lens.json',
  calibrationSubjectPath: 'tests/eval/fixtures/subjects/webhook-lens-good.json',
  calibrationReviewPath: 'tests/eval/fixtures/reviews/webhook-lens-good.json',
  expectedContractDomains: ['DISCOVERY', 'LEARNING_SPEC'],
  criteria: [
    {
      key: 'contract_valid',
      dimension: 'CONTRACT_INTEGRITY',
      reviewMode: 'AUTOMATED',
      description: 'Representative output passes the strict runtime contract.',
      successDefinition: 'No contract validation issue is produced.',
    },
  ],
  scenarioTags: ['unseen', 'no personal need'],
  fixtureVersion: '1.0.0',
  containsPersonalData: false,
  redactionStatus: 'VERIFIED_REDACTED',
} as const

export const evaluationResultFixture = {
  fixtureId: ids.fixture,
  fixtureVersion: '1.0.0',
  status: 'PASSED',
  criterionResults: [
    {
      criterionKey: 'contract_valid',
      dimension: 'CONTRACT_INTEGRITY',
      reviewMode: 'AUTOMATED',
      status: 'PASSED',
      explanation: 'All representative records passed runtime validation.',
      evidenceReferences: ['candidateRound'],
      metrics: [],
    },
  ],
  metrics: [
    {
      name: 'contract validation failures',
      value: 0,
      unit: 'COUNT',
      interpretation: 'All representative records passed runtime validation.',
    },
  ],
  notes: [],
} as const

export const evaluationRunFixture = {
  schemaVersion: 1,
  id: ids.evaluationRun,
  correlationId: ids.correlation,
  revision: 1,
  evaluatorVersion: '1.0.0',
  systemUnderTestVersion: '0.0.0',
  fixtureIds: [ids.fixture],
  status: 'COMPLETED',
  startedAt: timestamp,
  completedAt: timestamp,
  results: [evaluationResultFixture],
  redactionStatus: 'VERIFIED_REDACTED',
} as const

export const baselineResultFixture = {
  schemaVersion: 1,
  id: ids.baselineResult,
  evaluationRunId: ids.evaluationRun,
  correlationId: ids.correlation,
  kind: 'CALIBRATION',
  baselineName: 'contract-only baseline',
  baselineVersion: '1.0.0',
  results: [evaluationResultFixture],
  recordedAt: timestamp,
  redactionStatus: 'VERIFIED_REDACTED',
} as const
