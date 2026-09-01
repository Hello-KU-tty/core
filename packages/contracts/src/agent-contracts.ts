import { z } from 'zod'

import { activityEventSchema, episodeSchema } from './activity.js'
import {
  builderTaskSchema,
  contextRefreshRequestSchema,
  decisionContextDraftSchema,
  decisionApplicationSchema,
  decisionRequestDraftSchema,
  decisionRequestSchema,
  decisionResolutionSchema,
  liveProjectContextSchema,
  taskCompletionReportSchema,
} from './build.js'
import {
  candidateRoundSchema,
  discoveryFeedbackSchema,
  discoverySessionSchema,
  projectCandidateRevisionSchema,
  projectSchema,
} from './discovery.js'
import { conceptLedgerEntrySchema, evidenceProposalBatchSchema } from './evidence.js'
import { learningSpecRevisionSchema } from './learning-spec.js'
import {
  correlationIdSchema,
  decisionIdSchema,
  discoverySessionIdSchema,
  entityRevisionSchema,
  episodeIdSchema,
  expectedRevisionSchema,
  idempotencyKeySchema,
  labelSchema,
  nonEmptyTextSchema,
  projectIdSchema,
  schemaVersionSchema,
  taskIdSchema,
  utcTimestampSchema,
} from './primitives.js'
import { codeReferenceSchema, contextualSourceReferenceSchema } from './references.js'

const discoveryQueryMetadata = {
  schemaVersion: schemaVersionSchema,
  correlationId: correlationIdSchema,
  actor: z.strictObject({ kind: z.literal('AGENT'), role: z.literal('DISCOVERY') }),
} as const

const builderQueryMetadata = {
  schemaVersion: schemaVersionSchema,
  correlationId: correlationIdSchema,
  actor: z.strictObject({ kind: z.literal('AGENT'), role: z.literal('BUILDER') }),
} as const

const helperQueryMetadata = {
  schemaVersion: schemaVersionSchema,
  correlationId: correlationIdSchema,
  actor: z.strictObject({ kind: z.literal('AGENT'), role: z.literal('HELPER') }),
} as const

const analystQueryMetadata = {
  schemaVersion: schemaVersionSchema,
  correlationId: correlationIdSchema,
  actor: z.strictObject({ kind: z.literal('AGENT'), role: z.literal('EVIDENCE_ANALYST') }),
} as const

export const discoveryGetContextQuerySchema = z.strictObject({
  ...discoveryQueryMetadata,
  kind: z.literal('DISCOVERY_GET_CONTEXT'),
  projectId: projectIdSchema,
  discoverySessionId: discoverySessionIdSchema.optional(),
})

export const builderGetTaskQuerySchema = z.strictObject({
  ...builderQueryMetadata,
  kind: z.literal('BUILDER_GET_TASK'),
  projectId: projectIdSchema,
  taskId: taskIdSchema,
})

export const builderGetDecisionResultQuerySchema = z.strictObject({
  ...builderQueryMetadata,
  kind: z.literal('BUILDER_GET_DECISION_RESULT'),
  projectId: projectIdSchema,
  taskId: taskIdSchema,
  decisionId: decisionIdSchema,
})

export const helperGetContextQuerySchema = z.strictObject({
  ...helperQueryMetadata,
  kind: z.literal('HELPER_GET_CONTEXT'),
  projectId: projectIdSchema,
  taskId: taskIdSchema.optional(),
  decisionId: decisionIdSchema.optional(),
  question: nonEmptyTextSchema,
  relatedConceptNames: z.array(labelSchema).max(5),
  observedContextVersion: entityRevisionSchema.optional(),
})

export const analystGetEpisodeContextQuerySchema = z.strictObject({
  ...analystQueryMetadata,
  kind: z.literal('ANALYST_GET_EPISODE_CONTEXT'),
  projectId: projectIdSchema,
  episodeId: episodeIdSchema,
  expectedEpisodeRevision: entityRevisionSchema,
})

