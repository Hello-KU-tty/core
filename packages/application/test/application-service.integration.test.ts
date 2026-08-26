import { mkdir, mkdtemp, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  type ApplicationError,
  ApplicationService,
  WorkspacePathPolicy,
} from '@vibe-helper/application'
import {
  builderTaskSchema,
  candidateRoundSchema,
  canonicalConceptSchema,
  decisionRequestSchema,
  discoveryFeedbackSchema,
  discoverySessionSchema,
  activityEventSchema,
  episodeSchema,
  learningSpecRevisionSchema,
  projectCandidateRevisionSchema,
  projectSchema,
} from '@vibe-helper/contracts'
import { describe, expect, it } from 'vitest'

import {
  builderTaskFixture,
  activityEventFixture,
  candidateFixture,
  candidateRoundFixture,
  confirmedLearningSpecFixture,
  canonicalConceptFixture,
  decisionRequestFixture,
  discoveryFeedbackFixture,
  discoveryInputFixture,
  discoverySessionFixture,
  draftLearningSpecFixture,
  episodeFixture,
  evidenceProposalBatchFixture,
  ids,
  learningSpecDraftContentFixture,
  liveContextFixture,
  projectFixture,
  timestamp,
} from '../../contracts/test/fixtures.js'
import { openInMemorySqliteStorage } from '../../storage-sqlite/src/index.js'

const fixedIdGenerator = (() => {
  let sequence = 40
  return (prefix: string): string => {
    sequence += 1
    return `${prefix}_00000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`
  }
})()

const createHarness = async (
  options: { readonly generateId?: (prefix: string) => string } = {},
) => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'vibe-helper-application-workspaces-'))
  const storage = await openInMemorySqliteStorage()
  const workspacePolicy = await WorkspacePathPolicy.create(workspaceRoot)
  const service = new ApplicationService({
    storage,
    workspacePolicy,
    now: () => new Date(timestamp),
    generateId: options.generateId ?? fixedIdGenerator,
  })
  return { service, storage, workspaceRoot, workspacePolicy }
}

const seedSpecReview = (
  storage: Awaited<ReturnType<typeof openInMemorySqliteStorage>>,
  includeDraft = false,
): void => {
  storage.transaction((repository) => {
    repository.appendProject(
      projectSchema.parse({
        ...projectFixture,
        status: 'DISCOVERY',
        generatedWorkspacePath: undefined,
      }),
    )
    repository.appendDiscoverySession(discoverySessionSchema.parse(discoverySessionFixture))
    repository.appendCandidate(projectCandidateRevisionSchema.parse(candidateFixture))
    repository.appendCandidateRound(candidateRoundSchema.parse(candidateRoundFixture))
    repository.appendDiscoveryFeedback(discoveryFeedbackSchema.parse(discoveryFeedbackFixture))
    repository.appendDiscoverySession(
      discoverySessionSchema.parse({
        ...discoverySessionFixture,
        revision: 2,
        status: 'SELECTED',
        closedAt: timestamp,
      }),
    )
    repository.appendProject(
      projectSchema.parse({
        ...projectFixture,
        revision: 2,
        status: 'SPEC_REVIEW',
        generatedWorkspacePath: undefined,
      }),
    )
    if (includeDraft) {
      repository.appendLearningSpec(learningSpecRevisionSchema.parse(draftLearningSpecFixture))
    }
  })
}

const seedBuilderGraph = (storage: Awaited<ReturnType<typeof openInMemorySqliteStorage>>): void => {
  storage.transaction((repository) => {
    repository.appendProject(projectSchema.parse(projectFixture))
    repository.appendDiscoverySession(discoverySessionSchema.parse(discoverySessionFixture))
    repository.appendCandidate(projectCandidateRevisionSchema.parse(candidateFixture))
    repository.appendCandidateRound(candidateRoundSchema.parse(candidateRoundFixture))
    repository.appendDiscoveryFeedback(discoveryFeedbackSchema.parse(discoveryFeedbackFixture))
    repository.appendLearningSpec(learningSpecRevisionSchema.parse(draftLearningSpecFixture))
    repository.appendLearningSpec(learningSpecRevisionSchema.parse(confirmedLearningSpecFixture))
    repository.appendTask(builderTaskSchema.parse(builderTaskFixture))
  })
}

