import {
  type ContractError,
  type OperationError,
  operationErrorSchema,
} from '@vibe-helper/contracts'

export type ApplicationResult<T> =
  | { readonly success: true; readonly data: T }
  | { readonly success: false; readonly error: ContractError | OperationError }

export interface OperationErrorInput {
  readonly category: OperationError['category']
  readonly code: string
  readonly disposition: OperationError['disposition']
  readonly message: string
  readonly correlationId: string
  readonly issues?: OperationError['issues']
  readonly redactionStatus?: OperationError['redactionStatus']
}

export function createOperationError(input: OperationErrorInput): OperationError {
  return operationErrorSchema.parse({
    schemaVersion: 1,
    kind: 'OPERATION_ERROR',
    category: input.category,
    code: input.code,
    disposition: input.disposition,
    message: input.message,
    correlationId: input.correlationId,
    issues: input.issues ?? [],
    redactionStatus: input.redactionStatus ?? 'VERIFIED_REDACTED',
  })
}

export class ApplicationError extends Error {
  readonly operationError: OperationError

  constructor(operationError: OperationError) {
    super(operationError.message)
    this.name = 'ApplicationError'
    this.operationError = operationError
  }
}
