import { describe, expect, it } from 'vitest'

import {
  agentRequestSchema,
  analystSubmitEvidenceProposalsCommandSchema,
  builderApplyDecisionToolInputSchema,
  builderCompleteTaskToolInputSchema,
  builderRequestDecisionToolInputSchema,
  builderUpdateLiveContextToolInputSchema,
  builderUpdateLiveContextCommandSchema,
  discoverySubmitCandidateRoundCommandSchema,
  discoverySubmitLearningSpecCommandSchema,
  discoverySubmitLearningSpecToolInputSchema,
  helperGetContextQuerySchema,
  validateAgentRequest,
} from '../src/index.ts'
import {
  candidateFixture,
  candidateRoundFixture,
  confirmedLearningSpecFixture,
  draftLearningSpecFixture,
  learningSpecDraftContentFixture,
  evidenceProposalBatchFixture,
  ids,
  liveContextFixture,
} from './fixtures.js'

const discoveryRoundCommand = {
  schemaVersion: 1,
  kind: 'DISCOVERY_SUBMIT_CANDIDATE_ROUND',
  correlationId: ids.correlation,
  actor: { kind: 'AGENT', role: 'DISCOVERY' },
  idempotencyKey: ids.idempotency,
  expectedSessionRevision: 1,
  round: candidateRoundFixture,
  candidates: [candidateFixture],
} as const

const builderContextCommand = {
  schemaVersion: 1,
  kind: 'BUILDER_UPDATE_LIVE_CONTEXT',
  correlationId: ids.correlation,
  actor: { kind: 'AGENT', role: 'BUILDER' },
  idempotencyKey: ids.idempotency,
  context: liveContextFixture,
} as const

const helperQuery = {
  schemaVersion: 1,
  kind: 'HELPER_GET_CONTEXT',
  correlationId: ids.correlation,
  actor: { kind: 'AGENT', role: 'HELPER' },
  projectId: ids.project,
  taskId: ids.task,
  question: 'Why does the parser reject unknown fields?',
  relatedConceptNames: ['runtime validation'],
  observedContextVersion: 1,
} as const

const analystCommand = {
  schemaVersion: 1,
  kind: 'ANALYST_SUBMIT_EVIDENCE_PROPOSALS',
  correlationId: ids.correlation,
  actor: { kind: 'AGENT', role: 'EVIDENCE_ANALYST' },
  idempotencyKey: ids.idempotency,
  batch: evidenceProposalBatchFixture,
} as const

