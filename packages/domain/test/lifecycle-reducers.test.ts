import { describe, expect, it } from 'vitest'

import {
  applyDecision,
  closeEpisode,
  confirmLearningSpec,
  openDecision,
  planBuilderTask,
  reduceCandidateRevision,
  requiredEvidenceConceptNames,
  resolveDecision,
  transitionBuilderTask,
  updateLiveContext,
  supersedeLearningSpec,
  writeLearningSpecDraft,
} from '../src/index.ts'
import {
  activityEventFixture,
  builderTaskFixture,
  candidateFixture,
  completionReportFixture,
  confirmedLearningSpecFixture,
  decisionApplicationFixture,
  decisionRequestFixture,
  decisionResolutionFixture,
  discoveryFeedbackFixture,
  draftLearningSpecFixture,
  episodeFixture,
  ids,
  liveContextFixture,
  projectFixture,
  timestamp,
} from '../../contracts/test/fixtures.js'

const secondCandidateId = 'candidate_00000000-0000-4000-8000-000000000041'
const secondEventId = 'event_00000000-0000-4000-8000-000000000042'

describe('Candidate revision reducer', () => {
  const revisedCandidate = {
    ...candidateFixture,
    revision: 2,
    parentRevisions: [{ candidateId: ids.candidate, revision: 1 }],
    summary: 'A revised local viewer with explicit strict-boundary feedback.',
  } as const
  const reviseFeedback = {
    ...discoveryFeedbackFixture,
    intent: 'REVISE',
    targets: [{ candidateId: ids.candidate, revision: 1 }],
  } as const

  it.each(['REVISE', 'SHRINK', 'EXPAND'] as const)(
    'applies a consecutive %s revision and treats an exact replay as a no-op',
    (intent) => {
      const feedback = { ...reviseFeedback, intent }
      const applied = reduceCandidateRevision({
        existing: [candidateFixture],
        proposed: revisedCandidate,
        feedback,
      })
      expect(applied.outcome).toBe('APPLIED')
      if (applied.outcome !== 'APPLIED') return
      expect(applied.value).toHaveLength(2)
      expect(applied.trace.supportingIds).toEqual([`${ids.candidate}:1`])

      const replayed = reduceCandidateRevision({
        existing: applied.value,
        proposed: revisedCandidate,
        feedback,
      })
      expect(replayed.outcome).toBe('NO_OP')
      expect(replayed.trace.reasonCode).toBe('CANDIDATE_DUPLICATE')
    },
  )

  it('continues the first merge target and preserves every latest parent', () => {
    const secondCandidate = { ...candidateFixture, id: secondCandidateId, title: 'Schema Journal' }
    const merged = {
      ...revisedCandidate,
      parentRevisions: [
        { candidateId: ids.candidate, revision: 1 },
        { candidateId: secondCandidateId, revision: 1 },
      ],
      title: 'Webhook Schema Journal',
    }
    const mergeFeedback = {
      ...discoveryFeedbackFixture,
      intent: 'MERGE',
      targets: [
        { candidateId: ids.candidate, revision: 1 },
        { candidateId: secondCandidateId, revision: 1 },
      ],
    } as const

    const result = reduceCandidateRevision({
      existing: [secondCandidate, candidateFixture],
      proposed: merged,
      feedback: mergeFeedback,
    })
    expect(result.outcome).toBe('APPLIED')
    expect(result.trace.supportingIds).toEqual([`${ids.candidate}:1`, `${secondCandidateId}:1`])
  })

  it('rejects missing lineage and conflicting duplicate revisions', () => {
    expect(
      reduceCandidateRevision({ existing: [], proposed: revisedCandidate }).trace.reasonCode,
    ).toBe('CANDIDATE_PARENT_NOT_FOUND')
    expect(
      reduceCandidateRevision({
        existing: [candidateFixture],
        proposed: { ...candidateFixture, title: 'Conflicting payload' },
      }).trace.reasonCode,
    ).toBe('CANDIDATE_REVISION_CONFLICT')
  })

  it('requires regenerated Candidates to start a new lineage', () => {
    const regenerateFeedback = {
      ...discoveryFeedbackFixture,
      intent: 'REGENERATE',
      targets: [],
    } as const
    expect(
      reduceCandidateRevision({
        existing: [candidateFixture],
        proposed: revisedCandidate,
        feedback: regenerateFeedback,
      }).trace.reasonCode,
    ).toBe('CANDIDATE_REGENERATION_LINEAGE_INVALID')
  })
})

