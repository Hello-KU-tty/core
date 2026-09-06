import { describe, expect, it } from 'vitest'

import {
  acceptedEvidenceSchema,
  activityEventSchema,
  conceptStateSchema,
  contextRefreshRequestSchema,
  decisionRequestSchema,
  discoveryInputSchema,
  episodeSchema,
  evidenceProposalSchema,
  learningSpecRevisionSchema,
  liveProjectContextSchema,
  personalizationTraceSchema,
  projectCandidateRevisionSchema,
  projectSchema,
  relativePosixPathSchema,
} from '../src/index.ts'
import {
  acceptedEvidenceFixture,
  activityEventFixture,
  candidateFixture,
  confirmedLearningSpecFixture,
  contextRefreshRequestFixture,
  decisionRequestFixture,
  discoveryInputFixture,
  episodeFixture,
  evidenceProposalFixture,
  helperPersonalizationFixture,
  ids,
  liveContextFixture,
  projectFixture,
} from './fixtures.js'

describe('identity, time, and path rules', () => {
  it.each([
    '/etc/passwd',
    '../secrets.txt',
    'src/../secrets.txt',
    'C:/Users/example/token.txt',
    String.raw`src\secrets.txt`,
    'src//events.ts',
    'src/events.ts/',
    `src/events.ts\0hidden`,
  ])('rejects unsafe or non-canonical path %s', (path) => {
    expect(relativePosixPathSchema.safeParse(path).success).toBe(false)
  })

  it('rejects malformed IDs, non-UTC timestamps, and invalid enums', () => {
    expect(projectSchema.safeParse({ ...projectFixture, id: 'project-readable-id' }).success).toBe(
      false,
    )
    expect(
      projectSchema.safeParse({ ...projectFixture, updatedAt: '2026-08-25T12:00:00+09:00' })
        .success,
    ).toBe(false)
    expect(projectSchema.safeParse({ ...projectFixture, status: 'FINAL' }).success).toBe(false)
  })
})

describe('Discovery and Learning Spec invariants', () => {
  it('does not accept availableTime as a Discovery input', () => {
    expect(
      discoveryInputSchema.safeParse({ ...discoveryInputFixture, availableTime: 'two weeks' })
        .success,
    ).toBe(false)
  })

  it('requires lineage after the first Candidate revision', () => {
    expect(
      projectCandidateRevisionSchema.safeParse({ ...candidateFixture, revision: 2 }).success,
    ).toBe(false)
    expect(
      projectCandidateRevisionSchema.safeParse({
        ...candidateFixture,
        revision: 2,
        parentRevisions: [{ candidateId: ids.candidate, revision: 1 }],
      }).success,
    ).toBe(true)
  })

  it('requires all three Learning Spec scopes and explicit confirmation', () => {
    expect(
      learningSpecRevisionSchema.safeParse({
        ...confirmedLearningSpecFixture,
        scope: confirmedLearningSpecFixture.scope.filter((item) => item.category !== 'EXCLUDED'),
      }).success,
    ).toBe(false)

    const { confirmation: _confirmation, ...withoutConfirmation } = confirmedLearningSpecFixture
    expect(learningSpecRevisionSchema.safeParse(withoutConfirmation).success).toBe(false)
    expect(
      learningSpecRevisionSchema.safeParse({
        ...confirmedLearningSpecFixture,
        expectedDecisions: [],
      }).success,
    ).toBe(false)
    expect(
      learningSpecRevisionSchema.safeParse({
        ...confirmedLearningSpecFixture,
        scope: confirmedLearningSpecFixture.scope.map((item) =>
          item.category === 'AGENT_SUPPORT'
            ? { ...item, conceptNames: ['discriminated union'] }
            : item,
        ),
      }).success,
    ).toBe(false)
  })
})

