import { z } from 'zod'

import { analysisJobStatusSchema } from './analysis.js'
import { builderTaskSchema, decisionResolutionSchema } from './build.js'
import { discoveryFeedbackSchema, discoveryInputSchema } from './discovery.js'
import { learningSpecDraftContentSchema } from './learning-spec.js'
import {
  analysisJobIdSchema,
  conceptIdSchema,
  conversationIdSchema,
  correlationIdSchema,
  decisionIdSchema,
  entityRevisionSchema,
  episodeIdSchema,
  idempotencyKeySchema,
  discoverySessionIdSchema,
  learningSpecIdSchema,
  nonEmptyTextSchema,
  projectIdSchema,
  relativePosixPathSchema,
  schemaVersionSchema,
  shortTextSchema,
  taskIdSchema,
} from './primitives.js'

const uiRequestMetadata = {
  schemaVersion: schemaVersionSchema,
  correlationId: correlationIdSchema,
  actor: z.strictObject({ kind: z.literal('UI') }),
} as const

export const uiStartDiscoveryCommandSchema = z.strictObject({
  ...uiRequestMetadata,
  kind: z.literal('UI_START_DISCOVERY'),
  idempotencyKey: idempotencyKeySchema,
  projectId: projectIdSchema,
  input: discoveryInputSchema,
})

export const uiRecordDiscoveryFeedbackCommandSchema = z
  .strictObject({
    ...uiRequestMetadata,
    kind: z.literal('UI_RECORD_DISCOVERY_FEEDBACK'),
    idempotencyKey: idempotencyKeySchema,
    expectedSessionRevision: entityRevisionSchema,
    feedback: discoveryFeedbackSchema,
  })
  .refine((command) => command.feedback.correlationId === command.correlationId, {
    path: ['feedback', 'correlationId'],
    message: 'Discovery Feedback correlation ID must match its command',
  })

export const uiConfirmLearningSpecCommandSchema = z.strictObject({
  ...uiRequestMetadata,
  kind: z.literal('UI_CONFIRM_LEARNING_SPEC'),
  idempotencyKey: idempotencyKeySchema,
  projectId: projectIdSchema,
  learningSpecId: learningSpecIdSchema,
  expectedSpecRevision: entityRevisionSchema,
})

export const uiPrepareBuilderTaskCommandSchema = z.strictObject({
  ...uiRequestMetadata,
  kind: z.literal('UI_PREPARE_BUILDER_TASK'),
  idempotencyKey: idempotencyKeySchema,
  projectId: projectIdSchema,
  learningSpecId: learningSpecIdSchema,
  expectedSpecRevision: entityRevisionSchema,
})

export const uiUpdateLearningSpecCommandSchema = z.strictObject({
  ...uiRequestMetadata,
  kind: z.literal('UI_UPDATE_LEARNING_SPEC'),
  idempotencyKey: idempotencyKeySchema,
  projectId: projectIdSchema,
  learningSpecId: learningSpecIdSchema,
  expectedSessionRevision: entityRevisionSchema,
  expectedSpecRevision: entityRevisionSchema,
  draft: learningSpecDraftContentSchema,
})

export const uiReturnToDiscoveryCommandSchema = z.strictObject({
  ...uiRequestMetadata,
  kind: z.literal('UI_RETURN_TO_DISCOVERY'),
  idempotencyKey: idempotencyKeySchema,
  projectId: projectIdSchema,
  discoverySessionId: discoverySessionIdSchema,
  expectedSessionRevision: entityRevisionSchema,
  expectedSpecRevision: z.int().nonnegative(),
})

export const uiResolveDecisionCommandSchema = z
  .strictObject({
    ...uiRequestMetadata,
    kind: z.literal('UI_RESOLVE_DECISION'),
    idempotencyKey: idempotencyKeySchema,
    resolution: decisionResolutionSchema,
  })
  .refine((command) => command.resolution.correlationId === command.correlationId, {
    path: ['resolution', 'correlationId'],
    message: 'Decision Resolution correlation ID must match its command',
  })

export const uiOpenHelperQuerySchema = z.strictObject({
  ...uiRequestMetadata,
  kind: z.literal('UI_OPEN_HELPER'),
  projectId: projectIdSchema,
  taskId: taskIdSchema.optional(),
  decisionId: decisionIdSchema.optional(),
  question: nonEmptyTextSchema.optional(),
})

