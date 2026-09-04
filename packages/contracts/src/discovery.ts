import { z } from 'zod'

import {
  actorSchema,
  candidateIdSchema,
  candidatePreviewRoundIdSchema,
  candidateRoundIdSchema,
  correlationIdSchema,
  discoverySessionIdSchema,
  entityRevisionSchema,
  expectedRevisionSchema,
  feedbackIdSchema,
  idempotencyKeySchema,
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

const projectCandidateContentShape = {
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
  risks: z.array(shortTextSchema).max(12).optional(),
  generationTags: z.array(candidateGenerationTagSchema).min(1).max(4),
  evaluation: candidateEvaluationSchema.optional(),
} as const

const candidatePreviewContentShape = {
  title: labelSchema,
  summary: shortTextSchema,
  coreInteraction: nonEmptyTextSchema,
  appeal: nonEmptyTextSchema,
  technologyNecessity: nonEmptyTextSchema,
  generationTags: z.array(candidateGenerationTagSchema).min(1).max(4),
} as const

export const candidatePreviewDraftSchema = z.strictObject(candidatePreviewContentShape)

export const candidatePreviewSchema = z.strictObject({
  candidateId: candidateIdSchema,
  position: z.int().min(1).max(10),
  ...candidatePreviewContentShape,
})

export const candidatePreviewRoundSchema = z
  .strictObject({
    schemaVersion: schemaVersionSchema,
    id: candidatePreviewRoundIdSchema,
    finalRoundId: candidateRoundIdSchema,
    discoverySessionId: discoverySessionIdSchema,
    correlationId: correlationIdSchema,
    inputSnapshot: discoveryInputSchema,
    previews: z.array(candidatePreviewSchema).length(10),
    generationRationale: nonEmptyTextSchema,
    createdAt: utcTimestampSchema,
    source: z.strictObject({ kind: z.literal('AGENT'), role: z.literal('DISCOVERY') }),
    redactionStatus: redactionStatusSchema,
  })
  .superRefine((round, context) => {
    const candidateIds = round.previews.map((preview) => preview.candidateId)
    if (new Set(candidateIds).size !== candidateIds.length) {
      context.addIssue({
        code: 'custom',
        path: ['previews'],
        message: 'Candidate preview identities must be unique',
      })
    }
    const positions = round.previews.map((preview) => preview.position).sort((a, b) => a - b)
    if (positions.some((position, index) => position !== index + 1)) {
      context.addIssue({
        code: 'custom',
        path: ['previews'],
        message: 'Candidate preview positions must contain every position from 1 through 10',
      })
    }
  })

export const projectCandidateRevisionSchema = z
  .strictObject({
    schemaVersion: schemaVersionSchema,
    id: candidateIdSchema,
    discoverySessionId: discoverySessionIdSchema,
    correlationId: correlationIdSchema,
    revision: entityRevisionSchema,
    parentRevisions: z.array(candidateRevisionReferenceSchema).max(8),
    ...projectCandidateContentShape,
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

export const candidateDraftSchema = z.strictObject({
  lineage: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('NEW') }),
    z.strictObject({
      kind: z.literal('REVISION'),
      candidateId: candidateIdSchema,
      revision: entityRevisionSchema,
      parentRevisions: z.array(candidateRevisionReferenceSchema).min(1).max(8),
    }),
  ]),
  ...projectCandidateContentShape,
})

export const discoverySubmitCandidateRoundToolInputSchema = z.strictObject({
  __tool_use_purpose: nonEmptyTextSchema.optional(),
  schemaVersion: schemaVersionSchema,
  projectId: projectIdSchema,
  discoverySessionId: discoverySessionIdSchema,
  correlationId: correlationIdSchema,
  idempotencyKey: idempotencyKeySchema,
  expectedSessionRevision: expectedRevisionSchema,
  appliedFeedbackIds: z.array(feedbackIdSchema).max(100),
  carriedCandidates: z.array(candidateRevisionReferenceSchema).max(30),
  candidates: z.array(candidateDraftSchema).max(30),
  generationRationale: nonEmptyTextSchema,
  diversityCheck: candidateDiversityCheckSchema,
})

export const discoverySubmitCandidateMergeToolInputSchema =
  discoverySubmitCandidateRoundToolInputSchema
    .omit({ appliedFeedbackIds: true, carriedCandidates: true, candidates: true })
    .extend({ candidate: candidateDraftSchema.omit({ lineage: true }) })

export const discoverySubmitCandidatePreviewsToolInputSchema = z.strictObject({
  __tool_use_purpose: nonEmptyTextSchema.optional(),
  schemaVersion: schemaVersionSchema,
  projectId: projectIdSchema,
  discoverySessionId: discoverySessionIdSchema,
  correlationId: correlationIdSchema,
  idempotencyKey: idempotencyKeySchema,
  expectedSessionRevision: expectedRevisionSchema,
  previews: z.array(candidatePreviewDraftSchema).length(10),
  generationRationale: nonEmptyTextSchema,
})

