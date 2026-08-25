import { z } from 'zod'

import {
  conversationIdSchema,
  decisionIdSchema,
  diffIdSchema,
  eventIdSchema,
  labelSchema,
  messageIdSchema,
  relativePosixPathSchema,
  taskIdSchema,
  testResultIdSchema,
  toolCallIdSchema,
} from './primitives.js'

export const lineRangeSchema = z
  .strictObject({
    start: z.int().positive(),
    end: z.int().positive(),
  })
  .refine(({ start, end }) => end >= start, {
    message: 'Line range end must be greater than or equal to start',
    path: ['end'],
  })

export const codeReferenceSchema = z.strictObject({
  kind: z.literal('CODE'),
  path: relativePosixPathSchema,
  lineRange: lineRangeSchema.optional(),
  revisionRef: labelSchema.optional(),
})

export const diffReferenceSchema = z.strictObject({
  kind: z.literal('DIFF'),
  diffId: diffIdSchema,
  paths: z.array(relativePosixPathSchema).min(1).max(50),
  revisionRef: labelSchema.optional(),
})

export const testResultReferenceSchema = z.strictObject({
  kind: z.literal('TEST_RESULT'),
  testResultId: testResultIdSchema,
  taskId: taskIdSchema,
})

export const toolCallReferenceSchema = z.strictObject({
  kind: z.literal('TOOL_CALL'),
  toolCallId: toolCallIdSchema,
  toolName: labelSchema,
})

export const userMessageReferenceSchema = z.strictObject({
  kind: z.literal('USER_MESSAGE'),
  conversationId: conversationIdSchema,
  messageId: messageIdSchema,
})

export const userDecisionReferenceSchema = z.strictObject({
  kind: z.literal('USER_DECISION'),
  decisionId: decisionIdSchema,
})

export const userActionReferenceSchema = z.strictObject({
  kind: z.literal('USER_ACTION'),
  eventId: eventIdSchema,
})

export const agentMessageReferenceSchema = z.strictObject({
  kind: z.literal('AGENT_MESSAGE'),
  conversationId: conversationIdSchema,
  messageId: messageIdSchema,
})

export const eventReferenceSchema = z.strictObject({
  kind: z.literal('EVENT'),
  eventId: eventIdSchema,
})

export const userEvidenceSourceReferenceSchema = z.discriminatedUnion('kind', [
  userMessageReferenceSchema,
  userDecisionReferenceSchema,
  userActionReferenceSchema,
])

export const contextualSourceReferenceSchema = z.discriminatedUnion('kind', [
  codeReferenceSchema,
  diffReferenceSchema,
  testResultReferenceSchema,
  toolCallReferenceSchema,
  userMessageReferenceSchema,
  userDecisionReferenceSchema,
  userActionReferenceSchema,
  agentMessageReferenceSchema,
  eventReferenceSchema,
])

export type LineRange = z.infer<typeof lineRangeSchema>
export type CodeReference = z.infer<typeof codeReferenceSchema>
export type UserEvidenceSourceReference = z.infer<typeof userEvidenceSourceReferenceSchema>
export type ContextualSourceReference = z.infer<typeof contextualSourceReferenceSchema>
