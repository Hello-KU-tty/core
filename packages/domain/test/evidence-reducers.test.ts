import { describe, expect, it } from 'vitest'
import {
  acceptedEvidenceFixture,
  activityEventFixture,
  canonicalConceptFixture,
  codeReferenceFixture,
  decisionResolutionFixture,
  episodeFixture,
  evidenceProposalFixture,
  ids,
  timestamp,
} from '../../contracts/test/fixtures.js'
import {
  applyMisconceptionProposal,
  evaluateEvidenceProposal,
  reduceConceptState,
} from '../src/index.ts'

const previousTaskId = 'task_00000000-0000-4000-8000-000000000051'
const observationEvidenceId = 'evidence_00000000-0000-4000-8000-000000000052'
const misconceptionIssueId = 'misconception_00000000-0000-4000-8000-000000000053'
const resolutionProposalId = 'evidence_proposal_00000000-0000-4000-8000-000000000054'
const resolutionDecisionId = 'evidence_decision_00000000-0000-4000-8000-000000000055'
const resolutionEvidenceId = 'evidence_00000000-0000-4000-8000-000000000056'
const contradictionProposalId = 'evidence_proposal_00000000-0000-4000-8000-000000000057'
const contradictionDecisionId = 'evidence_decision_00000000-0000-4000-8000-000000000058'
const contradictionEvidenceId = 'evidence_00000000-0000-4000-8000-000000000059'

const reasonedDecisionEvent = {
  ...activityEventFixture,
  id: 'event_00000000-0000-4000-8000-000000000060',
  conversationId: undefined,
  decisionId: ids.decision,
  payload: {
    type: 'DECISION_RESOLVED' as const,
    decisionId: ids.decision,
    resolutionId: ids.resolution,
    rationaleProvided: true,
  },
  sourceReferences: [],
} as const

const reasonedDecisionProposal = {
  ...evidenceProposalFixture,
  concept: {
    ...evidenceProposalFixture.concept,
    originalExpression: 'unexpected shapes',
  },
  userEvidenceSources: [{ kind: 'USER_DECISION', decisionId: ids.decision }],
  redactedEvidenceExcerpt: decisionResolutionFixture.rationale,
} as const

const metadata = {
  proposalId: ids.evidenceProposal,
  decisionId: ids.evidenceDecision,
  acceptedEvidenceId: ids.evidence,
  decidedAt: timestamp,
  acceptedAt: timestamp,
} as const

function evaluate(
  proposal: unknown,
  overrides: Partial<Parameters<typeof evaluateEvidenceProposal>[0]> = {},
) {
  return evaluateEvidenceProposal({
    proposal,
    episode: episodeFixture,
    episodeRevision: 1,
    events: [activityEventFixture],
    decisionResolutions: [],
    concept: canonicalConceptFixture,
    existingProposalIds: [],
    priorAcceptedEvidence: [],
    metadata,
    ...overrides,
  })
}

