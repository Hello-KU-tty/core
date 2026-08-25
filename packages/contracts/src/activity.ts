import { z } from 'zod'

import {
  actorSchema,
  completionReportIdSchema,
  conceptIdSchema,
  conversationIdSchema,
  correlationIdSchema,
  decisionIdSchema,
  decisionResolutionIdSchema,
  entityRevisionSchema,
  episodeIdSchema,
  eventIdSchema,
  labelSchema,
  liveContextIdSchema,
  messageIdSchema,
  nonEmptyTextSchema,
  projectIdSchema,
  redactionStatusSchema,
  schemaVersionSchema,
  shortTextSchema,
  taskIdSchema,
  utcTimestampSchema,
} from './primitives.js'
import {
  codeReferenceSchema,
  contextualSourceReferenceSchema,
  diffReferenceSchema,
  testResultReferenceSchema,
} from './references.js'

export const activityPayloadSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('TASK_STARTED'), taskId: taskIdSchema }),
  z.strictObject({
    type: z.literal('TASK_COMPLETED'),
    taskId: taskIdSchema,
    completionReportId: completionReportIdSchema,
  }),
  z.strictObject({
    type: z.literal('LIVE_CONTEXT_UPDATED'),
    taskId: taskIdSchema,
    liveContextId: liveContextIdSchema,
    contextVersion: entityRevisionSchema,
  }),
  z.strictObject({
    type: z.literal('USER_MESSAGE'),
    conversationId: conversationIdSchema,
    messageId: messageIdSchema,
    redactedExcerpt: nonEmptyTextSchema,
  }),
  z.strictObject({
    type: z.literal('HELPER_RESPONSE'),
    conversationId: conversationIdSchema,
    messageId: messageIdSchema,
    summary: shortTextSchema,
  }),
  z.strictObject({ type: z.literal('DECISION_REQUESTED'), decisionId: decisionIdSchema }),
  z.strictObject({
    type: z.literal('DECISION_RESOLVED'),
    decisionId: decisionIdSchema,
    resolutionId: decisionResolutionIdSchema,
  }),
  z.strictObject({
    type: z.literal('CONCEPT_REPORTED'),
    taskId: taskIdSchema,
    conceptNames: z.array(labelSchema).min(1).max(30),
  }),
  z.strictObject({
    type: z.literal('VALIDATION_RESULT'),
    taskId: taskIdSchema,
    result: z.enum(['PASSED', 'FAILED']),
    reference: testResultReferenceSchema,
  }),
])

export const activityEventSchema = z
  .strictObject({
    schemaVersion: schemaVersionSchema,
    id: eventIdSchema,
    projectId: projectIdSchema,
    taskId: taskIdSchema.optional(),
    decisionId: decisionIdSchema.optional(),
    conversationId: conversationIdSchema.optional(),
    correlationId: correlationIdSchema,
    sequence: z.int().nonnegative(),
    actor: actorSchema,
    occurredAt: utcTimestampSchema,
    payload: activityPayloadSchema,
    sourceReferences: z.array(contextualSourceReferenceSchema).max(30),
    redactionStatus: redactionStatusSchema,
  })
  .superRefine((event, context) => {
    if (event.payload.type === 'USER_MESSAGE' && event.actor.kind !== 'USER') {
      context.addIssue({
        code: 'custom',
        path: ['actor'],
        message: 'USER_MESSAGE must be user-authored',
      })
    }
    if (
      event.payload.type === 'HELPER_RESPONSE' &&
      (event.actor.kind !== 'AGENT' || event.actor.role !== 'HELPER')
    ) {
      context.addIssue({
        code: 'custom',
        path: ['actor'],
        message: 'HELPER_RESPONSE must be authored by the Helper Agent',
      })
    }
  })

export const episodeTypeSchema = z.enum([
  'BUILD_TASK',
  'DECISION',
  'HELPER_CONVERSATION',
  'FINAL_UPGRADE',
])

export const episodeStatusSchema = z.enum([
  'OPEN',
  'PENDING_ANALYSIS',
  'ANALYZED',
  'ANALYSIS_FAILED',
])

export const episodeSchema = z
  .strictObject({
    schemaVersion: schemaVersionSchema,
    id: episodeIdSchema,
    projectId: projectIdSchema,
    taskId: taskIdSchema.optional(),
    decisionId: decisionIdSchema.optional(),
    conversationId: conversationIdSchema.optional(),
    correlationId: correlationIdSchema,
    revision: entityRevisionSchema,
    type: episodeTypeSchema,
    status: episodeStatusSchema,
    eventIds: z.array(eventIdSchema).min(1).max(500),
    conceptCandidates: z.array(
      z.strictObject({ conceptId: conceptIdSchema.optional(), originalExpression: labelSchema }),
    ),
    contextReferences: z.array(
      z.union([codeReferenceSchema, diffReferenceSchema, contextualSourceReferenceSchema]),
    ),
    startedAt: utcTimestampSchema,
    endedAt: utcTimestampSchema.optional(),
    closeReason: nonEmptyTextSchema.optional(),
    source: z.strictObject({ kind: z.literal('CORE') }),
    redactionStatus: redactionStatusSchema,
  })
  .superRefine((episode, context) => {
    if (episode.status === 'OPEN') {
      if (episode.endedAt !== undefined || episode.closeReason !== undefined) {
        context.addIssue({
          code: 'custom',
          message: 'Open Episode must not contain close fields',
        })
      }
      return
    }
    if (episode.endedAt === undefined || episode.closeReason === undefined) {
      context.addIssue({
        code: 'custom',
        message: 'Closed Episode requires endedAt and closeReason',
      })
      return
    }
    if (Date.parse(episode.endedAt) < Date.parse(episode.startedAt)) {
      context.addIssue({
        code: 'custom',
        path: ['endedAt'],
        message: 'Episode cannot end before it starts',
      })
    }
  })

export type ActivityPayload = z.infer<typeof activityPayloadSchema>
export type ActivityEvent = z.infer<typeof activityEventSchema>
export type Episode = z.infer<typeof episodeSchema>
