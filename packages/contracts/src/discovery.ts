import { z } from 'zod'

import {
  actorSchema,
  candidateIdSchema,
  candidateRoundIdSchema,
  correlationIdSchema,
  discoverySessionIdSchema,
  entityRevisionSchema,
  feedbackIdSchema,
  labelSchema,
  nonEmptyTextSchema,
  projectIdSchema,
  redactionStatusSchema,
  relativePosixPathSchema,
  schemaVersionSchema,
  shortTextSchema,
  utcTimestampSchema,
} from './primitives.js'

export const projectStatusSchema = z.enum(['DISCOVERY', 'SPEC_REVIEW', 'BUILDING', 'COMPLETED'])

export const projectSchema = z.strictObject({
  schemaVersion: schemaVersionSchema,
  id: projectIdSchema,
  correlationId: correlationIdSchema,
  revision: entityRevisionSchema,
  title: labelSchema,
  learningGoal: shortTextSchema,
  status: projectStatusSchema,
  generatedWorkspacePath: relativePosixPathSchema.optional(),
  createdAt: utcTimestampSchema,
  updatedAt: utcTimestampSchema,
  source: actorSchema,
  redactionStatus: redactionStatusSchema,
})

export const learnerLevelSchema = z.enum(['NEW', 'BEGINNER', 'FAMILIAR', 'UNSPECIFIED'])

export const discoveryInputSchema = z.strictObject({
  learningGoal: shortTextSchema,
  personalNeed: nonEmptyTextSchema.optional(),
  recentFriction: nonEmptyTextSchema.optional(),
  interestAreas: z.array(labelSchema).max(12).optional(),
  currentLevel: learnerLevelSchema.optional(),
  freeContext: nonEmptyTextSchema.optional(),
})

export const discoverySessionStatusSchema = z.enum(['ACTIVE', 'SELECTED', 'ABANDONED'])

export const discoverySessionSchema = z.strictObject({
  schemaVersion: schemaVersionSchema,
  id: discoverySessionIdSchema,
  projectId: projectIdSchema,
  correlationId: correlationIdSchema,
  revision: entityRevisionSchema,
  input: discoveryInputSchema,
  status: discoverySessionStatusSchema,
  openedAt: utcTimestampSchema,
  updatedAt: utcTimestampSchema,
  closedAt: utcTimestampSchema.optional(),
  source: actorSchema,
  redactionStatus: redactionStatusSchema,
})

export const candidateGenerationTagSchema = z.enum(['DIRECT', 'EXPAND', 'DISCOVER', 'UPGRADE'])

export const candidateEvaluationCriterionSchema = z.enum([
  'CONCEPT_NECESSITY',
  'PERSONAL_UTILITY',
  'ADOPTION_FEASIBILITY',
  'LEARNER_FIT',
  'SCOPE_FEASIBILITY',
  'ADJACENT_COMPLEXITY',
  'DEPLOYABILITY',
  'DISTINCTIVENESS',
])

const ALL_CANDIDATE_EVALUATION_CRITERIA = candidateEvaluationCriterionSchema.options

export const candidateEvaluationSchema = z
  .array(
    z.strictObject({
      criterion: candidateEvaluationCriterionSchema,
      assessment: z.enum(['POSITIVE', 'MIXED', 'CONCERN']),
      rationale: nonEmptyTextSchema,
    }),
  )
  .length(ALL_CANDIDATE_EVALUATION_CRITERIA.length)
  .superRefine((items, context) => {
    const criteria = new Set(items.map((item) => item.criterion))
    for (const criterion of ALL_CANDIDATE_EVALUATION_CRITERIA) {
      if (!criteria.has(criterion)) {
        context.addIssue({
          code: 'custom',
          message: `Missing candidate evaluation criterion ${criterion}`,
        })
      }
    }
    if (criteria.size !== items.length) {
      context.addIssue({ code: 'custom', message: 'Candidate evaluation criteria must be unique' })
    }
  })

export const candidateRevisionReferenceSchema = z.strictObject({
  candidateId: candidateIdSchema,
  revision: entityRevisionSchema,
})

export const candidateScopeSuggestionSchema = z.strictObject({
  learnerFocus: z.array(shortTextSchema).max(20),
  agentSupport: z.array(shortTextSchema).max(20),
  excluded: z.array(shortTextSchema).max(20),
})

