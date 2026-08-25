import { z } from 'zod'

import {
  completionReportIdSchema,
  correlationIdSchema,
  decisionApplicationIdSchema,
  decisionCategorySchema,
  decisionIdSchema,
  decisionOptionIdSchema,
  decisionResolutionIdSchema,
  entityRevisionSchema,
  expectedRevisionSchema,
  labelSchema,
  learningScopeCategorySchema,
  learningSpecIdSchema,
  liveContextIdSchema,
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

export const builderTaskStatusSchema = z.enum([
  'PENDING',
  'ACTIVE',
  'BLOCKED',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
])

export const acceptanceCriterionSchema = z.strictObject({
  key: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/),
  description: nonEmptyTextSchema,
})

export const builderTaskSchema = z.strictObject({
  schemaVersion: schemaVersionSchema,
  id: taskIdSchema,
  projectId: projectIdSchema,
  learningSpecId: learningSpecIdSchema,
  learningSpecRevision: entityRevisionSchema,
  correlationId: correlationIdSchema,
  revision: entityRevisionSchema,
  title: labelSchema,
  productGoal: nonEmptyTextSchema,
  requirements: z.array(nonEmptyTextSchema).min(1).max(40),
  acceptanceCriteria: z.array(acceptanceCriterionSchema).min(1).max(40),
  expectedConcepts: z.array(labelSchema).max(20),
  excludedWork: z.array(shortTextSchema).max(30),
  prerequisiteTaskIds: z.array(taskIdSchema).max(20),
  expectedDecisionCategories: z.array(decisionCategorySchema).max(10),
  sequence: z.int().positive(),
  status: builderTaskStatusSchema,
  createdAt: utcTimestampSchema,
  updatedAt: utcTimestampSchema,
  source: z.strictObject({ kind: z.literal('CORE') }),
  redactionStatus: redactionStatusSchema,
})

export const buildCheckpointSchema = z.enum([
  'TASK_STARTED',
  'DIRECTION_CHANGED',
  'CONCEPT_INTRODUCED',
  'DECISION_REQUIRED',
  'PLAN_CHANGED_AFTER_ERROR',
  'VALIDATION_STARTED',
  'TASK_COMPLETED',
])

export const liveProjectContextSchema = z
  .strictObject({
    schemaVersion: schemaVersionSchema,
    id: liveContextIdSchema,
    projectId: projectIdSchema,
    taskId: taskIdSchema,
    correlationId: correlationIdSchema,
    contextVersion: entityRevisionSchema,
    expectedPreviousVersion: expectedRevisionSchema,
    checkpoint: buildCheckpointSchema,
    stage: labelSchema,
    currentGoal: nonEmptyTextSchema,
    recentChanges: z.array(shortTextSchema).max(30),
    activeDecisionIds: z.array(decisionIdSchema).max(10),
    activeConceptNames: z.array(labelSchema).max(20),
    relatedFiles: z.array(codeReferenceSchema).max(30),
    nextActions: z.array(shortTextSchema).max(20),
    blockingReason: nonEmptyTextSchema.optional(),
    updatedAt: utcTimestampSchema,
    source: z.strictObject({ kind: z.literal('AGENT'), role: z.literal('BUILDER') }),
    redactionStatus: redactionStatusSchema,
  })
  .refine((context) => context.contextVersion === context.expectedPreviousVersion + 1, {
    path: ['contextVersion'],
    message: 'Live Context version must immediately follow expectedPreviousVersion',
  })

export const decisionOptionSchema = z.strictObject({
  id: decisionOptionIdSchema,
  label: labelSchema,
  description: nonEmptyTextSchema,
  impacts: z.array(shortTextSchema).min(1).max(12),
  tradeoffs: z.array(shortTextSchema).max(12),
})

export const decisionRequestSchema = z
  .strictObject({
    schemaVersion: schemaVersionSchema,
    id: decisionIdSchema,
    projectId: projectIdSchema,
    taskId: taskIdSchema,
    correlationId: correlationIdSchema,
    contextVersion: entityRevisionSchema,
    category: decisionCategorySchema,
    question: nonEmptyTextSchema,
    reasonRequiredNow: nonEmptyTextSchema,
    options: z.array(decisionOptionSchema).min(2).max(6),
    recommendedOptionId: decisionOptionIdSchema,
    recommendationRationale: nonEmptyTextSchema,
    relatedConceptNames: z.array(labelSchema).max(12),
    sourceReferences: z.array(contextualSourceReferenceSchema).max(30),
    independentWorkCanContinue: z.boolean(),
    requestedAt: utcTimestampSchema,
    source: z.strictObject({ kind: z.literal('AGENT'), role: z.literal('BUILDER') }),
    redactionStatus: redactionStatusSchema,
  })
  .superRefine((request, context) => {
    const optionIds = new Set(request.options.map((option) => option.id))
    if (optionIds.size !== request.options.length) {
      context.addIssue({
        code: 'custom',
        path: ['options'],
        message: 'Decision option IDs must be unique',
      })
    }
    if (!optionIds.has(request.recommendedOptionId)) {
      context.addIssue({
        code: 'custom',
        path: ['recommendedOptionId'],
        message: 'Recommended option must reference one of the Decision options',
      })
    }
  })

