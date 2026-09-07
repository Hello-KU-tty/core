import { z } from 'zod'

import { analysisJobSchema } from './analysis.js'
import { helperContextSchema, commandReceiptSchema } from './agent-contracts.js'
import { projectEvidenceTraceSchema } from './personalization.js'
import {
  candidateIdSchema,
  correlationIdSchema,
  decisionIdSchema,
  discoverySessionIdSchema,
  expectedRevisionSchema,
  idempotencyKeySchema,
  nonEmptyTextSchema,
  projectIdSchema,
  taskIdSchema,
  utcTimestampSchema,
} from './primitives.js'
import {
  builderSessionBindingDescriptorSchema,
  preparedBuilderTaskDescriptorSchema,
  helperExchangeReceiptSchema,
  generatedResultDescriptorSchema,
  uiRequestSchema,
  type UiRequest,
} from './ui-contracts.js'
import { projectHistorySchema, projectSessionSnapshotSchema } from './ui-session.js'

/** Independent local transport version. Not the Crew proxy protocol. */
export const LOCAL_PROTOCOL_VERSION = 1 as const
export const FRONTEND_CLIENT_VERSION = '0.1.0' as const
export const localRunIdSchema = z
  .string()
  .regex(/^run_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
const metadata = {
  projectId: projectIdSchema,
  idempotencyKey: idempotencyKeySchema,
}
export const localRunRequestSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    ...metadata,
    kind: z.literal('DISCOVERY'),
    discoverySessionId: discoverySessionIdSchema,
    expectedSessionRevision: expectedRevisionSchema,
    phase: z.enum(['PREVIEW', 'ENRICH_ALL', 'ENRICH_SELECTED', 'ROUND', 'MERGE', 'SPEC']),
    candidateIds: z.array(candidateIdSchema).max(10).default([]),
    message: nonEmptyTextSchema.optional(),
    expectedSpecRevision: expectedRevisionSchema.optional(),
    enrichAfterPreview: z.boolean().default(true),
  }),
  z.strictObject({
    ...metadata,
    kind: z.literal('BUILDER'),
    taskId: taskIdSchema,
    expectedTaskRevision: expectedRevisionSchema,
    message: nonEmptyTextSchema,
  }),
  z.strictObject({
    ...metadata,
    kind: z.literal('HELPER'),
    taskId: taskIdSchema,
    decisionId: decisionIdSchema.optional(),
    message: nonEmptyTextSchema,
    origin: z.enum(['FREE_TEXT', 'QUICK_ACTION']).default('FREE_TEXT'),
  }),
])
export type LocalRunRequest = z.infer<typeof localRunRequestSchema>
export type LocalRunInput = z.input<typeof localRunRequestSchema>
export const localRunSchema = z.strictObject({
  protocolVersion: z.literal(LOCAL_PROTOCOL_VERSION),
  backendInstanceId: z.string().uuid(),
  id: localRunIdSchema,
  projectId: projectIdSchema,
  kind: z.enum(['DISCOVERY', 'BUILDER', 'HELPER']),
  phase: z.string().max(40),
  status: z.enum(['ACCEPTED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED']),
  outcome: z.enum(['PENDING', 'DURABLE_RESULT', 'TURN_ENDED', 'HELPER_RECORDED', 'NONE']),
  createdAt: utcTimestampSchema,
  updatedAt: utcTimestampSchema,
  errorCode: z
    .string()
    .regex(/^[A-Z0-9_]{1,100}$/)
    .nullable(),
  lastSequence: z.int().nonnegative(),
  retainedFromSequence: z.int().nonnegative(),
})
export type LocalRun = z.infer<typeof localRunSchema>
export const localRunEventSchema = z.strictObject({
  runId: localRunIdSchema,
  projectId: projectIdSchema,
  sequence: z.int().positive(),
  kind: z.enum(['STATE', 'TEXT', 'TOOL', 'PERMISSION_DENIED']),
  text: z.string().max(65_536).optional(),
  update: z.record(z.string(), z.unknown()).optional(),
  run: localRunSchema.optional(),
  transient: z.literal(true),
  redactionStatus: z.literal('VERIFIED_REDACTED'),
})
export type LocalRunEvent = z.infer<typeof localRunEventSchema>
export const localConnectionSchema = z.strictObject({
  protocolVersion: z.literal(LOCAL_PROTOCOL_VERSION),
  backendInstanceId: z.string().uuid(),
  baseUrl: z.string().regex(/^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}$/),
  token: z.string().regex(/^[0-9a-f]{64}$/),
})
/** Extension-host only: never send this object to a Webview. */
export type LocalConnection = z.infer<typeof localConnectionSchema>
export const localApplicationEnvelopeSchema = z.strictObject({
  protocolVersion: z.literal(LOCAL_PROTOCOL_VERSION),
  request: uiRequestSchema,
})
export const localRunEnvelopeSchema = z.strictObject({
  protocolVersion: z.literal(LOCAL_PROTOCOL_VERSION),
  request: localRunRequestSchema,
})
export const localResponseSchemas = {
  UI_START_DISCOVERY: commandReceiptSchema,
  UI_RECORD_DISCOVERY_FEEDBACK: commandReceiptSchema,
  UI_UPDATE_LEARNING_SPEC: commandReceiptSchema,
  UI_CONFIRM_LEARNING_SPEC: commandReceiptSchema,
  UI_PREPARE_BUILDER_TASK: preparedBuilderTaskDescriptorSchema,
  UI_PREPARE_FINAL_UPGRADE_TASK: preparedBuilderTaskDescriptorSchema,
  UI_RETURN_TO_DISCOVERY: commandReceiptSchema,
  UI_RESOLVE_DECISION: commandReceiptSchema,
  UI_LIST_PROJECTS: projectHistorySchema,
  UI_RESTORE_PROJECT_SESSION: projectSessionSnapshotSchema,
  UI_PREPARE_DISCOVERY_AGENT_CONTEXT: projectSessionSnapshotSchema,
  UI_OPEN_HELPER: helperContextSchema,
  UI_PREPARE_BUILDER_SESSION: builderSessionBindingDescriptorSchema,
  UI_RECORD_HELPER_EXCHANGE: helperExchangeReceiptSchema,
  UI_RETRY_ANALYSIS: analysisJobSchema,
  UI_READ_ANALYSIS_JOBS: analysisJobSchema.array(),
  UI_READ_EVIDENCE_TRACE: projectEvidenceTraceSchema,
  UI_LAUNCH_RESULT: generatedResultDescriptorSchema,
} as const satisfies Record<UiRequest['kind'], z.ZodType>
export type LocalUiResponse<K extends UiRequest['kind']> = z.infer<(typeof localResponseSchemas)[K]>
export const localUiMetadataSchema = z.strictObject({
  schemaVersion: z.literal(1),
  correlationId: correlationIdSchema,
  actor: z.strictObject({ kind: z.literal('UI') }),
})
