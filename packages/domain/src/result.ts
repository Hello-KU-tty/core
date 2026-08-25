export const DOMAIN_POLICY_VERSION = '1.0.0' as const

export type DomainOutcome = 'APPLIED' | 'NO_OP' | 'REJECTED'

export interface DomainTrace {
  readonly policyVersion: typeof DOMAIN_POLICY_VERSION
  readonly operation: string
  readonly outcome: DomainOutcome
  readonly reasonCode: string
  readonly entityIds: readonly string[]
  readonly before?: string
  readonly after?: string
  readonly supportingIds?: readonly string[]
}

export type DomainResult<T> =
  | { readonly outcome: 'APPLIED'; readonly value: T; readonly trace: DomainTrace }
  | { readonly outcome: 'NO_OP'; readonly value: T; readonly trace: DomainTrace }
  | { readonly outcome: 'REJECTED'; readonly reasonCode: string; readonly trace: DomainTrace }

export interface TraceInput {
  readonly operation: string
  readonly reasonCode: string
  readonly entityIds?: readonly string[]
  readonly before?: string
  readonly after?: string
  readonly supportingIds?: readonly string[]
}

export function createDomainTrace(outcome: DomainOutcome, input: TraceInput): DomainTrace {
  return {
    policyVersion: DOMAIN_POLICY_VERSION,
    operation: input.operation,
    outcome,
    reasonCode: input.reasonCode,
    entityIds: [...(input.entityIds ?? [])].sort(),
    ...(input.before === undefined ? {} : { before: input.before }),
    ...(input.after === undefined ? {} : { after: input.after }),
    ...(input.supportingIds === undefined
      ? {}
      : { supportingIds: [...input.supportingIds].sort() }),
  }
}

export function applied<T>(value: T, input: TraceInput): DomainResult<T> {
  return { outcome: 'APPLIED', value, trace: createDomainTrace('APPLIED', input) }
}

export function noOp<T>(value: T, input: TraceInput): DomainResult<T> {
  return { outcome: 'NO_OP', value, trace: createDomainTrace('NO_OP', input) }
}

export function rejected<T>(input: TraceInput): DomainResult<T> {
  return {
    outcome: 'REJECTED',
    reasonCode: input.reasonCode,
    trace: createDomainTrace('REJECTED', input),
  }
}