describe('Learning Spec confirmation reducer', () => {
  it('creates and revises only the selected Candidate draft', () => {
    const created = writeLearningSpecDraft({
      history: [],
      proposed: draftLearningSpecFixture,
      selectedCandidate: candidateFixture,
      selection: discoveryFeedbackFixture,
    })
    expect(created.outcome).toBe('APPLIED')
    expect(
      writeLearningSpecDraft({
        history: [],
        proposed: { ...draftLearningSpecFixture, source: { kind: 'USER' } },
        selectedCandidate: candidateFixture,
        selection: discoveryFeedbackFixture,
      }).trace.reasonCode,
    ).toBe('LEARNING_SPEC_INITIAL_REVISION_INVALID')

    const revised = {
      ...draftLearningSpecFixture,
      revision: 2,
      parentRevision: 1,
      productPurpose: 'Inspect and compare redacted webhook variants locally.',
      source: { kind: 'USER' as const },
    }
    const updated = writeLearningSpecDraft({
      history: [draftLearningSpecFixture],
      proposed: revised,
      selectedCandidate: candidateFixture,
      selection: discoveryFeedbackFixture,
    })
    expect(updated.outcome).toBe('APPLIED')
    expect(updated.trace.reasonCode).toBe('LEARNING_SPEC_DRAFT_REVISED')

    expect(
      writeLearningSpecDraft({
        history: [draftLearningSpecFixture],
        proposed: { ...revised, revision: 3, parentRevision: 2 },
        selectedCandidate: candidateFixture,
        selection: discoveryFeedbackFixture,
      }).trace.reasonCode,
    ).toBe('LEARNING_SPEC_REVISION_NOT_NEXT')
  })

  it('supersedes an unchanged draft and derives Evidence targets from Learner Focus only', () => {
    const superseded = {
      ...draftLearningSpecFixture,
      revision: 2,
      parentRevision: 1,
      status: 'SUPERSEDED',
      source: { kind: 'CORE' as const },
    }
    const result = supersedeLearningSpec({
      history: [draftLearningSpecFixture],
      proposed: superseded,
    })
    expect(result.outcome).toBe('APPLIED')
    expect(requiredEvidenceConceptNames(draftLearningSpecFixture)).toEqual(['discriminated union'])
  })

  it('confirms an unchanged current draft and makes retries idempotent', () => {
    const result = confirmLearningSpec({
      history: [draftLearningSpecFixture],
      proposed: confirmedLearningSpecFixture,
      selectedCandidate: candidateFixture,
      selection: discoveryFeedbackFixture,
    })
    expect(result.outcome).toBe('APPLIED')
    if (result.outcome !== 'APPLIED') return
    expect(result.value.at(-1)?.status).toBe('CONFIRMED')

    const replay = confirmLearningSpec({
      history: result.value,
      proposed: confirmedLearningSpecFixture,
      selectedCandidate: candidateFixture,
      selection: discoveryFeedbackFixture,
    })
    expect(replay.outcome).toBe('NO_OP')
  })

  it('rejects content changes smuggled into confirmation', () => {
    const result = confirmLearningSpec({
      history: [draftLearningSpecFixture],
      proposed: { ...confirmedLearningSpecFixture, productPurpose: 'A changed product purpose.' },
      selectedCandidate: candidateFixture,
      selection: discoveryFeedbackFixture,
    })
    expect(result.trace.reasonCode).toBe('LEARNING_SPEC_CHANGED_DURING_CONFIRMATION')
  })
})