export const uiListProjectsQuerySchema = z.strictObject({
  ...uiRequestMetadata,
  kind: z.literal('UI_LIST_PROJECTS'),
  limit: z.int().min(1).max(100),
})

export const uiRestoreProjectSessionQuerySchema = z.strictObject({
  ...uiRequestMetadata,
  kind: z.literal('UI_RESTORE_PROJECT_SESSION'),
  projectId: projectIdSchema,
  helperConversationLimit: z.int().min(1).max(20),
})

export const uiRecordHelperExchangeCommandSchema = z.strictObject({
  ...uiRequestMetadata,
  kind: z.literal('UI_RECORD_HELPER_EXCHANGE'),
  idempotencyKey: idempotencyKeySchema,
  projectId: projectIdSchema,
  taskId: taskIdSchema.optional(),
  decisionId: decisionIdSchema.optional(),
  conversationId: conversationIdSchema.optional(),
  userMessage: nonEmptyTextSchema,
  helperResponseSummary: shortTextSchema,
  closeConversation: z.boolean(),
})

export const uiRetryAnalysisCommandSchema = z.strictObject({
  ...uiRequestMetadata,
  kind: z.literal('UI_RETRY_ANALYSIS'),
  idempotencyKey: idempotencyKeySchema,
  projectId: projectIdSchema,
  analysisJobId: analysisJobIdSchema,
  expectedJobRevision: entityRevisionSchema,
})

export const uiReadAnalysisJobsQuerySchema = z.strictObject({
  ...uiRequestMetadata,
  kind: z.literal('UI_READ_ANALYSIS_JOBS'),
  projectId: projectIdSchema,
  status: analysisJobStatusSchema.optional(),
  limit: z.int().min(1).max(100),
})

export const uiReadEvidenceTraceQuerySchema = z.strictObject({
  ...uiRequestMetadata,
  kind: z.literal('UI_READ_EVIDENCE_TRACE'),
  projectId: projectIdSchema,
  conceptId: conceptIdSchema.optional(),
})

export const uiLaunchResultCommandSchema = z.strictObject({
  ...uiRequestMetadata,
  kind: z.literal('UI_LAUNCH_RESULT'),
  idempotencyKey: idempotencyKeySchema,
  projectId: projectIdSchema,
})

export const generatedResultDescriptorSchema = z.strictObject({
  schemaVersion: schemaVersionSchema,
  correlationId: correlationIdSchema,
  projectId: projectIdSchema,
  workspacePath: relativePosixPathSchema,
  status: z.literal('READY'),
})

export const preparedBuilderTaskDescriptorSchema = z.strictObject({
  schemaVersion: schemaVersionSchema,
  correlationId: correlationIdSchema,
  projectId: projectIdSchema,
  workspacePath: relativePosixPathSchema,
  task: builderTaskSchema,
  status: z.literal('READY'),
})

export const helperExchangeReceiptSchema = z.strictObject({
  schemaVersion: schemaVersionSchema,
  correlationId: correlationIdSchema,
  conversationId: conversationIdSchema,
  episodeId: episodeIdSchema,
  episodeRevision: entityRevisionSchema,
  status: z.enum(['OPEN', 'PENDING_ANALYSIS']),
})

export const uiRequestSchema = z.discriminatedUnion('kind', [
  uiStartDiscoveryCommandSchema,
  uiRecordDiscoveryFeedbackCommandSchema,
  uiUpdateLearningSpecCommandSchema,
  uiConfirmLearningSpecCommandSchema,
  uiPrepareBuilderTaskCommandSchema,
  uiReturnToDiscoveryCommandSchema,
  uiResolveDecisionCommandSchema,
  uiListProjectsQuerySchema,
  uiRestoreProjectSessionQuerySchema,
  uiOpenHelperQuerySchema,
  uiRecordHelperExchangeCommandSchema,
  uiRetryAnalysisCommandSchema,
  uiReadAnalysisJobsQuerySchema,
  uiReadEvidenceTraceQuerySchema,
  uiLaunchResultCommandSchema,
])

export type UiRequest = z.infer<typeof uiRequestSchema>
export type GeneratedResultDescriptor = z.infer<typeof generatedResultDescriptorSchema>
export type PreparedBuilderTaskDescriptor = z.infer<typeof preparedBuilderTaskDescriptorSchema>
export type HelperExchangeReceipt = z.infer<typeof helperExchangeReceiptSchema>
