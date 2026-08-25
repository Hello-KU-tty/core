import { z } from 'zod'

import { activityEventSchema, episodeSchema } from './activity.js'
import {
  builderTaskSchema,
  decisionRequestSchema,
  decisionResolutionSchema,
  liveProjectContextSchema,
  taskCompletionReportSchema,
} from './build.js'
import {
  candidateRoundSchema,
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
} from './primitives.js'
import { contextualSourceReferenceSchema } from './references.js'

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
    candidates: z.array(projectCandidateRevisionSchema).min(1).max(30),
  })
  .superRefine((command, context) => {
    if (command.round.correlationId !== command.correlationId) {
      context.addIssue({
        code: 'custom',
        path: ['round', 'correlationId'],
        message: 'Candidate Round correlation ID must match its command',
      })
    }

    const submittedCandidates = new Set(
      command.candidates.map((candidate) => `${candidate.id}:${candidate.revision}`),
    )
    for (const [index, candidate] of command.candidates.entries()) {
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
    }
    for (const [index, reference] of command.round.candidates.entries()) {
      if (!submittedCandidates.has(`${reference.candidateId}:${reference.revision}`)) {
        context.addIssue({
          code: 'custom',
          path: ['round', 'candidates', index],
          message: 'Candidate Round reference must be present in the submitted Candidate batch',
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
    expectedTaskRevision: expectedRevisionSchema,
    decision: decisionRequestSchema,
  })
  .refine((command) => command.decision.correlationId === command.correlationId, {
    path: ['decision', 'correlationId'],
    message: 'Decision correlation ID must match its command',
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
})

export const helperContextSchema = z.strictObject({
  schemaVersion: schemaVersionSchema,
  correlationId: correlationIdSchema,
  project: projectSchema,
  learningSpec: learningSpecRevisionSchema,
  task: builderTaskSchema,
  liveContext: liveProjectContextSchema.nullable(),
  activeDecisions: z.array(decisionRequestSchema).max(10),
  relevantLedgerEntries: z.array(conceptLedgerEntrySchema).max(5),
  contextReferences: z.array(contextualSourceReferenceSchema).max(30),
  freshness: z.strictObject({
    currentContextVersion: entityRevisionSchema.nullable(),
    stale: z.boolean(),
  }),
})

export const episodeContextSchema = z.strictObject({
  schemaVersion: schemaVersionSchema,
  correlationId: correlationIdSchema,
  episode: episodeSchema,
  events: z.array(activityEventSchema).min(1).max(500),
  relevantLedgerEntries: z.array(conceptLedgerEntrySchema).max(20),
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
export type EpisodeContext = z.infer<typeof episodeContextSchema>
export type CommandReceipt = z.infer<typeof commandReceiptSchema>
