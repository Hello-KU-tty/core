import { z } from 'zod'

import {
  baselineResultIdSchema,
  correlationIdSchema,
  entityRevisionSchema,
  evaluationRunIdSchema,
  fixtureIdSchema,
  labelSchema,
  nonEmptyTextSchema,
  relativePosixPathSchema,
  schemaVersionSchema,
  semanticVersionSchema,
  utcTimestampSchema,
} from './primitives.js'

export const contractDomainSchema = z.enum([
  'DISCOVERY',
  'LEARNING_SPEC',
  'BUILD',
  'DECISION',
  'ACTIVITY',
  'EPISODE',
  'EVIDENCE',
  'CONCEPT_LEDGER',
  'AUDIT',
  'EVALUATION',
])

export const evaluationDimensionSchema = z.enum([
  'DISCOVERY_DIVERSITY',
  'CONCEPT_NECESSITY',
  'SPEC_SCOPE',
  'CONTEXT_COMPLETENESS',
  'DECISION_NECESSITY',
  'EVIDENCE_QUALITY',
  'REDACTION',
  'CONTRACT_INTEGRITY',
])

export const evaluationReviewModeSchema = z.enum(['AUTOMATED', 'HUMAN'])

export const evaluationCriterionStatusSchema = z.enum(['PASSED', 'FAILED', 'NEEDS_REVIEW', 'ERROR'])

const criterionKeySchema = z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/)

export const evaluationCriterionSchema = z.strictObject({
  key: criterionKeySchema,
  dimension: evaluationDimensionSchema,
  reviewMode: evaluationReviewModeSchema,
  description: nonEmptyTextSchema,
  successDefinition: nonEmptyTextSchema,
})

export const evaluationFixtureSchema = z
  .strictObject({
    schemaVersion: schemaVersionSchema,
    id: fixtureIdSchema,
    name: labelSchema,
    description: nonEmptyTextSchema,
    kind: z.enum([
      'GOLDEN_PATH',
      'UNSEEN_DISCOVERY',
      'FALSE_MASTERY',
      'FALSE_MISCONCEPTION',
      'STALE_CONTEXT',
      'CANDIDATE_MODE_COLLAPSE',
      'SPEC_SCOPE',
      'DECISION_QUALITY',
      'REDACTION',
    ]),
    inputPath: relativePosixPathSchema,
    calibrationSubjectPath: relativePosixPathSchema.optional(),
    calibrationReviewPath: relativePosixPathSchema.optional(),
    expectedContractDomains: z.array(contractDomainSchema).min(1).max(20),
    criteria: z.array(evaluationCriterionSchema).min(1).max(50),
    scenarioTags: z.array(labelSchema).max(20),
    fixtureVersion: semanticVersionSchema,
    containsPersonalData: z.literal(false),
    redactionStatus: z.literal('VERIFIED_REDACTED'),
  })
  .superRefine((fixture, context) => {
    const keys = new Set(fixture.criteria.map((criterion) => criterion.key))
    if (keys.size !== fixture.criteria.length) {
      context.addIssue({
        code: 'custom',
        path: ['criteria'],
        message: 'Evaluation criterion keys must be unique within a fixture',
      })
    }
    const domains = new Set(fixture.expectedContractDomains)
    if (domains.size !== fixture.expectedContractDomains.length) {
      context.addIssue({
        code: 'custom',
        path: ['expectedContractDomains'],
        message: 'Expected contract domains must be unique',
      })
    }
    if (
      fixture.calibrationReviewPath !== undefined &&
      fixture.calibrationSubjectPath === undefined
    ) {
      context.addIssue({
        code: 'custom',
        path: ['calibrationReviewPath'],
        message: 'A calibration review requires a calibration subject',
      })
    }
  })

export const evaluationMetricSchema = z.strictObject({
  name: labelSchema,
  value: z.number().finite(),
  unit: z.enum(['COUNT', 'RATIO', 'MILLISECONDS', 'TOKENS']),
  interpretation: nonEmptyTextSchema,
})

export const evaluationCriterionResultSchema = z.strictObject({
  criterionKey: criterionKeySchema,
  dimension: evaluationDimensionSchema,
  reviewMode: evaluationReviewModeSchema,
  status: evaluationCriterionStatusSchema,
  explanation: nonEmptyTextSchema,
  evidenceReferences: z.array(nonEmptyTextSchema).max(30),
  metrics: z.array(evaluationMetricSchema).max(30),
})

function expectedCaseStatus(
  results: readonly { readonly status: z.infer<typeof evaluationCriterionStatusSchema> }[],
): z.infer<typeof evaluationCriterionStatusSchema> {
  if (results.some((result) => result.status === 'ERROR')) return 'ERROR'
  if (results.some((result) => result.status === 'FAILED')) return 'FAILED'
  if (results.some((result) => result.status === 'NEEDS_REVIEW')) return 'NEEDS_REVIEW'
  return 'PASSED'
}

export const evaluationCaseResultSchema = z
  .strictObject({
    fixtureId: fixtureIdSchema,
    fixtureVersion: semanticVersionSchema,
    status: evaluationCriterionStatusSchema,
    criterionResults: z.array(evaluationCriterionResultSchema).min(1).max(50),
    metrics: z.array(evaluationMetricSchema).max(100),
    notes: z.array(nonEmptyTextSchema).max(50),
  })
  .superRefine((result, context) => {
    const keys = new Set(result.criterionResults.map((criterion) => criterion.criterionKey))
    if (keys.size !== result.criterionResults.length) {
      context.addIssue({
        code: 'custom',
        path: ['criterionResults'],
        message: 'Evaluation criterion results must be unique within a case',
      })
    }
    if (result.status !== expectedCaseStatus(result.criterionResults)) {
      context.addIssue({
        code: 'custom',
        path: ['status'],
        message: 'Evaluation case status must summarize its criterion results',
      })
    }
  })

