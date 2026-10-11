import {
  type BuilderTask,
  NEXT_MOVE_MAX_ATTEMPTS,
  type NextMoveJob,
  type NextMoveView,
  nextMoveJobSchema,
  nextMoveViewSchema,
} from '@vibe-helper/contracts'

import { findClearOptionAnswer } from './chat-decision-reply.js'
import { applied, type DomainResult, noOp, rejected } from './result.js'
import { compareUtc, sameValue } from './utils.js'

const OPERATION = 'NEXT_MOVE_JOB_TRANSITION'

/** Same lease and retry rules as an Analysis Job (DECISIONS: Next Move runs like the Analyst). */
export function transitionNextMoveJob(input: {
  readonly current: NextMoveJob
  readonly proposed: unknown
}): DomainResult<NextMoveJob> {
  const parsed = nextMoveJobSchema.safeParse(input.proposed)
  if (!parsed.success)
    return rejected({ operation: OPERATION, reasonCode: 'NEXT_MOVE_JOB_INVALID_SCHEMA' })
  const proposed = parsed.data
  const { current } = input
  const entityIds = [current.id]
  if (sameValue(current, proposed))
    return noOp(current, { operation: OPERATION, reasonCode: 'NEXT_MOVE_JOB_DUPLICATE', entityIds })
  if (
    proposed.id !== current.id ||
    proposed.projectId !== current.projectId ||
    proposed.sourceTaskId !== current.sourceTaskId ||
    proposed.correlationId !== current.correlationId ||
    proposed.revision !== current.revision + 1 ||
    proposed.createdAt !== current.createdAt ||
    compareUtc(proposed.updatedAt, current.updatedAt) < 0
  )
    return rejected({
      operation: OPERATION,
      reasonCode: 'NEXT_MOVE_JOB_REVISION_CONFLICT',
      entityIds,
    })
  const reject = (reasonCode: string): DomainResult<NextMoveJob> =>
    rejected({ operation: OPERATION, reasonCode, entityIds })
  switch (`${current.status}:${proposed.status}`) {
    case 'PENDING:RUNNING':
      if (proposed.attempt !== current.attempt + 1) return reject('NEXT_MOVE_ATTEMPT_INVALID')
      break
    case 'RUNNING:PENDING':
      if (
        proposed.attempt !== current.attempt ||
        proposed.attempt >= NEXT_MOVE_MAX_ATTEMPTS ||
        proposed.lastFailure?.retryable !== true
      )
        return reject('NEXT_MOVE_RETRY_NOT_ALLOWED')
      break
    case 'RUNNING:SUCCEEDED':
      if (proposed.attempt !== current.attempt || proposed.lastFailure !== undefined)
        return reject('NEXT_MOVE_RESULT_STALE')
      break
    case 'RUNNING:FAILED':
      if (
        proposed.attempt !== current.attempt ||
        proposed.lastFailure === undefined ||
        (proposed.lastFailure.retryable && proposed.attempt < NEXT_MOVE_MAX_ATTEMPTS)
      )
        return reject('NEXT_MOVE_FAILURE_NOT_TERMINAL')
      break
    case 'FAILED:PENDING':
      if (proposed.attempt !== 0 || proposed.lastFailure !== undefined)
        return reject('NEXT_MOVE_MANUAL_RETRY_INVALID')
      break
    default:
      return reject('NEXT_MOVE_JOB_TRANSITION_NOT_ALLOWED')
  }
  return applied(proposed, {
    operation: OPERATION,
    reasonCode: 'NEXT_MOVE_JOB_TRANSITIONED',
    entityIds,
    before: current.status,
    after: proposed.status,
  })
}

/**
 * The Project's current suggestions. They belong to the latest Task only while it is finished;
 * once the learner starts another Task they are past and nothing is shown until it finishes.
 */
export function nextMoveView(input: {
  readonly latestTask: BuilderTask | null
  readonly job: NextMoveJob | null
}): NextMoveView {
  const { latestTask, job } = input
  if (
    latestTask === null ||
    latestTask.status !== 'COMPLETED' ||
    job === null ||
    job.sourceTaskId !== latestTask.id
  )
    return nextMoveViewSchema.parse({ status: 'NONE', moves: [] })
  const identity = {
    nextMoveJobId: job.id,
    jobRevision: job.revision,
    sourceTaskId: job.sourceTaskId,
    updatedAt: job.updatedAt,
  }
  switch (job.status) {
    case 'PENDING':
    case 'RUNNING':
      return nextMoveViewSchema.parse({ status: 'GENERATING', ...identity, moves: [] })
    case 'FAILED':
      return nextMoveViewSchema.parse({
        status: 'FAILED',
        ...identity,
        moves: [],
        ...(job.lastFailure === undefined ? {} : { failureCode: job.lastFailure.code }),
      })
    case 'SUCCEEDED':
      return nextMoveViewSchema.parse({
        status: 'READY',
        ...identity,
        moves: (job.moves ?? []).map(({ number, title, summary, benefit, size }) => ({
          number,
          title,
          summary,
          benefit,
          size,
        })),
      })
  }
}

/**
 * The number a learner's reply clearly picks among the shown suggestions, using the same narrow
 * reading as a chat Decision answer ("2번", "2번 해 보자"). Core uses it only to reject a Builder
 * record that contradicts the learner or leaves out a clearly chosen suggestion.
 */
export function clearNextMoveAnswer(
  moves: readonly { readonly number: number }[],
  reply: string,
): number | undefined {
  const options = moves.map((move) => ({ id: String(move.number) }))
  const chosen = findClearOptionAnswer({ options }, reply)
  return chosen === undefined ? undefined : Number(chosen)
}