describe('ApplicationService boundary', () => {
  it('persists and replays an idempotent UI command, but rejects key reuse', async () => {
    const { service, storage } = await createHarness()
    const request = {
      schemaVersion: 1,
      kind: 'UI_START_DISCOVERY',
      correlationId: ids.correlation,
      actor: { kind: 'UI' },
      idempotencyKey: ids.idempotency,
      projectId: ids.project,
      input: discoveryInputFixture,
    } as const

    const first = await service.executeUi(request)
    const replay = await service.executeUi(request)

    expect(first).toEqual(replay)
    expect(first).toMatchObject({
      success: true,
      data: { accepted: true, resourceRevision: 1 },
    })
    expect(storage.repository.readDiscoveryAggregate(ids.project)?.session.revision).toBe(1)

    const conflict = await service.executeUi({
      ...request,
      input: { ...request.input, learningGoal: 'A different goal' },
    })
    expect(conflict).toMatchObject({
      success: false,
      error: { kind: 'OPERATION_ERROR', code: 'IDEMPOTENCY_KEY_REUSE' },
    })
  })

  it('rejects role escalation before dispatching any use case', async () => {
    const { service } = await createHarness()
    const result = await service.executeAgent('HELPER', {
      schemaVersion: 1,
      kind: 'BUILDER_START_TASK',
      correlationId: ids.correlation,
      actor: { kind: 'AGENT', role: 'BUILDER' },
      idempotencyKey: ids.idempotency,
      projectId: ids.project,
      taskId: ids.task,
      expectedTaskRevision: 1,
    })

    expect(result).toMatchObject({
      success: false,
      error: {
        kind: 'CONTRACT_ERROR',
        category: 'PERMISSION',
        code: 'AGENT_PERMISSION_MISMATCH',
      },
    })
  })

  it('returns a retryable stale-context error without mutating the task', async () => {
    const { service, storage } = await createHarness()
    seedBuilderGraph(storage)

    const result = await service.executeAgent('BUILDER', {
      schemaVersion: 1,
      kind: 'BUILDER_START_TASK',
      correlationId: ids.correlation,
      actor: { kind: 'AGENT', role: 'BUILDER' },
      idempotencyKey: ids.idempotency,
      projectId: ids.project,
      taskId: ids.task,
      expectedTaskRevision: 0,
    })

    expect(result).toMatchObject({
      success: false,
      error: {
        kind: 'OPERATION_ERROR',
        category: 'STALE_CONTEXT',
        code: 'BUILDER_TASK_STALE',
        disposition: 'RETRYABLE',
      },
    })
    expect(storage.repository.recoverProject(ids.project)?.activeTask?.revision).toBe(1)
  })

  it('rejects canonical paths that escape through a workspace symlink', async () => {
    const { workspacePolicy, workspaceRoot } = await createHarness()
    const project = projectSchema.parse(projectFixture)
    const projectWorkspace = join(workspaceRoot, 'generated', 'webhook-lens')
    const outside = await mkdtemp(join(tmpdir(), 'vibe-helper-outside-workspace-'))
    await mkdir(projectWorkspace, { recursive: true })
    await symlink(outside, join(projectWorkspace, 'escape'))

    await expect(
      workspacePolicy.validateReferences(
        project,
        { kind: 'CODE', path: 'escape/secret.ts' },
        ids.correlation,
      ),
    ).rejects.toMatchObject<ApplicationError>({
      operationError: {
        kind: 'OPERATION_ERROR',
        category: 'PERMISSION',
        code: 'WORKSPACE_PATH_ESCAPE',
      },
    })
  })

  it('rejects a Builder context update that references a path outside its workspace', async () => {
    const { service, storage, workspaceRoot } = await createHarness()
    seedBuilderGraph(storage)
    const projectWorkspace = join(workspaceRoot, 'generated', 'webhook-lens')
    const outside = await mkdtemp(join(tmpdir(), 'vibe-helper-builder-escape-'))
    await mkdir(projectWorkspace, { recursive: true })
    await symlink(outside, join(projectWorkspace, 'escape'))

    const result = await service.executeAgent('BUILDER', {
      schemaVersion: 1,
      kind: 'BUILDER_UPDATE_LIVE_CONTEXT',
      correlationId: ids.correlation,
      actor: { kind: 'AGENT', role: 'BUILDER' },
      idempotencyKey: ids.idempotency,
      context: {
        ...liveContextFixture,
        relatedFiles: [
          {
            ...liveContextFixture.relatedFiles[0],
            path: 'escape/secret.ts',
          },
        ],
      },
    })

    expect(result).toMatchObject({
      success: false,
      error: {
        kind: 'OPERATION_ERROR',
        category: 'PERMISSION',
        code: 'WORKSPACE_PATH_ESCAPE',
      },
    })
    expect(storage.repository.recoverProject(ids.project)?.liveContext).toBeNull()
  })

  it('enforces the application payload cap before contract dispatch', async () => {
    const { service } = await createHarness()
    const result = await service.executeAgent('HELPER', {
      schemaVersion: 1,
      kind: 'HELPER_GET_CONTEXT',
      correlationId: ids.correlation,
      actor: { kind: 'AGENT', role: 'HELPER' },
      projectId: ids.project,
      question: 'x'.repeat(2 * 1024 * 1024),
      relatedConceptNames: [],
    })

    expect(result).toMatchObject({
      success: false,
      error: { kind: 'OPERATION_ERROR', code: 'PAYLOAD_TOO_LARGE' },
    })
  })

  it('applies Analyst proposals through deterministic Evidence reducers and replays the result', async () => {
    const { service, storage } = await createHarness()
    seedBuilderGraph(storage)
    storage.transaction((repository) => {
      repository.appendDecisionRequest(decisionRequestSchema.parse(decisionRequestFixture))
      repository.appendActivityEvent(activityEventSchema.parse(activityEventFixture))
      repository.appendEpisode(episodeSchema.parse(episodeFixture))
      repository.appendCanonicalConcept(canonicalConceptSchema.parse(canonicalConceptFixture))
    })
    const request = {
      schemaVersion: 1,
      kind: 'ANALYST_SUBMIT_EVIDENCE_PROPOSALS',
      correlationId: ids.correlation,
      actor: { kind: 'AGENT', role: 'EVIDENCE_ANALYST' },
      idempotencyKey: ids.idempotency,
      batch: evidenceProposalBatchFixture,
    } as const

    const applied = await service.executeAgent('EVIDENCE_ANALYST', request)
    const replay = await service.executeAgent('EVIDENCE_ANALYST', request)

    expect(applied).toEqual(replay)
    expect(applied).toMatchObject({
      success: true,
      data: {
        episodeId: ids.episode,
        outcomes: [
          {
            proposalId: ids.evidenceProposal,
            decision: { outcome: 'ACCEPTED', reasonCode: 'VALID_USER_EVIDENCE' },
            conceptId: ids.concept,
            ledgerRevision: 1,
          },
        ],
      },
    })
    expect(storage.repository.readEvidenceTrace(ids.concept)).toMatchObject({
      ledger: { state: { state: 'DEMONSTRATED' } },
      acceptedEvidence: [{ evidenceProposalId: ids.evidenceProposal }],
    })
  })

  it('applies pinned, rejected, and regenerated Candidate feedback before explicit selection', async () => {
    const { service, storage } = await createHarness()
    const secondCandidateId = 'candidate_00000000-0000-4000-8000-000000000051'
    const thirdCandidateId = 'candidate_00000000-0000-4000-8000-000000000052'
    const regeneratedCandidateId = 'candidate_00000000-0000-4000-8000-000000000053'
    const secondRoundId = 'candidate_round_00000000-0000-4000-8000-000000000054'
    const pinFeedbackId = 'feedback_00000000-0000-4000-8000-000000000055'
    const rejectFeedbackId = 'feedback_00000000-0000-4000-8000-000000000056'
    const regenerateFeedbackId = 'feedback_00000000-0000-4000-8000-000000000057'
    const selectionFeedbackId = 'feedback_00000000-0000-4000-8000-000000000058'
    const secondCandidate = {
      ...candidateFixture,
      id: secondCandidateId,
      title: 'Typed Form State Lab',
      coreInteraction: 'Move a form through explicit state variants.',
    }
    const thirdCandidate = {
      ...candidateFixture,
      id: thirdCandidateId,
      title: 'API Change Radar',
      coreInteraction: 'Compare response variants and inspect typed compatibility changes.',
    }
    const discoveryProject = {
      ...projectFixture,
      status: 'DISCOVERY' as const,
      generatedWorkspacePath: undefined,
    }
    storage.transaction((repository) => {
      repository.appendProject(projectSchema.parse(discoveryProject))
      repository.appendDiscoverySession(discoverySessionSchema.parse(discoverySessionFixture))
    })

    const firstRound = {
      ...candidateRoundFixture,
      candidates: [
        { candidateId: ids.candidate, revision: 1 },
        { candidateId: secondCandidateId, revision: 1 },
        { candidateId: thirdCandidateId, revision: 1 },
      ],
    }
    const initial = await service.executeAgent('DISCOVERY', {
      schemaVersion: 1,
      kind: 'DISCOVERY_SUBMIT_CANDIDATE_ROUND',
      correlationId: ids.correlation,
      actor: { kind: 'AGENT', role: 'DISCOVERY' },
      idempotencyKey: 'idem_00000000-0000-4000-8000-000000000060',
      expectedSessionRevision: 1,
      round: firstRound,
      candidates: [candidateFixture, secondCandidate, thirdCandidate],
    })
    expect(initial).toMatchObject({ success: true, data: { resourceRevision: 2 } })

    const feedbackBase = {
      schemaVersion: 1 as const,
      discoverySessionId: ids.discoverySession,
      roundId: ids.candidateRound,
      correlationId: ids.correlation,
      createdAt: timestamp,
      source: { kind: 'USER' as const },
      redactionStatus: 'NOT_REQUIRED' as const,
    }
    const feedbackCommands = [
      {
        id: pinFeedbackId,
        intent: 'PIN' as const,
        targets: [{ candidateId: ids.candidate, revision: 1 }],
        message: 'Keep this candidate visible.',
      },
      {
        id: rejectFeedbackId,
        intent: 'REJECT' as const,
        targets: [{ candidateId: secondCandidateId, revision: 1 }],
        message: 'Remove this direction.',
      },
      {
        id: regenerateFeedbackId,
        intent: 'REGENERATE' as const,
        targets: [{ candidateId: thirdCandidateId, revision: 1 }],
        message: 'Replace this with a more practical direction.',
      },
    ]
    for (const [index, feedback] of feedbackCommands.entries()) {
      const result = await service.executeUi({
        schemaVersion: 1,
        kind: 'UI_RECORD_DISCOVERY_FEEDBACK',
        correlationId: ids.correlation,
        actor: { kind: 'UI' },
        idempotencyKey: `idem_00000000-0000-4000-8000-${String(61 + index).padStart(12, '0')}`,
        expectedSessionRevision: 2 + index,
        feedback: { ...feedbackBase, ...feedback },
      })
      expect(result).toMatchObject({ success: true, data: { resourceRevision: 3 + index } })
    }

    const regeneratedCandidate = {
      ...candidateFixture,
      id: regeneratedCandidateId,
      title: 'Runtime Contract Playground',
      coreInteraction: 'Try unknown payloads and inspect safe typed parsing branches.',
    }
    const secondRound = {
      ...candidateRoundFixture,
      id: secondRoundId,
      roundIndex: 2,
      appliedFeedbackIds: [pinFeedbackId, rejectFeedbackId, regenerateFeedbackId],
      candidates: [
        { candidateId: ids.candidate, revision: 1 },
        { candidateId: regeneratedCandidateId, revision: 1 },
      ],
      generationRationale:
        'The pinned option remains while rejected and regenerated options change.',
    }
    const refined = await service.executeAgent('DISCOVERY', {
      schemaVersion: 1,
      kind: 'DISCOVERY_SUBMIT_CANDIDATE_ROUND',
      correlationId: ids.correlation,
      actor: { kind: 'AGENT', role: 'DISCOVERY' },
      idempotencyKey: 'idem_00000000-0000-4000-8000-000000000064',
      expectedSessionRevision: 5,
      round: secondRound,
      candidates: [regeneratedCandidate],
    })
    expect(refined).toMatchObject({ success: true, data: { resourceRevision: 6 } })
    expect(storage.repository.readDiscoveryAggregate(ids.project)).toMatchObject({
      session: { status: 'ACTIVE', revision: 6 },
      rounds: [
        { roundIndex: 1, appliedFeedbackIds: [] },
        {
          roundIndex: 2,
          appliedFeedbackIds: [pinFeedbackId, rejectFeedbackId, regenerateFeedbackId],
          candidates: [
            { candidateId: ids.candidate, revision: 1 },
            { candidateId: regeneratedCandidateId, revision: 1 },
          ],
        },
      ],
      candidates: expect.arrayContaining([
        expect.objectContaining({ id: regeneratedCandidateId, revision: 1, parentRevisions: [] }),
      ]),
    })

    const staleSelection = await service.executeUi({
      schemaVersion: 1,
      kind: 'UI_RECORD_DISCOVERY_FEEDBACK',
      correlationId: ids.correlation,
      actor: { kind: 'UI' },
      idempotencyKey: 'idem_00000000-0000-4000-8000-000000000065',
      expectedSessionRevision: 6,
      feedback: {
        ...feedbackBase,
        id: selectionFeedbackId,
        intent: 'SELECT',
        targets: [{ candidateId: ids.candidate, revision: 1 }],
      },
    })
    expect(staleSelection).toMatchObject({
      success: false,
      error: { code: 'DISCOVERY_ROUND_NOT_CURRENT' },
    })

    const selected = await service.executeUi({
      schemaVersion: 1,
      kind: 'UI_RECORD_DISCOVERY_FEEDBACK',
      correlationId: ids.correlation,
      actor: { kind: 'UI' },
      idempotencyKey: 'idem_00000000-0000-4000-8000-000000000066',
      expectedSessionRevision: 6,
      feedback: {
        ...feedbackBase,
        id: selectionFeedbackId,
        roundId: secondRoundId,
        intent: 'SELECT',
        targets: [{ candidateId: regeneratedCandidateId, revision: 1 }],
      },
    })
    expect(selected).toMatchObject({ success: true, data: { resourceRevision: 7 } })
    expect(storage.repository.recoverProject(ids.project)).toMatchObject({
      project: { status: 'SPEC_REVIEW' },
      discoverySession: { status: 'SELECTED' },
      selectedCandidate: { id: regeneratedCandidateId, revision: 1 },
    })

    const postSelectionRound = await service.executeAgent('DISCOVERY', {
      schemaVersion: 1,
      kind: 'DISCOVERY_SUBMIT_CANDIDATE_ROUND',
      correlationId: ids.correlation,
      actor: { kind: 'AGENT', role: 'DISCOVERY' },
      idempotencyKey: 'idem_00000000-0000-4000-8000-000000000067',
      expectedSessionRevision: 7,
      round: { ...secondRound, id: ids.candidateRound, roundIndex: 3 },
      candidates: [],
    })
    expect(postSelectionRound).toMatchObject({
      success: false,
      error: { code: 'DISCOVERY_SESSION_NOT_ACTIVE' },
    })
  })
})

