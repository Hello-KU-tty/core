import { createHash } from 'node:crypto'

import { PersistenceError } from '@vibe-helper/application'

interface ContractSchema<T> {
  safeParse(input: unknown): { success: true; data: T } | { success: false }
}

type JsonPrimitive = boolean | number | string | null
type JsonValue = JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue }

export interface PreparedRecord<T> {
  readonly record: T
  readonly payloadJson: string
  readonly payloadHash: string
}

const SECRET_PATTERNS: readonly RegExp[] = [
  /\bAKIA[0-9A-Z]{16}\b/u,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/u,
  /\bsk-[A-Za-z0-9_-]{20,}\b/u,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}\b/iu,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/u,
  /["']?(?:api[_-]?key|access[_-]?token|auth[_-]?token|password|secret)["']?\s*[:=]\s*(?:\\?["'][^"']{8,}\\?["']|[A-Za-z0-9._~+/=-]{16,})/iu,
]

const sortJson = (value: unknown): JsonValue => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new PersistenceError('VALIDATION_FAILED', 'Record contains a non-finite number')
    }
    return value
  }
  if (Array.isArray(value)) {
    return value.map(sortJson)
  }
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, nested]) => nested !== undefined)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, nested]) => [key, sortJson(nested)]),
    )
  }
  throw new PersistenceError('VALIDATION_FAILED', 'Record is not JSON serializable')
}

export const stableStringify = (value: unknown): string => JSON.stringify(sortJson(value))

export const assertPayloadSafe = (payloadJson: string): void => {
  if (SECRET_PATTERNS.some((pattern) => pattern.test(payloadJson))) {
    throw new PersistenceError(
      'UNSAFE_PAYLOAD',
      'Record was rejected because it contains credential-like material',
    )
  }
}

export const prepareRecord = <T>(schema: ContractSchema<T>, input: T): PreparedRecord<T> => {
  const result = schema.safeParse(input)
  if (!result.success) {
    throw new PersistenceError('VALIDATION_FAILED', 'Record does not match its contract schema')
  }
  const payloadJson = stableStringify(result.data)
  assertPayloadSafe(payloadJson)
  return {
    record: result.data,
    payloadJson,
    payloadHash: createHash('sha256').update(payloadJson).digest('hex'),
  }
}

export const parseStoredRecord = <T>(
  schema: ContractSchema<T>,
  payloadJson: string,
  payloadHash: string,
): T => {
  try {
    const actualHash = createHash('sha256').update(payloadJson).digest('hex')
    if (actualHash !== payloadHash) {
      throw new PersistenceError('CORRUPT_DATABASE', 'Stored record hash verification failed')
    }
    const parsed: unknown = JSON.parse(payloadJson)
    const result = schema.safeParse(parsed)
    if (!result.success) {
      throw new PersistenceError(
        'CORRUPT_DATABASE',
        'Stored record does not match its contract schema',
      )
    }
    return result.data
  } catch (error) {
    if (error instanceof PersistenceError) {
      throw error
    }
    throw new PersistenceError('CORRUPT_DATABASE', 'Stored record is not valid JSON')
  }
}
