import {
  type BuilderTask,
  type LiveProjectContext,
  liveProjectContextSchema,
} from '@vibe-helper/contracts'

import { applied, type DomainResult, noOp, rejected } from './result.js'
import { compareUtc, sameValue, uniqueStrings } from './utils.js'

const OPERATION = 'LIVE_CONTEXT_UPDATE'

export interface UpdateLiveContextInput {
  readonly task: BuilderTask
  readonly current?: LiveProjectContext
  readonly proposed: unknown
}

export function updateLiveContext(input: UpdateLiveContextInput): DomainResult<LiveProjectContext> {
  const parsed = liveProjectContextSchema.safeParse(input.proposed)
  if (!parsed.success) {
    return rejected({ operation: OPERATION, reasonCode: 'LIVE_CONTEXT_INVALID_SCHEMA' })
  }
  const proposed = parsed.data
  const entityIds = [input.task.id, proposed.id]
  if (!['ACTIVE', 'BLOCKED'].includes(input.task.status)) {
    return rejected({
      operation: OPERATION,
      reasonCode: 'LIVE_CONTEXT_TASK_NOT_RUNNING',
      entityIds,
    })
  }
  if (
    proposed.projectId !== input.task.projectId ||
    proposed.taskId !== input.task.id ||
    proposed.correlationId !== input.task.correlationId
  ) {
    return rejected({ operation: OPERATION, reasonCode: 'LIVE_CONTEXT_TASK_MISMATCH', entityIds })
  }
  if (
    !uniqueStrings(proposed.activeDecisionIds) ||
    !uniqueStrings(proposed.activeConceptNames.map((name) => name.toLocaleLowerCase('en-US')))
  ) {
    return rejected({
      operation: OPERATION,
      reasonCode: 'LIVE_CONTEXT_DUPLICATE_REFERENCE',
      entityIds,
    })
  }

  if (input.current === undefined) {
    if (
      proposed.contextVersion !== 1 ||
      proposed.expectedPreviousVersion !== 0 ||
      proposed.checkpoint !== 'TASK_STARTED'
    ) {
      return rejected({
        operation: OPERATION,
        reasonCode: 'LIVE_CONTEXT_INITIAL_INVALID',
        entityIds,
      })
    }
    return applied(proposed, {
      operation: OPERATION,
      reasonCode: 'LIVE_CONTEXT_CREATED',
      entityIds,
      after: proposed.checkpoint,
    })
  }

  if (sameValue(input.current, proposed)) {
    return noOp(input.current, {
      operation: OPERATION,
      reasonCode: 'LIVE_CONTEXT_DUPLICATE',
      entityIds,
    })
  }
  if (
    proposed.id !== input.current.id ||
    proposed.expectedPreviousVersion !== input.current.contextVersion ||
    proposed.contextVersion !== input.current.contextVersion + 1
  ) {
    return rejected({ operation: OPERATION, reasonCode: 'LIVE_CONTEXT_STALE', entityIds })
  }
  if (proposed.checkpoint === 'TASK_STARTED') {
    return rejected({ operation: OPERATION, reasonCode: 'LIVE_CONTEXT_START_REPEATED', entityIds })
  }
  if (input.current.checkpoint === 'TASK_COMPLETED') {
    return rejected({
      operation: OPERATION,
      reasonCode: 'LIVE_CONTEXT_ALREADY_COMPLETED',
      entityIds,
    })
  }
  if (compareUtc(proposed.updatedAt, input.current.updatedAt) < 0) {
    return rejected({
      operation: OPERATION,
      reasonCode: 'LIVE_CONTEXT_TIMESTAMP_REGRESSION',
      entityIds,
    })
  }

  return applied(proposed, {
    operation: OPERATION,
    reasonCode: 'LIVE_CONTEXT_UPDATED',
    entityIds,
    before: input.current.checkpoint,
    after: proposed.checkpoint,
  })
}