export const decisionResolutionSchema = z
  .strictObject({
    schemaVersion: schemaVersionSchema,
    id: decisionResolutionIdSchema,
    decisionId: decisionIdSchema,
    projectId: projectIdSchema,
    taskId: taskIdSchema,
    correlationId: correlationIdSchema,
    expectedContextVersion: entityRevisionSchema,
    selectionKind: z.enum(['OPTION', 'RECOMMENDATION', 'CUSTOM']),
    selectedOptionId: decisionOptionIdSchema.optional(),
    customProposal: nonEmptyTextSchema.optional(),
    rationale: nonEmptyTextSchema.optional(),
    helperUsed: z.boolean(),
    resolvedAt: utcTimestampSchema,
    source: z.strictObject({ kind: z.literal('USER') }),
    redactionStatus: redactionStatusSchema,
  })
  .superRefine((resolution, context) => {
    if (resolution.selectionKind === 'CUSTOM') {
      if (resolution.customProposal === undefined || resolution.selectedOptionId !== undefined) {
        context.addIssue({
          code: 'custom',
          path: ['customProposal'],
          message: 'CUSTOM resolution requires only a custom proposal',
        })
      }
      return
    }
    if (resolution.selectedOptionId === undefined || resolution.customProposal !== undefined) {
      context.addIssue({
        code: 'custom',
        path: ['selectedOptionId'],
        message: `${resolution.selectionKind} resolution requires only a selected option`,
      })
    }
  })

export const decisionApplicationSchema = z.strictObject({
  schemaVersion: schemaVersionSchema,
  id: decisionApplicationIdSchema,
  decisionId: decisionIdSchema,
  resolutionId: decisionResolutionIdSchema,
  projectId: projectIdSchema,
  taskId: taskIdSchema,
  correlationId: correlationIdSchema,
  appliedResult: nonEmptyTextSchema,
  sourceReferences: z.array(contextualSourceReferenceSchema).max(30),
  appliedAt: utcTimestampSchema,
  source: z.strictObject({ kind: z.literal('AGENT'), role: z.literal('BUILDER') }),
  redactionStatus: redactionStatusSchema,
})

export const validationResultSchema = z.strictObject({
  name: labelSchema,
  status: z.enum(['PASSED', 'FAILED', 'NOT_RUN']),
  summary: nonEmptyTextSchema,
  reference: testResultReferenceSchema.optional(),
})

export const conceptUsageReportSchema = z.strictObject({
  conceptName: labelSchema,
  scope: learningScopeCategorySchema,
  importance: z.enum(['CORE', 'SUPPORTING']),
  usageReason: nonEmptyTextSchema,
  codeReferences: z.array(codeReferenceSchema).max(20),
})

export const taskCompletionReportSchema = z.strictObject({
  schemaVersion: schemaVersionSchema,
  id: completionReportIdSchema,
  projectId: projectIdSchema,
  taskId: taskIdSchema,
  correlationId: correlationIdSchema,
  expectedTaskRevision: entityRevisionSchema,
  implementedFeatures: z.array(nonEmptyTextSchema).min(1).max(40),
  acceptanceResults: z.array(
    z.strictObject({
      criterionKey: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/),
      status: z.enum(['PASSED', 'FAILED']),
      evidence: z.array(contextualSourceReferenceSchema).max(20),
    }),
  ),
  validationResults: z.array(validationResultSchema).max(40),
  conceptUsage: z.array(conceptUsageReportSchema).max(30),
  appliedDecisionIds: z.array(decisionIdSchema).max(20),
  codeReferences: z.array(codeReferenceSchema).max(50),
  diffReferences: z.array(diffReferenceSchema).max(20),
  specDeviations: z.array(nonEmptyTextSchema).max(20),
  remainingIssues: z.array(nonEmptyTextSchema).max(30),
  limitations: z.array(nonEmptyTextSchema).max(30),
  completedAt: utcTimestampSchema,
  source: z.strictObject({ kind: z.literal('AGENT'), role: z.literal('BUILDER') }),
  redactionStatus: redactionStatusSchema,
})

export type BuilderTask = z.infer<typeof builderTaskSchema>
export type LiveProjectContext = z.infer<typeof liveProjectContextSchema>
export type DecisionOption = z.infer<typeof decisionOptionSchema>
export type DecisionRequest = z.infer<typeof decisionRequestSchema>
export type DecisionResolution = z.infer<typeof decisionResolutionSchema>
export type DecisionApplication = z.infer<typeof decisionApplicationSchema>
export type TaskCompletionReport = z.infer<typeof taskCompletionReportSchema>
