import { analystSemanticResultSchema } from '@vibe-helper/contracts'

const knownFields = new Set([
  'schemaVersion',
  'episodeId',
  'episodeRevision',
  'correlationId',
  'proposals',
  'noEvidenceReason',
  'concept',
  'canonicalConceptId',
  'originalExpression',
  'proposedCanonicalName',
  'signal',
  'strength',
  'promptDependence',
  'userEvidenceSources',
  'contextSources',
  'redactedEvidenceExcerpt',
  'rationale',
  'uncertainty',
  'maximumSupportedState',
  'misconception',
  'action',
  'issueId',
  'summary',
  'kind',
  'conversationId',
  'messageId',
  'decisionId',
  'eventId',
  'path',
  'lineRange',
  'revisionRef',
  'diffId',
  'paths',
  'testResultId',
  'taskId',
  'toolCallId',
  'toolName',
  'start',
  'end',
])
const rootFields = [
  'schemaVersion',
  'episodeId',
  'episodeRevision',
  'correlationId',
  'proposals',
  'noEvidenceReason',
] as const
const issueCodes = new Set([
  'invalid_type',
  'invalid_value',
  'unrecognized_keys',
  'too_small',
  'too_big',
  'custom',
])

function parseCandidate(text: string): { readonly form: string; readonly candidate?: unknown } {
  const trimmed = text.trim()
  try {
    return { form: 'JSON', candidate: JSON.parse(trimmed) as unknown }
  } catch {
    const blocks = [...trimmed.matchAll(/```(?:json)?\s*\n([\s\S]*?)\n```/gi)]
    if (blocks.length !== 1) return { form: 'UNPARSEABLE' }
    try {
      return { form: 'FENCED_JSON', candidate: JSON.parse(blocks[0]?.[1]?.trim() ?? '') as unknown }
    } catch {
      return { form: 'UNPARSEABLE' }
    }
  }
}

/** Metadata only: no Agent text, input IDs, free-form keys, or Zod messages leave this function. */
export function describeNativeAnalystResult(text: string) {
  const parsed = parseCandidate(text)
  if (parsed.form === 'UNPARSEABLE') return { form: parsed.form }
  const value = parsed.candidate
  const type = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value
  if (type !== 'object' || value === null || Array.isArray(value)) {
    return { form: parsed.form, topLevelType: type }
  }
  const record = value as Record<string, unknown>
  const presentFields = rootFields.filter((key) => Object.hasOwn(record, key))
  const unknownFieldCount = Object.keys(record).filter(
    (key) => !rootFields.includes(key as (typeof rootFields)[number]),
  ).length
  const checked = analystSemanticResultSchema.safeParse(value)
  if (checked.success) {
    return {
      form: parsed.form,
      topLevelType: type,
      presentFields,
      unknownFieldCount,
      schemaValid: true,
    }
  }
  const issues = checked.error.issues.slice(0, 12).map((issue) => ({
    path: issue.path.map((segment) =>
      typeof segment === 'number' ? '#' : knownFields.has(String(segment)) ? segment : '?',
    ),
    code: issueCodes.has(issue.code) ? issue.code : 'other',
  }))
  return {
    form: parsed.form,
    topLevelType: type,
    presentFields,
    unknownFieldCount,
    schemaValid: false,
    issueCount: checked.error.issues.length,
    issues,
  }
}
