import { z } from 'zod'

import {
  baselineResultIdSchema,
  correlationIdSchema,
  evaluationRunIdSchema,
  fixtureIdSchema,
  labelSchema,
  nonEmptyTextSchema,
  redactionStatusSchema,
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
])

export const evaluationFixtureSchema = z.strictObject({
  schemaVersion: schemaVersionSchema,
  id: fixtureIdSchema,
  name: labelSchema,
  description: nonEmptyTextSchema,
  kind: z.enum([
    'GOLDEN_PATH',
    'UNSEEN_DISCOVERY',
    'FALSE_MASTERY',
    'MISCONCEPTION',
    'STALE_CONTEXT',
    'SECURITY',
  ]),
  inputPath: relativePosixPathSchema,
  expectedContractDomains: z.array(contractDomainSchema).min(1).max(20),
  fixtureVersion: semanticVersionSchema,
  containsPersonalData: z.literal(false),
  redactionStatus: z.literal('VERIFIED_REDACTED'),
})

export const evaluationMetricSchema = z.strictObject({
  name: labelSchema,
  value: z.number().finite(),
  unit: z.enum(['COUNT', 'RATIO', 'MILLISECONDS', 'TOKENS']),
  interpretation: nonEmptyTextSchema,
})

export const evaluationCaseResultSchema = z.strictObject({
  fixtureId: fixtureIdSchema,
  status: z.enum(['PASSED', 'FAILED', 'NEEDS_REVIEW', 'ERROR']),
  metrics: z.array(evaluationMetricSchema).max(100),
  notes: z.array(nonEmptyTextSchema).max(50),
})

export const evaluationRunSchema = z.strictObject({
  schemaVersion: schemaVersionSchema,
  id: evaluationRunIdSchema,
  correlationId: correlationIdSchema,
  evaluatorVersion: semanticVersionSchema,
  systemUnderTestVersion: semanticVersionSchema,
  fixtureIds: z.array(fixtureIdSchema).min(1).max(500),
  status: z.enum(['PENDING', 'RUNNING', 'COMPLETED', 'FAILED']),
  startedAt: utcTimestampSchema,
  completedAt: utcTimestampSchema.optional(),
  results: z.array(evaluationCaseResultSchema).max(500),
  redactionStatus: redactionStatusSchema,
})

export const baselineResultSchema = z.strictObject({
  schemaVersion: schemaVersionSchema,
  id: baselineResultIdSchema,
  evaluationRunId: evaluationRunIdSchema,
  correlationId: correlationIdSchema,
  baselineName: labelSchema,
  baselineVersion: semanticVersionSchema,
  results: z.array(evaluationCaseResultSchema).min(1).max(500),
  recordedAt: utcTimestampSchema,
  redactionStatus: redactionStatusSchema,
})

export type ContractDomain = z.infer<typeof contractDomainSchema>
export type EvaluationFixture = z.infer<typeof evaluationFixtureSchema>
export type EvaluationMetric = z.infer<typeof evaluationMetricSchema>
export type EvaluationRun = z.infer<typeof evaluationRunSchema>
export type BaselineResult = z.infer<typeof baselineResultSchema>
