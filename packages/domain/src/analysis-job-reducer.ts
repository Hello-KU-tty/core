import { type AnalysisJob, analysisJobSchema, ANALYSIS_MAX_ATTEMPTS } from '@vibe-helper/contracts'

import { applied, type DomainResult, noOp, rejected } from './result.js'
import { compareUtc, sameValue } from './utils.js'

const OPERATION = 'ANALYSIS_JOB_TRANSITION'

export interface TransitionAnalysisJobInput {
  readonly current: AnalysisJob
  readonly proposed: unknown
}

export function transitionAnalysisJob(
  input: TransitionAnalysisJobInput,
): DomainResult<AnalysisJob> {
  const parsed = analysisJobSchema.safeParse(input.proposed)
  if (!parsed.success) {
    return rejected({ operation: OPERATION, reasonCode: 'ANALYSIS_JOB_INVALID_SCHEMA' })
  }
  const proposed = parsed.data
  const entityIds = [input.current.id]
  const manualRetry = input.current.status === 'FAILED' && proposed.status === 'PENDING'
  if (sameValue(input.current, proposed)) {
    return noOp(input.current, {
      operation: OPERATION,
      reasonCode: 'ANALYSIS_JOB_DUPLICATE',
      entityIds,
    })
  }
  if (
    proposed.id !== input.current.id ||
    proposed.projectId !== input.current.projectId ||
    proposed.episodeId !== input.current.episodeId ||
    (!manualRetry && proposed.episodeRevision !== input.current.episodeRevision) ||
    proposed.correlationId !== input.current.correlationId ||
    proposed.revision !== input.current.revision + 1 ||
    proposed.maxAttempts !== input.current.maxAttempts ||
    proposed.timeoutMs !== input.current.timeoutMs ||
    proposed.createdAt !== input.current.createdAt ||
    compareUtc(proposed.updatedAt, input.current.updatedAt) < 0
  ) {
    return rejected({
      operation: OPERATION,
      reasonCode: 'ANALYSIS_JOB_REVISION_CONFLICT',
      entityIds,
    })
  }

  const transition = `${input.current.status}:${proposed.status}`
  if (transition === 'PENDING:RUNNING') {
    if (proposed.attempt !== input.current.attempt + 1) {
      return rejected({ operation: OPERATION, reasonCode: 'ANALYSIS_ATTEMPT_INVALID', entityIds })
    }
  } else if (transition === 'RUNNING:PENDING') {
    if (
      proposed.attempt !== input.current.attempt ||
      proposed.attempt >= ANALYSIS_MAX_ATTEMPTS ||
      proposed.lastFailure === undefined ||
      !proposed.lastFailure.retryable
    ) {
      return rejected({ operation: OPERATION, reasonCode: 'ANALYSIS_RETRY_NOT_ALLOWED', entityIds })
    }
  } else if (transition === 'RUNNING:SUCCEEDED') {
    if (proposed.attempt !== input.current.attempt || proposed.lastFailure !== undefined) {
      return rejected({ operation: OPERATION, reasonCode: 'ANALYSIS_RESULT_STALE', entityIds })
    }
  } else if (transition === 'RUNNING:FAILED') {
    if (
      proposed.attempt !== input.current.attempt ||
      proposed.lastFailure === undefined ||
      (proposed.lastFailure.retryable && proposed.attempt < ANALYSIS_MAX_ATTEMPTS)
    ) {
      return rejected({
        operation: OPERATION,
        reasonCode: 'ANALYSIS_FAILURE_NOT_TERMINAL',
        entityIds,
      })
    }
  } else if (transition === 'FAILED:PENDING') {
    if (proposed.attempt !== 0 || proposed.lastFailure !== undefined) {
      return rejected({
        operation: OPERATION,
        reasonCode: 'ANALYSIS_MANUAL_RETRY_INVALID',
        entityIds,
      })
    }
  } else {
    return rejected({
      operation: OPERATION,
      reasonCode: 'ANALYSIS_JOB_TRANSITION_NOT_ALLOWED',
      entityIds,
    })
  }

  return applied(proposed, {
    operation: OPERATION,
    reasonCode: 'ANALYSIS_JOB_TRANSITIONED',
    entityIds,
    before: input.current.status,
    after: proposed.status,
  })
}