export const discoverySubmitCandidateRoundCommandSchema = z
  .strictObject({
    ...discoveryQueryMetadata,
    kind: z.literal('DISCOVERY_SUBMIT_CANDIDATE_ROUND'),
    idempotencyKey: idempotencyKeySchema,
    expectedSessionRevision: expectedRevisionSchema,
    round: candidateRoundSchema,
    candidates: z.array(projectCandidateRevisionSchema).max(30),
  })
  .superRefine((command, context) => {
    if (command.round.correlationId !== command.correlationId) {
      context.addIssue({
        code: 'custom',
        path: ['round', 'correlationId'],
        message: 'Candidate Round correlation ID must match its command',
      })
    }

    const roundCandidates = new Set(
      command.round.candidates.map((candidate) => `${candidate.candidateId}:${candidate.revision}`),
    )
    const submittedCandidates = new Set<string>()
    for (const [index, candidate] of command.candidates.entries()) {
      const key = `${candidate.id}:${candidate.revision}`
      if (submittedCandidates.has(key)) {
        context.addIssue({
          code: 'custom',
          path: ['candidates', index],
          message: 'Submitted Candidate revisions must be unique',
        })
      }
      submittedCandidates.add(key)
      if (
        candidate.discoverySessionId !== command.round.discoverySessionId ||
        candidate.correlationId !== command.correlationId
      ) {
        context.addIssue({
          code: 'custom',
          path: ['candidates', index],
          message: 'Candidate must match its Round session and correlation ID',
        })
      }
      if (!roundCandidates.has(key)) {
        context.addIssue({
          code: 'custom',
          path: ['candidates', index],
          message: 'Every submitted Candidate revision must appear in the Candidate Round',
        })
      }
    }
  })

export const discoverySubmitLearningSpecCommandSchema = z
  .strictObject({
    ...discoveryQueryMetadata,
    kind: z.literal('DISCOVERY_SUBMIT_LEARNING_SPEC'),
    idempotencyKey: idempotencyKeySchema,
    expectedSessionRevision: expectedRevisionSchema,
    expectedSpecRevision: expectedRevisionSchema,
    learningSpec: learningSpecRevisionSchema,
  })
  .superRefine((command, context) => {
    if (command.learningSpec.status !== 'DRAFT') {
      context.addIssue({
        code: 'custom',
        path: ['learningSpec', 'status'],
        message: 'Discovery Agent can submit only a draft Learning Spec',
      })
    }
    if (
      command.learningSpec.source.kind !== 'AGENT' ||
      command.learningSpec.source.role !== 'DISCOVERY'
    ) {
      context.addIssue({
        code: 'custom',
        path: ['learningSpec', 'source'],
        message: 'Discovery Learning Spec proposal must be authored by the Discovery Agent',
      })
    }
    if (command.learningSpec.correlationId !== command.correlationId) {
      context.addIssue({
        code: 'custom',
        path: ['learningSpec', 'correlationId'],
        message: 'Learning Spec correlation ID must match its command',
      })
    }
  })

export const builderStartTaskCommandSchema = z.strictObject({
  ...builderQueryMetadata,
  kind: z.literal('BUILDER_START_TASK'),
  idempotencyKey: idempotencyKeySchema,
  projectId: projectIdSchema,
  taskId: taskIdSchema,
  expectedTaskRevision: expectedRevisionSchema,
})

export const builderUpdateLiveContextCommandSchema = z
  .strictObject({
    ...builderQueryMetadata,
    kind: z.literal('BUILDER_UPDATE_LIVE_CONTEXT'),
    idempotencyKey: idempotencyKeySchema,
    context: liveProjectContextSchema,
  })
  .refine((command) => command.context.correlationId === command.correlationId, {
    path: ['context', 'correlationId'],
    message: 'Live Context correlation ID must match its command',
  })

export const builderRequestDecisionCommandSchema = z
  .strictObject({
    ...builderQueryMetadata,
    kind: z.literal('BUILDER_REQUEST_DECISION'),
    idempotencyKey: idempotencyKeySchema,
    projectId: projectIdSchema,
    taskId: taskIdSchema,
    expectedTaskRevision: expectedRevisionSchema,
    expectedContextVersion: entityRevisionSchema,
    decision: decisionRequestDraftSchema,
    context: decisionContextDraftSchema,
  })
  .refine(
    (command) =>
      command.decision.independentWorkCanContinue || command.context.blockingReason !== undefined,
    {
      path: ['context', 'blockingReason'],
      message: 'A blocking Decision requires a blocking reason',
    },
  )

export const builderApplyDecisionCommandSchema = z.strictObject({
  ...builderQueryMetadata,
  kind: z.literal('BUILDER_APPLY_DECISION'),
  idempotencyKey: idempotencyKeySchema,
  projectId: projectIdSchema,
  taskId: taskIdSchema,
  decisionId: decisionIdSchema,
  expectedTaskRevision: expectedRevisionSchema,
  expectedContextVersion: entityRevisionSchema,
  appliedResult: nonEmptyTextSchema,
  sourceReferences: z.array(contextualSourceReferenceSchema).max(30),
  context: decisionContextDraftSchema.omit({ blockingReason: true }),
})