describe('Build, Event, and Evidence provenance invariants', () => {
  it('requires the recommended Decision option to exist', () => {
    expect(
      decisionRequestSchema.safeParse({
        ...decisionRequestFixture,
        recommendedOptionId: 'decision_option_00000000-0000-4000-8000-000000000099',
      }).success,
    ).toBe(false)
  })

  it('requires monotonic Live Context versions', () => {
    expect(
      liveProjectContextSchema.safeParse({ ...liveContextFixture, contextVersion: 3 }).success,
    ).toBe(false)
  })

  it('requires complete Context refresh fulfillment metadata', () => {
    expect(
      contextRefreshRequestSchema.safeParse({
        ...contextRefreshRequestFixture,
        revision: 1,
        status: 'FULFILLED',
        fulfilledAt: contextRefreshRequestFixture.requestedAt,
        fulfilledByContextVersion: 2,
      }).success,
    ).toBe(false)
    expect(
      contextRefreshRequestSchema.safeParse({
        ...contextRefreshRequestFixture,
        revision: 2,
        status: 'FULFILLED',
        fulfilledAt: contextRefreshRequestFixture.requestedAt,
        fulfilledByContextVersion: 2,
      }).success,
    ).toBe(true)
  })

  it('requires closed Episode boundaries', () => {
    const { endedAt: _endedAt, ...withoutEnd } = episodeFixture
    expect(episodeSchema.safeParse(withoutEnd).success).toBe(false)
  })

  it('does not allow an Agent to author a USER_MESSAGE Event', () => {
    expect(
      activityEventSchema.safeParse({
        ...activityEventFixture,
        actor: { kind: 'AGENT', role: 'BUILDER' },
      }).success,
    ).toBe(false)
  })

  it('rejects Agent-authored references as direct Evidence', () => {
    expect(
      evidenceProposalSchema.safeParse({
        ...evidenceProposalFixture,
        userEvidenceSources: [
          {
            kind: 'AGENT_MESSAGE',
            conversationId: ids.conversation,
            messageId: ids.helperMessage,
          },
        ],
      }).success,
    ).toBe(false)
  })

  it('rejects strong directly-led Evidence and keeps MISCONCEPTION out of Concept State', () => {
    expect(
      evidenceProposalSchema.safeParse({
        ...evidenceProposalFixture,
        promptDependence: 'DIRECTLY_LED',
      }).success,
    ).toBe(false)
    expect(conceptStateSchema.safeParse('MISCONCEPTION').success).toBe(false)
  })

  it('keeps personalization provenance explicit about evidence and fallback modes', () => {
    expect(personalizationTraceSchema.safeParse(helperPersonalizationFixture).success).toBe(true)
    expect(
      personalizationTraceSchema.safeParse({
        ...helperPersonalizationFixture,
        mode: 'EVIDENCE_AWARE',
      }).success,
    ).toBe(false)
    expect(
      personalizationTraceSchema.safeParse({
        ...helperPersonalizationFixture,
        basis: [],
        fallbackReason: undefined,
      }).success,
    ).toBe(false)
    const basis = {
      conceptId: ids.concept,
      conceptName: 'runtime validation',
      ledgerRevision: 1,
      state: 'OBSERVED',
      evidenceIds: [ids.evidence],
      episodeIds: [ids.episode],
      sourceProjectIds: [ids.project],
      sourceProjectTitles: ['Webhook Lens'],
      openIssueIds: [],
      purpose: 'HELPER_EXPLANATION_START',
    } as const
    expect(
      personalizationTraceSchema.safeParse({
        ...helperPersonalizationFixture,
        mode: 'EVIDENCE_AWARE',
        basis: Array.from({ length: 6 }, () => basis),
        fallbackReason: undefined,
      }).success,
    ).toBe(false)
  })

  it('keeps contradiction Evidence separate from user-understanding State support', () => {
    expect(
      acceptedEvidenceSchema.safeParse({
        ...acceptedEvidenceFixture,
        kind: 'MISCONCEPTION_SIGNAL',
        signal: 'CONTRADICTION',
        strength: 'MEDIUM',
        promptDependence: 'LIGHT_HINT',
        userEvidenceSources: acceptedEvidenceFixture.userEvidenceSources,
        supportsState: undefined,
      }).success,
    ).toBe(false)

    const {
      supportsState: _supportsState,
      signal: _signal,
      strength: _strength,
      promptDependence: _promptDependence,
      ...baseEvidence
    } = acceptedEvidenceFixture
    expect(
      acceptedEvidenceSchema.safeParse({
        ...baseEvidence,
        kind: 'MISCONCEPTION_SIGNAL',
        signal: 'CONTRADICTION',
        strength: 'MEDIUM',
        promptDependence: 'LIGHT_HINT',
      }).success,
    ).toBe(true)
  })
})
