import type { EvaluationSubject } from './types.js'

const TOP_LEVEL_KEYS = new Set([
  'schemaVersion',
  'discovery',
  'learningSpec',
  'builderTask',
  'liveContext',
  'completionReport',
  'decision',
  'activityEvent',
  'episode',
  'evidence',
  'conceptLedger',
  'audit',
  'scopeExpectation',
  'contextExpectation',
  'redaction',
  'helperInteraction',
  'specRevisionInteraction',
  'analystInteraction',
])

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseEvaluationSubject(value: unknown): EvaluationSubject {
  if (!isRecord(value) || value.schemaVersion !== 1) {
    throw new Error('Evaluation subject must be a schemaVersion 1 object')
  }
  const unexpected = Object.keys(value).find((key) => !TOP_LEVEL_KEYS.has(key))
  if (unexpected !== undefined) {
    throw new Error(`Evaluation subject contains unexpected field ${unexpected}`)
  }
  return value as unknown as EvaluationSubject
}

export function asRecord(value: unknown): Readonly<Record<string, unknown>> | null {
  return isRecord(value) ? value : null
}
