import {
  type AcceptedEvidence,
  type ActivityEvent,
  acceptedEvidenceSchema,
  type CanonicalConcept,
  type ConceptState,
  type DecisionResolution,
  type Episode,
  type EvidenceDecision,
  type EvidenceProposal,
  evidenceDecisionSchema,
  evidenceProposalSchema,
} from '@vibe-helper/contracts'

import { createDomainTrace, type DomainTrace } from './result.js'

const OPERATION = 'EVIDENCE_PROPOSAL_EVALUATE'

type EvidenceDecisionReason = EvidenceDecision['reasonCode']

export interface EvidenceDecisionMetadata {
  readonly proposalId: string
  readonly decisionId: string
  readonly acceptedEvidenceId: string
  readonly decidedAt: string
  readonly acceptedAt: string
}

export interface EvaluateEvidenceProposalInput {
  readonly proposal: unknown
  readonly episode: Episode
  readonly episodeRevision: number
  readonly events: readonly ActivityEvent[]
  readonly decisionResolutions: readonly DecisionResolution[]
  readonly concept: CanonicalConcept
  readonly existingProposalIds: readonly string[]
  readonly priorAcceptedEvidence: readonly AcceptedEvidence[]
  readonly metadata: EvidenceDecisionMetadata
}

export type EvidenceEvaluationResult =
  | {
      readonly outcome: 'ACCEPTED'
      readonly decision: EvidenceDecision
      readonly evidence: AcceptedEvidence
      readonly trace: DomainTrace
    }
  | {
      readonly outcome: 'REJECTED'
      readonly decision: EvidenceDecision
      readonly trace: DomainTrace
    }

const STATE_RANK: Readonly<Record<ConceptState, number>> = {
  OBSERVED: 0,
  EXPLAINED: 1,
  DEMONSTRATED: 2,
  TRANSFERRED: 3,
}

function rawDirectSources(input: unknown): readonly unknown[] {
  if (typeof input !== 'object' || input === null || !('userEvidenceSources' in input)) return []
  return Array.isArray(input.userEvidenceSources) ? input.userEvidenceSources : []
}

function hasNonUserDirectSource(input: unknown): boolean {
  const allowed = new Set(['USER_MESSAGE', 'USER_DECISION', 'USER_ACTION'])
  return rawDirectSources(input).some((source) => {
    if (typeof source !== 'object' || source === null || !('kind' in source)) return false
    return typeof source.kind === 'string' && !allowed.has(source.kind)
  })
}

function findSourceEvent(
  source: EvidenceProposal['userEvidenceSources'][number],
  events: readonly ActivityEvent[],
): ActivityEvent | undefined {
  if (source.kind === 'USER_ACTION') {
    return events.find((event) => event.id === source.eventId && event.actor.kind === 'USER')
  }
  if (source.kind === 'USER_DECISION') {
    return events.find(
      (event) =>
        event.actor.kind === 'USER' &&
        event.payload.type === 'DECISION_RESOLVED' &&
        event.payload.decisionId === source.decisionId,
    )
  }
  return events.find(
    (event) =>
      event.actor.kind === 'USER' &&
      event.payload.type === 'USER_MESSAGE' &&
      event.payload.conversationId === source.conversationId &&
      event.payload.messageId === source.messageId,
  )
}

function isDistinctContext(
  previous: Extract<AcceptedEvidence, { kind: 'USER_UNDERSTANDING' }>,
  proposal: EvidenceProposal,
): boolean {
  return (
    previous.projectId !== proposal.projectId ||
    (previous.taskId !== undefined &&
      proposal.taskId !== undefined &&
      previous.taskId !== proposal.taskId)
  )
}

