import {
  type DiscoveryFeedback,
  type LearningSpecRevision,
  learningSpecRevisionSchema,
  type ProjectCandidateRevision,
} from '@vibe-helper/contracts'

import { applied, type DomainResult, noOp, rejected } from './result.js'
import { compareUtc, sameValue } from './utils.js'

const OPERATION = 'LEARNING_SPEC_CONFIRM'

export interface ConfirmLearningSpecInput {
  readonly history: readonly LearningSpecRevision[]
  readonly proposed: unknown
  readonly selectedCandidate: ProjectCandidateRevision
  readonly selection: DiscoveryFeedback
}

function sortHistory(history: readonly LearningSpecRevision[]): LearningSpecRevision[] {
  return [...history].sort(
    (left, right) => left.id.localeCompare(right.id) || left.revision - right.revision,
  )
}

function confirmationContent(spec: LearningSpecRevision): unknown {
  return {
    schemaVersion: spec.schemaVersion,
    id: spec.id,
    projectId: spec.projectId,
    correlationId: spec.correlationId,
    selectedCandidate: spec.selectedCandidate,
    productPurpose: spec.productPurpose,
    targetUsers: spec.targetUsers,
    primaryUsageMoment: spec.primaryUsageMoment,
    successMoment: spec.successMoment,
    mvpFeatures: spec.mvpFeatures,
    scope: spec.scope,
    expectedDecisions: spec.expectedDecisions,
    runtimeConstraint: spec.runtimeConstraint,
    deploymentConstraints: spec.deploymentConstraints,
    createdAt: spec.createdAt,
    redactionStatus: spec.redactionStatus,
  }
}

export function confirmLearningSpec(
  input: ConfirmLearningSpecInput,
): DomainResult<readonly LearningSpecRevision[]> {
  const parsed = learningSpecRevisionSchema.safeParse(input.proposed)
  if (!parsed.success) {
    return rejected({ operation: OPERATION, reasonCode: 'LEARNING_SPEC_INVALID_SCHEMA' })
  }
  const proposed = parsed.data
  const entityIds = [proposed.id]
  const existingSameKey = input.history.find(
    (spec) => spec.id === proposed.id && spec.revision === proposed.revision,
  )
  if (existingSameKey !== undefined) {
    if (sameValue(existingSameKey, proposed)) {
      return noOp(sortHistory(input.history), {
        operation: OPERATION,
        reasonCode: 'LEARNING_SPEC_DUPLICATE',
        entityIds,
      })
    }
    return rejected({
      operation: OPERATION,
      reasonCode: 'LEARNING_SPEC_REVISION_CONFLICT',
      entityIds,
    })
  }

  const sameSpecHistory = input.history.filter((spec) => spec.id === proposed.id)
  const current = sameSpecHistory.reduce<LearningSpecRevision | undefined>(
    (latest, spec) => (latest === undefined || spec.revision > latest.revision ? spec : latest),
    undefined,
  )
  if (current === undefined || current.status !== 'DRAFT') {
    return rejected({
      operation: OPERATION,
      reasonCode: 'LEARNING_SPEC_NOT_CONFIRMABLE',
      entityIds,
    })
  }
  if (
    proposed.status !== 'CONFIRMED' ||
    proposed.revision !== current.revision + 1 ||
    proposed.parentRevision !== current.revision
  ) {
    return rejected({
      operation: OPERATION,
      reasonCode: 'LEARNING_SPEC_REVISION_NOT_NEXT',
      entityIds,
    })
  }
  if (!sameValue(confirmationContent(current), confirmationContent(proposed))) {
    return rejected({
      operation: OPERATION,
      reasonCode: 'LEARNING_SPEC_CHANGED_DURING_CONFIRMATION',
      entityIds,
    })
  }
  if (
    input.selection.intent !== 'SELECT' ||
    input.selection.correlationId !== proposed.correlationId ||
    input.selection.discoverySessionId !== input.selectedCandidate.discoverySessionId ||
    input.selection.targets.length !== 1 ||
    input.selection.targets[0]?.candidateId !== input.selectedCandidate.id ||
    input.selection.targets[0]?.revision !== input.selectedCandidate.revision ||
    proposed.selectedCandidate.candidateId !== input.selectedCandidate.id ||
    proposed.selectedCandidate.revision !== input.selectedCandidate.revision
  ) {
    return rejected({
      operation: OPERATION,
      reasonCode: 'LEARNING_SPEC_CANDIDATE_NOT_SELECTED',
      entityIds,
    })
  }
  if (
    proposed.confirmation === undefined ||
    compareUtc(proposed.updatedAt, current.updatedAt) < 0 ||
    compareUtc(proposed.confirmation.confirmedAt, current.updatedAt) < 0
  ) {
    return rejected({
      operation: OPERATION,
      reasonCode: 'LEARNING_SPEC_CONFIRMATION_TIME_INVALID',
      entityIds,
    })
  }

  return applied(sortHistory([...input.history, proposed]), {
    operation: OPERATION,
    reasonCode: 'LEARNING_SPEC_CONFIRMED',
    entityIds,
    before: current.status,
    after: proposed.status,
    supportingIds: [`${input.selectedCandidate.id}:${input.selectedCandidate.revision}`],
  })
}
