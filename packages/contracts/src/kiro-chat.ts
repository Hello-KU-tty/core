import { z } from 'zod'

import { builderTaskStatusSchema } from './build.js'
import {
  correlationIdSchema,
  decisionCategorySchema,
  decisionIdSchema,
  entityRevisionSchema,
  idempotencyKeySchema,
  labelSchema,
  nonEmptyTextSchema,
  projectIdSchema,
  relativePosixPathSchema,
  schemaVersionSchema,
  shortTextSchema,
  taskIdSchema,
} from './primitives.js'

/**
 * Kiro chat Builder surface (K10). The learner's own Kiro Agent sends only what it decided;
 * identifiers, schema versions, idempotency keys and expected revisions come from the binding
 * and from Core state at write time. These inputs are what the Agent sees as MCP tool schemas.
 */

const toolPurpose = { __tool_use_purpose: nonEmptyTextSchema.optional() } as const

const filesSchema = (max: number) => z.array(relativePosixPathSchema).max(max)

export const kiroChatProgressKindSchema = z.enum([
  'PLAN',
  'DIRECTION_CHANGE',
  'ERROR_REPLAN',
  'TEST_START',
])

export const kiroChatProgressNoteSchema = z.strictObject({
  kind: kiroChatProgressKindSchema,
  summary: nonEmptyTextSchema,
  stage: labelSchema.optional(),
  changes: z.array(shortTextSchema).max(30).optional(),
  nextSteps: z.array(shortTextSchema).max(20).optional(),
  files: filesSchema(30).optional(),
  concepts: z.array(labelSchema).max(20).optional(),
})

export const kiroChatChoiceOptionSchema = z.strictObject({
  label: labelSchema,
  description: nonEmptyTextSchema,
  tradeoffs: z.array(shortTextSchema).max(12).optional(),
})

export const kiroChatAskChoiceSchema = z
  .strictObject({
    category: decisionCategorySchema,
    question: nonEmptyTextSchema,
    whyNow: nonEmptyTextSchema,
    options: z.array(kiroChatChoiceOptionSchema).min(2).max(4),
    recommended: z.int().min(1).max(4),
    recommendationReason: nonEmptyTextSchema,
    blocksWork: z.boolean(),
    blockingReason: nonEmptyTextSchema.optional(),
    concepts: z.array(labelSchema).max(12).optional(),
    files: filesSchema(30).optional(),
  })
  .refine((choice) => choice.recommended <= choice.options.length, {
    path: ['recommended'],
    message: 'The recommended option number must be one of the options',
  })

/** A number is accepted as a JSON number or a numeric string, since models send both. */
const optionNumberSchema = z.preprocess(
  (value) => (typeof value === 'string' && /^\s*[1-6]\s*$/.test(value) ? Number(value) : value),
  z.int().min(1).max(6),
)

export const kiroChatSaveChoiceSchema = z
  .strictObject({
    decisionId: decisionIdSchema.optional(),
    choice: z.union([optionNumberSchema, z.literal('recommended'), z.literal('custom')]),
    customSummary: nonEmptyTextSchema.optional(),
  })
  .refine((answer) => answer.choice !== 'custom' || answer.customSummary !== undefined, {
    path: ['customSummary'],
    message: "A custom choice needs a short summary of the learner's idea",
  })

export const kiroChatFinishTaskSchema = z.strictObject({
  implemented: z.array(nonEmptyTextSchema).min(1).max(40),
  acceptance: z
    .array(
      z.strictObject({
        key: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/),
        passed: z.boolean(),
        /** The learner's Decision that changed this criterion; it then does not have to pass. */
        changedByDecisionId: decisionIdSchema.optional(),
      }),
    )
    .max(40),
  checks: z
    .array(
      z.strictObject({
        name: labelSchema,
        passed: z.boolean(),
        summary: nonEmptyTextSchema,
      }),
    )
    .max(40),
  decisionsApplied: z
    .array(z.strictObject({ decisionId: decisionIdSchema, how: nonEmptyTextSchema }))
    .max(20)
    .optional(),
  concepts: z
    .array(
      z.strictObject({
        name: labelSchema,
        why: nonEmptyTextSchema,
        files: filesSchema(20).optional(),
      }),
    )
    .max(30)
    .optional(),
  deviations: z.array(nonEmptyTextSchema).max(20).optional(),
  remaining: z.array(nonEmptyTextSchema).max(30).optional(),
  limitations: z.array(nonEmptyTextSchema).max(30).optional(),
  files: filesSchema(50).optional(),
})

// Agent-facing MCP tool inputs. Kiro may add `__tool_use_purpose`; nothing else is accepted.
export const kiroChatCheckProgressToolInputSchema = z.strictObject({ ...toolPurpose })
export const kiroChatSaveProgressToolInputSchema = kiroChatProgressNoteSchema.extend(toolPurpose)
export const kiroChatAskChoiceToolInputSchema = z
  .strictObject({ ...kiroChatAskChoiceSchema.shape, ...toolPurpose })
  .refine((choice) => choice.recommended <= choice.options.length, {
    path: ['recommended'],
    message: 'The recommended option number must be one of the options',
  })
export const kiroChatSaveChoiceToolInputSchema = z
  .strictObject({ ...kiroChatSaveChoiceSchema.shape, ...toolPurpose })
  .refine((answer) => answer.choice !== 'custom' || answer.customSummary !== undefined, {
    path: ['customSummary'],
    message: "A custom choice needs a short summary of the learner's idea",
  })
