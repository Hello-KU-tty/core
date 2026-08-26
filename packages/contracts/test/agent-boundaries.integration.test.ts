import { describe, expect, it } from 'vitest'

import {
  agentRequestSchema,
  analystSubmitEvidenceProposalsCommandSchema,
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
})
