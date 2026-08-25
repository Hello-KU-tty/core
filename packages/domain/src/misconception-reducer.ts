import {
  type AcceptedEvidence,
  type EvidenceProposal,
  type MisconceptionIssue,
  misconceptionIssueSchema,
} from '@vibe-helper/contracts'

import { applied, type DomainResult, noOp, rejected } from './result.js'
import { compareUtc, sameValue, sortedUnique } from './utils.js'

const OPERATION = 'MISCONCEPTION_ISSUE_APPLY'

export interface ApplyMisconceptionProposalInput {
  readonly issues: readonly MisconceptionIssue[]
  readonly proposal: EvidenceProposal
  readonly evidence: AcceptedEvidence
  readonly newIssueId?: string
  readonly appliedAt: string
}

function sortIssues(issues: readonly MisconceptionIssue[]): MisconceptionIssue[] {
  return [...issues].sort((left, right) => left.id.localeCompare(right.id))
}

export function applyMisconceptionProposal(
  input: ApplyMisconceptionProposalInput,
): DomainResult<readonly MisconceptionIssue[]> {
  const action = input.proposal.misconception.action
  const entityIds = [input.evidence.conceptId]
  if (input.evidence.kind === 'CONCEPT_OBSERVATION') {
    return rejected({
      operation: OPERATION,
      reasonCode: 'MISCONCEPTION_USER_EVIDENCE_REQUIRED',
      entityIds,
    })
  }
  if (
    input.evidence.evidenceProposalId !== input.proposal.id ||
    (input.proposal.concept.canonicalConceptId !== undefined &&
      input.proposal.concept.canonicalConceptId !== input.evidence.conceptId) ||
    input.evidence.projectId !== input.proposal.projectId
  ) {
    return rejected({
      operation: OPERATION,
      reasonCode: 'MISCONCEPTION_REFERENCE_MISMATCH',
      entityIds,
    })
  }
  if (action === 'NONE') {
    return noOp(sortIssues(input.issues), {
      operation: OPERATION,
      reasonCode: 'MISCONCEPTION_NO_ACTION',
      entityIds,
    })
  }

  if (action === 'OPEN') {
    if (input.evidence.kind !== 'MISCONCEPTION_SIGNAL') {
      return rejected({
        operation: OPERATION,
        reasonCode: 'MISCONCEPTION_SIGNAL_REQUIRED',
        entityIds,
      })
    }
    const targetId = input.proposal.misconception.issueId
    if (targetId !== undefined) {
      const existing = input.issues.find((issue) => issue.id === targetId)
      if (
        existing === undefined ||
        existing.status !== 'OPEN' ||
        existing.conceptId !== input.evidence.conceptId ||
        existing.projectId !== input.evidence.projectId
      ) {
        return rejected({
          operation: OPERATION,
          reasonCode: 'MISCONCEPTION_ISSUE_NOT_FOUND',
          entityIds: [...entityIds, targetId],
        })
      }
      if (existing.supportingEvidenceIds.includes(input.evidence.id)) {
        return noOp(sortIssues(input.issues), {
          operation: OPERATION,
          reasonCode: 'MISCONCEPTION_DUPLICATE_EVIDENCE',
          entityIds: [...entityIds, targetId],
        })
      }
      const updated = misconceptionIssueSchema.parse({
        ...existing,
        supportingEvidenceIds: sortedUnique([...existing.supportingEvidenceIds, input.evidence.id]),
      })
      return applied(
        sortIssues(input.issues.map((issue) => (issue.id === updated.id ? updated : issue))),
        {
          operation: OPERATION,
          reasonCode: 'MISCONCEPTION_ISSUE_SUPPORTED',
          entityIds: [...entityIds, targetId],
          supportingIds: updated.supportingEvidenceIds,
        },
      )
    }

    if (input.newIssueId === undefined || input.proposal.misconception.summary === undefined) {
      return rejected({
        operation: OPERATION,
        reasonCode: 'MISCONCEPTION_ISSUE_METADATA_REQUIRED',
        entityIds,
      })
    }
    if (input.issues.some((issue) => issue.id === input.newIssueId)) {
      return rejected({
        operation: OPERATION,
        reasonCode: 'MISCONCEPTION_ISSUE_ID_CONFLICT',
        entityIds: [...entityIds, input.newIssueId],
      })
    }
    const issue = misconceptionIssueSchema.parse({
      schemaVersion: 1,
      id: input.newIssueId,
      conceptId: input.evidence.conceptId,
      projectId: input.evidence.projectId,
      openedByEvidenceId: input.evidence.id,
      status: 'OPEN',
      summary: input.proposal.misconception.summary,
      supportingEvidenceIds: [input.evidence.id],
      openedAt: input.evidence.acceptedAt,
      source: { kind: 'CORE' },
    })
    return applied(sortIssues([...input.issues, issue]), {
      operation: OPERATION,
      reasonCode: 'MISCONCEPTION_ISSUE_OPENED',
      entityIds: [...entityIds, issue.id],
      supportingIds: [input.evidence.id],
    })
  }

  const issueId = input.proposal.misconception.issueId
  const existing = input.issues.find((issue) => issue.id === issueId)
  if (
    issueId === undefined ||
    existing === undefined ||
    existing.conceptId !== input.evidence.conceptId ||
    existing.projectId !== input.evidence.projectId
  ) {
    return rejected({
      operation: OPERATION,
      reasonCode: 'MISCONCEPTION_ISSUE_NOT_FOUND',
      entityIds: issueId === undefined ? entityIds : [...entityIds, issueId],
    })
  }
  if (existing.status === 'RESOLVED') {
    if (existing.resolvedByEvidenceId === input.evidence.id) {
      return noOp(sortIssues(input.issues), {
        operation: OPERATION,
        reasonCode: 'MISCONCEPTION_DUPLICATE_RESOLUTION',
        entityIds: [...entityIds, issueId],
      })
    }
    return rejected({
      operation: OPERATION,
      reasonCode: 'MISCONCEPTION_ALREADY_RESOLVED',
      entityIds: [...entityIds, issueId],
    })
  }
  if (input.evidence.kind !== 'USER_UNDERSTANDING') {
    return rejected({
      operation: OPERATION,
      reasonCode: 'MISCONCEPTION_RESOLUTION_EVIDENCE_REQUIRED',
      entityIds,
    })
  }
  if (
    compareUtc(input.appliedAt, existing.openedAt) < 0 ||
    compareUtc(input.appliedAt, input.evidence.acceptedAt) < 0
  ) {
    return rejected({
      operation: OPERATION,
      reasonCode: 'MISCONCEPTION_TIMESTAMP_REGRESSION',
      entityIds: [...entityIds, issueId],
    })
  }
  const resolved = misconceptionIssueSchema.parse({
    ...existing,
    status: 'RESOLVED',
    supportingEvidenceIds: sortedUnique([...existing.supportingEvidenceIds, input.evidence.id]),
    resolvedByEvidenceId: input.evidence.id,
    resolvedAt: input.appliedAt,
  })
  const nextIssues = input.issues.map((issue) => (issue.id === resolved.id ? resolved : issue))
  if (sameValue(nextIssues, input.issues)) {
    return noOp(sortIssues(input.issues), {
      operation: OPERATION,
      reasonCode: 'MISCONCEPTION_DUPLICATE_RESOLUTION',
      entityIds: [...entityIds, issueId],
    })
  }
  return applied(sortIssues(nextIssues), {
    operation: OPERATION,
    reasonCode: 'MISCONCEPTION_ISSUE_RESOLVED',
    entityIds: [...entityIds, issueId],
    supportingIds: resolved.supportingEvidenceIds,
  })
}