describe('T09 Learning Spec application flow', () => {
  it('creates, directly revises, and confirms a draft without creating a Builder Task', async () => {
    const { service, storage } = await createHarness()
    seedSpecReview(storage)

    const submitRequest = {
      schemaVersion: 1,
      kind: 'DISCOVERY_SUBMIT_LEARNING_SPEC',
      correlationId: ids.correlation,
      actor: { kind: 'AGENT', role: 'DISCOVERY' },
      idempotencyKey: 'idem_00000000-0000-4000-8000-000000000081',
      expectedSessionRevision: 2,
      expectedSpecRevision: 0,
      learningSpec: draftLearningSpecFixture,
    } as const
    const submitted = await service.executeAgent('DISCOVERY', submitRequest)
    const replayed = await service.executeAgent('DISCOVERY', submitRequest)
    expect(submitted).toMatchObject({ success: true, data: { resourceRevision: 1 } })
    expect(replayed).toEqual(submitted)
    expect(storage.repository.recoverProject(ids.project)?.activeTask).toBeNull()
    expect(
      await service.executeAgent('DISCOVERY', {
        schemaVersion: 1,
        kind: 'DISCOVERY_GET_CONTEXT',
        correlationId: ids.correlation,
        actor: { kind: 'AGENT', role: 'DISCOVERY' },
        projectId: ids.project,
        discoverySessionId: ids.discoverySession,
      }),
    ).toMatchObject({
      success: true,
      data: { session: { revision: 3 }, learningSpec: { id: ids.learningSpec, revision: 1 } },
    })

    const revisedDraft = {
      ...learningSpecDraftContentFixture,
      productPurpose: 'Compare redacted webhook variants locally before implementation.',
    }
    const revised = await service.executeUi({
      schemaVersion: 1,
      kind: 'UI_UPDATE_LEARNING_SPEC',
      correlationId: ids.correlation,
      actor: { kind: 'UI' },
      idempotencyKey: 'idem_00000000-0000-4000-8000-000000000082',
      projectId: ids.project,
      learningSpecId: ids.learningSpec,
      expectedSessionRevision: 3,
      expectedSpecRevision: 1,
      draft: revisedDraft,
    })
    expect(revised).toMatchObject({ success: true, data: { resourceRevision: 2 } })

    const stale = await service.executeUi({
      schemaVersion: 1,
      kind: 'UI_UPDATE_LEARNING_SPEC',
      correlationId: ids.correlation,
      actor: { kind: 'UI' },
      idempotencyKey: 'idem_00000000-0000-4000-8000-000000000083',
      projectId: ids.project,
      learningSpecId: ids.learningSpec,
      expectedSessionRevision: 3,
      expectedSpecRevision: 1,
      draft: revisedDraft,
    })
    expect(stale).toMatchObject({ success: false, error: { code: 'DISCOVERY_SESSION_STALE' } })

    const confirmed = await service.executeUi({
      schemaVersion: 1,
      kind: 'UI_CONFIRM_LEARNING_SPEC',
      correlationId: ids.correlation,
      actor: { kind: 'UI' },
      idempotencyKey: 'idem_00000000-0000-4000-8000-000000000084',
      projectId: ids.project,
      learningSpecId: ids.learningSpec,
      expectedSpecRevision: 2,
    })
    expect(confirmed).toMatchObject({ success: true, data: { resourceRevision: 3 } })
    expect(storage.repository.recoverProject(ids.project)).toMatchObject({
      learningSpec: {
        revision: 3,
        status: 'CONFIRMED',
        productPurpose: revisedDraft.productPurpose,
        source: { kind: 'USER' },
      },
      activeTask: null,
    })
  })

  it('supersedes the draft and returns through a new Discovery session', async () => {
    const newSessionId = 'discovery_session_00000000-0000-4000-8000-000000000085'
    let generatedSequence = 90
    const { service, storage } = await createHarness({
      generateId: (prefix) => {
        if (prefix === 'discovery_session') return newSessionId
        generatedSequence += 1
        return `${prefix}_00000000-0000-4000-8000-${String(generatedSequence).padStart(12, '0')}`
      },
    })
    seedSpecReview(storage, true)

    const returned = await service.executeUi({
      schemaVersion: 1,
      kind: 'UI_RETURN_TO_DISCOVERY',
      correlationId: ids.correlation,
      actor: { kind: 'UI' },
      idempotencyKey: 'idem_00000000-0000-4000-8000-000000000086',
      projectId: ids.project,
      discoverySessionId: ids.discoverySession,
      expectedSessionRevision: 2,
      expectedSpecRevision: 1,
    })
    expect(returned).toMatchObject({ success: true, data: { resourceRevision: 1 } })

    expect(storage.repository.readDiscoveryAggregateBySession(ids.discoverySession)).toMatchObject({
      session: { revision: 2, status: 'SELECTED' },
      learningSpecs: [
        { revision: 1, status: 'DRAFT' },
        { revision: 2, status: 'SUPERSEDED' },
      ],
    })
    expect(storage.repository.readDiscoveryAggregateBySession(newSessionId)).toMatchObject({
      project: { status: 'DISCOVERY' },
      session: { revision: 1, status: 'ACTIVE', input: discoveryInputFixture },
    })
  })
})