function policyMaximum(
  proposal: EvidenceProposal,
  priorAcceptedEvidence: readonly AcceptedEvidence[],
): Exclude<ConceptState, 'OBSERVED'> | null {
  if (
    proposal.strength === 'NONE' ||
    proposal.strength === 'WEAK' ||
    proposal.promptDependence === 'DIRECTLY_LED'
  ) {
    return null
  }

  if (proposal.signal === 'QUESTION' || proposal.signal === 'CONTRADICTION') return null
  if (proposal.signal === 'REPHRASE') return 'EXPLAINED'
  if (proposal.signal !== 'TRANSFER') {
    return proposal.strength === 'STRONG' ? 'DEMONSTRATED' : 'EXPLAINED'
  }

  const hasDistinctDemonstration = priorAcceptedEvidence.some(
    (evidence): evidence is Extract<AcceptedEvidence, { kind: 'USER_UNDERSTANDING' }> =>
      evidence.kind === 'USER_UNDERSTANDING' &&
      STATE_RANK[evidence.supportsState] >= STATE_RANK.DEMONSTRATED &&
      isDistinctContext(evidence, proposal),
  )
  if (
    proposal.strength === 'STRONG' &&
    proposal.promptDependence === 'INDEPENDENT' &&
    hasDistinctDemonstration
  ) {
    return 'TRANSFERRED'
  }
  return 'DEMONSTRATED'
}

function makeDecision(
  input: EvaluateEvidenceProposalInput,
  outcome: EvidenceDecision['outcome'],
  reasonCode: EvidenceDecisionReason,
  explanation: string,
): EvidenceDecision {
  return evidenceDecisionSchema.parse({
    schemaVersion: 1,
    id: input.metadata.decisionId,
    evidenceProposalId: input.metadata.proposalId,
    correlationId: input.episode.correlationId,
    outcome,
    reasonCode,
    explanation,
    decidedAt: input.metadata.decidedAt,
    source: { kind: 'CORE' },
  })
}

function rejectEvidence(
  input: EvaluateEvidenceProposalInput,
  reasonCode: EvidenceDecisionReason,
  explanation: string,
): EvidenceEvaluationResult {
  return {
    outcome: 'REJECTED',
    decision: makeDecision(input, 'REJECTED', reasonCode, explanation),
    trace: createDomainTrace('REJECTED', {
      operation: OPERATION,
      reasonCode,
      entityIds: [input.metadata.proposalId],
    }),
  }
}

function acceptEvidence(
  input: EvaluateEvidenceProposalInput,
  proposal: EvidenceProposal,
  supportsState?: Exclude<ConceptState, 'OBSERVED'>,
): EvidenceEvaluationResult {
  const decision = makeDecision(
    input,
    'ACCEPTED',
    'VALID_USER_EVIDENCE',
    supportsState === undefined
      ? 'Accepted a user-authored contradiction as a misconception signal without changing Concept State.'
      : `Accepted user-authored Evidence supporting ${supportsState}.`,
  )
  const common = {
    schemaVersion: 1 as const,
    id: input.metadata.acceptedEvidenceId,
    projectId: proposal.projectId,
    ...(proposal.taskId === undefined ? {} : { taskId: proposal.taskId }),
    episodeId: proposal.episodeId,
    conceptId: input.concept.id,
    correlationId: proposal.correlationId,
    evidenceProposalId: proposal.id,
    evidenceDecisionId: decision.id,
    signal: proposal.signal,
    strength: proposal.strength,
    promptDependence: proposal.promptDependence,
    userEvidenceSources: proposal.userEvidenceSources,
    acceptedAt: input.metadata.acceptedAt,
    source: { kind: 'CORE' as const },
    redactionStatus: proposal.redactionStatus,
  }
  const evidence = acceptedEvidenceSchema.parse(
    supportsState === undefined
      ? { ...common, kind: 'MISCONCEPTION_SIGNAL' }
      : { ...common, kind: 'USER_UNDERSTANDING', supportsState },
  )
  return {
    outcome: 'ACCEPTED',
    decision,
    evidence,
    trace: createDomainTrace('APPLIED', {
      operation: OPERATION,
      reasonCode: 'VALID_USER_EVIDENCE',
      entityIds: [proposal.id, evidence.id],
      ...(supportsState === undefined ? {} : { after: supportsState }),
      supportingIds: proposal.userEvidenceSources.map((source) => JSON.stringify(source)),
    }),
  }
}