describe('Evidence acceptance policy', () => {
  it('accepts strong independent justified reasoning up to DEMONSTRATED', () => {
    const result = evaluate(reasonedDecisionProposal, {
      episode: { ...episodeFixture, eventIds: [reasonedDecisionEvent.id] },
      events: [reasonedDecisionEvent],
      decisionResolutions: [decisionResolutionFixture],
    })
    expect(result.outcome).toBe('ACCEPTED')
    if (result.outcome !== 'ACCEPTED') return
    expect(result.decision.reasonCode).toBe('VALID_USER_EVIDENCE')
    expect(result.evidence).toMatchObject({
      kind: 'USER_UNDERSTANDING',
      episodeId: ids.episode,
      signal: 'JUSTIFIED_DECISION',
      strength: 'STRONG',
      promptDependence: 'INDEPENDENT',
      supportsState: 'DEMONSTRATED',
    })
  })

  it('rejects JUSTIFIED_DECISION without a cited structured user Decision', () => {
    const result = evaluate(evidenceProposalFixture)

    expect(result.outcome).toBe('REJECTED')
    expect(result.decision.reasonCode).toBe('INSUFFICIENT_EVIDENCE')
  })

  it('rejects JUSTIFIED_DECISION when the cited Decision has no stored Resolution', () => {
    const result = evaluate(reasonedDecisionProposal, {
      episode: { ...episodeFixture, eventIds: [reasonedDecisionEvent.id] },
      events: [reasonedDecisionEvent],
    })

    expect(result.outcome).toBe('REJECTED')
    expect(result.decision.reasonCode).toBe('INVALID_REFERENCE')
  })

  it('rejects JUSTIFIED_DECISION when the stored Resolution is outside the Evidence scope', () => {
    const result = evaluate(reasonedDecisionProposal, {
      episode: { ...episodeFixture, eventIds: [reasonedDecisionEvent.id] },
      events: [reasonedDecisionEvent],
      decisionResolutions: [
        {
          ...decisionResolutionFixture,
          correlationId: 'correlation_00000000-0000-4000-8000-000000000061',
        },
      ],
    })

    expect(result.outcome).toBe('REJECTED')
    expect(result.decision.reasonCode).toBe('INVALID_REFERENCE')
  })

  it('rejects JUSTIFIED_DECISION when its quotes are absent from the stored user reason', () => {
    const result = evaluate(
      {
        ...reasonedDecisionProposal,
        concept: {
          ...reasonedDecisionProposal.concept,
          originalExpression: 'an unrelated explanation',
        },
        redactedEvidenceExcerpt: 'This text is not in the Decision rationale.',
      },
      {
        episode: { ...episodeFixture, eventIds: [reasonedDecisionEvent.id] },
        events: [reasonedDecisionEvent],
        decisionResolutions: [decisionResolutionFixture],
      },
    )

    expect(result.outcome).toBe('REJECTED')
    expect(result.decision.reasonCode).toBe('INVALID_REFERENCE')
  })

  it.each([
    [
      'paraphrased Concept expression',
      {
        ...evidenceProposalFixture,
        concept: {
          ...evidenceProposalFixture.concept,
          originalExpression: 'prevent input mistakes at the boundary',
        },
      },
    ],
    [
      'paraphrased Evidence excerpt',
      {
        ...evidenceProposalFixture,
        redactedEvidenceExcerpt: 'The user expects strict validation to catch mistakes.',
      },
    ],
    [
      'both fields paraphrased',
      {
        ...evidenceProposalFixture,
        concept: {
          ...evidenceProposalFixture.concept,
          originalExpression: 'catch input mistakes',
        },
        redactedEvidenceExcerpt: 'Strict validation should catch input mistakes.',
      },
    ],
  ])('rejects %s instead of treating it as a direct user quote', (_name, proposal) => {
    const result = evaluate(proposal)
    expect(result.outcome).toBe('REJECTED')
    expect(result.decision.reasonCode).toBe('INVALID_REFERENCE')
  })

  it('does not accept a quote from an Episode message that the Proposal did not cite', () => {
    const uncitedEvent = {
      ...activityEventFixture,
      id: 'event_00000000-0000-4000-8000-000000000061',
      sequence: 2,
      payload: {
        ...activityEventFixture.payload,
        messageId: 'message_00000000-0000-4000-8000-000000000062',
        redactedExcerpt: 'A second user message mentions cache invalidation.',
      },
    } as const
    const result = evaluate(
      {
        ...evidenceProposalFixture,
        concept: {
          ...evidenceProposalFixture.concept,
          originalExpression: 'cache invalidation',
        },
        redactedEvidenceExcerpt: 'A second user message mentions cache invalidation.',
      },
      {
        episode: { ...episodeFixture, eventIds: [ids.eventUser, uncitedEvent.id] },
        events: [activityEventFixture, uncitedEvent],
      },
    )

    expect(result.outcome).toBe('REJECTED')
    expect(result.decision.reasonCode).toBe('INVALID_REFERENCE')
  })

  it('checks a cited message even when its Event ID is submitted as a USER_ACTION reference', () => {
    const result = evaluate({
      ...evidenceProposalFixture,
      userEvidenceSources: [{ kind: 'USER_ACTION', eventId: ids.eventUser }],
      redactedEvidenceExcerpt: 'The user expects strict validation to catch mistakes.',
    })

    expect(result.outcome).toBe('REJECTED')
    expect(result.decision.reasonCode).toBe('INVALID_REFERENCE')
  })

  it('distinguishes Agent-authored sources from other invalid payloads', () => {
    const agentAuthored = evaluate({
      ...evidenceProposalFixture,
      userEvidenceSources: [
        {
          kind: 'AGENT_MESSAGE',
          conversationId: ids.conversation,
          messageId: ids.helperMessage,
        },
      ],
    })
    expect(agentAuthored.outcome).toBe('REJECTED')
    expect(agentAuthored.decision.reasonCode).toBe('AGENT_AUTHORED_SOURCE')

    const malformed = evaluate({ ...evidenceProposalFixture, signal: 'CONFIRMATION' })
    expect(malformed.outcome).toBe('REJECTED')
    expect(malformed.decision.reasonCode).toBe('INVALID_SCHEMA')
  })

  it('rejects a recommendation acceptance without user-authored rationale as understanding', () => {
    const { rationale: _rationale, ...resolutionWithoutRationale } = decisionResolutionFixture
    const decisionEventId = 'event_00000000-0000-4000-8000-000000000060'
    const decisionEvent = {
      ...activityEventFixture,
      id: decisionEventId,
      conversationId: undefined,
      decisionId: ids.decision,
      payload: {
        type: 'DECISION_RESOLVED' as const,
        decisionId: ids.decision,
        resolutionId: ids.resolution,
        rationaleProvided: false,
      },
      sourceReferences: [],
    }
    const result = evaluate(
      {
        ...evidenceProposalFixture,
        userEvidenceSources: [{ kind: 'USER_DECISION', decisionId: ids.decision }],
      },
      {
        episode: { ...episodeFixture, eventIds: [decisionEventId] },
        events: [decisionEvent],
        decisionResolutions: [resolutionWithoutRationale],
      },
    )

    expect(result.outcome).toBe('REJECTED')
    expect(result.decision.reasonCode).toBe('INSUFFICIENT_EVIDENCE')
  })

  it.each([
    [
      'weak acknowledgement',
      { ...evidenceProposalFixture, strength: 'WEAK', maximumSupportedState: null },
    ],
    [
      'directly led repetition',
      {
        ...evidenceProposalFixture,
        strength: 'MEDIUM',
        promptDependence: 'DIRECTLY_LED',
        maximumSupportedState: null,
      },
    ],
    [
      'question',
      {
        ...evidenceProposalFixture,
        signal: 'QUESTION',
        strength: 'NONE',
        maximumSupportedState: null,
      },
    ],
    [
      'quick-card action',
      {
        ...evidenceProposalFixture,
        signal: 'APPLICATION',
        strength: 'WEAK',
        maximumSupportedState: null,
        userEvidenceSources: [{ kind: 'USER_ACTION', eventId: ids.eventUser }],
      },
    ],
  ])('does not promote State for %s', (_name, proposal) => {
    const result = evaluate(proposal)
    expect(result.outcome).toBe('REJECTED')
    expect(result.decision.reasonCode).toBe('INSUFFICIENT_EVIDENCE')
  })

  it('rejects an Analyst maximum above the deterministic signal cap', () => {
    const result = evaluate({
      ...evidenceProposalFixture,
      signal: 'REPHRASE',
      maximumSupportedState: 'DEMONSTRATED',
    })
    expect(result.outcome).toBe('REJECTED')
    expect(result.decision.reasonCode).toBe('OVERSTATED_MAXIMUM_STATE')
  })

  it('requires prior demonstration in a different Task or Project for TRANSFERRED', () => {
    const transferProposal = {
      ...evidenceProposalFixture,
      signal: 'TRANSFER',
      maximumSupportedState: 'TRANSFERRED',
    }
    const withoutBaseline = evaluate(transferProposal)
    expect(withoutBaseline.outcome).toBe('REJECTED')
    expect(withoutBaseline.decision.reasonCode).toBe('OVERSTATED_MAXIMUM_STATE')

    const priorDemonstration = { ...acceptedEvidenceFixture, taskId: previousTaskId }
    const transferred = evaluate(transferProposal, {
      priorAcceptedEvidence: [priorDemonstration],
    })
    expect(transferred.outcome).toBe('ACCEPTED')
    if (transferred.outcome !== 'ACCEPTED') return
    expect(transferred.evidence).toMatchObject({
      kind: 'USER_UNDERSTANDING',
      supportsState: 'TRANSFERRED',
    })
  })

  it('rejects stale, duplicate and unresolved direct references with explicit reasons', () => {
    expect(evaluate(evidenceProposalFixture, { episodeRevision: 2 }).decision.reasonCode).toBe(
      'STALE_EPISODE_REVISION',
    )
    expect(
      evaluate(evidenceProposalFixture, {
        existingProposalIds: [ids.evidenceProposal],
      }).decision.reasonCode,
    ).toBe('DUPLICATE_PROPOSAL')
    expect(evaluate(evidenceProposalFixture, { events: [] }).decision.reasonCode).toBe(
      'INVALID_REFERENCE',
    )
  })
})

