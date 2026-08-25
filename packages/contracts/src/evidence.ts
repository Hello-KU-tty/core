import { z } from 'zod'

import {
  aliasProposalIdSchema,
  conceptIdSchema,
  conceptLedgerIdSchema,
  correlationIdSchema,
  entityRevisionSchema,
  episodeIdSchema,
  evidenceDecisionIdSchema,
  evidenceIdSchema,
  evidenceProposalIdSchema,
  labelSchema,
  misconceptionIssueIdSchema,
  nonEmptyTextSchema,
  projectIdSchema,
  redactionStatusSchema,
  schemaVersionSchema,
  semanticVersionSchema,
  taskIdSchema,
  utcTimestampSchema,
} from './primitives.js'
import { contextualSourceReferenceSchema, userEvidenceSourceReferenceSchema } from './references.js'

export const conceptStateSchema = z.enum(['OBSERVED', 'EXPLAINED', 'DEMONSTRATED', 'TRANSFERRED'])

export const userUnderstandingStateSchema = z.enum(['EXPLAINED', 'DEMONSTRATED', 'TRANSFERRED'])

export const evidenceSignalSchema = z.enum([
  'QUESTION',
  'REPHRASE',
  'PREDICTION',
  'JUSTIFIED_DECISION',
  'APPLICATION',
  'TRANSFER',
  'CONTRADICTION',
])

export const evidenceStrengthSchema = z.enum(['NONE', 'WEAK', 'MEDIUM', 'STRONG'])

export const promptDependenceSchema = z.enum(['INDEPENDENT', 'LIGHT_HINT', 'DIRECTLY_LED'])

export const canonicalConceptSchema = z.strictObject({
  schemaVersion: schemaVersionSchema,
  id: conceptIdSchema,
  canonicalName: labelSchema,
  description: nonEmptyTextSchema,
  revision: entityRevisionSchema,
  createdAt: utcTimestampSchema,
  updatedAt: utcTimestampSchema,
  source: z.strictObject({ kind: z.literal('CORE') }),
})

export const conceptAliasProposalSchema = z.strictObject({
  schemaVersion: schemaVersionSchema,
  id: aliasProposalIdSchema,
  correlationId: correlationIdSchema,
  proposedAlias: labelSchema,
  canonicalConceptId: conceptIdSchema.optional(),
  rationale: nonEmptyTextSchema,
  uncertainty: nonEmptyTextSchema.optional(),
  status: z.enum(['PENDING', 'ACCEPTED', 'REJECTED']),
  proposedAt: utcTimestampSchema,
  source: z.strictObject({ kind: z.literal('AGENT'), role: z.literal('EVIDENCE_ANALYST') }),
})

export const misconceptionProposalSchema = z
  .strictObject({
    action: z.enum(['OPEN', 'RESOLVE', 'NONE']),
    issueId: misconceptionIssueIdSchema.optional(),
    summary: nonEmptyTextSchema.optional(),
  })
  .superRefine((proposal, context) => {
    if (proposal.action === 'OPEN' && proposal.summary === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['summary'],
        message: 'Opening a misconception issue requires a summary',
      })
    }
    if (proposal.action === 'RESOLVE' && proposal.issueId === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['issueId'],
        message: 'Resolving a misconception issue requires its ID',
      })
    }
    if (
      proposal.action === 'NONE' &&
      (proposal.issueId !== undefined || proposal.summary !== undefined)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'NONE misconception proposal must not contain issue details',
      })
    }
  })

export const evidenceProposalSchema = z
  .strictObject({
    schemaVersion: schemaVersionSchema,
    id: evidenceProposalIdSchema,
    projectId: projectIdSchema,
    taskId: taskIdSchema.optional(),
    episodeId: episodeIdSchema,
    correlationId: correlationIdSchema,
    concept: z.strictObject({
      canonicalConceptId: conceptIdSchema.optional(),
      originalExpression: labelSchema,
      proposedCanonicalName: labelSchema,
    }),
    signal: evidenceSignalSchema,
    strength: evidenceStrengthSchema,
    promptDependence: promptDependenceSchema,
    userEvidenceSources: z.array(userEvidenceSourceReferenceSchema).min(1).max(20),
    contextSources: z.array(contextualSourceReferenceSchema).max(30),
    redactedEvidenceExcerpt: nonEmptyTextSchema,
    rationale: nonEmptyTextSchema,
    uncertainty: nonEmptyTextSchema.optional(),
    maximumSupportedState: userUnderstandingStateSchema.nullable(),
    misconception: misconceptionProposalSchema,
    proposedAt: utcTimestampSchema,
    source: z.strictObject({ kind: z.literal('AGENT'), role: z.literal('EVIDENCE_ANALYST') }),
    redactionStatus: redactionStatusSchema,
  })
  .superRefine((proposal, context) => {
    if (proposal.strength === 'NONE' && proposal.maximumSupportedState !== null) {
      context.addIssue({
        code: 'custom',
        path: ['maximumSupportedState'],
        message: 'NONE Evidence cannot support a Concept State',
      })
    }
    if (proposal.promptDependence === 'DIRECTLY_LED' && proposal.strength === 'STRONG') {
      context.addIssue({
        code: 'custom',
        path: ['strength'],
        message: 'Directly led Evidence cannot be STRONG',
      })
    }
  })