export const builderCompleteTaskCommandSchema = z
  .strictObject({
    ...builderQueryMetadata,
    kind: z.literal('BUILDER_COMPLETE_TASK'),
    idempotencyKey: idempotencyKeySchema,
    report: taskCompletionReportSchema,
  })
  .refine((command) => command.report.correlationId === command.correlationId, {
    path: ['report', 'correlationId'],
    message: 'Completion Report correlation ID must match its command',
  })

export const helperRequestContextRefreshCommandSchema = z.strictObject({
  ...helperQueryMetadata,
  kind: z.literal('HELPER_REQUEST_CONTEXT_REFRESH'),
  idempotencyKey: idempotencyKeySchema,
  projectId: projectIdSchema,
  taskId: taskIdSchema,
  observedContextVersion: entityRevisionSchema.optional(),
  reason: nonEmptyTextSchema,
})

export const analystSubmitEvidenceProposalsCommandSchema = z
  .strictObject({
    ...analystQueryMetadata,
    kind: z.literal('ANALYST_SUBMIT_EVIDENCE_PROPOSALS'),
    idempotencyKey: idempotencyKeySchema,
    batch: evidenceProposalBatchSchema,
  })
  .refine((command) => command.batch.correlationId === command.correlationId, {
    path: ['batch', 'correlationId'],
    message: 'Evidence batch correlation ID must match its command',
  })

export const discoveryAgentRequestSchema = z.discriminatedUnion('kind', [
  discoveryGetContextQuerySchema,
  discoverySubmitCandidateRoundCommandSchema,
  discoverySubmitLearningSpecCommandSchema,
])

export const builderAgentRequestSchema = z.discriminatedUnion('kind', [
  builderGetTaskQuerySchema,
  builderGetDecisionResultQuerySchema,
  builderStartTaskCommandSchema,
  builderUpdateLiveContextCommandSchema,
  builderRequestDecisionCommandSchema,
  builderApplyDecisionCommandSchema,
  builderCompleteTaskCommandSchema,
])

export const helperAgentRequestSchema = z.discriminatedUnion('kind', [
  helperGetContextQuerySchema,
  helperRequestContextRefreshCommandSchema,
])

export const evidenceAnalystRequestSchema = z.discriminatedUnion('kind', [
  analystGetEpisodeContextQuerySchema,
  analystSubmitEvidenceProposalsCommandSchema,
])

export const agentRequestSchema = z.discriminatedUnion('kind', [
  discoveryGetContextQuerySchema,
  discoverySubmitCandidateRoundCommandSchema,
  discoverySubmitLearningSpecCommandSchema,
  builderGetTaskQuerySchema,
  builderGetDecisionResultQuerySchema,
  builderStartTaskCommandSchema,
  builderUpdateLiveContextCommandSchema,
  builderRequestDecisionCommandSchema,
  builderApplyDecisionCommandSchema,
  builderCompleteTaskCommandSchema,
  helperGetContextQuerySchema,
  helperRequestContextRefreshCommandSchema,
  analystGetEpisodeContextQuerySchema,
  analystSubmitEvidenceProposalsCommandSchema,
])

export const discoveryContextSchema = z.strictObject({
  schemaVersion: schemaVersionSchema,
  correlationId: correlationIdSchema,
  project: projectSchema,
  session: discoverySessionSchema,
  rounds: z.array(candidateRoundSchema).max(100),
  candidates: z.array(projectCandidateRevisionSchema).max(1_000),
  feedback: z.array(discoveryFeedbackSchema).max(1_000),
  learningSpec: learningSpecRevisionSchema.nullable(),
  relevantLedgerEntries: z.array(conceptLedgerEntrySchema).max(20),
})

export const builderTaskContextSchema = z.strictObject({
  schemaVersion: schemaVersionSchema,
  correlationId: correlationIdSchema,
  project: projectSchema,
  learningSpec: learningSpecRevisionSchema,
  task: builderTaskSchema,
  liveContext: liveProjectContextSchema.nullable(),
  decisionRequests: z.array(decisionRequestSchema).max(50),
  decisionResolutions: z.array(decisionResolutionSchema).max(50),
  decisionApplications: z.array(decisionApplicationSchema).max(50),
  pendingContextRefreshRequests: z.array(contextRefreshRequestSchema).max(20),
})