describe('Agent-specific request contracts', () => {
  it('accepts only the payload families assigned to each Agent', () => {
    expect(discoverySubmitCandidateRoundCommandSchema.parse(discoveryRoundCommand)).toEqual(
      discoveryRoundCommand,
    )
    expect(builderUpdateLiveContextCommandSchema.parse(builderContextCommand)).toEqual(
      builderContextCommand,
    )
    expect(helperGetContextQuerySchema.parse(helperQuery)).toEqual(helperQuery)
    expect(analystSubmitEvidenceProposalsCommandSchema.parse(analystCommand)).toEqual(
      analystCommand,
    )

    expect(agentRequestSchema.safeParse(discoveryRoundCommand).success).toBe(true)
    expect(agentRequestSchema.safeParse(builderContextCommand).success).toBe(true)
    expect(agentRequestSchema.safeParse(helperQuery).success).toBe(true)
    expect(agentRequestSchema.safeParse(analystCommand).success).toBe(true)
  })

  it('returns a permission error when Helper attempts a Builder mutation', () => {
    const result = validateAgentRequest('HELPER', builderContextCommand)

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error.category).toBe('PERMISSION')
    expect(result.error.code).toBe('AGENT_PERMISSION_MISMATCH')
    expect(result.error.message).toContain('HELPER')
  })

  it('does not expose a Concept State mutation to the Analyst', () => {
    const result = validateAgentRequest('EVIDENCE_ANALYST', {
      ...analystCommand,
      kind: 'ANALYST_CHANGE_CONCEPT_STATE',
    })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error.code).toBe('AGENT_PERMISSION_MISMATCH')
  })

  it('rejects caller role spoofing even for an otherwise valid command kind', () => {
    expect(
      builderUpdateLiveContextCommandSchema.safeParse({
        ...builderContextCommand,
        actor: { kind: 'AGENT', role: 'HELPER' },
      }).success,
    ).toBe(false)

    const result = validateAgentRequest('BUILDER', {
      ...builderContextCommand,
      actor: { kind: 'AGENT', role: 'HELPER' },
    })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error.code).toBe('AGENT_PERMISSION_MISMATCH')
  })

  it('allows Discovery to propose only a draft Learning Spec', () => {
    const command = {
      schemaVersion: 1,
      kind: 'DISCOVERY_SUBMIT_LEARNING_SPEC',
      correlationId: ids.correlation,
      actor: { kind: 'AGENT', role: 'DISCOVERY' },
      idempotencyKey: ids.idempotency,
      expectedSessionRevision: 1,
      expectedSpecRevision: 0,
      learningSpec: draftLearningSpecFixture,
    } as const

    expect(discoverySubmitLearningSpecCommandSchema.safeParse(command).success).toBe(true)
    expect(
      discoverySubmitLearningSpecCommandSchema.safeParse({
        ...command,
        learningSpec: confirmedLearningSpecFixture,
      }).success,
    ).toBe(false)

    expect(
      discoverySubmitLearningSpecToolInputSchema.safeParse({
        schemaVersion: 1,
        projectId: ids.project,
        discoverySessionId: ids.discoverySession,
        correlationId: ids.correlation,
        idempotencyKey: ids.idempotency,
        expectedSessionRevision: 1,
        expectedSpecRevision: 0,
        draft: learningSpecDraftContentFixture,
      }).success,
    ).toBe(true)
    expect(
      discoverySubmitLearningSpecToolInputSchema.safeParse({
        schemaVersion: 1,
        projectId: ids.project,
        discoverySessionId: ids.discoverySession,
        correlationId: ids.correlation,
        idempotencyKey: ids.idempotency,
        expectedSessionRevision: 1,
        expectedSpecRevision: 0,
        draft: learningSpecDraftContentFixture,
        learningSpecId: ids.learningSpec,
        source: { kind: 'AGENT', role: 'DISCOVERY' },
      }).success,
    ).toBe(false)
  })

  it('keeps Builder record identity, timestamps, provenance, and learning verdicts out of semantic tools', () => {
    const contextInput = {
      schemaVersion: 1,
      projectId: ids.project,
      taskId: ids.task,
      correlationId: ids.correlation,
      idempotencyKey: ids.idempotency,
      expectedPreviousVersion: 0,
      checkpoint: 'TASK_STARTED',
      stage: 'Starting',
      currentGoal: 'Implement the confirmed MVP.',
      recentChanges: [],
      activeDecisionIds: [],
      activeConceptNames: ['discriminated union'],
      relatedFiles: [],
      nextActions: ['Run the initial test.'],
    } as const
    expect(builderUpdateLiveContextToolInputSchema.safeParse(contextInput).success).toBe(true)
    expect(
      builderUpdateLiveContextToolInputSchema.safeParse({
        ...contextInput,
        id: ids.context,
        contextVersion: 1,
        updatedAt: '2026-08-25T03:00:00.000Z',
        source: { kind: 'AGENT', role: 'BUILDER' },
      }).success,
    ).toBe(false)

    const decisionInput = {
      schemaVersion: 1,
      projectId: ids.project,
      taskId: ids.task,
      correlationId: ids.correlation,
      idempotencyKey: ids.idempotency,
      expectedTaskRevision: 1,
      expectedContextVersion: 1,
      decision: {
        category: 'DATA_MODEL',
        question: 'Should unknown fields be rejected or retained?',
        reasonRequiredNow: 'The parser result depends on this choice.',
        options: [
          {
            key: 'reject',
            label: 'Reject',
            description: 'Reject unknown fields.',
            impacts: ['Typos fail early.'],
            tradeoffs: [],
          },
          {
            key: 'retain',
            label: 'Retain',
            description: 'Retain unknown fields.',
            impacts: ['New fields stay visible.'],
            tradeoffs: [],
          },
        ],
        recommendedOptionKey: 'reject',
        recommendationRationale: 'Strict parsing catches mistakes early.',
        relatedConceptNames: ['runtime validation'],
        sourceReferences: [],
        independentWorkCanContinue: false,
      },
      context: {
        stage: 'Waiting on parser behavior',
        currentGoal: 'Choose the parser behavior.',
        recentChanges: [],
        activeConceptNames: ['runtime validation'],
        relatedFiles: [],
        nextActions: ['Apply the user choice.'],
        blockingReason: 'The parser branch depends on this choice.',
      },
    } as const
    expect(builderRequestDecisionToolInputSchema.safeParse(decisionInput).success).toBe(true)
    expect(
      builderRequestDecisionToolInputSchema.safeParse({
        ...decisionInput,
        decisionId: ids.decision,
        requestedAt: '2026-08-25T03:00:00.000Z',
        source: { kind: 'AGENT', role: 'BUILDER' },
      }).success,
    ).toBe(false)

    expect(
      builderApplyDecisionToolInputSchema.safeParse({
        schemaVersion: 1,
        projectId: ids.project,
        taskId: ids.task,
        decisionId: ids.decision,
        correlationId: ids.correlation,
        idempotencyKey: ids.idempotency,
        expectedTaskRevision: 2,
        expectedContextVersion: 2,
        appliedResult: 'Implemented strict parsing.',
        sourceReferences: [],
        context: {
          stage: 'Applied parser behavior',
          currentGoal: 'Validate the selected behavior.',
          recentChanges: ['Implemented strict parsing.'],
          activeConceptNames: ['runtime validation'],
          relatedFiles: [],
          nextActions: ['Run tests.'],
        },
      }).success,
    ).toBe(true)

    const completionInput = {
      schemaVersion: 1,
      projectId: ids.project,
      taskId: ids.task,
      correlationId: ids.correlation,
      idempotencyKey: ids.idempotency,
      expectedTaskRevision: 1,
      report: {
        implementedFeatures: ['Rendered one event variant.'],
        acceptanceResults: [{ criterionKey: 'valid_event', status: 'PASSED', evidence: [] }],
        validationResults: [],
        conceptUsage: [],
        appliedDecisionIds: [],
        codeReferences: [],
        diffReferences: [],
        specDeviations: [],
        remainingIssues: [],
        limitations: [],
      },
    } as const
    expect(builderCompleteTaskToolInputSchema.safeParse(completionInput).success).toBe(true)
    expect(
      builderCompleteTaskToolInputSchema.safeParse({
        ...completionInput,
        report: { ...completionInput.report, userUnderstandsConcepts: true },
      }).success,
    ).toBe(false)
  })
})