export const evidenceProposalBatchSchema = z
  .strictObject({
    schemaVersion: schemaVersionSchema,
    episodeId: episodeIdSchema,
    correlationId: correlationIdSchema,
    episodeRevision: entityRevisionSchema,
    proposals: z.array(evidenceProposalSchema).min(1).max(100),
    submittedAt: utcTimestampSchema,
    source: z.strictObject({ kind: z.literal('AGENT'), role: z.literal('EVIDENCE_ANALYST') }),
  })
  .superRefine((batch, context) => {
    const proposalIds = new Set<string>()
    for (const [index, proposal] of batch.proposals.entries()) {
      if (
        proposal.episodeId !== batch.episodeId ||
        proposal.correlationId !== batch.correlationId
      ) {
        context.addIssue({
          code: 'custom',
          path: ['proposals', index],
          message: 'Evidence Proposal must match its batch Episode and correlation ID',
        })
      }
      if (proposalIds.has(proposal.id)) {
        context.addIssue({
          code: 'custom',
          path: ['proposals', index, 'id'],
          message: 'Evidence Proposal IDs must be unique within a batch',
        })
      }
      proposalIds.add(proposal.id)
    }
  })

export const evidenceDecisionSchema = z.strictObject({
  schemaVersion: schemaVersionSchema,
  id: evidenceDecisionIdSchema,
  evidenceProposalId: evidenceProposalIdSchema,
  correlationId: correlationIdSchema,
  outcome: z.enum(['ACCEPTED', 'REJECTED']),
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
  source: z.strictObject({ kind: z.literal('CORE') }),
})

export const acceptedEvidenceSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    schemaVersion: schemaVersionSchema,
    id: evidenceIdSchema,
    kind: z.literal('USER_UNDERSTANDING'),
    projectId: projectIdSchema,
    taskId: taskIdSchema.optional(),
    episodeId: episodeIdSchema,
    conceptId: conceptIdSchema,
    correlationId: correlationIdSchema,
    evidenceProposalId: evidenceProposalIdSchema,
    evidenceDecisionId: evidenceDecisionIdSchema,
    signal: z.enum(['REPHRASE', 'PREDICTION', 'JUSTIFIED_DECISION', 'APPLICATION', 'TRANSFER']),
    strength: evidenceStrengthSchema,
    promptDependence: promptDependenceSchema,
    supportsState: userUnderstandingStateSchema,
    userEvidenceSources: z.array(userEvidenceSourceReferenceSchema).min(1).max(20),
    acceptedAt: utcTimestampSchema,
    source: z.strictObject({ kind: z.literal('CORE') }),
    redactionStatus: redactionStatusSchema,
  }),
  z.strictObject({
    schemaVersion: schemaVersionSchema,
    id: evidenceIdSchema,
    kind: z.literal('MISCONCEPTION_SIGNAL'),
    projectId: projectIdSchema,
    taskId: taskIdSchema.optional(),
    episodeId: episodeIdSchema,
    conceptId: conceptIdSchema,
    correlationId: correlationIdSchema,
    evidenceProposalId: evidenceProposalIdSchema,
    evidenceDecisionId: evidenceDecisionIdSchema,
    signal: z.literal('CONTRADICTION'),
    strength: z.enum(['MEDIUM', 'STRONG']),
    promptDependence: z.enum(['INDEPENDENT', 'LIGHT_HINT']),
    userEvidenceSources: z.array(userEvidenceSourceReferenceSchema).min(1).max(20),
    acceptedAt: utcTimestampSchema,
    source: z.strictObject({ kind: z.literal('CORE') }),
    redactionStatus: redactionStatusSchema,
  }),
  z.strictObject({
    schemaVersion: schemaVersionSchema,
    id: evidenceIdSchema,
    kind: z.literal('CONCEPT_OBSERVATION'),
    projectId: projectIdSchema,
    taskId: taskIdSchema.optional(),
    conceptId: conceptIdSchema,
    correlationId: correlationIdSchema,
    supportsState: z.literal('OBSERVED'),
    contextSources: z.array(contextualSourceReferenceSchema).min(1).max(30),
    acceptedAt: utcTimestampSchema,
    source: z.strictObject({ kind: z.literal('CORE') }),
    redactionStatus: redactionStatusSchema,
  }),
])

