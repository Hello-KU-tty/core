import { z } from 'zod'

export const CURRENT_SCHEMA_VERSION = 1 as const

export const schemaVersionSchema = z.literal(CURRENT_SCHEMA_VERSION)

const UUID_V4_PATTERN = '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'

function prefixedUuidSchema(prefix: string) {
  return z
    .string()
    .regex(
      new RegExp(`^${prefix}_${UUID_V4_PATTERN}$`),
      `Expected a ${prefix}_ prefixed lowercase UUID v4`,
    )
}

export const stableEntityIdSchema = z
  .string()
  .regex(
    new RegExp(`^[a-z]+(?:_[a-z]+)*_${UUID_V4_PATTERN}$`),
    'Expected a lowercase entity prefix and UUID v4',
  )

export const projectIdSchema = prefixedUuidSchema('project')
export const discoverySessionIdSchema = prefixedUuidSchema('discovery_session')
export const candidateRoundIdSchema = prefixedUuidSchema('candidate_round')
export const candidatePreviewRoundIdSchema = prefixedUuidSchema('candidate_preview_round')
export const candidateIdSchema = prefixedUuidSchema('candidate')
export const feedbackIdSchema = prefixedUuidSchema('feedback')
export const learningSpecIdSchema = prefixedUuidSchema('learning_spec')
export const taskIdSchema = prefixedUuidSchema('task')
export const liveContextIdSchema = prefixedUuidSchema('context')
export const contextRefreshRequestIdSchema = prefixedUuidSchema('context_refresh')
export const decisionIdSchema = prefixedUuidSchema('decision')
export const decisionOptionIdSchema = prefixedUuidSchema('decision_option')
export const decisionResolutionIdSchema = prefixedUuidSchema('decision_resolution')
export const decisionApplicationIdSchema = prefixedUuidSchema('decision_application')
export const completionReportIdSchema = prefixedUuidSchema('completion_report')
export const conversationIdSchema = prefixedUuidSchema('conversation')
export const messageIdSchema = prefixedUuidSchema('message')
export const toolCallIdSchema = prefixedUuidSchema('tool_call')
export const testResultIdSchema = prefixedUuidSchema('test_result')
export const diffIdSchema = prefixedUuidSchema('diff')
export const eventIdSchema = prefixedUuidSchema('event')
export const episodeIdSchema = prefixedUuidSchema('episode')
export const analysisJobIdSchema = prefixedUuidSchema('analysis_job')
export const conceptIdSchema = prefixedUuidSchema('concept')
export const aliasProposalIdSchema = prefixedUuidSchema('alias_proposal')
export const evidenceProposalIdSchema = prefixedUuidSchema('evidence_proposal')
export const evidenceIdSchema = prefixedUuidSchema('evidence')
export const evidenceDecisionIdSchema = prefixedUuidSchema('evidence_decision')
export const misconceptionIssueIdSchema = prefixedUuidSchema('misconception')
export const conceptLedgerIdSchema = prefixedUuidSchema('concept_ledger')
export const auditRecordIdSchema = prefixedUuidSchema('audit')
export const fixtureIdSchema = prefixedUuidSchema('fixture')
export const evaluationRunIdSchema = prefixedUuidSchema('evaluation_run')
export const baselineResultIdSchema = prefixedUuidSchema('baseline_result')
export const correlationIdSchema = prefixedUuidSchema('corr')
export const idempotencyKeySchema = prefixedUuidSchema('idem')

export const utcTimestampSchema = z.iso
  .datetime({ offset: false })
  .refine((value) => value.endsWith('Z'), 'Expected a UTC timestamp ending in Z')

export const entityRevisionSchema = z.int().positive()
export const expectedRevisionSchema = z.int().nonnegative()
export const sequenceSchema = z.int().nonnegative()

export const semanticVersionSchema = z
  .string()
  .regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/, 'Expected SemVer')

export const nonEmptyTextSchema = z.string().trim().min(1).max(4_000)
export const shortTextSchema = z.string().trim().min(1).max(240)
export const labelSchema = z.string().trim().min(1).max(120)

export const redactionStatusSchema = z.enum(['NOT_REQUIRED', 'REDACTED', 'VERIFIED_REDACTED'])

export const agentRoleSchema = z.enum(['DISCOVERY', 'BUILDER', 'HELPER', 'EVIDENCE_ANALYST'])

export const learningScopeCategorySchema = z.enum(['LEARNER_FOCUS', 'AGENT_SUPPORT', 'EXCLUDED'])

export const decisionCategorySchema = z.enum([
  'PRODUCT_BEHAVIOR',
  'DATA_MODEL',
  'API_CONTRACT',
  'AUTHENTICATION',
  'AUTHORIZATION',
  'SECURITY_PRIVACY',
  'RETENTION_DELETION',
  'COST_DEPLOYMENT',
  'ARCHITECTURE',
  'LEARNING_CONCEPT',
])

export const actorSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('USER') }),
  z.strictObject({ kind: z.literal('AGENT'), role: agentRoleSchema }),
  z.strictObject({ kind: z.literal('CORE') }),
  z.strictObject({ kind: z.literal('UI') }),
  z.strictObject({ kind: z.literal('KIRO_ADAPTER') }),
])

export const relativePosixPathSchema = z
  .string()
  .min(1)
  .max(512)
  .superRefine((value, context) => {
    if (value.includes('\0')) {
      context.addIssue({ code: 'custom', message: 'Path must not contain NUL' })
    }
    if (value.includes('\\')) {
      context.addIssue({ code: 'custom', message: 'Path must use POSIX separators' })
    }
    if (value.startsWith('/') || /^[A-Za-z]:/.test(value)) {
      context.addIssue({ code: 'custom', message: 'Path must be relative' })
    }
    if (value.endsWith('/') || value.includes('//')) {
      context.addIssue({ code: 'custom', message: 'Path must be normalized' })
    }

    const segments = value.split('/')
    if (segments.some((segment) => segment === '.' || segment === '..' || segment.length === 0)) {
      context.addIssue({ code: 'custom', message: 'Path must not contain dot segments' })
    }
  })

export type AgentRole = z.infer<typeof agentRoleSchema>
export type Actor = z.infer<typeof actorSchema>
export type RedactionStatus = z.infer<typeof redactionStatusSchema>
export type LearningScopeCategory = z.infer<typeof learningScopeCategorySchema>
export type DecisionCategory = z.infer<typeof decisionCategorySchema>
