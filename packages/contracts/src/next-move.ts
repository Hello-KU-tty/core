import { z } from 'zod'

import { analysisFailureSchema } from './analysis.js'
import { learningSpecRevisionSchema } from './learning-spec.js'
import {
  correlationIdSchema,
  entityRevisionSchema,
  labelSchema,
  nextMoveJobIdSchema,
  projectIdSchema,
  redactionStatusSchema,
  schemaVersionSchema,
  shortTextSchema,
  taskIdSchema,
  utcTimestampSchema,
} from './primitives.js'

/**
 * Next Move (SPEC 5.8.1): after each finished Task a Discovery sub-agent suggests three ways to
 * grow the project. Suggestions are Agent-authored proposals; reading or choosing one never
 * changes Evidence or Concept State. The learner starts one only by saying so in the Builder chat.
 */

export const NEXT_MOVE_COUNT = 3 as const
export const NEXT_MOVE_MAX_ATTEMPTS = 2 as const
export const NEXT_MOVE_SOFT_TIMEOUT_MS = 120_000 as const

export const nextMoveSizeSchema = z.enum(['SMALL', 'MEDIUM'])

// The prompt asks for 16/45/35 characters; the bounds leave room so a slightly long line is not
// a failed attempt.
const moveContent = {
  title: z.string().trim().min(1).max(24),
  summary: z.string().trim().min(1).max(64),
  benefit: z.string().trim().min(1).max(48),
  size: nextMoveSizeSchema,
} as const

/** What the Agent returns for one suggestion; Core numbers them in the given order. */
export const nextMoveProposalSchema = z.strictObject({
  ...moveContent,
  /** Concepts this suggestion would naturally use; kept as provenance, never shown or scored. */
  concepts: z.array(labelSchema).max(5),
})

export const nextMoveSemanticResultSchema = z.strictObject({
  moves: z.array(nextMoveProposalSchema).length(NEXT_MOVE_COUNT),
})

export const nextMoveSchema = nextMoveProposalSchema.extend({
  number: z.int().min(1).max(NEXT_MOVE_COUNT),
})

export const nextMoveJobStatusSchema = z.enum(['PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED'])

export const nextMoveJobSchema = z
  .strictObject({
    schemaVersion: schemaVersionSchema,
    id: nextMoveJobIdSchema,
    projectId: projectIdSchema,
    sourceTaskId: taskIdSchema,
    correlationId: correlationIdSchema,
    revision: entityRevisionSchema,
    status: nextMoveJobStatusSchema,
    attempt: z.int().min(0).max(NEXT_MOVE_MAX_ATTEMPTS),
    maxAttempts: z.literal(NEXT_MOVE_MAX_ATTEMPTS),
    timeoutMs: z.literal(NEXT_MOVE_SOFT_TIMEOUT_MS),
    runtimeHandle: shortTextSchema.optional(),
    deadlineAt: utcTimestampSchema.optional(),
    lastFailure: analysisFailureSchema.optional(),
    moves: z.array(nextMoveSchema).length(NEXT_MOVE_COUNT).optional(),
    /** The Agent that wrote `moves`; present exactly when they are. */
    author: z
      .strictObject({
        kind: z.literal('AGENT'),
        role: z.literal('DISCOVERY'),
        promptVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
      })
      .optional(),
    createdAt: utcTimestampSchema,
    updatedAt: utcTimestampSchema,
    startedAt: utcTimestampSchema.optional(),
    completedAt: utcTimestampSchema.optional(),
    source: z.strictObject({ kind: z.literal('CORE') }),
    redactionStatus: redactionStatusSchema,
  })
  .superRefine((job, context) => {
    const issue = (message: string) => context.addIssue({ code: 'custom', message })
    if (job.status === 'RUNNING') {
      if (job.attempt < 1 || job.startedAt === undefined || job.deadlineAt === undefined)
        issue('Running Next Move Job requires an attempt, start time and deadline')
      if (job.completedAt !== undefined) issue('Running Next Move Job cannot be completed')
    } else if (job.deadlineAt !== undefined || job.runtimeHandle !== undefined) {
      issue('Only a running Next Move Job may retain runtime attempt fields')
    }
    const terminal = job.status === 'SUCCEEDED' || job.status === 'FAILED'
    if (terminal && (job.attempt < 1 || job.completedAt === undefined))
      issue('Terminal Next Move Job requires an attempted and completed result')
    if (job.status === 'PENDING' && job.completedAt !== undefined)
      issue('Pending Next Move Job cannot be completed')
    if (job.status === 'FAILED' && job.lastFailure === undefined)
      issue('Failed Next Move Job requires failure details')
    const hasMoves = job.moves !== undefined
    if (hasMoves !== (job.status === 'SUCCEEDED'))
      issue('Only a succeeded Next Move Job has suggestions, and it must have them')
    if (hasMoves !== (job.author !== undefined))
      issue('Next Move suggestions require their Agent author')
    if (job.moves?.some((move, index) => move.number !== index + 1))
      issue('Next Move suggestions are numbered 1 to 3 in order')
  })

