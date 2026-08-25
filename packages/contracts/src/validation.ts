import { z } from 'zod'

import {
  builderAgentRequestSchema,
  discoveryAgentRequestSchema,
  evidenceAnalystRequestSchema,
  helperAgentRequestSchema,
} from './agent-contracts.js'
import {
  type AgentRole,
  correlationIdSchema,
  redactionStatusSchema,
  schemaVersionSchema,
} from './primitives.js'

export const contractValidationIssueSchema = z.strictObject({
  path: z.array(z.union([z.string(), z.int().nonnegative()])),
  code: z.string().min(1),
  message: z.string().min(1),
})

export const contractErrorSchema = z.strictObject({
  schemaVersion: schemaVersionSchema,
  kind: z.literal('CONTRACT_ERROR'),
  category: z.enum(['VALIDATION', 'PERMISSION']),
  code: z.enum([
    'INVALID_PAYLOAD',
    'UNSUPPORTED_SCHEMA_VERSION',
    'UNEXPECTED_FIELD',
    'AGENT_PERMISSION_MISMATCH',
  ]),
  message: z.string().min(1),
  correlationId: correlationIdSchema.optional(),
  retryable: z.literal(false),
  issues: z.array(contractValidationIssueSchema).min(1),
})

export const operationErrorCategorySchema = z.enum([
  'VALIDATION',
  'PERMISSION',
  'STALE_CONTEXT',
  'EXTERNAL',
  'ANALYSIS',
  'STORAGE',
  'GENERATED_PROJECT',
])

export const operationErrorSchema = z.strictObject({
  schemaVersion: schemaVersionSchema,
  kind: z.literal('OPERATION_ERROR'),
  category: operationErrorCategorySchema,
  code: z.string().regex(/^[A-Z][A-Z0-9_]{0,79}$/),
  disposition: z.enum(['RETRYABLE', 'USER_ACTION_REQUIRED', 'PERMANENT']),
  message: z.string().min(1).max(1_000),
  correlationId: correlationIdSchema,
  issues: z.array(contractValidationIssueSchema).max(100),
  redactionStatus: redactionStatusSchema,
})

export type ContractError = z.infer<typeof contractErrorSchema>
export type OperationError = z.infer<typeof operationErrorSchema>

export type ContractValidationResult<T> =
  | { readonly success: true; readonly data: T }
  | { readonly success: false; readonly error: ContractError }

function readCorrelationId(input: unknown): string | undefined {
  if (typeof input !== 'object' || input === null || !('correlationId' in input)) return undefined
  const parsed = correlationIdSchema.safeParse(input.correlationId)
  return parsed.success ? parsed.data : undefined
}

function formatZodError(error: z.ZodError, input: unknown): ContractError {
  const issues = error.issues.map((issue) => ({
    path: issue.path.map((segment) => (typeof segment === 'number' ? segment : String(segment))),
    code: issue.code,
    message: issue.message,
  }))
  const hasVersionIssue = issues.some((issue) => issue.path.includes('schemaVersion'))
  const hasUnexpectedField = issues.some((issue) => issue.code === 'unrecognized_keys')

  return {
    schemaVersion: 1,
    kind: 'CONTRACT_ERROR',
    category: 'VALIDATION',
    code: hasVersionIssue
      ? 'UNSUPPORTED_SCHEMA_VERSION'
      : hasUnexpectedField
        ? 'UNEXPECTED_FIELD'
        : 'INVALID_PAYLOAD',
    message: hasVersionIssue
      ? 'Unsupported contract schema version'
      : hasUnexpectedField
        ? 'Payload contains fields that are not part of the contract'
        : 'Payload failed runtime contract validation',
    ...(readCorrelationId(input) === undefined ? {} : { correlationId: readCorrelationId(input) }),
    retryable: false,
    issues,
  }
}

export function validateContract<TSchema extends z.ZodType>(
  schema: TSchema,
  input: unknown,
): ContractValidationResult<z.output<TSchema>> {
  const result = schema.safeParse(input)
  if (result.success) return { success: true, data: result.data }
  return { success: false, error: formatZodError(result.error, input) }
}

const requestSchemaByRole = {
  DISCOVERY: discoveryAgentRequestSchema,
  BUILDER: builderAgentRequestSchema,
  HELPER: helperAgentRequestSchema,
  EVIDENCE_ANALYST: evidenceAnalystRequestSchema,
} as const

const allowedKindsByRole = {
  DISCOVERY: new Set([
    'DISCOVERY_GET_CONTEXT',
    'DISCOVERY_SUBMIT_CANDIDATE_ROUND',
    'DISCOVERY_SUBMIT_LEARNING_SPEC',
  ]),
  BUILDER: new Set([
    'BUILDER_GET_TASK',
    'BUILDER_GET_DECISION_RESULT',
    'BUILDER_START_TASK',
    'BUILDER_UPDATE_LIVE_CONTEXT',
    'BUILDER_REQUEST_DECISION',
    'BUILDER_COMPLETE_TASK',
  ]),
  HELPER: new Set(['HELPER_GET_CONTEXT', 'HELPER_REQUEST_CONTEXT_REFRESH']),
  EVIDENCE_ANALYST: new Set(['ANALYST_GET_EPISODE_CONTEXT', 'ANALYST_SUBMIT_EVIDENCE_PROPOSALS']),
} as const

export function validateAgentRequest(
  authenticatedRole: AgentRole,
  input: unknown,
): ContractValidationResult<z.output<(typeof requestSchemaByRole)[typeof authenticatedRole]>> {
  const kind =
    typeof input === 'object' && input !== null && 'kind' in input && typeof input.kind === 'string'
      ? input.kind
      : undefined
  const claimedRole =
    typeof input === 'object' &&
    input !== null &&
    'actor' in input &&
    typeof input.actor === 'object' &&
    input.actor !== null &&
    'role' in input.actor &&
    typeof input.actor.role === 'string'
      ? input.actor.role
      : undefined

  if (
    (kind !== undefined && !allowedKindsByRole[authenticatedRole].has(kind)) ||
    (claimedRole !== undefined && claimedRole !== authenticatedRole)
  ) {
    const attemptedCapability = kind ?? 'request with a mismatched claimed role'
    return {
      success: false,
      error: {
        schemaVersion: 1,
        kind: 'CONTRACT_ERROR',
        category: 'PERMISSION',
        code: 'AGENT_PERMISSION_MISMATCH',
        message: `${authenticatedRole} Agent cannot submit ${attemptedCapability}`,
        ...(readCorrelationId(input) === undefined
          ? {}
          : { correlationId: readCorrelationId(input) }),
        retryable: false,
        issues: [
          {
            path: ['kind'],
            code: 'agent_permission_mismatch',
            message: `${attemptedCapability} is not allowed for ${authenticatedRole}`,
          },
        ],
      },
    }
  }

  return validateContract(requestSchemaByRole[authenticatedRole], input)
}
