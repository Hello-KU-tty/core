import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import {
  acceptedEvidenceSchema,
  activityEventSchema,
  auditRecordSchema,
  baselineResultSchema,
  builderTaskSchema,
  candidateRoundSchema,
  candidateDraftSchema,
  conceptLedgerEntrySchema,
  contextRefreshRequestSchema,
  contractErrorSchema,
  decisionApplicationSchema,
  decisionRequestSchema,
  decisionResolutionSchema,
  discoveryFeedbackSchema,
  discoverySessionSchema,
  episodeSchema,
  evaluationFixtureSchema,
  evaluationCaseResultSchema,
  evaluationRunSchema,
  evidenceProposalBatchSchema,
  evidenceProposalSchema,
  learningSpecRevisionSchema,
  liveProjectContextSchema,
  operationErrorSchema,
  projectCandidateRevisionSchema,
  projectSchema,
  taskCompletionReportSchema,
  validateContract,
} from '../src/index.ts'
import {
  acceptedEvidenceFixture,
  activityEventFixture,
  auditRecordFixture,
  baselineResultFixture,
  builderTaskFixture,
  candidateFixture,
  candidateRoundFixture,
  completionReportFixture,
  conceptLedgerFixture,
  contextRefreshRequestFixture,
  confirmedLearningSpecFixture,
  decisionApplicationFixture,
  decisionRequestFixture,
  decisionResolutionFixture,
  discoveryFeedbackFixture,
  discoverySessionFixture,
  episodeFixture,
  evaluationFixture,
  evaluationRunFixture,
  evidenceProposalBatchFixture,
  evidenceProposalFixture,
  liveContextFixture,
  projectFixture,
} from './fixtures.js'

function loadPayload(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`./payloads/${name}`, import.meta.url), 'utf8'))
}

describe('versioned strict payload fixtures', () => {
  it('accepts the current normal payload', () => {
    const result = validateContract(projectSchema, loadPayload('valid-project.json'))

    expect(result.success).toBe(true)
  })

  it('reports a missing required field with its path', () => {
    const result = validateContract(projectSchema, loadPayload('missing-required-project.json'))

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error.code).toBe('INVALID_PAYLOAD')
    expect(result.error.issues.some((issue) => issue.path[0] === 'learningGoal')).toBe(true)
    expect(contractErrorSchema.parse(result.error)).toEqual(result.error)
  })

  it('rejects unexpected fields instead of silently stripping them', () => {
    const result = validateContract(projectSchema, loadPayload('unexpected-field-project.json'))

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error.code).toBe('UNEXPECTED_FIELD')
    expect(result.error.issues[0]?.message).toContain('availableTime')
  })

  it('rejects legacy payloads with an explicit version error', () => {
    const result = validateContract(projectSchema, loadPayload('legacy-version-project.json'))

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error.code).toBe('UNSUPPORTED_SCHEMA_VERSION')
    expect(result.error.issues.some((issue) => issue.path[0] === 'schemaVersion')).toBe(true)
  })

  it('classifies a legacy Agent-authored Candidate as an unsupported version', () => {
    const result = validateContract(projectCandidateRevisionSchema, {
      ...candidateFixture,
      schemaVersion: 0,
    })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error.code).toBe('UNSUPPORTED_SCHEMA_VERSION')
  })

  it('accepts a concise starter Candidate without deferred evaluation and risks', () => {
    const { evaluation: _evaluation, risks: _risks, ...content } = candidateFixture
    const {
      schemaVersion: _schemaVersion,
      id: _id,
      discoverySessionId: _discoverySessionId,
      correlationId: _correlationId,
      revision: _revision,
      parentRevisions: _parentRevisions,
      createdAt: _createdAt,
      source: _source,
      redactionStatus: _redactionStatus,
      ...draftContent
    } = content
    expect(
      candidateDraftSchema.parse({ lineage: { kind: 'NEW' }, ...draftContent }),
    ).not.toHaveProperty('evaluation')
  })

  it('accepts target-free MORE feedback and rejects a targeted addition', () => {
    const more = { ...discoveryFeedbackFixture, intent: 'MORE', targets: [] } as const
    expect(discoveryFeedbackSchema.parse(more)).toEqual(more)
    expect(
      discoveryFeedbackSchema.safeParse({
        ...more,
        targets: [{ candidateId: candidateFixture.id, revision: 1 }],
      }).success,
    ).toBe(false)
  })

  it('serializes a redacted, recoverable operation error without raw diagnostics', () => {
    const error = {
      schemaVersion: 1,
      kind: 'OPERATION_ERROR',
      category: 'STALE_CONTEXT',
      code: 'STALE_CONTEXT_VERSION',
      disposition: 'RETRYABLE',
      message: 'Read the latest Live Context before retrying.',
      correlationId: projectFixture.correlationId,
      issues: [{ path: ['contextVersion'], code: 'stale', message: 'Expected revision 2' }],
      redactionStatus: 'NOT_REQUIRED',
    }

    expect(operationErrorSchema.parse(JSON.parse(JSON.stringify(error)))).toEqual(error)
    expect(
      operationErrorSchema.safeParse({ ...error, stack: '/Users/example/private.ts' }).success,
    ).toBe(false)
  })
})