export const evaluationRunSchema = z
  .strictObject({
    schemaVersion: schemaVersionSchema,
    id: evaluationRunIdSchema,
    correlationId: correlationIdSchema,
    revision: entityRevisionSchema,
    evaluatorVersion: semanticVersionSchema,
    systemUnderTestVersion: semanticVersionSchema,
    fixtureIds: z.array(fixtureIdSchema).min(1).max(500),
    status: z.enum(['PENDING', 'RUNNING', 'NEEDS_REVIEW', 'COMPLETED', 'FAILED']),
    startedAt: utcTimestampSchema,
    completedAt: utcTimestampSchema.optional(),
    results: z.array(evaluationCaseResultSchema).max(500),
    redactionStatus: z.literal('VERIFIED_REDACTED'),
  })
  .superRefine((run, context) => {
    const fixtureIds = new Set(run.fixtureIds)
    if (fixtureIds.size !== run.fixtureIds.length) {
      context.addIssue({
        code: 'custom',
        path: ['fixtureIds'],
        message: 'Evaluation run fixture IDs must be unique',
      })
    }
    const resultFixtureIds = new Set(run.results.map((result) => result.fixtureId))
    if (resultFixtureIds.size !== run.results.length) {
      context.addIssue({
        code: 'custom',
        path: ['results'],
        message: 'Evaluation run can contain only one result per fixture',
      })
    }
    for (const [index, result] of run.results.entries()) {
      if (!fixtureIds.has(result.fixtureId)) {
        context.addIssue({
          code: 'custom',
          path: ['results', index, 'fixtureId'],
          message: 'Evaluation result must belong to the run fixture set',
        })
      }
    }

    const terminal = ['NEEDS_REVIEW', 'COMPLETED', 'FAILED'].includes(run.status)
    if (terminal !== (run.completedAt !== undefined)) {
      context.addIssue({
        code: 'custom',
        path: ['completedAt'],
        message: 'Only terminal Evaluation runs require completedAt',
      })
    }
    if (run.status === 'PENDING' && run.results.length > 0) {
      context.addIssue({
        code: 'custom',
        path: ['results'],
        message: 'Pending Evaluation run must not contain results',
      })
    }
    if (terminal && resultFixtureIds.size !== fixtureIds.size) {
      context.addIssue({
        code: 'custom',
        path: ['results'],
        message: 'Terminal Evaluation run requires one result for every fixture',
      })
    }
    if (
      run.status === 'NEEDS_REVIEW' &&
      !run.results.some((result) => result.status === 'NEEDS_REVIEW')
    ) {
      context.addIssue({
        code: 'custom',
        path: ['status'],
        message: 'NEEDS_REVIEW run requires at least one case awaiting review',
      })
    }
    if (
      run.status === 'COMPLETED' &&
      run.results.some((result) => ['NEEDS_REVIEW', 'ERROR'].includes(result.status))
    ) {
      context.addIssue({
        code: 'custom',
        path: ['status'],
        message: 'Completed Evaluation run cannot contain pending review or scorer errors',
      })
    }
    if (run.status === 'FAILED' && !run.results.some((result) => result.status === 'ERROR')) {
      context.addIssue({
        code: 'custom',
        path: ['status'],
        message: 'Failed Evaluation run requires a scorer error',
      })
    }
  })

export const baselineResultSchema = z
  .strictObject({
    schemaVersion: schemaVersionSchema,
    id: baselineResultIdSchema,
    evaluationRunId: evaluationRunIdSchema,
    correlationId: correlationIdSchema,
    kind: z.enum(['CALIBRATION', 'GENERIC_KIRO', 'SIMPLE_MEMORY', 'ABLATION']),
    baselineName: labelSchema,
    baselineVersion: semanticVersionSchema,
    results: z.array(evaluationCaseResultSchema).min(1).max(500),
    recordedAt: utcTimestampSchema,
    redactionStatus: z.literal('VERIFIED_REDACTED'),
  })
  .superRefine((baseline, context) => {
    const fixtureIds = new Set(baseline.results.map((result) => result.fixtureId))
    if (fixtureIds.size !== baseline.results.length) {
      context.addIssue({
        code: 'custom',
        path: ['results'],
        message: 'Baseline result can contain only one result per fixture',
      })
    }
  })

export type ContractDomain = z.infer<typeof contractDomainSchema>
export type EvaluationDimension = z.infer<typeof evaluationDimensionSchema>
export type EvaluationReviewMode = z.infer<typeof evaluationReviewModeSchema>
export type EvaluationCriterion = z.infer<typeof evaluationCriterionSchema>
export type EvaluationFixture = z.infer<typeof evaluationFixtureSchema>
export type EvaluationMetric = z.infer<typeof evaluationMetricSchema>
export type EvaluationCriterionResult = z.infer<typeof evaluationCriterionResultSchema>
export type EvaluationCaseResult = z.infer<typeof evaluationCaseResultSchema>
export type EvaluationRun = z.infer<typeof evaluationRunSchema>
export type BaselineResult = z.infer<typeof baselineResultSchema>
