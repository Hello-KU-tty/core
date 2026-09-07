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
  personalizationTraceIdSchema,
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

export const uiPrepareFinalUpgradeTaskCommandSchema = z.strictObject({
  ...uiRequestMetadata,
  kind: z.literal('UI_PREPARE_FINAL_UPGRADE_TASK'),
  idempotencyKey: idempotencyKeySchema,
  projectId: projectIdSchema,
  sourceTaskId: taskIdSchema,
  expectedSourceTaskRevision: entityRevisionSchema,
  personalizationTraceId: personalizationTraceIdSchema,
  userGoal: nonEmptyTextSchema,
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
  input: discoveryInputSchema.optional(),
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

export const uiPrepareBuilderSessionQuerySchema = z.strictObject({
  ...uiRequestMetadata,
  kind: z.literal('UI_PREPARE_BUILDER_SESSION'),
  purpose: z.enum(['AGENT_SESSION', 'WORKSPACE_VIEW']).optional(),
  projectId: projectIdSchema,
  taskId: taskIdSchema,
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

export const uiPrepareDiscoveryAgentContextQuerySchema = z.strictObject({
  ...uiRequestMetadata,
  kind: z.literal('UI_PREPARE_DISCOVERY_AGENT_CONTEXT'),
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
  origin: z.enum(['FREE_TEXT', 'QUICK_ACTION']).default('FREE_TEXT'),
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

const generatedResultDescriptorBase = {
  schemaVersion: schemaVersionSchema,
  correlationId: correlationIdSchema,
  projectId: projectIdSchema,
  workspacePath: relativePosixPathSchema,
} as const

export const generatedResultDescriptorSchema = z.discriminatedUnion('status', [
  z.strictObject({
    ...generatedResultDescriptorBase,
    status: z.literal('READY'),
  }),
  z.strictObject({
    ...generatedResultDescriptorBase,
    status: z.literal('RUNNING'),
    url: z.url().refine((value) => {
      const match = value.match(/^http:\/\/127\.0\.0\.1:([1-9]\d{0,4})(?:\/[^?#]*)?$/)
      if (match?.[1] === undefined) return false
      return Number(match[1]) <= 65_535
    }, 'Generated result URL must use loopback HTTP'),
    reused: z.boolean(),
  }),
])

export const builderSessionBindingDescriptorSchema = z.strictObject({
  schemaVersion: schemaVersionSchema,
  correlationId: correlationIdSchema,
  projectId: projectIdSchema,
  taskId: taskIdSchema,
  workspaceDirectory: z
    .string()
    .min(1)
    .max(4_096)
    .refine(
      (value) =>
        (value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value)) && !/[\0\r\n]/.test(value),
      'Expected an absolute local POSIX or Windows drive path',
    ),
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
  uiPrepareFinalUpgradeTaskCommandSchema,
  uiReturnToDiscoveryCommandSchema,
  uiResolveDecisionCommandSchema,
  uiListProjectsQuerySchema,
  uiRestoreProjectSessionQuerySchema,
  uiPrepareDiscoveryAgentContextQuerySchema,
  uiOpenHelperQuerySchema,
  uiPrepareBuilderSessionQuerySchema,
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
export type BuilderSessionBindingDescriptor = z.infer<typeof builderSessionBindingDescriptorSchema>