export const candidateEnrichmentBatchSchema = z.enum(['FIRST', 'SECOND'])

export const candidateEnrichmentDraftSchema = z.strictObject({
  candidateId: candidateIdSchema,
  ...projectCandidateContentShape,
})

export const candidateEnrichmentSchema = z.strictObject({
  schemaVersion: schemaVersionSchema,
  previewRoundId: candidatePreviewRoundIdSchema,
  discoverySessionId: discoverySessionIdSchema,
  correlationId: correlationIdSchema,
  candidate: projectCandidateRevisionSchema,
  createdAt: utcTimestampSchema,
  source: z.strictObject({ kind: z.literal('AGENT'), role: z.literal('DISCOVERY') }),
  redactionStatus: redactionStatusSchema,
})

export const discoverySubmitCandidateEnrichmentsToolInputSchema = z.strictObject({
  __tool_use_purpose: nonEmptyTextSchema.optional(),
  schemaVersion: schemaVersionSchema,
  projectId: projectIdSchema,
  discoverySessionId: discoverySessionIdSchema,
  correlationId: correlationIdSchema,
  idempotencyKey: idempotencyKeySchema,
  expectedSessionRevision: expectedRevisionSchema,
  previewRoundId: candidatePreviewRoundIdSchema,
  batch: candidateEnrichmentBatchSchema,
  candidates: z.array(candidateEnrichmentDraftSchema).length(5),
})

export const candidateRoundSchema = z
  .strictObject({
    schemaVersion: schemaVersionSchema,
    id: candidateRoundIdSchema,
    discoverySessionId: discoverySessionIdSchema,
    correlationId: correlationIdSchema,
    roundIndex: entityRevisionSchema,
    inputSnapshot: discoveryInputSchema,
    appliedFeedbackIds: z.array(feedbackIdSchema).max(100),
    candidates: z.array(candidateRevisionReferenceSchema).min(1).max(30),
    generationRationale: nonEmptyTextSchema,
    diversityCheck: candidateDiversityCheckSchema,
    createdAt: utcTimestampSchema,
    source: z.strictObject({ kind: z.literal('AGENT'), role: z.literal('DISCOVERY') }),
    redactionStatus: redactionStatusSchema,
  })
  .superRefine((round, context) => {
    if (new Set(round.appliedFeedbackIds).size !== round.appliedFeedbackIds.length) {
      context.addIssue({
        code: 'custom',
        path: ['appliedFeedbackIds'],
        message: 'Applied Discovery Feedback IDs must be unique',
      })
    }

    const references = round.candidates.map(
      (candidate) => `${candidate.candidateId}:${candidate.revision}`,
    )
    if (new Set(references).size !== references.length) {
      context.addIssue({
        code: 'custom',
        path: ['candidates'],
        message: 'Candidate Round references must be unique',
      })
    }
  })

export const discoveryFeedbackIntentSchema = z.enum([
  'PIN',
  'REJECT',
  'MERGE',
  'REVISE',
  'SHRINK',
  'EXPAND',
  'REGENERATE',
  'MORE',
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
    if (!['REGENERATE', 'MORE'].includes(feedback.intent) && feedback.targets.length === 0) {
      context.addIssue({
        code: 'custom',
        path: ['targets'],
        message: `${feedback.intent} feedback requires a candidate revision`,
      })
    }
    if (feedback.intent === 'MORE' && feedback.targets.length !== 0) {
      context.addIssue({
        code: 'custom',
        path: ['targets'],
        message: 'MORE feedback must not target an existing candidate revision',
      })
    }
    if (['REVISE', 'SHRINK', 'EXPAND'].includes(feedback.intent) && feedback.targets.length !== 1) {
      context.addIssue({
        code: 'custom',
        path: ['targets'],
        message: `${feedback.intent} feedback requires exactly one candidate revision`,
      })
    }
    const targetKeys = feedback.targets.map((target) => `${target.candidateId}:${target.revision}`)
    if (new Set(targetKeys).size !== targetKeys.length) {
      context.addIssue({
        code: 'custom',
        path: ['targets'],
        message: 'Discovery Feedback targets must be unique',
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
export type CandidateDraft = z.infer<typeof candidateDraftSchema>
export type CandidatePreview = z.infer<typeof candidatePreviewSchema>
export type CandidatePreviewRound = z.infer<typeof candidatePreviewRoundSchema>
export type CandidateEnrichment = z.infer<typeof candidateEnrichmentSchema>
export type CandidateEnrichmentBatch = z.infer<typeof candidateEnrichmentBatchSchema>
export type DiscoverySubmitCandidateRoundToolInput = z.infer<
  typeof discoverySubmitCandidateRoundToolInputSchema
>