/** Bounded, redacted input for one Next Move attempt. */
export const nextMoveContextSchema = z.strictObject({
  schemaVersion: schemaVersionSchema,
  correlationId: correlationIdSchema,
  nextMoveJobId: nextMoveJobIdSchema,
  projectTitle: labelSchema,
  learningSpec: learningSpecRevisionSchema,
  /** Finished and earlier Tasks of this project, oldest first, ending with the source Task. */
  tasks: z
    .array(
      z.strictObject({
        sequence: z.int().positive(),
        title: labelSchema,
        goal: z.string().trim().min(1).max(4_000),
        implemented: z.array(z.string().trim().min(1).max(4_000)).max(40),
        remaining: z.array(z.string().trim().min(1).max(4_000)).max(30),
        limitations: z.array(z.string().trim().min(1).max(4_000)).max(30),
        /** The Next Move suggestion the learner started this Task from, if any. */
        fromNextMove: z.strictObject({ title: z.string(), summary: z.string() }).optional(),
      }),
    )
    .min(1)
    .max(20),
  /** Core's learner-level summary from Concept State; a secondary signal only. */
  learnerProfile: z.string().max(20_000).nullable(),
})

export const nextMoveViewStatusSchema = z.enum(['NONE', 'GENERATING', 'READY', 'FAILED'])

/** What the panel, the Builder chat and Helper see. Concepts stay internal. */
export const nextMoveViewSchema = z.strictObject({
  status: nextMoveViewStatusSchema,
  nextMoveJobId: nextMoveJobIdSchema.optional(),
  jobRevision: entityRevisionSchema.optional(),
  sourceTaskId: taskIdSchema.optional(),
  moves: z
    .array(z.strictObject({ number: nextMoveSchema.shape.number, ...moveContent }))
    .max(NEXT_MOVE_COUNT),
  failureCode: analysisFailureSchema.shape.code.optional(),
  updatedAt: utcTimestampSchema.optional(),
})

const nextMoveRuntimeMetadata = {
  schemaVersion: schemaVersionSchema,
  correlationId: correlationIdSchema,
  actor: z.strictObject({ kind: z.literal('KIRO_ADAPTER') }),
} as const

const nextMoveJobTarget = {
  projectId: projectIdSchema,
  nextMoveJobId: nextMoveJobIdSchema,
  expectedJobRevision: entityRevisionSchema,
} as const

export const nextMoveListPendingQuerySchema = z.strictObject({
  ...nextMoveRuntimeMetadata,
  kind: z.literal('NEXT_MOVE_LIST_PENDING'),
  limit: z.int().min(1).max(100),
})

export const nextMoveRecoverExpiredCommandSchema = z.strictObject({
  ...nextMoveRuntimeMetadata,
  kind: z.literal('NEXT_MOVE_RECOVER_EXPIRED'),
  limit: z.int().min(1).max(100),
})

export const nextMoveClaimJobCommandSchema = z.strictObject({
  ...nextMoveRuntimeMetadata,
  kind: z.literal('NEXT_MOVE_CLAIM_JOB'),
  ...nextMoveJobTarget,
  runtimeHandle: shortTextSchema,
})

export const nextMoveGetContextQuerySchema = z.strictObject({
  ...nextMoveRuntimeMetadata,
  kind: z.literal('NEXT_MOVE_GET_CONTEXT'),
  ...nextMoveJobTarget,
})

export const nextMoveFailAttemptCommandSchema = z.strictObject({
  ...nextMoveRuntimeMetadata,
  kind: z.literal('NEXT_MOVE_FAIL_ATTEMPT'),
  ...nextMoveJobTarget,
  attempt: z.int().min(1).max(NEXT_MOVE_MAX_ATTEMPTS),
  failure: analysisFailureSchema,
})

export const nextMoveSubmitResultCommandSchema = z.strictObject({
  ...nextMoveRuntimeMetadata,
  kind: z.literal('NEXT_MOVE_SUBMIT_RESULT'),
  ...nextMoveJobTarget,
  attempt: z.int().min(1).max(NEXT_MOVE_MAX_ATTEMPTS),
  promptVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  result: nextMoveSemanticResultSchema,
})

export const nextMoveRuntimeRequestSchema = z.discriminatedUnion('kind', [
  nextMoveListPendingQuerySchema,
  nextMoveRecoverExpiredCommandSchema,
  nextMoveClaimJobCommandSchema,
  nextMoveGetContextQuerySchema,
  nextMoveFailAttemptCommandSchema,
  nextMoveSubmitResultCommandSchema,
])

export type NextMoveSize = z.infer<typeof nextMoveSizeSchema>
export type NextMoveProposal = z.infer<typeof nextMoveProposalSchema>
export type NextMoveSemanticResult = z.infer<typeof nextMoveSemanticResultSchema>
export type NextMove = z.infer<typeof nextMoveSchema>
export type NextMoveJobStatus = z.infer<typeof nextMoveJobStatusSchema>
export type NextMoveJob = z.infer<typeof nextMoveJobSchema>
export type NextMoveContext = z.infer<typeof nextMoveContextSchema>
export type NextMoveView = z.infer<typeof nextMoveViewSchema>
export type NextMoveRuntimeRequest = z.infer<typeof nextMoveRuntimeRequestSchema>
