import {
  type DiscoveryFeedback,
  type ProjectCandidateRevision,
  projectCandidateRevisionSchema,
} from '@vibe-helper/contracts'

import { applied, type DomainResult, noOp, rejected } from './result.js'
import { sameValue } from './utils.js'

const OPERATION = 'CANDIDATE_REVISION_SUBMIT'

export interface CandidateRevisionInput {
  readonly existing: readonly ProjectCandidateRevision[]
  readonly proposed: unknown
  readonly feedback?: DiscoveryFeedback
}

function key(reference: { readonly candidateId: string; readonly revision: number }): string {
  return `${reference.candidateId}:${reference.revision}`
}

function candidateKey(candidate: ProjectCandidateRevision): string {
  return `${candidate.id}:${candidate.revision}`
}

function sortHistory(history: readonly ProjectCandidateRevision[]): ProjectCandidateRevision[] {
  return [...history].sort(
    (left, right) => left.id.localeCompare(right.id) || left.revision - right.revision,
  )
}

function sameReferenceSet(
  left: readonly { readonly candidateId: string; readonly revision: number }[],
  right: readonly { readonly candidateId: string; readonly revision: number }[],
): boolean {
  return sameValue(left.map(key).sort(), right.map(key).sort())
}

export function reduceCandidateRevision(
  input: CandidateRevisionInput,
): DomainResult<readonly ProjectCandidateRevision[]> {
  const parsed = projectCandidateRevisionSchema.safeParse(input.proposed)
  if (!parsed.success) {
    return rejected({ operation: OPERATION, reasonCode: 'CANDIDATE_INVALID_SCHEMA' })
  }

  const proposed = parsed.data
  const entityIds = [proposed.id]
  const existingSameKey = input.existing.find(
    (candidate) => candidate.id === proposed.id && candidate.revision === proposed.revision,
  )
  if (existingSameKey !== undefined) {
    if (sameValue(existingSameKey, proposed)) {
      return noOp(sortHistory(input.existing), {
        operation: OPERATION,
        reasonCode: 'CANDIDATE_DUPLICATE',
        entityIds,
      })
    }
    return rejected({ operation: OPERATION, reasonCode: 'CANDIDATE_REVISION_CONFLICT', entityIds })
  }

  const historyByKey = new Map(
    input.existing.map((candidate) => [candidateKey(candidate), candidate]),
  )
  const latestByCandidate = new Map<string, ProjectCandidateRevision>()
  for (const candidate of input.existing) {
    const current = latestByCandidate.get(candidate.id)
    if (current === undefined || candidate.revision > current.revision) {
      latestByCandidate.set(candidate.id, candidate)
    }
  }

  for (const parent of proposed.parentRevisions) {
    const existingParent = historyByKey.get(key(parent))
    if (existingParent === undefined) {
      return rejected({ operation: OPERATION, reasonCode: 'CANDIDATE_PARENT_NOT_FOUND', entityIds })
    }
    const latestParent = latestByCandidate.get(parent.candidateId)
    if (latestParent?.revision !== parent.revision) {
      return rejected({
        operation: OPERATION,
        reasonCode: 'CANDIDATE_PARENT_NOT_LATEST',
        entityIds,
      })
    }
    if (
      existingParent.discoverySessionId !== proposed.discoverySessionId ||
      existingParent.correlationId !== proposed.correlationId
    ) {
      return rejected({
        operation: OPERATION,
        reasonCode: 'CANDIDATE_LINEAGE_SCOPE_MISMATCH',
        entityIds,
      })
    }
  }

  const latestOwnRevision = latestByCandidate.get(proposed.id)
  if (proposed.revision === 1) {
    if (latestOwnRevision !== undefined) {
      return rejected({
        operation: OPERATION,
        reasonCode: 'CANDIDATE_REVISION_CONFLICT',
        entityIds,
      })
    }
  } else if (
    latestOwnRevision === undefined ||
    proposed.revision !== latestOwnRevision.revision + 1 ||
    !proposed.parentRevisions.some(
      (parent) =>
        parent.candidateId === proposed.id && parent.revision === latestOwnRevision.revision,
    )
  ) {
    return rejected({ operation: OPERATION, reasonCode: 'CANDIDATE_REVISION_NOT_NEXT', entityIds })
  }

  if (input.feedback !== undefined) {
    const feedback = input.feedback
    if (!['MERGE', 'REVISE', 'SHRINK', 'EXPAND', 'REGENERATE'].includes(feedback.intent)) {
      return rejected({
        operation: OPERATION,
        reasonCode: 'CANDIDATE_FEEDBACK_DOES_NOT_CREATE_REVISION',
        entityIds,
      })
    }
    if (
      feedback.discoverySessionId !== proposed.discoverySessionId ||
      feedback.correlationId !== proposed.correlationId
    ) {
      return rejected({
        operation: OPERATION,
        reasonCode: 'CANDIDATE_FEEDBACK_MISMATCH',
        entityIds,
      })
    }
    if (
      !feedback.resultingRevisions.some((reference) => key(reference) === candidateKey(proposed))
    ) {
      return rejected({
        operation: OPERATION,
        reasonCode: 'CANDIDATE_RESULT_NOT_DECLARED',
        entityIds,
      })
    }

    if (feedback.intent === 'MERGE') {
      const primary = feedback.targets[0]
      if (
        primary === undefined ||
        proposed.id !== primary.candidateId ||
        proposed.revision !== primary.revision + 1 ||
        !sameReferenceSet(proposed.parentRevisions, feedback.targets)
      ) {
        return rejected({
          operation: OPERATION,
          reasonCode: 'CANDIDATE_MERGE_LINEAGE_INVALID',
          entityIds,
        })
      }
    }

    if (['REVISE', 'SHRINK', 'EXPAND'].includes(feedback.intent)) {
      const target = feedback.targets[0]
      if (
        feedback.targets.length !== 1 ||
        target === undefined ||
        proposed.id !== target.candidateId ||
        !sameReferenceSet(proposed.parentRevisions, feedback.targets)
      ) {
        return rejected({
          operation: OPERATION,
          reasonCode: 'CANDIDATE_REFINEMENT_LINEAGE_INVALID',
          entityIds,
        })
      }
    }
  }

  return applied(sortHistory([...input.existing, proposed]), {
    operation: OPERATION,
    reasonCode: 'CANDIDATE_REVISION_APPLIED',
    entityIds,
    supportingIds: proposed.parentRevisions.map(key),
  })
}