export const kiroChatFinishTaskToolInputSchema = kiroChatFinishTaskSchema.extend(toolPurpose)

const builderChatMetadata = {
  schemaVersion: schemaVersionSchema,
  correlationId: correlationIdSchema,
  actor: z.strictObject({ kind: z.literal('AGENT'), role: z.literal('BUILDER') }),
  projectId: projectIdSchema,
  taskId: taskIdSchema,
} as const

export const builderChatCheckProgressQuerySchema = z.strictObject({
  ...builderChatMetadata,
  kind: z.literal('BUILDER_CHAT_CHECK_PROGRESS'),
})

export const builderChatSaveProgressCommandSchema = z.strictObject({
  ...builderChatMetadata,
  kind: z.literal('BUILDER_CHAT_SAVE_PROGRESS'),
  idempotencyKey: idempotencyKeySchema,
  note: kiroChatProgressNoteSchema,
})

export const builderChatAskChoiceCommandSchema = z.strictObject({
  ...builderChatMetadata,
  kind: z.literal('BUILDER_CHAT_ASK_CHOICE'),
  idempotencyKey: idempotencyKeySchema,
  choice: kiroChatAskChoiceSchema,
})

export const builderChatSaveChoiceCommandSchema = z.strictObject({
  ...builderChatMetadata,
  kind: z.literal('BUILDER_CHAT_SAVE_CHOICE'),
  idempotencyKey: idempotencyKeySchema,
  answer: kiroChatSaveChoiceSchema,
})

export const builderChatFinishTaskCommandSchema = z.strictObject({
  ...builderChatMetadata,
  kind: z.literal('BUILDER_CHAT_FINISH_TASK'),
  idempotencyKey: idempotencyKeySchema,
  report: kiroChatFinishTaskSchema,
})

const numberedOptionSchema = z.strictObject({
  number: z.int().min(1).max(6),
  label: labelSchema,
})

export const builderChatProgressSchema = z.strictObject({
  schemaVersion: schemaVersionSchema,
  correlationId: correlationIdSchema,
  task: z.strictObject({ title: labelSchema, status: builderTaskStatusSchema }),
  acceptanceCriteria: z
    .array(z.strictObject({ key: z.string(), description: nonEmptyTextSchema }))
    .max(40),
  openChoices: z
    .array(
      z.strictObject({
        decisionId: decisionIdSchema,
        question: nonEmptyTextSchema,
        state: z.enum(['WAITING_FOR_LEARNER', 'CHOSEN']),
        options: z.array(numberedOptionSchema).min(2).max(6),
        recommendedNumber: z.int().min(1).max(6),
        chosenNumber: z.int().min(1).max(6).optional(),
        chosenCustom: z.boolean().optional(),
      }),
    )
    .max(10),
  omittedOpenChoiceCount: z.int().nonnegative(),
  lastNote: nonEmptyTextSchema.optional(),
})

export const builderChatSaveProgressReceiptSchema = z.strictObject({
  schemaVersion: schemaVersionSchema,
  correlationId: correlationIdSchema,
  outcome: z.enum(['SAVED', 'UNCHANGED']),
  contextVersion: entityRevisionSchema,
})

export const builderChatAskChoiceReceiptSchema = z.strictObject({
  schemaVersion: schemaVersionSchema,
  correlationId: correlationIdSchema,
  outcome: z.enum(['ASKED', 'ALREADY_OPEN']),
  decisionId: decisionIdSchema,
  options: z.array(numberedOptionSchema).min(2).max(6),
  recommendedNumber: z.int().min(1).max(6),
})

export const builderChatSaveChoiceReceiptSchema = z.strictObject({
  schemaVersion: schemaVersionSchema,
  correlationId: correlationIdSchema,
  outcome: z.enum(['SAVED', 'CHANGED', 'UNCHANGED']),
  decisionId: decisionIdSchema,
  chosen: z.strictObject({
    number: z.int().min(1).max(6).optional(),
    label: nonEmptyTextSchema,
    custom: z.boolean(),
  }),
  linkedMessageCount: z.int().min(0).max(20),
})

export const builderChatFinishTaskReceiptSchema = z.strictObject({
  schemaVersion: schemaVersionSchema,
  correlationId: correlationIdSchema,
  outcome: z.enum(['COMPLETED', 'ALREADY_COMPLETED']),
  taskRevision: entityRevisionSchema,
  /** Concepts the Agent named that the confirmed Learning Spec does not list; not recorded. */
  ignoredConcepts: z.array(labelSchema).max(30),
})

export type KiroChatProgressNote = z.infer<typeof kiroChatProgressNoteSchema>
export type KiroChatAskChoice = z.infer<typeof kiroChatAskChoiceSchema>
export type KiroChatSaveChoice = z.infer<typeof kiroChatSaveChoiceSchema>
export type KiroChatFinishTask = z.infer<typeof kiroChatFinishTaskSchema>
export type BuilderChatProgress = z.infer<typeof builderChatProgressSchema>
export type BuilderChatSaveProgressReceipt = z.infer<typeof builderChatSaveProgressReceiptSchema>
export type BuilderChatAskChoiceReceipt = z.infer<typeof builderChatAskChoiceReceiptSchema>
export type BuilderChatSaveChoiceReceipt = z.infer<typeof builderChatSaveChoiceReceiptSchema>
export type BuilderChatFinishTaskReceipt = z.infer<typeof builderChatFinishTaskReceiptSchema>
