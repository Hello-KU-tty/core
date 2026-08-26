import {
  type DiscoveryFeedback,
  type LearningSpecRevision,
  learningSpecRevisionSchema,
  type ProjectCandidateRevision,
} from '@vibe-helper/contracts'

import { applied, type DomainResult, noOp, rejected } from './result.js'
import { compareUtc, sameValue } from './utils.js'

const CONFIRM_OPERATION = 'LEARNING_SPEC_CONFIRM'
const DRAFT_OPERATION = 'LEARNING_SPEC_DRAFT'
const SUPERSEDE_OPERATION = 'LEARNING_SPEC_SUPERSEDE'

export interface WriteLearningSpecDraftInput {
  readonly history: readonly LearningSpecRevision[]
  readonly proposed: unknown
  readonly selectedCandidate: ProjectCandidateRevision
  readonly selection: DiscoveryFeedback
}

export interface SupersedeLearningSpecInput {
  readonly history: readonly LearningSpecRevision[]
  readonly proposed: unknown
}

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

function selectionMatches(
  spec: LearningSpecRevision,
  selectedCandidate: ProjectCandidateRevision,
  selection: DiscoveryFeedback,
): boolean {
  return (
    selection.intent === 'SELECT' &&
    selection.correlationId === spec.correlationId &&
    selection.discoverySessionId === selectedCandidate.discoverySessionId &&
    selection.targets.length === 1 &&
    selection.targets[0]?.candidateId === selectedCandidate.id &&
    selection.targets[0]?.revision === selectedCandidate.revision &&
    spec.selectedCandidate.candidateId === selectedCandidate.id &&
    spec.selectedCandidate.revision === selectedCandidate.revision
  )
}

export function writeLearningSpecDraft(
  input: WriteLearningSpecDraftInput,
): DomainResult<readonly LearningSpecRevision[]> {
  const parsed = learningSpecRevisionSchema.safeParse(input.proposed)
  if (!parsed.success) {
    return rejected({ operation: DRAFT_OPERATION, reasonCode: 'LEARNING_SPEC_INVALID_SCHEMA' })
  }
  const proposed = parsed.data
  const entityIds = [proposed.id]
  const existingSameKey = input.history.find(
    (spec) => spec.id === proposed.id && spec.revision === proposed.revision,
  )
  if (existingSameKey !== undefined) {
    return sameValue(existingSameKey, proposed)
      ? noOp(sortHistory(input.history), {
          operation: DRAFT_OPERATION,
          reasonCode: 'LEARNING_SPEC_DUPLICATE',
          entityIds,
        })
      : rejected({
          operation: DRAFT_OPERATION,
          reasonCode: 'LEARNING_SPEC_REVISION_CONFLICT',
          entityIds,
        })
  }
  if (proposed.status !== 'DRAFT' || proposed.confirmation !== undefined) {
    return rejected({
      operation: DRAFT_OPERATION,
      reasonCode: 'LEARNING_SPEC_DRAFT_REQUIRED',
      entityIds,
    })
  }
  const discoveryAuthored = proposed.source.kind === 'AGENT' && proposed.source.role === 'DISCOVERY'
  if (!discoveryAuthored && proposed.source.kind !== 'USER') {
    return rejected({
      operation: DRAFT_OPERATION,
      reasonCode: 'LEARNING_SPEC_DRAFT_AUTHOR_INVALID',
      entityIds,
    })
  }
  if (!selectionMatches(proposed, input.selectedCandidate, input.selection)) {
    return rejected({
      operation: DRAFT_OPERATION,
      reasonCode: 'LEARNING_SPEC_CANDIDATE_NOT_SELECTED',
      entityIds,
    })
  }

  const sameSpecHistory = input.history.filter((spec) => spec.id === proposed.id)
  const current = sameSpecHistory.reduce<LearningSpecRevision | undefined>(
    (latest, spec) => (latest === undefined || spec.revision > latest.revision ? spec : latest),
    undefined,
  )
  if (current === undefined) {
    if (proposed.revision !== 1 || proposed.parentRevision !== undefined || !discoveryAuthored) {
      return rejected({
        operation: DRAFT_OPERATION,
        reasonCode: 'LEARNING_SPEC_INITIAL_REVISION_INVALID',
        entityIds,
      })
    }
  } else {
    if (current.status !== 'DRAFT') {
      return rejected({
        operation: DRAFT_OPERATION,
        reasonCode: 'LEARNING_SPEC_NOT_EDITABLE',
        entityIds,
      })
    }
    if (
      proposed.revision !== current.revision + 1 ||
      proposed.parentRevision !== current.revision
    ) {
      return rejected({
        operation: DRAFT_OPERATION,
        reasonCode: 'LEARNING_SPEC_REVISION_NOT_NEXT',
        entityIds,
      })
    }
    if (
      proposed.projectId !== current.projectId ||
      proposed.correlationId !== current.correlationId ||
      !sameValue(proposed.selectedCandidate, current.selectedCandidate) ||
      proposed.createdAt !== current.createdAt
    ) {
      return rejected({
        operation: DRAFT_OPERATION,
        reasonCode: 'LEARNING_SPEC_IDENTITY_CHANGED',
        entityIds,
      })
    }
    if (compareUtc(proposed.updatedAt, current.updatedAt) < 0) {
      return rejected({
        operation: DRAFT_OPERATION,
        reasonCode: 'LEARNING_SPEC_UPDATE_TIME_INVALID',
        entityIds,
      })
    }
  }

  return applied(sortHistory([...input.history, proposed]), {
    operation: DRAFT_OPERATION,
    reasonCode:
      current === undefined ? 'LEARNING_SPEC_DRAFT_CREATED' : 'LEARNING_SPEC_DRAFT_REVISED',
    entityIds,
    ...(current === undefined ? {} : { before: current.status }),
    after: proposed.status,
    supportingIds: [`${input.selectedCandidate.id}:${input.selectedCandidate.revision}`],
  })
}

