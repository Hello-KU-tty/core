import { z } from 'zod'

import {
  actorSchema,
  auditRecordIdSchema,
  correlationIdSchema,
  nonEmptyTextSchema,
  redactionStatusSchema,
  schemaVersionSchema,
  stableEntityIdSchema,
  utcTimestampSchema,
} from './primitives.js'

export const auditActionSchema = z.enum([
  'CREATED',
  'UPDATED',
  'SUBMITTED',
  'ACCEPTED',
  'REJECTED',
  'RESOLVED',
  'APPLIED',
  'REDACTED',
])

export const auditOutcomeSchema = z.enum(['SUCCEEDED', 'REJECTED', 'FAILED'])

export const auditRecordSchema = z.strictObject({
  schemaVersion: schemaVersionSchema,
  id: auditRecordIdSchema,
  correlationId: correlationIdSchema,
  actor: actorSchema,
  action: auditActionSchema,
  resource: z.strictObject({
    type: z.enum([
      'PROJECT',
      'DISCOVERY_SESSION',
      'CANDIDATE_REVISION',
      'LEARNING_SPEC',
      'BUILDER_TASK',
      'LIVE_CONTEXT',
      'DECISION',
      'EVENT',
      'EPISODE',
      'EVIDENCE_PROPOSAL',
      'EVIDENCE',
      'CONCEPT_LEDGER',
      'EVALUATION_RUN',
    ]),
    id: stableEntityIdSchema,
    revision: z.int().positive().optional(),
  }),
  outcome: auditOutcomeSchema,
  reasonCode: z
    .string()
    .regex(/^[A-Z][A-Z0-9_]{0,79}$/)
    .optional(),
  summary: nonEmptyTextSchema,
  changedFields: z.array(z.string().regex(/^[a-z][A-Za-z0-9.]{0,119}$/)).max(100),
  occurredAt: utcTimestampSchema,
  redactionStatus: redactionStatusSchema,
})

export type AuditAction = z.infer<typeof auditActionSchema>
export type AuditOutcome = z.infer<typeof auditOutcomeSchema>
export type AuditRecord = z.infer<typeof auditRecordSchema>
