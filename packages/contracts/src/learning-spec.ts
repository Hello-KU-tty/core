import { z } from 'zod'

import { candidateRevisionReferenceSchema } from './discovery.js'
import {
  actorSchema,
  correlationIdSchema,
  decisionCategorySchema,
  entityRevisionSchema,
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

export const learningSpecRevisionSchema = z
  .strictObject({
    schemaVersion: schemaVersionSchema,
    id: learningSpecIdSchema,
    projectId: projectIdSchema,
    correlationId: correlationIdSchema,
    revision: entityRevisionSchema,
    parentRevision: entityRevisionSchema.optional(),
    selectedCandidate: candidateRevisionReferenceSchema,
    productPurpose: nonEmptyTextSchema,
    targetUsers: z.array(shortTextSchema).min(1).max(8),
    primaryUsageMoment: nonEmptyTextSchema,
    successMoment: nonEmptyTextSchema,
    mvpFeatures: z.array(shortTextSchema).min(1).max(30),
    scope: z.array(learningScopeItemSchema).min(1).max(60),
    expectedDecisions: z.array(expectedDecisionAreaSchema).max(20),
    runtimeConstraint: z.literal('TYPESCRIPT'),
    deploymentConstraints: z.array(shortTextSchema).max(12),
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

    const categories = new Set(spec.scope.map((item) => item.category))
    for (const category of learningScopeCategorySchema.options) {
      if (!categories.has(category)) {
        context.addIssue({
          code: 'custom',
          path: ['scope'],
          message: `Learning Spec must represent ${category}`,
        })
      }
    }
  })

export type LearningScopeItem = z.infer<typeof learningScopeItemSchema>
export type ExpectedDecisionArea = z.infer<typeof expectedDecisionAreaSchema>
export type LearningSpecRevision = z.infer<typeof learningSpecRevisionSchema>