export function supersedeLearningSpec(
  input: SupersedeLearningSpecInput,
): DomainResult<readonly LearningSpecRevision[]> {
  const parsed = learningSpecRevisionSchema.safeParse(input.proposed)
  if (!parsed.success) {
    return rejected({ operation: SUPERSEDE_OPERATION, reasonCode: 'LEARNING_SPEC_INVALID_SCHEMA' })
  }
  const proposed = parsed.data
  const entityIds = [proposed.id]
  const existingSameKey = input.history.find(
    (spec) => spec.id === proposed.id && spec.revision === proposed.revision,
  )
  if (existingSameKey !== undefined) {
    return sameValue(existingSameKey, proposed)
      ? noOp(sortHistory(input.history), {
          operation: SUPERSEDE_OPERATION,
          reasonCode: 'LEARNING_SPEC_DUPLICATE',
          entityIds,
        })
      : rejected({
          operation: SUPERSEDE_OPERATION,
          reasonCode: 'LEARNING_SPEC_REVISION_CONFLICT',
          entityIds,
        })
  }
  const current = latestBySpec(input.history, proposed.id)
  if (
    current === undefined ||
    current.status !== 'DRAFT' ||
    proposed.status !== 'SUPERSEDED' ||
    proposed.source.kind !== 'CORE' ||
    proposed.revision !== current.revision + 1 ||
    proposed.parentRevision !== current.revision
  ) {
    return rejected({
      operation: SUPERSEDE_OPERATION,
      reasonCode: 'LEARNING_SPEC_NOT_SUPERSEDABLE',
      entityIds,
    })
  }
  if (!sameValue(confirmationContent(current), confirmationContent(proposed))) {
    return rejected({
      operation: SUPERSEDE_OPERATION,
      reasonCode: 'LEARNING_SPEC_CHANGED_DURING_SUPERSEDE',
      entityIds,
    })
  }
  if (compareUtc(proposed.updatedAt, current.updatedAt) < 0) {
    return rejected({
      operation: SUPERSEDE_OPERATION,
      reasonCode: 'LEARNING_SPEC_UPDATE_TIME_INVALID',
      entityIds,
    })
  }
  return applied(sortHistory([...input.history, proposed]), {
    operation: SUPERSEDE_OPERATION,
    reasonCode: 'LEARNING_SPEC_SUPERSEDED',
    entityIds,
    before: current.status,
    after: proposed.status,
  })
}

function latestBySpec(
  history: readonly LearningSpecRevision[],
  id: string,
): LearningSpecRevision | undefined {
  return history
    .filter((spec) => spec.id === id)
    .reduce<LearningSpecRevision | undefined>(
      (latest, spec) => (latest === undefined || spec.revision > latest.revision ? spec : latest),
      undefined,
    )
}

export function requiredEvidenceConceptNames(spec: LearningSpecRevision): readonly string[] {
  const names = new Map<string, string>()
  for (const item of spec.scope) {
    if (item.category !== 'LEARNER_FOCUS') continue
    for (const conceptName of item.conceptNames) {
      const key = conceptName.trim().toLocaleLowerCase('en-US')
      if (!names.has(key)) names.set(key, conceptName)
    }
  }
  return [...names.values()]
}

export function confirmLearningSpec(
  input: ConfirmLearningSpecInput,
): DomainResult<readonly LearningSpecRevision[]> {
  const parsed = learningSpecRevisionSchema.safeParse(input.proposed)
  if (!parsed.success) {
    return rejected({ operation: CONFIRM_OPERATION, reasonCode: 'LEARNING_SPEC_INVALID_SCHEMA' })
  }
  const proposed = parsed.data
  const entityIds = [proposed.id]
  const existingSameKey = input.history.find(
    (spec) => spec.id === proposed.id && spec.revision === proposed.revision,
  )
  if (existingSameKey !== undefined) {
    if (sameValue(existingSameKey, proposed)) {
      return noOp(sortHistory(input.history), {
        operation: CONFIRM_OPERATION,
        reasonCode: 'LEARNING_SPEC_DUPLICATE',
        entityIds,
      })
    }
    return rejected({
      operation: CONFIRM_OPERATION,
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
      operation: CONFIRM_OPERATION,
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
      operation: CONFIRM_OPERATION,
      reasonCode: 'LEARNING_SPEC_REVISION_NOT_NEXT',
      entityIds,
    })
  }
  if (!sameValue(confirmationContent(current), confirmationContent(proposed))) {
    return rejected({
      operation: CONFIRM_OPERATION,
      reasonCode: 'LEARNING_SPEC_CHANGED_DURING_CONFIRMATION',
      entityIds,
    })
  }
  if (!selectionMatches(proposed, input.selectedCandidate, input.selection)) {
    return rejected({
      operation: CONFIRM_OPERATION,
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
      operation: CONFIRM_OPERATION,
      reasonCode: 'LEARNING_SPEC_CONFIRMATION_TIME_INVALID',
      entityIds,
    })
  }

  return applied(sortHistory([...input.history, proposed]), {
    operation: CONFIRM_OPERATION,
    reasonCode: 'LEARNING_SPEC_CONFIRMED',
    entityIds,
    before: current.status,
    after: proposed.status,
    supportingIds: [`${input.selectedCandidate.id}:${input.selectedCandidate.revision}`],
  })
}