describe('Task and Decision reducers', () => {
  const completedTask = {
    ...builderTaskFixture,
    revision: 2,
    status: 'COMPLETED',
  } as const

  it('plans deterministic Task scope only from a confirmed Spec', () => {
    const planned = planBuilderTask({
      project: { ...projectFixture, status: 'SPEC_REVIEW', generatedWorkspacePath: undefined },
      spec: confirmedLearningSpecFixture,
      taskId: ids.task,
      sequence: 1,
      now: timestamp,
    })
    expect(planned.outcome).toBe('APPLIED')
    if (planned.outcome !== 'APPLIED') return
    expect(planned.value).toMatchObject({
      status: 'PENDING',
      expectedConcepts: ['discriminated union'],
      excludedWork: ['Hosted sample storage'],
      expectedDecisionCategories: ['DATA_MODEL'],
    })
    expect(planned.value.requirements).toContain(
      'Agent-supported implementation scope: Local application shell',
    )
    expect(planned.value.acceptanceCriteria.map((criterion) => criterion.key)).toEqual([
      'feature_01',
      'feature_02',
      'local_result',
      'tests_pass',
    ])
    expect(
      planBuilderTask({
        project: { ...projectFixture, status: 'SPEC_REVIEW', generatedWorkspacePath: undefined },
        spec: draftLearningSpecFixture,
        taskId: ids.task,
        sequence: 1,
        now: timestamp,
      }).trace.reasonCode,
    ).toBe('BUILDER_TASK_CONFIRMED_SPEC_REQUIRED')
  })

  it('requires a started first Context and rejects stale or post-completion updates', () => {
    const first = { ...liveContextFixture, checkpoint: 'TASK_STARTED' as const }
    expect(updateLiveContext({ task: builderTaskFixture, proposed: first }).outcome).toBe('APPLIED')
    expect(
      updateLiveContext({ task: builderTaskFixture, proposed: liveContextFixture }).trace
        .reasonCode,
    ).toBe('LIVE_CONTEXT_INITIAL_INVALID')

    const stale = {
      ...first,
      stage: 'A stale direction',
    }
    expect(
      updateLiveContext({ task: builderTaskFixture, current: first, proposed: stale }).trace
        .reasonCode,
    ).toBe('LIVE_CONTEXT_STALE')

    const completed = {
      ...first,
      contextVersion: 2,
      expectedPreviousVersion: 1,
      checkpoint: 'TASK_COMPLETED' as const,
    }
    expect(
      updateLiveContext({ task: builderTaskFixture, current: first, proposed: completed }).outcome,
    ).toBe('APPLIED')
    expect(
      updateLiveContext({
        task: builderTaskFixture,
        current: completed,
        proposed: {
          ...completed,
          contextVersion: 3,
          expectedPreviousVersion: 2,
          checkpoint: 'VALIDATION_STARTED',
        },
      }).trace.reasonCode,
    ).toBe('LIVE_CONTEXT_ALREADY_COMPLETED')
  })

  it('completes a Task only with complete passing acceptance evidence', () => {
    const result = transitionBuilderTask({
      current: builderTaskFixture,
      proposed: completedTask,
      completionReport: completionReportFixture,
    })
    expect(result.outcome).toBe('APPLIED')
    expect(result.trace.before).toBe('ACTIVE')
    expect(result.trace.after).toBe('COMPLETED')

    const missingReport = transitionBuilderTask({
      current: builderTaskFixture,
      proposed: completedTask,
    })
    expect(missingReport.trace.reasonCode).toBe('TASK_COMPLETION_REPORT_REQUIRED')

    const failedAcceptance = transitionBuilderTask({
      current: builderTaskFixture,
      proposed: completedTask,
      completionReport: {
        ...completionReportFixture,
        acceptanceResults: [{ ...completionReportFixture.acceptanceResults[0], status: 'FAILED' }],
      },
    })
    expect(failedAcceptance.trace.reasonCode).toBe('TASK_ACCEPTANCE_FAILED')
  })

  it('rejects terminal Task transitions and accepts exact replays as no-ops', () => {
    expect(
      transitionBuilderTask({ current: builderTaskFixture, proposed: builderTaskFixture }).outcome,
    ).toBe('NO_OP')
    expect(
      transitionBuilderTask({
        current: completedTask,
        proposed: { ...completedTask, revision: 3, status: 'ACTIVE' },
      }).trace.reasonCode,
    ).toBe('TASK_TRANSITION_NOT_ALLOWED')
  })

  it('moves one Decision through request, resolution and application exactly once', () => {
    const opened = openDecision({
      task: builderTaskFixture,
      liveContext: liveContextFixture,
      request: decisionRequestFixture,
    })
    expect(opened.outcome).toBe('APPLIED')
    if (opened.outcome !== 'APPLIED') return

    const resolved = resolveDecision({
      aggregate: opened.value,
      task: builderTaskFixture,
      resolution: decisionResolutionFixture,
      currentContextVersion: 1,
    })
    expect(resolved.outcome).toBe('APPLIED')
    if (resolved.outcome !== 'APPLIED') return

    const applied = applyDecision({
      aggregate: resolved.value,
      task: builderTaskFixture,
      application: decisionApplicationFixture,
    })
    expect(applied.outcome).toBe('APPLIED')
    if (applied.outcome !== 'APPLIED') return
    expect(
      applyDecision({
        aggregate: applied.value,
        task: builderTaskFixture,
        application: decisionApplicationFixture,
      }).outcome,
    ).toBe('NO_OP')
  })

  it('rejects stale resolutions and recommendation substitutions', () => {
    const aggregate = { request: decisionRequestFixture }
    expect(
      resolveDecision({
        aggregate,
        task: builderTaskFixture,
        resolution: decisionResolutionFixture,
        currentContextVersion: 2,
      }).trace.reasonCode,
    ).toBe('DECISION_RESOLUTION_REFERENCE_MISMATCH')
    expect(
      resolveDecision({
        aggregate,
        task: builderTaskFixture,
        resolution: {
          ...decisionResolutionFixture,
          selectionKind: 'RECOMMENDATION',
          selectedOptionId: ids.optionB,
        },
        currentContextVersion: 1,
      }).trace.reasonCode,
    ).toBe('DECISION_RECOMMENDATION_MISMATCH')
  })

  it('accepts a user-authored custom proposal without substituting an option ID', () => {
    const { selectedOptionId: _selectedOptionId, ...resolution } = decisionResolutionFixture
    expect(
      resolveDecision({
        aggregate: { request: decisionRequestFixture },
        task: builderTaskFixture,
        resolution: {
          ...resolution,
          selectionKind: 'CUSTOM',
          customProposal: 'Reject unknown fields but retain their names in a local debug summary.',
        },
        currentContextVersion: 1,
      }).outcome,
    ).toBe('APPLIED')
  })

  it('requires a coherent DECISION_REQUIRED Context and blocking reason', () => {
    expect(
      openDecision({
        task: builderTaskFixture,
        liveContext: { ...liveContextFixture, checkpoint: 'DIRECTION_CHANGED' },
        request: decisionRequestFixture,
      }).trace.reasonCode,
    ).toBe('DECISION_REQUEST_CONTEXT_MISMATCH')
    expect(
      openDecision({
        task: builderTaskFixture,
        liveContext: liveContextFixture,
        request: { ...decisionRequestFixture, independentWorkCanContinue: false },
      }).trace.reasonCode,
    ).toBe('DECISION_REQUEST_CONTEXT_MISMATCH')
  })
})

