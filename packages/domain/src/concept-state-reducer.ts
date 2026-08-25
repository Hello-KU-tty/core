import {
  type AcceptedEvidence,
  type ConceptState,
  type ConceptStateSnapshot,
  conceptStateSnapshotSchema,
} from '@vibe-helper/contracts'

import { applied, DOMAIN_POLICY_VERSION, type DomainResult, noOp, rejected } from './result.js'
import { compareUtc, sameValue, sortedUnique } from './utils.js'

const OPERATION = 'CONCEPT_STATE_REDUCE'

const STATE_RANK: Readonly<Record<ConceptState, number>> = {
  OBSERVED: 0,
  EXPLAINED: 1,
  DEMONSTRATED: 2,
  TRANSFERRED: 3,
}

export interface ReduceConceptStateInput {
  readonly conceptId: string
  readonly current?: ConceptStateSnapshot
  readonly acceptedEvidence: readonly AcceptedEvidence[]
  readonly nextRevision: number
  readonly updatedAt: string
}

function supportingState(evidence: AcceptedEvidence): ConceptState | undefined {
  if (evidence.kind === 'MISCONCEPTION_SIGNAL') return undefined
  return evidence.supportsState
}

export function reduceConceptState(
  input: ReduceConceptStateInput,
): DomainResult<ConceptStateSnapshot> {
  const entityIds = [input.conceptId]
  const evidenceById = new Map<string, AcceptedEvidence>()
  for (const evidence of input.acceptedEvidence) {
    if (evidence.conceptId !== input.conceptId) {
      return rejected({ operation: OPERATION, reasonCode: 'CONCEPT_EVIDENCE_MISMATCH', entityIds })
    }
    const existing = evidenceById.get(evidence.id)
    if (existing !== undefined && !sameValue(existing, evidence)) {
      return rejected({
        operation: OPERATION,
        reasonCode: 'CONCEPT_EVIDENCE_ID_CONFLICT',
        entityIds,
      })
    }
    evidenceById.set(evidence.id, evidence)
  }

  const supporting = [...evidenceById.values()].filter(
    (evidence) => supportingState(evidence) !== undefined,
  )
  if (supporting.length === 0) {
    return rejected({
      operation: OPERATION,
      reasonCode: 'CONCEPT_SUPPORTING_EVIDENCE_REQUIRED',
      entityIds,
    })
  }
  if (input.current?.acceptedEvidenceIds.some((id) => !evidenceById.has(id))) {
    return rejected({
      operation: OPERATION,
      reasonCode: 'CONCEPT_REPLAY_LOG_INCOMPLETE',
      entityIds,
    })
  }

  const calculatedState = supporting.reduce<ConceptState>((highest, evidence) => {
    const state = supportingState(evidence)
    return state !== undefined && STATE_RANK[state] > STATE_RANK[highest] ? state : highest
  }, 'OBSERVED')
  if (
    input.current !== undefined &&
    STATE_RANK[calculatedState] < STATE_RANK[input.current.state]
  ) {
    return rejected({
      operation: OPERATION,
      reasonCode: 'CONCEPT_STATE_DOWNGRADE_BLOCKED',
      entityIds,
    })
  }

  const acceptedEvidenceIds = sortedUnique(supporting.map((evidence) => evidence.id))
  const revision = input.current === undefined ? 1 : input.current.revision + 1
  if (input.nextRevision !== revision) {
    return rejected({
      operation: OPERATION,
      reasonCode: 'CONCEPT_STATE_REVISION_CONFLICT',
      entityIds,
    })
  }
  if (input.current !== undefined && compareUtc(input.updatedAt, input.current.updatedAt) < 0) {
    return rejected({
      operation: OPERATION,
      reasonCode: 'CONCEPT_STATE_TIMESTAMP_REGRESSION',
      entityIds,
    })
  }

  const next = conceptStateSnapshotSchema.parse({
    conceptId: input.conceptId,
    state: calculatedState,
    acceptedEvidenceIds,
    reducerVersion: DOMAIN_POLICY_VERSION,
    revision,
    updatedAt: input.updatedAt,
  })
  if (
    input.current !== undefined &&
    input.current.state === next.state &&
    sameValue(input.current.acceptedEvidenceIds, next.acceptedEvidenceIds) &&
    input.current.reducerVersion === next.reducerVersion
  ) {
    return noOp(input.current, {
      operation: OPERATION,
      reasonCode: 'CONCEPT_STATE_REPLAY_NO_CHANGE',
      entityIds,
      before: input.current.state,
      after: input.current.state,
      supportingIds: acceptedEvidenceIds,
    })
  }
  return applied(next, {
    operation: OPERATION,
    reasonCode: 'CONCEPT_STATE_REDUCED',
    entityIds,
    ...(input.current === undefined ? {} : { before: input.current.state }),
    after: next.state,
    supportingIds: acceptedEvidenceIds,
  })
}