describe('contract serialization', () => {
  const representativeContracts = [
    ['Project', projectSchema, projectFixture],
    ['DiscoverySession', discoverySessionSchema, discoverySessionFixture],
    ['ProjectCandidateRevision', projectCandidateRevisionSchema, candidateFixture],
    ['CandidateRound', candidateRoundSchema, candidateRoundFixture],
    ['DiscoveryFeedback', discoveryFeedbackSchema, discoveryFeedbackFixture],
    ['LearningSpecRevision', learningSpecRevisionSchema, confirmedLearningSpecFixture],
    ['BuilderTask', builderTaskSchema, builderTaskFixture],
    ['LiveProjectContext', liveProjectContextSchema, liveContextFixture],
    ['ContextRefreshRequest', contextRefreshRequestSchema, contextRefreshRequestFixture],
    ['DecisionRequest', decisionRequestSchema, decisionRequestFixture],
    ['DecisionResolution', decisionResolutionSchema, decisionResolutionFixture],
    ['DecisionApplication', decisionApplicationSchema, decisionApplicationFixture],
    ['TaskCompletionReport', taskCompletionReportSchema, completionReportFixture],
    ['ActivityEvent', activityEventSchema, activityEventFixture],
    ['Episode', episodeSchema, episodeFixture],
    ['EvidenceProposal', evidenceProposalSchema, evidenceProposalFixture],
    ['EvidenceProposalBatch', evidenceProposalBatchSchema, evidenceProposalBatchFixture],
    ['AcceptedEvidence', acceptedEvidenceSchema, acceptedEvidenceFixture],
    ['ConceptLedgerEntry', conceptLedgerEntrySchema, conceptLedgerFixture],
    ['AuditRecord', auditRecordSchema, auditRecordFixture],
    ['EvaluationFixture', evaluationFixtureSchema, evaluationFixture],
    ['EvaluationRun', evaluationRunSchema, evaluationRunFixture],
    ['BaselineResult', baselineResultSchema, baselineResultFixture],
  ] as const

  it.each(representativeContracts)('%s survives a JSON round trip', (_name, schema, fixture) => {
    const wirePayload: unknown = JSON.parse(JSON.stringify(fixture))

    expect(schema.parse(wirePayload)).toEqual(fixture)
  })
})

describe('Evaluation contract invariants', () => {
  it('rejects orphan calibration reviews and duplicate baseline cases', () => {
    expect(
      evaluationFixtureSchema.safeParse({
        ...evaluationFixture,
        calibrationSubjectPath: undefined,
      }).success,
    ).toBe(false)
    expect(
      baselineResultSchema.safeParse({
        ...baselineResultFixture,
        results: [baselineResultFixture.results[0], baselineResultFixture.results[0]],
      }).success,
    ).toBe(false)
  })

  it('derives a case status from criterion results', () => {
    expect(
      evaluationCaseResultSchema.safeParse({
        ...evaluationRunFixture.results[0],
        status: 'PASSED',
        criterionResults: [
          { ...evaluationRunFixture.results[0].criterionResults[0], status: 'FAILED' },
        ],
      }).success,
    ).toBe(false)
  })

  it('keeps a terminal run awaiting semantic review distinct from completion', () => {
    const needsReviewResult = {
      ...evaluationRunFixture.results[0],
      status: 'NEEDS_REVIEW',
      criterionResults: [
        {
          ...evaluationRunFixture.results[0].criterionResults[0],
          reviewMode: 'HUMAN',
          status: 'NEEDS_REVIEW',
        },
      ],
    } as const

    expect(
      evaluationRunSchema.safeParse({
        ...evaluationRunFixture,
        status: 'NEEDS_REVIEW',
        results: [needsReviewResult],
      }).success,
    ).toBe(true)
    expect(
      evaluationRunSchema.safeParse({
        ...evaluationRunFixture,
        status: 'COMPLETED',
        results: [needsReviewResult],
      }).success,
    ).toBe(false)
  })
})