describe('Episode close reducer', () => {
  const openEpisode = {
    ...episodeFixture,
    status: 'OPEN',
    endedAt: undefined,
    closeReason: undefined,
  } as const
  const closedEpisode = { ...episodeFixture, revision: 2 } as const

  it('closes an Episode once with ordered, same-scope Events', () => {
    const result = closeEpisode({
      current: openEpisode,
      proposed: closedEpisode,
      events: [activityEventFixture],
    })
    expect(result.outcome).toBe('APPLIED')
    expect(result.trace.supportingIds).toEqual([ids.eventUser])
    expect(
      closeEpisode({
        current: closedEpisode,
        proposed: closedEpisode,
        events: [activityEventFixture],
      }).outcome,
    ).toBe('NO_OP')
  })

  it('rejects duplicate or out-of-order Event sequences', () => {
    const secondEvent = {
      ...activityEventFixture,
      id: secondEventId,
      sequence: 1,
    }
    const proposed = {
      ...closedEpisode,
      eventIds: [ids.eventUser, secondEventId],
    }
    expect(
      closeEpisode({
        current: openEpisode,
        proposed,
        events: [activityEventFixture, secondEvent],
      }).trace.reasonCode,
    ).toBe('EPISODE_EVENT_SCOPE_INVALID')

    expect(
      closeEpisode({
        current: openEpisode,
        proposed: { ...closedEpisode, eventIds: [ids.eventUser, ids.eventUser] },
        events: [activityEventFixture, activityEventFixture],
      }).trace.reasonCode,
    ).toBe('EPISODE_EVENT_SET_INVALID')
  })

  it('is deterministic for the same transition input', () => {
    const input = {
      current: openEpisode,
      proposed: closedEpisode,
      events: [activityEventFixture],
    }
    expect(JSON.stringify(closeEpisode(input))).toBe(JSON.stringify(closeEpisode(input)))
    expect(timestamp).toBe(activityEventFixture.occurredAt)
  })
})
