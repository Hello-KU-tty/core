import {
  type BuilderTask,
  builderTaskSchema,
  type TaskCompletionReport,
  taskCompletionReportSchema,
} from '@vibe-helper/contracts'

import { applied, type DomainResult, noOp, rejected } from './result.js'
import { compareUtc, sameValue, uniqueStrings } from './utils.js'

const OPERATION = 'BUILDER_TASK_TRANSITION'

const ALLOWED_TRANSITIONS: Readonly<
  Record<BuilderTask['status'], readonly BuilderTask['status'][]>
> = {
  PENDING: ['ACTIVE', 'CANCELLED'],
  ACTIVE: ['BLOCKED', 'COMPLETED', 'FAILED', 'CANCELLED'],
  BLOCKED: ['ACTIVE', 'FAILED', 'CANCELLED'],
  COMPLETED: [],
  FAILED: [],
  CANCELLED: [],
}

export interface TransitionBuilderTaskInput {
  readonly current: BuilderTask
  readonly proposed: unknown
  readonly completionReport?: unknown
}

function immutableTaskContent(task: BuilderTask): unknown {
  const { revision: _revision, status: _status, updatedAt: _updatedAt, ...immutable } = task
  return immutable
}

function validateCompletion(task: BuilderTask, report: TaskCompletionReport): string | undefined {
  if (
    report.projectId !== task.projectId ||
    report.taskId !== task.id ||
    report.correlationId !== task.correlationId ||
    report.expectedTaskRevision !== task.revision
  ) {
    return 'TASK_COMPLETION_REFERENCE_MISMATCH'
  }
  const requiredKeys = task.acceptanceCriteria.map((criterion) => criterion.key).sort()
  const reportedKeys = report.acceptanceResults.map((result) => result.criterionKey).sort()
  if (
    !uniqueStrings(requiredKeys) ||
    !uniqueStrings(reportedKeys) ||
    !sameValue(requiredKeys, reportedKeys)
  ) {
    return 'TASK_ACCEPTANCE_RESULTS_INCOMPLETE'
  }
  if (report.acceptanceResults.some((result) => result.status !== 'PASSED')) {
    return 'TASK_ACCEPTANCE_FAILED'
  }
  if (report.validationResults.some((result) => result.status === 'FAILED')) {
    return 'TASK_VALIDATION_FAILED'
  }
  if (!uniqueStrings(report.appliedDecisionIds)) return 'TASK_APPLIED_DECISIONS_DUPLICATED'
  return undefined
}

export function transitionBuilderTask(
  input: TransitionBuilderTaskInput,
): DomainResult<BuilderTask> {
  const parsed = builderTaskSchema.safeParse(input.proposed)
  if (!parsed.success) {
    return rejected({ operation: OPERATION, reasonCode: 'TASK_INVALID_SCHEMA' })
  }
  const proposed = parsed.data
  const entityIds = [input.current.id]
  if (sameValue(input.current, proposed)) {
    return noOp(input.current, { operation: OPERATION, reasonCode: 'TASK_DUPLICATE', entityIds })
  }
  if (
    proposed.id !== input.current.id ||
    proposed.revision !== input.current.revision + 1 ||
    !sameValue(immutableTaskContent(input.current), immutableTaskContent(proposed))
  ) {
    return rejected({ operation: OPERATION, reasonCode: 'TASK_REVISION_CONFLICT', entityIds })
  }
  if (!ALLOWED_TRANSITIONS[input.current.status].includes(proposed.status)) {
    return rejected({ operation: OPERATION, reasonCode: 'TASK_TRANSITION_NOT_ALLOWED', entityIds })
  }
  if (compareUtc(proposed.updatedAt, input.current.updatedAt) < 0) {
    return rejected({ operation: OPERATION, reasonCode: 'TASK_TIMESTAMP_REGRESSION', entityIds })
  }

  if (proposed.status === 'COMPLETED') {
    const reportResult = taskCompletionReportSchema.safeParse(input.completionReport)
    if (!reportResult.success) {
      return rejected({
        operation: OPERATION,
        reasonCode: 'TASK_COMPLETION_REPORT_REQUIRED',
        entityIds,
      })
    }
    const reason = validateCompletion(input.current, reportResult.data)
    if (reason !== undefined) {
      return rejected({ operation: OPERATION, reasonCode: reason, entityIds })
    }
  } else if (input.completionReport !== undefined) {
    return rejected({
      operation: OPERATION,
      reasonCode: 'TASK_COMPLETION_REPORT_NOT_ALLOWED',
      entityIds,
    })
  }

  return applied(proposed, {
    operation: OPERATION,
    reasonCode: 'TASK_TRANSITION_APPLIED',
    entityIds,
    before: input.current.status,
    after: proposed.status,
  })
}