export const projectCandidateRevisionSchema = z
  .strictObject({
    schemaVersion: schemaVersionSchema,
    id: candidateIdSchema,
    discoverySessionId: discoverySessionIdSchema,
    correlationId: correlationIdSchema,
    revision: entityRevisionSchema,
    parentRevisions: z.array(candidateRevisionReferenceSchema).max(8),
    title: labelSchema,
    summary: shortTextSchema,
    targetUsers: z.array(shortTextSchema).min(1).max(8),
    coreInteraction: nonEmptyTextSchema,
    usageMoment: nonEmptyTextSchema,
    appeal: nonEmptyTextSchema,
    personalNeedRelationship: nonEmptyTextSchema.optional(),
    technologyNecessity: nonEmptyTextSchema,
    coreConcepts: z.array(labelSchema).min(1).max(12),
    mvpFeatures: z.array(shortTextSchema).min(1).max(20),
    suggestedScope: candidateScopeSuggestionSchema,
    risks: z.array(shortTextSchema).max(12),
    generationTags: z.array(candidateGenerationTagSchema).min(1).max(4),
    evaluation: candidateEvaluationSchema,
    createdAt: utcTimestampSchema,
    source: z.strictObject({ kind: z.literal('AGENT'), role: z.literal('DISCOVERY') }),
    redactionStatus: redactionStatusSchema,
  })
  .superRefine((candidate, context) => {
    if (candidate.revision === 1 && candidate.parentRevisions.length > 0) {
      context.addIssue({
        code: 'custom',
        path: ['parentRevisions'],
        message: 'First candidate revision must not have parents',
      })
    }
    if (candidate.revision > 1 && candidate.parentRevisions.length === 0) {
      context.addIssue({
        code: 'custom',
        path: ['parentRevisions'],
        message: 'Later candidate revisions require lineage',
      })
    }

    const parentKeys = new Set<string>()
    for (const [index, parent] of candidate.parentRevisions.entries()) {
      const key = `${parent.candidateId}:${parent.revision}`
      if (parentKeys.has(key)) {
        context.addIssue({
          code: 'custom',
          path: ['parentRevisions', index],
          message: 'Candidate lineage references must be unique',
        })
      }
      parentKeys.add(key)
      if (parent.candidateId === candidate.id && parent.revision >= candidate.revision) {
        context.addIssue({
          code: 'custom',
          path: ['parentRevisions', index],
          message: 'Candidate cannot descend from its current or future revision',
        })
      }
    }
  })

export const candidateDiversityCheckSchema = z.strictObject({
  dimensionsReviewed: z.array(
    z.enum(['PROBLEM_DOMAIN', 'TARGET_USER', 'CORE_INTERACTION', 'DATA_SHAPE', 'USER_APPEAL']),
  ),
  modeCollapseDetected: z.boolean(),
  rationale: nonEmptyTextSchema,
})

export const candidateRoundSchema = z.strictObject({
  schemaVersion: schemaVersionSchema,
  id: candidateRoundIdSchema,
  discoverySessionId: discoverySessionIdSchema,
  correlationId: correlationIdSchema,
  roundIndex: entityRevisionSchema,
  inputSnapshot: discoveryInputSchema,
  candidates: z.array(candidateRevisionReferenceSchema).min(1).max(30),
  generationRationale: nonEmptyTextSchema,
  diversityCheck: candidateDiversityCheckSchema,
  createdAt: utcTimestampSchema,
  source: z.strictObject({ kind: z.literal('AGENT'), role: z.literal('DISCOVERY') }),
  redactionStatus: redactionStatusSchema,
})

export const discoveryFeedbackIntentSchema = z.enum([
  'PIN',
  'REJECT',
  'MERGE',
  'REVISE',
  'SHRINK',
  'EXPAND',
  'REGENERATE',
  'SELECT',
])

export const discoveryFeedbackSchema = z
  .strictObject({
    schemaVersion: schemaVersionSchema,
    id: feedbackIdSchema,
    discoverySessionId: discoverySessionIdSchema,
    roundId: candidateRoundIdSchema,
    correlationId: correlationIdSchema,
    intent: discoveryFeedbackIntentSchema,
    targets: z.array(candidateRevisionReferenceSchema).max(8),
    message: nonEmptyTextSchema.optional(),
    resultingRevisions: z.array(candidateRevisionReferenceSchema).max(30),
    createdAt: utcTimestampSchema,
    source: z.strictObject({ kind: z.literal('USER') }),
    redactionStatus: redactionStatusSchema,
  })
  .superRefine((feedback, context) => {
    if (feedback.intent === 'MERGE' && feedback.targets.length < 2) {
      context.addIssue({
        code: 'custom',
        path: ['targets'],
        message: 'MERGE feedback requires at least two candidate revisions',
      })
    }
    if (feedback.intent === 'SELECT' && feedback.targets.length !== 1) {
      context.addIssue({
        code: 'custom',
        path: ['targets'],
        message: 'SELECT feedback requires exactly one candidate revision',
      })
    }
    if (feedback.intent !== 'REGENERATE' && feedback.targets.length === 0) {
      context.addIssue({
        code: 'custom',
        path: ['targets'],
        message: `${feedback.intent} feedback requires a candidate revision`,
      })
    }
  })

export type Project = z.infer<typeof projectSchema>
export type DiscoveryInput = z.infer<typeof discoveryInputSchema>
export type DiscoverySession = z.infer<typeof discoverySessionSchema>
export type ProjectCandidateRevision = z.infer<typeof projectCandidateRevisionSchema>
export type CandidateRound = z.infer<typeof candidateRoundSchema>
export type DiscoveryFeedback = z.infer<typeof discoveryFeedbackSchema>
export type CandidateRevisionReference = z.infer<typeof candidateRevisionReferenceSchema>