export const misconceptionIssueSchema = z
  .strictObject({
    schemaVersion: schemaVersionSchema,
    id: misconceptionIssueIdSchema,
    conceptId: conceptIdSchema,
    projectId: projectIdSchema,
    openedByEvidenceId: evidenceIdSchema,
    status: z.enum(['OPEN', 'RESOLVED']),
    summary: nonEmptyTextSchema,
    supportingEvidenceIds: z.array(evidenceIdSchema).min(1).max(50),
    resolvedByEvidenceId: evidenceIdSchema.optional(),
    openedAt: utcTimestampSchema,
    resolvedAt: utcTimestampSchema.optional(),
    source: z.strictObject({ kind: z.literal('CORE') }),
  })
  .superRefine((issue, context) => {
    const hasResolution = issue.resolvedByEvidenceId !== undefined && issue.resolvedAt !== undefined
    if (issue.status === 'RESOLVED' && !hasResolution) {
      context.addIssue({
        code: 'custom',
        message: 'Resolved issue requires resolution Evidence and time',
      })
    }
    if (
      issue.status === 'OPEN' &&
      (issue.resolvedByEvidenceId !== undefined || issue.resolvedAt !== undefined)
    ) {
      context.addIssue({ code: 'custom', message: 'Open issue must not contain resolution fields' })
    }
  })

export const conceptStateSnapshotSchema = z.strictObject({
  conceptId: conceptIdSchema,
  state: conceptStateSchema,
  acceptedEvidenceIds: z.array(evidenceIdSchema).min(1).max(500),
  reducerVersion: semanticVersionSchema,
  revision: entityRevisionSchema,
  updatedAt: utcTimestampSchema,
})

export const conceptLedgerEntrySchema = z
  .strictObject({
    schemaVersion: schemaVersionSchema,
    id: conceptLedgerIdSchema,
    concept: canonicalConceptSchema,
    acceptedAliases: z.array(labelSchema).max(100),
    state: conceptStateSnapshotSchema,
    openIssues: z.array(misconceptionIssueSchema).max(100),
    relatedProjectIds: z.array(projectIdSchema).min(1).max(100),
    relatedTaskIds: z.array(taskIdSchema).max(500),
    revision: entityRevisionSchema,
    updatedAt: utcTimestampSchema,
    source: z.strictObject({ kind: z.literal('CORE') }),
  })
  .superRefine((entry, context) => {
    if (entry.state.conceptId !== entry.concept.id) {
      context.addIssue({
        code: 'custom',
        path: ['state', 'conceptId'],
        message: 'Concept State must belong to the Ledger concept',
      })
    }
    for (const [index, issue] of entry.openIssues.entries()) {
      if (issue.conceptId !== entry.concept.id || issue.status !== 'OPEN') {
        context.addIssue({
          code: 'custom',
          path: ['openIssues', index],
          message: 'Ledger openIssues must be open and belong to the Ledger concept',
        })
      }
    }
  })

export type ConceptState = z.infer<typeof conceptStateSchema>
export type EvidenceSignal = z.infer<typeof evidenceSignalSchema>
export type EvidenceStrength = z.infer<typeof evidenceStrengthSchema>
export type PromptDependence = z.infer<typeof promptDependenceSchema>
export type CanonicalConcept = z.infer<typeof canonicalConceptSchema>
export type EvidenceProposal = z.infer<typeof evidenceProposalSchema>
export type EvidenceProposalBatch = z.infer<typeof evidenceProposalBatchSchema>
export type EvidenceDecision = z.infer<typeof evidenceDecisionSchema>
export type AcceptedEvidence = z.infer<typeof acceptedEvidenceSchema>
export type MisconceptionIssue = z.infer<typeof misconceptionIssueSchema>
export type ConceptStateSnapshot = z.infer<typeof conceptStateSnapshotSchema>
export type ConceptLedgerEntry = z.infer<typeof conceptLedgerEntrySchema>
