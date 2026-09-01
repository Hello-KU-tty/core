import {
  type BuilderTask,
  type DecisionApplication,
  decisionApplicationSchema,
  type DecisionRequest,
  decisionRequestSchema,
  type DecisionResolution,
  decisionResolutionSchema,
  type LiveProjectContext,
} from '@vibe-helper/contracts'

import { applied, type DomainResult, noOp, rejected } from './result.js'
import { compareUtc, sameValue } from './utils.js'

export interface DecisionAggregate {
  readonly request: DecisionRequest
  readonly resolution?: DecisionResolution
  readonly application?: DecisionApplication
}

export interface OpenDecisionInput {
  readonly task: BuilderTask
  readonly liveContext: LiveProjectContext
  readonly request: unknown
  readonly existing?: DecisionAggregate
}

export interface ResolveDecisionInput {
  readonly aggregate: DecisionAggregate
  readonly task: BuilderTask
  readonly resolution: unknown
  readonly currentContextVersion: number
}

export interface ApplyDecisionInput {
  readonly aggregate: DecisionAggregate
  readonly task: BuilderTask
  readonly application: unknown
}

export function openDecision(input: OpenDecisionInput): DomainResult<DecisionAggregate> {
  const operation = 'DECISION_REQUEST'
  const parsed = decisionRequestSchema.safeParse(input.request)
  if (!parsed.success) return rejected({ operation, reasonCode: 'DECISION_INVALID_SCHEMA' })
  const request = parsed.data
  const entityIds = [request.id]
  if (input.existing !== undefined) {
    if (sameValue(input.existing.request, request)) {
      return noOp(input.existing, { operation, reasonCode: 'DECISION_DUPLICATE', entityIds })
    }
    return rejected({ operation, reasonCode: 'DECISION_ID_CONFLICT', entityIds })
  }
  if (
    input.task.status !== 'ACTIVE' ||
    request.projectId !== input.task.projectId ||
    request.taskId !== input.task.id ||
    request.correlationId !== input.task.correlationId ||
    input.liveContext.projectId !== request.projectId ||
    input.liveContext.taskId !== request.taskId ||
    input.liveContext.correlationId !== request.correlationId ||
    input.liveContext.contextVersion !== request.contextVersion ||
    input.liveContext.checkpoint !== 'DECISION_REQUIRED' ||
    !input.liveContext.activeDecisionIds.includes(request.id) ||
    (!request.independentWorkCanContinue && input.liveContext.blockingReason === undefined)
  ) {
    return rejected({ operation, reasonCode: 'DECISION_REQUEST_CONTEXT_MISMATCH', entityIds })
  }
  return applied({ request }, { operation, reasonCode: 'DECISION_REQUESTED', entityIds })
}

export function resolveDecision(input: ResolveDecisionInput): DomainResult<DecisionAggregate> {
  const operation = 'DECISION_RESOLVE'
  const parsed = decisionResolutionSchema.safeParse(input.resolution)
  if (!parsed.success) return rejected({ operation, reasonCode: 'DECISION_INVALID_SCHEMA' })
  const resolution = parsed.data
  const entityIds = [input.aggregate.request.id]
  if (
    !['ACTIVE', 'BLOCKED'].includes(input.task.status) ||
    input.task.id !== input.aggregate.request.taskId ||
    input.task.projectId !== input.aggregate.request.projectId
  ) {
    return rejected({ operation, reasonCode: 'DECISION_TASK_NOT_ACTIVE', entityIds })
  }
  if (input.aggregate.resolution !== undefined) {
    if (sameValue(input.aggregate.resolution, resolution)) {
      return noOp(input.aggregate, { operation, reasonCode: 'DECISION_DUPLICATE', entityIds })
    }
    return rejected({ operation, reasonCode: 'DECISION_ALREADY_RESOLVED', entityIds })
  }
  const request = input.aggregate.request
  if (
    resolution.decisionId !== request.id ||
    resolution.projectId !== request.projectId ||
    resolution.taskId !== request.taskId ||
    resolution.correlationId !== request.correlationId ||
    resolution.expectedContextVersion !== input.currentContextVersion ||
    input.currentContextVersion < request.contextVersion
  ) {
    return rejected({ operation, reasonCode: 'DECISION_RESOLUTION_REFERENCE_MISMATCH', entityIds })
  }
  if (
    resolution.selectionKind !== 'CUSTOM' &&
    !request.options.some((option) => option.id === resolution.selectedOptionId)
  ) {
    return rejected({ operation, reasonCode: 'DECISION_OPTION_NOT_FOUND', entityIds })
  }
  if (
    resolution.selectionKind === 'RECOMMENDATION' &&
    resolution.selectedOptionId !== request.recommendedOptionId
  ) {
    return rejected({ operation, reasonCode: 'DECISION_RECOMMENDATION_MISMATCH', entityIds })
  }
  if (compareUtc(resolution.resolvedAt, request.requestedAt) < 0) {
    return rejected({ operation, reasonCode: 'DECISION_TIMESTAMP_REGRESSION', entityIds })
  }
  return applied(
    { ...input.aggregate, resolution },
    { operation, reasonCode: 'DECISION_RESOLVED', entityIds },
  )
}

export function applyDecision(input: ApplyDecisionInput): DomainResult<DecisionAggregate> {
  const operation = 'DECISION_APPLY'
  const parsed = decisionApplicationSchema.safeParse(input.application)
  if (!parsed.success) return rejected({ operation, reasonCode: 'DECISION_INVALID_SCHEMA' })
  const application = parsed.data
  const entityIds = [input.aggregate.request.id]
  if (
    !['ACTIVE', 'BLOCKED'].includes(input.task.status) ||
    input.task.id !== input.aggregate.request.taskId ||
    input.task.projectId !== input.aggregate.request.projectId
  ) {
    return rejected({ operation, reasonCode: 'DECISION_TASK_NOT_ACTIVE', entityIds })
  }
  if (input.aggregate.application !== undefined) {
    if (sameValue(input.aggregate.application, application)) {
      return noOp(input.aggregate, { operation, reasonCode: 'DECISION_DUPLICATE', entityIds })
    }
    return rejected({ operation, reasonCode: 'DECISION_ALREADY_APPLIED', entityIds })
  }
  const resolution = input.aggregate.resolution
  if (resolution === undefined) {
    return rejected({ operation, reasonCode: 'DECISION_NOT_RESOLVED', entityIds })
  }
  const request = input.aggregate.request
  if (
    application.decisionId !== request.id ||
    application.resolutionId !== resolution.id ||
    application.projectId !== request.projectId ||
    application.taskId !== request.taskId ||
    application.correlationId !== request.correlationId
  ) {
    return rejected({ operation, reasonCode: 'DECISION_APPLICATION_REFERENCE_MISMATCH', entityIds })
  }
  if (compareUtc(application.appliedAt, resolution.resolvedAt) < 0) {
    return rejected({ operation, reasonCode: 'DECISION_TIMESTAMP_REGRESSION', entityIds })
  }
  return applied(
    { ...input.aggregate, application },
    { operation, reasonCode: 'DECISION_APPLIED', entityIds },
  )
}
