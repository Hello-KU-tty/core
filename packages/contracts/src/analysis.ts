import { z } from 'zod'

import { analystSemanticResultSchema } from './evidence.js'
import {
  analysisJobIdSchema,
  correlationIdSchema,
  entityRevisionSchema,
  episodeIdSchema,
  idempotencyKeySchema,
  nonEmptyTextSchema,
  projectIdSchema,
  redactionStatusSchema,
  schemaVersionSchema,
  shortTextSchema,
  utcTimestampSchema,
} from './primitives.js'

export const ANALYSIS_MAX_ATTEMPTS = 2 as const
export const ANALYSIS_SOFT_TIMEOUT_MS = 30_000 as const

export const analysisJobStatusSchema = z.enum(['PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED'])

export const analysisFailureSchema = z.strictObject({
  code: z.string().regex(/^[A-Z][A-Z0-9_]{0,79}$/),
  message: nonEmptyTextSchema,
  retryable: z.boolean(),
})

export const analysisResultSummarySchema = z
  .strictObject({
    proposalCount: z.int().min(0).max(100),
    acceptedCount: z.int().min(0).max(100),
    rejectedCount: z.int().min(0).max(100),
    noEvidenceReason: nonEmptyTextSchema.optional(),
  })
  .superRefine((summary, context) => {
    if (summary.acceptedCount + summary.rejectedCount !== summary.proposalCount) {
      context.addIssue({ code: 'custom', message: 'Analysis result counts must balance' })
    }
    if (summary.proposalCount === 0 && summary.noEvidenceReason === undefined) {
      context.addIssue({ code: 'custom', message: 'Empty analysis requires a reason' })
    }
    if (summary.proposalCount > 0 && summary.noEvidenceReason !== undefined) {
      context.addIssue({ code: 'custom', message: 'Non-empty analysis cannot claim no Evidence' })
    }
  })

export const analysisJobSchema = z
  .strictObject({
    schemaVersion: schemaVersionSchema,
    id: analysisJobIdSchema,
    projectId: projectIdSchema,
    episodeId: episodeIdSchema,
    episodeRevision: entityRevisionSchema,
    correlationId: correlationIdSchema,
    revision: entityRevisionSchema,
    status: analysisJobStatusSchema,
    attempt: z.int().min(0).max(ANALYSIS_MAX_ATTEMPTS),
    maxAttempts: z.literal(ANALYSIS_MAX_ATTEMPTS),
    timeoutMs: z.literal(ANALYSIS_SOFT_TIMEOUT_MS),
    runtimeHandle: shortTextSchema.optional(),
    deadlineAt: utcTimestampSchema.optional(),
    lastFailure: analysisFailureSchema.optional(),
    resultSummary: analysisResultSummarySchema.optional(),
    createdAt: utcTimestampSchema,
    updatedAt: utcTimestampSchema,
    startedAt: utcTimestampSchema.optional(),
    completedAt: utcTimestampSchema.optional(),
    source: z.strictObject({ kind: z.literal('CORE') }),
    redactionStatus: redactionStatusSchema,
  })
  .superRefine((job, context) => {
    if (job.status === 'RUNNING') {
      if (job.attempt < 1 || job.startedAt === undefined || job.deadlineAt === undefined) {
        context.addIssue({
          code: 'custom',
          message: 'Running Analysis Job requires an attempt, start time and deadline',
        })
      }
      if (job.completedAt !== undefined) {
        context.addIssue({ code: 'custom', message: 'Running Analysis Job cannot be completed' })
      }
      if (job.resultSummary !== undefined) {
        context.addIssue({
          code: 'custom',
          message: 'Running Analysis Job cannot have a result summary',
        })
      }
      return
    }
    if (job.deadlineAt !== undefined || job.runtimeHandle !== undefined) {
      context.addIssue({
        code: 'custom',
        message: 'Only a running Analysis Job may retain runtime attempt fields',
      })
    }
    if (job.status === 'SUCCEEDED' || job.status === 'FAILED') {
      if (job.attempt < 1 || job.completedAt === undefined) {
        context.addIssue({
          code: 'custom',
          message: 'Terminal Analysis Job requires an attempted and completed result',
        })
      }
    } else if (job.completedAt !== undefined) {
      context.addIssue({ code: 'custom', message: 'Pending Analysis Job cannot be completed' })
    }
    if (job.status === 'FAILED' && job.lastFailure === undefined) {
      context.addIssue({ code: 'custom', message: 'Failed Analysis Job requires failure details' })
    }
    if (job.status === 'SUCCEEDED' && job.resultSummary === undefined) {
      context.addIssue({
        code: 'custom',
        message: 'Succeeded Analysis Job requires a result summary',
      })
    }
    if (job.status !== 'SUCCEEDED' && job.resultSummary !== undefined) {
      context.addIssue({
        code: 'custom',
        message: 'Only a succeeded Analysis Job has a result summary',
      })
    }
  })

const analysisRuntimeMetadata = {
  schemaVersion: schemaVersionSchema,
  correlationId: correlationIdSchema,
  actor: z.strictObject({ kind: z.literal('KIRO_ADAPTER') }),
} as const

export const analysisClaimJobCommandSchema = z.strictObject({
  ...analysisRuntimeMetadata,
  kind: z.literal('ANALYSIS_CLAIM_JOB'),
  projectId: projectIdSchema,
  analysisJobId: analysisJobIdSchema,
  expectedJobRevision: entityRevisionSchema,
  runtimeHandle: shortTextSchema,
})

export const analysisListPendingQuerySchema = z.strictObject({
  ...analysisRuntimeMetadata,
  kind: z.literal('ANALYSIS_LIST_PENDING'),
  limit: z.int().min(1).max(100),
})

export const analysisRecoverExpiredCommandSchema = z.strictObject({
  ...analysisRuntimeMetadata,
  kind: z.literal('ANALYSIS_RECOVER_EXPIRED'),
  limit: z.int().min(1).max(100),
})

export const analysisFailAttemptCommandSchema = z.strictObject({
  ...analysisRuntimeMetadata,
  kind: z.literal('ANALYSIS_FAIL_ATTEMPT'),
  projectId: projectIdSchema,
  analysisJobId: analysisJobIdSchema,
  expectedJobRevision: entityRevisionSchema,
  attempt: z.int().min(1).max(ANALYSIS_MAX_ATTEMPTS),
  failure: analysisFailureSchema,
})

export const analysisSubmitResultCommandSchema = z.strictObject({
  ...analysisRuntimeMetadata,
  kind: z.literal('ANALYSIS_SUBMIT_RESULT'),
  idempotencyKey: idempotencyKeySchema,
  projectId: projectIdSchema,
  analysisJobId: analysisJobIdSchema,
  expectedJobRevision: entityRevisionSchema,
  attempt: z.int().min(1).max(ANALYSIS_MAX_ATTEMPTS),
  result: analystSemanticResultSchema,
})

export const analysisRuntimeRequestSchema = z.discriminatedUnion('kind', [
  analysisListPendingQuerySchema,
  analysisRecoverExpiredCommandSchema,
  analysisClaimJobCommandSchema,
  analysisFailAttemptCommandSchema,
  analysisSubmitResultCommandSchema,
])

export type AnalysisJobStatus = z.infer<typeof analysisJobStatusSchema>
export type AnalysisFailure = z.infer<typeof analysisFailureSchema>
export type AnalysisResultSummary = z.infer<typeof analysisResultSummarySchema>
export type AnalysisJob = z.infer<typeof analysisJobSchema>
export type AnalysisRuntimeRequest = z.infer<typeof analysisRuntimeRequestSchema>
