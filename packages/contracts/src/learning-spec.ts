import { z } from 'zod'

import { candidateRevisionReferenceSchema } from './discovery.js'
import {
  actorSchema,
  correlationIdSchema,
  decisionCategorySchema,
  discoverySessionIdSchema,
  entityRevisionSchema,
  expectedRevisionSchema,
  idempotencyKeySchema,
  labelSchema,
  learningScopeCategorySchema,
  learningSpecIdSchema,
  nonEmptyTextSchema,
  projectIdSchema,
  redactionStatusSchema,
  schemaVersionSchema,
  shortTextSchema,
  utcTimestampSchema,
} from './primitives.js'

export const learningScopeItemSchema = z.strictObject({
  category: learningScopeCategorySchema,
  title: labelSchema,
  rationale: nonEmptyTextSchema,
  conceptNames: z.array(labelSchema).max(12),
})

export const expectedDecisionAreaSchema = z.strictObject({
  category: decisionCategorySchema,
  description: nonEmptyTextSchema,
  whyUserInputMatters: nonEmptyTextSchema,
})

export const learningSpecStatusSchema = z.enum(['DRAFT', 'CONFIRMED', 'SUPERSEDED'])

export const learningSpecConfirmationSchema = z.strictObject({
  confirmedAt: utcTimestampSchema,
  confirmedBy: z.strictObject({ kind: z.literal('USER') }),
})

const learningSpecContentShape = {
  productPurpose: nonEmptyTextSchema,
  targetUsers: z.array(shortTextSchema).min(1).max(8),
  primaryUsageMoment: nonEmptyTextSchema,
  successMoment: nonEmptyTextSchema,
  mvpFeatures: z.array(shortTextSchema).min(1).max(30),
  scope: z.array(learningScopeItemSchema).min(1).max(60),
  expectedDecisions: z.array(expectedDecisionAreaSchema).min(1).max(20),
  runtimeConstraint: z.literal('TYPESCRIPT'),
  deploymentConstraints: z.array(shortTextSchema).min(1).max(12),
} as const

function requireAllScopeCategories(
  value: {
    readonly scope: readonly {
      readonly category: string
      readonly conceptNames: readonly string[]
    }[]
  },
  context: z.core.$RefinementCtx,
): void {
  const categories = new Set(value.scope.map((item) => item.category))
  for (const category of learningScopeCategorySchema.options) {
    if (!categories.has(category)) {
      context.addIssue({
        code: 'custom',
        path: ['scope'],
        message: `Learning Spec must represent ${category}`,
        input: value,
      })
    }
  }
  if (
    !value.scope.some((item) => item.category === 'LEARNER_FOCUS' && item.conceptNames.length > 0)
  ) {
    context.addIssue({
      code: 'custom',
      path: ['scope'],
      message: 'Learning Spec requires at least one Learner Focus concept',
      input: value,
    })
  }

  const categoryByConcept = new Map<string, string>()
  for (const item of value.scope) {
    for (const conceptName of item.conceptNames) {
      const key = conceptName.trim().toLocaleLowerCase('en-US')
      const existingCategory = categoryByConcept.get(key)
      if (existingCategory !== undefined && existingCategory !== item.category) {
        context.addIssue({
          code: 'custom',
          path: ['scope'],
          message: `Learning Spec concept ${conceptName} cannot belong to multiple scope categories`,
          input: value,
        })
      }
      categoryByConcept.set(key, item.category)
    }
  }
}

export const learningSpecDraftContentSchema = z
  .strictObject(learningSpecContentShape)
  .superRefine(requireAllScopeCategories)

export const discoverySubmitLearningSpecToolInputSchema = z.strictObject({
  __tool_use_purpose: nonEmptyTextSchema.optional(),
  schemaVersion: schemaVersionSchema,
  projectId: projectIdSchema,
  discoverySessionId: discoverySessionIdSchema,
  correlationId: correlationIdSchema,
  idempotencyKey: idempotencyKeySchema,
  expectedSessionRevision: expectedRevisionSchema,
  expectedSpecRevision: expectedRevisionSchema,
  draft: learningSpecDraftContentSchema,
})

export const learningSpecRevisionSchema = z
  .strictObject({
    schemaVersion: schemaVersionSchema,
    id: learningSpecIdSchema,
    projectId: projectIdSchema,
    correlationId: correlationIdSchema,
    revision: entityRevisionSchema,
    parentRevision: entityRevisionSchema.optional(),
    selectedCandidate: candidateRevisionReferenceSchema,
    ...learningSpecContentShape,
    status: learningSpecStatusSchema,
    confirmation: learningSpecConfirmationSchema.optional(),
    createdAt: utcTimestampSchema,
    updatedAt: utcTimestampSchema,
    source: actorSchema,
    redactionStatus: redactionStatusSchema,
  })
  .superRefine((spec, context) => {
    if (spec.revision === 1 && spec.parentRevision !== undefined) {
      context.addIssue({
        code: 'custom',
        path: ['parentRevision'],
        message: 'First Learning Spec revision must not have a parent',
      })
    }
    if (spec.revision > 1 && spec.parentRevision !== spec.revision - 1) {
      context.addIssue({
        code: 'custom',
        path: ['parentRevision'],
        message: 'Learning Spec revision must point to its immediate predecessor',
      })
    }
    if (spec.status === 'CONFIRMED' && spec.confirmation === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['confirmation'],
        message: 'Confirmed Learning Spec requires explicit user confirmation',
      })
    }
    if (spec.status === 'CONFIRMED' && spec.source.kind !== 'USER') {
      context.addIssue({
        code: 'custom',
        path: ['source'],
        message: 'Confirmed Learning Spec must be user-authored',
      })
    }
    if (spec.status !== 'CONFIRMED' && spec.confirmation !== undefined) {
      context.addIssue({
        code: 'custom',
        path: ['confirmation'],
        message: 'Only a confirmed Learning Spec can contain confirmation',
      })
    }

    requireAllScopeCategories(spec, context)
  })

export type LearningScopeItem = z.infer<typeof learningScopeItemSchema>
export type ExpectedDecisionArea = z.infer<typeof expectedDecisionAreaSchema>
export type LearningSpecDraftContent = z.infer<typeof learningSpecDraftContentSchema>
export type LearningSpecRevision = z.infer<typeof learningSpecRevisionSchema>