export const helperEpisodeSummarySchema = z.strictObject({
  episodeId: episodeIdSchema,
  type: z.enum(['BUILD_TASK', 'DECISION', 'HELPER_CONVERSATION', 'FINAL_UPGRADE']),
  endedAt: utcTimestampSchema,
  conceptNames: z.array(labelSchema).max(20),
  redactedUserExcerpts: z.array(nonEmptyTextSchema).max(5),
  helperResponseSummaries: z.array(nonEmptyTextSchema).max(5),
  contextReferences: z.array(contextualSourceReferenceSchema).max(10),
})

export const helperSourceExcerptSchema = z.strictObject({
  reference: codeReferenceSchema,
  redactedExcerpt: z.string().trim().min(1).max(8_192),
  truncated: z.boolean(),
  redactionStatus: z.literal('VERIFIED_REDACTED'),
})

export const helperReferenceDetailSchema = z.strictObject({
  reference: contextualSourceReferenceSchema,
  availability: z.enum(['EXCERPT_INCLUDED', 'REFERENCE_ONLY', 'UNAVAILABLE']),
  reason: z.string().trim().min(1).max(240).optional(),
})

export const helperContextSchema = z.strictObject({
  schemaVersion: schemaVersionSchema,
  correlationId: correlationIdSchema,
  project: projectSchema,
  learningSpec: learningSpecRevisionSchema,
  task: builderTaskSchema,
  liveContext: liveProjectContextSchema.nullable(),
  activeDecisions: z.array(decisionRequestSchema).max(10),
  focusedDecision: decisionRequestSchema.nullable(),
  relevantLedgerEntries: z.array(conceptLedgerEntrySchema).max(5),
  recentEpisodes: z.array(helperEpisodeSummarySchema).max(5),
  contextReferences: z.array(contextualSourceReferenceSchema).max(30),
  referenceDetails: z.array(helperReferenceDetailSchema).max(30),
  sourceExcerpts: z.array(helperSourceExcerptSchema).max(3),
  pendingContextRefreshRequests: z.array(contextRefreshRequestSchema).max(20),
  freshness: z.strictObject({
    currentContextVersion: entityRevisionSchema.nullable(),
    observedContextVersion: entityRevisionSchema.nullable(),
    status: z.enum(['CURRENT', 'STALE', 'MISSING']),
    stale: z.boolean(),
    refreshRequired: z.boolean(),
  }),
})

export const episodeContextSchema = z.strictObject({
  schemaVersion: schemaVersionSchema,
  correlationId: correlationIdSchema,
  episode: episodeSchema,
  events: z.array(activityEventSchema).min(1).max(500),
  relevantLedgerEntries: z.array(conceptLedgerEntrySchema).max(20),
})

export const decisionResultSchema = z.strictObject({
  schemaVersion: schemaVersionSchema,
  correlationId: correlationIdSchema,
  request: decisionRequestSchema,
  resolution: decisionResolutionSchema.nullable(),
  application: decisionApplicationSchema.nullable(),
})

export const decisionCommandReceiptSchema = z.strictObject({
  schemaVersion: schemaVersionSchema,
  correlationId: correlationIdSchema,
  accepted: z.literal(true),
  resourceRevision: entityRevisionSchema,
  decisionId: decisionIdSchema,
})

export const commandReceiptSchema = z.strictObject({
  schemaVersion: schemaVersionSchema,
  correlationId: correlationIdSchema,
  accepted: z.literal(true),
  resourceRevision: entityRevisionSchema,
})

export type AgentRequest = z.infer<typeof agentRequestSchema>
export type DiscoveryAgentRequest = z.infer<typeof discoveryAgentRequestSchema>
export type BuilderAgentRequest = z.infer<typeof builderAgentRequestSchema>
export type HelperAgentRequest = z.infer<typeof helperAgentRequestSchema>
export type EvidenceAnalystRequest = z.infer<typeof evidenceAnalystRequestSchema>
export type DiscoveryContext = z.infer<typeof discoveryContextSchema>
export type BuilderTaskContext = z.infer<typeof builderTaskContextSchema>
export type HelperContext = z.infer<typeof helperContextSchema>
export type HelperEpisodeSummary = z.infer<typeof helperEpisodeSummarySchema>
export type HelperSourceExcerpt = z.infer<typeof helperSourceExcerptSchema>
export type HelperReferenceDetail = z.infer<typeof helperReferenceDetailSchema>
export type EpisodeContext = z.infer<typeof episodeContextSchema>
export type DecisionResult = z.infer<typeof decisionResultSchema>
export type DecisionCommandReceipt = z.infer<typeof decisionCommandReceiptSchema>
export type CommandReceipt = z.infer<typeof commandReceiptSchema>
