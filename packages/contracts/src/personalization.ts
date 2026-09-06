import { z } from 'zod'

import { analysisFailureSchema, analysisResultSummarySchema } from './analysis.js'
import { episodeStatusSchema, episodeTypeSchema } from './activity.js'
import {
  conceptStateSchema,
  evidenceSignalSchema,
  evidenceStrengthSchema,
  misconceptionIssueSchema,
  promptDependenceSchema,
} from './evidence.js'
import {
  analysisJobIdSchema,
  conceptIdSchema,
  correlationIdSchema,
  decisionIdSchema,
  discoverySessionIdSchema,
  entityRevisionSchema,
  episodeIdSchema,
  evidenceDecisionIdSchema,
  evidenceIdSchema,
  evidenceProposalIdSchema,
  labelSchema,
  misconceptionIssueIdSchema,
  nonEmptyTextSchema,
  personalizationTraceIdSchema,
  projectIdSchema,
  redactionStatusSchema,
  schemaVersionSchema,
  shortTextSchema,
  taskIdSchema,
  utcTimestampSchema,
} from './primitives.js'

export const personalizationPurposeSchema = z.enum([
  'DISCOVERY_TIE_BREAK',
  'HELPER_EXPLANATION_START',
  'HELPER_PAST_EXPERIENCE_CONNECTION',
])

export const personalizationBasisSchema = z.strictObject({
  conceptId: conceptIdSchema,
  conceptName: labelSchema,
  ledgerRevision: entityRevisionSchema,
  state: conceptStateSchema,
  evidenceIds: z.array(evidenceIdSchema).min(1).max(5),
  episodeIds: z.array(episodeIdSchema).min(1).max(5),
  sourceProjectIds: z.array(projectIdSchema).min(1).max(5),
  sourceProjectTitles: z.array(labelSchema).min(1).max(5),
  openIssueIds: z.array(misconceptionIssueIdSchema).max(10),
  purpose: personalizationPurposeSchema,
  redactedEvidenceExcerpt: shortTextSchema.optional(),
})

export const personalizationFallbackReasonSchema = z.enum([
  'NO_LEDGER',
  'NO_RELEVANT_CONCEPT',
  'NO_PRIOR_PROJECT_EVIDENCE',
])

const personalizationTargetSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('DISCOVERY_SESSION'),
    discoverySessionId: discoverySessionIdSchema,
  }),
  z.strictObject({
    kind: z.literal('HELPER_TURN'),
    taskId: taskIdSchema,
    decisionId: decisionIdSchema.optional(),
  }),
])

export const personalizationTraceSchema = z
  .strictObject({
    schemaVersion: schemaVersionSchema,
    id: personalizationTraceIdSchema,
    projectId: projectIdSchema,
    correlationId: correlationIdSchema,
    target: personalizationTargetSchema,
    mode: z.enum(['EVIDENCE_AWARE', 'NO_RELEVANT_EVIDENCE']),
    basis: z.array(personalizationBasisSchema).max(5),
    fallbackReason: personalizationFallbackReasonSchema.optional(),
    createdAt: utcTimestampSchema,
    source: z.strictObject({ kind: z.literal('CORE') }),
    redactionStatus: z.literal('VERIFIED_REDACTED'),
  })
  .superRefine((trace, context) => {
    if (
      trace.mode === 'EVIDENCE_AWARE' &&
      (trace.basis.length === 0 || trace.fallbackReason !== undefined)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Evidence-aware personalization requires basis and no fallback reason',
      })
    }
    if (
      trace.mode === 'NO_RELEVANT_EVIDENCE' &&
      (trace.basis.length > 0 || trace.fallbackReason === undefined)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'No-evidence personalization requires an empty basis and fallback reason',
      })
    }
  })

export const evidenceTraceEvidenceItemSchema = z.strictObject({
  evidenceId: evidenceIdSchema,
  kind: z.enum(['USER_UNDERSTANDING', 'MISCONCEPTION_SIGNAL', 'CONCEPT_OBSERVATION']),
  projectId: projectIdSchema,
  projectTitle: labelSchema,
  taskId: taskIdSchema.optional(),
  episodeId: episodeIdSchema,
  episodeType: episodeTypeSchema,
  episodeStatus: episodeStatusSchema,
  episodeEndedAt: utcTimestampSchema.optional(),
  acceptedAt: utcTimestampSchema,
  supportsState: conceptStateSchema.optional(),
  signal: evidenceSignalSchema.optional(),
  strength: evidenceStrengthSchema.optional(),
  promptDependence: promptDependenceSchema.optional(),
  redactedEvidenceExcerpt: nonEmptyTextSchema.optional(),
  rationale: nonEmptyTextSchema.optional(),
})