export function evaluateEvidenceProposal(
  input: EvaluateEvidenceProposalInput,
): EvidenceEvaluationResult {
  if (hasNonUserDirectSource(input.proposal)) {
    return rejectEvidence(
      input,
      'AGENT_AUTHORED_SOURCE',
      'Direct Evidence sources must be authored by the user.',
    )
  }
  const parsed = evidenceProposalSchema.safeParse(input.proposal)
  if (!parsed.success) {
    return rejectEvidence(input, 'INVALID_SCHEMA', 'Evidence Proposal failed runtime validation.')
  }
  const proposal = parsed.data
  if (proposal.id !== input.metadata.proposalId) {
    return rejectEvidence(input, 'INVALID_REFERENCE', 'Proposal ID does not match its envelope.')
  }
  if (input.existingProposalIds.includes(proposal.id)) {
    return rejectEvidence(input, 'DUPLICATE_PROPOSAL', 'Evidence Proposal was already processed.')
  }
  if (input.episode.revision !== input.episodeRevision) {
    return rejectEvidence(
      input,
      'STALE_EPISODE_REVISION',
      'Evidence Proposal targets a stale Episode revision.',
    )
  }
  if (input.episode.status !== 'PENDING_ANALYSIS') {
    return rejectEvidence(
      input,
      'INVALID_STATE_TRANSITION',
      'Evidence can be applied only to an Episode pending analysis.',
    )
  }
  if (
    proposal.episodeId !== input.episode.id ||
    proposal.projectId !== input.episode.projectId ||
    proposal.correlationId !== input.episode.correlationId ||
    proposal.taskId !== input.episode.taskId ||
    (proposal.concept.canonicalConceptId !== undefined &&
      proposal.concept.canonicalConceptId !== input.concept.id) ||
    (proposal.concept.canonicalConceptId === undefined &&
      proposal.concept.proposedCanonicalName.trim().toLowerCase() !==
        input.concept.canonicalName.trim().toLowerCase())
  ) {
    return rejectEvidence(
      input,
      'INVALID_REFERENCE',
      'Evidence Proposal references do not match the Episode or canonical Concept.',
    )
  }
  const episodeEventIds = new Set(input.episode.eventIds)
  const episodeEvents = input.events.filter((event) => episodeEventIds.has(event.id))
  if (
    proposal.userEvidenceSources.some(
      (source) => findSourceEvent(source, episodeEvents) === undefined,
    )
  ) {
    return rejectEvidence(
      input,
      'INVALID_REFERENCE',
      'A direct user Evidence source is not present in the Episode.',
    )
  }
  const citedMessageExcerpts = proposal.userEvidenceSources.flatMap((source) => {
    const event = findSourceEvent(source, episodeEvents)
    return event?.payload.type === 'USER_MESSAGE' ? [event.payload.redactedExcerpt] : []
  })
  if (
    citedMessageExcerpts.length > 0 &&
    (!citedMessageExcerpts.some((excerpt) =>
      excerpt.includes(proposal.concept.originalExpression),
    ) ||
      !citedMessageExcerpts.some((excerpt) => excerpt.includes(proposal.redactedEvidenceExcerpt)))
  ) {
    return rejectEvidence(
      input,
      'INVALID_REFERENCE',
      'Quoted Evidence and the original Concept expression must occur in a cited user message.',
    )
  }
  if (proposal.signal === 'JUSTIFIED_DECISION') {
    const citedDecisionContexts = proposal.userEvidenceSources.flatMap((source) => {
      if (source.kind !== 'USER_DECISION') return []
      const event = findSourceEvent(source, episodeEvents)
      return event?.payload.type === 'DECISION_RESOLVED'
        ? [{ event, decisionPayload: event.payload }]
        : []
    })
    if (citedDecisionContexts.length === 0) {
      return rejectEvidence(
        input,
        'INSUFFICIENT_EVIDENCE',
        'A justified Decision requires a directly cited user Decision.',
      )
    }
    const matchingResolutionContexts = citedDecisionContexts.flatMap(
      ({ event, decisionPayload }) => {
        const resolution = input.decisionResolutions.find(
          (candidate) =>
            candidate.id === decisionPayload.resolutionId &&
            candidate.decisionId === decisionPayload.decisionId &&
            candidate.projectId === proposal.projectId &&
            candidate.taskId === proposal.taskId &&
            candidate.correlationId === proposal.correlationId,
        )
        return resolution === undefined ? [] : [{ event, decisionPayload, resolution }]
      },
    )
    if (matchingResolutionContexts.length === 0) {
      return rejectEvidence(
        input,
        'INVALID_REFERENCE',
        'A cited user Decision does not match a stored Decision Resolution in the Evidence scope.',
      )
    }
    const reasonedResolutionContexts = matchingResolutionContexts.filter(
      ({ decisionPayload, resolution }) =>
        decisionPayload.rationaleProvided && resolution.rationale !== undefined,
    )
    if (reasonedResolutionContexts.length === 0) {
      return rejectEvidence(
        input,
        'INSUFFICIENT_EVIDENCE',
        'A justified Decision requires stored user-authored rationale.',
      )
    }
    const citedDecisionTexts = reasonedResolutionContexts
      .flatMap(({ resolution }) => [resolution.rationale, resolution.customProposal])
      .filter((text): text is string => text !== undefined)
    if (
      !citedDecisionTexts.some((text) => text.includes(proposal.concept.originalExpression)) ||
      !citedDecisionTexts.some((text) => text.includes(proposal.redactedEvidenceExcerpt))
    ) {
      return rejectEvidence(
        input,
        'INVALID_REFERENCE',
        'Quoted Evidence and the original Concept expression must occur in the cited user Decision rationale or custom proposal.',
      )
    }
  }
  if (
    proposal.userEvidenceSources.some((source) => {
      if (source.kind !== 'USER_DECISION') return false
      const event = findSourceEvent(source, episodeEvents)
      return event?.payload.type === 'DECISION_RESOLVED' && !event.payload.rationaleProvided
    })
  ) {
    return rejectEvidence(
      input,
      'INSUFFICIENT_EVIDENCE',
      'A Decision accepted without user-authored rationale cannot support understanding.',
    )
  }

  if (proposal.signal === 'CONTRADICTION') {
    if (proposal.maximumSupportedState !== null) {
      return rejectEvidence(
        input,
        'OVERSTATED_MAXIMUM_STATE',
        'Contradiction cannot support a Concept State.',
      )
    }
    if (
      !['MEDIUM', 'STRONG'].includes(proposal.strength) ||
      proposal.promptDependence === 'DIRECTLY_LED' ||
      proposal.misconception.action !== 'OPEN'
    ) {
      return rejectEvidence(
        input,
        'INSUFFICIENT_EVIDENCE',
        'Contradiction is too weak, directly led, or does not identify an issue to open.',
      )
    }
    return acceptEvidence(input, proposal)
  }

  if (proposal.misconception.action === 'OPEN') {
    return rejectEvidence(
      input,
      'INVALID_STATE_TRANSITION',
      'Only contradiction Evidence can open a misconception issue.',
    )
  }
  const maximum = policyMaximum(proposal, input.priorAcceptedEvidence)
  if (maximum === null || proposal.maximumSupportedState === null) {
    return rejectEvidence(
      input,
      'INSUFFICIENT_EVIDENCE',
      'Evidence is too weak or too prompt-dependent to support a Concept State.',
    )
  }
  if (STATE_RANK[proposal.maximumSupportedState] > STATE_RANK[maximum]) {
    return rejectEvidence(
      input,
      'OVERSTATED_MAXIMUM_STATE',
      `Evidence policy permits at most ${maximum}.`,
    )
  }
  return acceptEvidence(input, proposal, proposal.maximumSupportedState)
}