describe('Concept State and misconception reducers', () => {
  const contradictionProposal = {
    ...evidenceProposalFixture,
    id: contradictionProposalId,
    signal: 'CONTRADICTION',
    strength: 'MEDIUM',
    promptDependence: 'LIGHT_HINT',
    maximumSupportedState: null,
    misconception: {
      action: 'OPEN',
      summary: 'Runtime validation was confused with compile-time type checking.',
    },
  } as const
  const contradictionMetadata = {
    proposalId: contradictionProposalId,
    decisionId: contradictionDecisionId,
    acceptedEvidenceId: contradictionEvidenceId,
    decidedAt: timestamp,
    acceptedAt: timestamp,
  } as const

  it('stores contradiction separately and never treats it as State support', () => {
    const contradiction = evaluate(contradictionProposal, { metadata: contradictionMetadata })
    expect(contradiction.outcome).toBe('ACCEPTED')
    if (contradiction.outcome !== 'ACCEPTED') return
    expect(contradiction.evidence.kind).toBe('MISCONCEPTION_SIGNAL')
    expect('supportsState' in contradiction.evidence).toBe(false)

    const positive = evaluate(reasonedDecisionProposal, {
      episode: { ...episodeFixture, eventIds: [reasonedDecisionEvent.id] },
      events: [reasonedDecisionEvent],
      decisionResolutions: [decisionResolutionFixture],
    })
    expect(positive.outcome).toBe('ACCEPTED')
    if (positive.outcome !== 'ACCEPTED') return
    const observation = {
      schemaVersion: 1,
      id: observationEvidenceId,
      kind: 'CONCEPT_OBSERVATION',
      projectId: ids.project,
      taskId: ids.task,
      episodeId: ids.episode,
      conceptId: ids.concept,
      correlationId: ids.correlation,
      supportsState: 'OBSERVED',
      contextSources: [codeReferenceFixture],
      acceptedAt: timestamp,
      source: { kind: 'CORE' },
      redactionStatus: 'VERIFIED_REDACTED',
    } as const

    const first = reduceConceptState({
      conceptId: ids.concept,
      acceptedEvidence: [contradiction.evidence, observation, positive.evidence],
      nextRevision: 1,
      updatedAt: timestamp,
    })
    expect(first.outcome).toBe('APPLIED')
    if (first.outcome !== 'APPLIED') return
    expect(first.value.state).toBe('DEMONSTRATED')
    expect(first.value.acceptedEvidenceIds).not.toContain(contradiction.evidence.id)

    const permuted = reduceConceptState({
      conceptId: ids.concept,
      acceptedEvidence: [positive.evidence, contradiction.evidence, observation],
      nextRevision: 1,
      updatedAt: timestamp,
    })
    expect(permuted).toEqual(first)

    const replay = reduceConceptState({
      conceptId: ids.concept,
      current: first.value,
      acceptedEvidence: [observation, contradiction.evidence, positive.evidence],
      nextRevision: 2,
      updatedAt: timestamp,
    })
    expect(replay.outcome).toBe('NO_OP')
    if (replay.outcome !== 'NO_OP') return
    expect(replay.value.state).toBe('DEMONSTRATED')
  })

  it('opens, supports and resolves a misconception issue without downgrading State', () => {
    const contradiction = evaluate(contradictionProposal, { metadata: contradictionMetadata })
    expect(contradiction.outcome).toBe('ACCEPTED')
    if (contradiction.outcome !== 'ACCEPTED') return
    const opened = applyMisconceptionProposal({
      issues: [],
      proposal: contradictionProposal,
      evidence: contradiction.evidence,
      newIssueId: misconceptionIssueId,
      appliedAt: timestamp,
    })
    expect(opened.outcome).toBe('APPLIED')
    if (opened.outcome !== 'APPLIED') return
    expect(opened.value[0]).toMatchObject({
      id: misconceptionIssueId,
      status: 'OPEN',
      openedByEvidenceId: contradiction.evidence.id,
    })

    const resolutionProposal = {
      ...evidenceProposalFixture,
      id: resolutionProposalId,
      signal: 'REPHRASE',
      maximumSupportedState: 'EXPLAINED',
      misconception: { action: 'RESOLVE', issueId: misconceptionIssueId },
    } as const
    const resolutionEvidence = evaluate(resolutionProposal, {
      metadata: {
        proposalId: resolutionProposalId,
        decisionId: resolutionDecisionId,
        acceptedEvidenceId: resolutionEvidenceId,
        decidedAt: timestamp,
        acceptedAt: timestamp,
      },
    })
    expect(resolutionEvidence.outcome).toBe('ACCEPTED')
    if (resolutionEvidence.outcome !== 'ACCEPTED') return
    const resolved = applyMisconceptionProposal({
      issues: opened.value,
      proposal: resolutionProposal,
      evidence: resolutionEvidence.evidence,
      appliedAt: timestamp,
    })
    expect(resolved.outcome).toBe('APPLIED')
    if (resolved.outcome !== 'APPLIED') return
    expect(resolved.value[0]).toMatchObject({
      status: 'RESOLVED',
      resolvedByEvidenceId: resolutionEvidenceId,
    })
  })
})