export const rejectedEvidenceItemSchema = z.strictObject({
  proposalId: evidenceProposalIdSchema,
  evidenceDecisionId: evidenceDecisionIdSchema,
  projectId: projectIdSchema,
  projectTitle: labelSchema,
  episodeId: episodeIdSchema,
  episodeType: episodeTypeSchema,
  proposedConceptName: labelSchema,
  signal: z.enum([
    'QUESTION',
    'REPHRASE',
    'PREDICTION',
    'JUSTIFIED_DECISION',
    'APPLICATION',
    'TRANSFER',
    'CONTRADICTION',
  ]),
  strength: z.enum(['NONE', 'WEAK', 'MEDIUM', 'STRONG']),
  promptDependence: z.enum(['INDEPENDENT', 'LIGHT_HINT', 'DIRECTLY_LED']),
  redactedEvidenceExcerpt: nonEmptyTextSchema,
  reasonCode: z.enum([
    'VALID_USER_EVIDENCE',
    'INVALID_SCHEMA',
    'AGENT_AUTHORED_SOURCE',
    'INSUFFICIENT_EVIDENCE',
    'OVERSTATED_MAXIMUM_STATE',
    'STALE_EPISODE_REVISION',
    'DUPLICATE_PROPOSAL',
    'INVALID_REFERENCE',
    'INVALID_STATE_TRANSITION',
    'MISCONCEPTION_ISSUE_NOT_FOUND',
  ]),
  explanation: nonEmptyTextSchema,
  decidedAt: utcTimestampSchema,
})

export const conceptEvidenceTraceViewSchema = z.strictObject({
  conceptId: conceptIdSchema,
  conceptName: labelSchema,
  description: nonEmptyTextSchema,
  state: conceptStateSchema.nullable(),
  stateRevision: entityRevisionSchema.nullable(),
  reducerVersion: z.string().trim().min(1).max(64).nullable(),
  updatedAt: utcTimestampSchema.nullable(),
  stateEvidenceIds: z.array(evidenceIdSchema).max(500),
  evidence: z.array(evidenceTraceEvidenceItemSchema).max(100),
  rejectedEvidence: z.array(rejectedEvidenceItemSchema).max(100),
  openIssues: z.array(misconceptionIssueSchema).max(100),
})

export const evidenceAnalysisStatusItemSchema = z.strictObject({
  analysisJobId: analysisJobIdSchema,
  episodeId: episodeIdSchema,
  status: z.enum(['PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED']),
  revision: entityRevisionSchema,
  resultSummary: analysisResultSummarySchema.optional(),
  lastFailure: analysisFailureSchema.optional(),
  updatedAt: utcTimestampSchema,
})

export const projectEvidenceTraceSchema = z.strictObject({
  schemaVersion: schemaVersionSchema,
  correlationId: correlationIdSchema,
  projectId: projectIdSchema,
  concepts: z.array(conceptEvidenceTraceViewSchema).max(100),
  analysis: z.array(evidenceAnalysisStatusItemSchema).max(100),
  personalization: z.array(personalizationTraceSchema).max(100),
  emptyReason: shortTextSchema.optional(),
  redactionStatus: redactionStatusSchema,
})

export type PersonalizationPurpose = z.infer<typeof personalizationPurposeSchema>
export type PersonalizationBasis = z.infer<typeof personalizationBasisSchema>
export type PersonalizationFallbackReason = z.infer<typeof personalizationFallbackReasonSchema>
export type PersonalizationTrace = z.infer<typeof personalizationTraceSchema>
export type EvidenceTraceEvidenceItem = z.infer<typeof evidenceTraceEvidenceItemSchema>
export type RejectedEvidenceItem = z.infer<typeof rejectedEvidenceItemSchema>
export type ConceptEvidenceTraceView = z.infer<typeof conceptEvidenceTraceViewSchema>
export type EvidenceAnalysisStatusItem = z.infer<typeof evidenceAnalysisStatusItemSchema>
export type ProjectEvidenceTrace = z.infer<typeof projectEvidenceTraceSchema>
