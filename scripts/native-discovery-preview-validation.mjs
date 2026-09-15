import {
  discoverySubmitCandidatePreviewsToolInputSchema,
  operationErrorSchema,
} from '../packages/contracts/dist/index.js'

const EXPECTED_PREVIEWS = 10
const MAX_ISSUES = 8
const KNOWN_PATH_SEGMENTS = new Set([
  'schemaVersion',
  'projectId',
  'discoverySessionId',
  'correlationId',
  'idempotencyKey',
  'expectedSessionRevision',
  'generationRationale',
  'previews',
  'title',
  'summary',
  'coreInteraction',
  'appeal',
  'technologyNecessity',
  'generationTags',
])

function safeIssuePath(path) {
  if (
    !Array.isArray(path) ||
    path.length === 0 ||
    path.length > 4 ||
    path.some(
      (part) =>
        !(
          (typeof part === 'string' && KNOWN_PATH_SEGMENTS.has(part)) ||
          (Number.isInteger(part) && part >= 0 && part <= 30)
        ),
    )
  )
    return ['input']
  return path
}

/** Return only schema-derived metadata; never echo Agent-authored field values. */
export function previewInputFailure(binding, input) {
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    input.projectId !== binding.projectId ||
    input.discoverySessionId !== binding.discoverySessionId ||
    input.correlationId !== binding.correlationId ||
    typeof input.previews === 'string'
  )
    return null

  const parsed = discoverySubmitCandidatePreviewsToolInputSchema.safeParse(input)
  if (parsed.success) return null

  const actualCount = Array.isArray(input.previews) ? input.previews.length : null
  const wrongCount = actualCount !== null && actualCount !== EXPECTED_PREVIEWS
  const issues = wrongCount
    ? [
        {
          path: ['previews'],
          code: actualCount > EXPECTED_PREVIEWS ? 'TOO_MANY' : 'TOO_FEW',
          message: `Exactly ${EXPECTED_PREVIEWS} previews are required; received ${actualCount}.`,
        },
      ]
    : parsed.error.issues.slice(0, MAX_ISSUES).map((issue) => ({
        path: safeIssuePath(issue.path),
        code: 'INVALID_FIELD',
        message: 'This field does not match the required Preview input schema.',
      }))
  const error = operationErrorSchema.parse({
    schemaVersion: 1,
    kind: 'OPERATION_ERROR',
    category: 'VALIDATION',
    code: wrongCount ? 'DISCOVERY_PREVIEW_COUNT_INVALID' : 'DISCOVERY_PREVIEW_INPUT_INVALID',
    disposition: 'RETRYABLE',
    message: wrongCount
      ? `Submit exactly ${EXPECTED_PREVIEWS} complete previews, then retry. No previews were stored.`
      : 'Correct the listed Preview fields and resubmit the complete input. No previews were stored.',
    correlationId: binding.correlationId,
    issues,
    redactionStatus: 'VERIFIED_REDACTED',
  })
  return {
    result: {
      content: [{ type: 'text', text: JSON.stringify(error) }],
      structuredContent: error,
      isError: true,
    },
    receipt: {
      event: 'DISCOVERY_PREVIEW_INPUT_REJECTED',
      role: 'DISCOVERY',
      code: error.code,
      issuePaths: issues.map((issue) => issue.path),
      issueCodes: issues.map((issue) => issue.code),
      expectedCount: wrongCount ? EXPECTED_PREVIEWS : null,
      actualCount: wrongCount ? actualCount : null,
    },
  }
}
