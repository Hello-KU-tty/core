import { mkdir, mkdtemp, stat, symlink } from 'node:fs/promises'
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
  preparedBuilderTaskDescriptorSchema,
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
  decisionResolutionFixture,
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

describe('T10 Builder Task and Live Context application flow', () => {
  it('prepares only a confirmed Spec, recovers pending work, and completes through current Context', async () => {
    let generatedSequence = 100
    const { service, storage, workspaceRoot } = await createHarness({
      generateId: (prefix) => {
        if (prefix === 'task') return ids.task
        generatedSequence += 1
        return `${prefix}_00000000-0000-4000-8000-${String(generatedSequence).padStart(12, '0')}`
      },
    })
    seedSpecReview(storage, true)

    const unconfirmed = await service.executeUi({
      schemaVersion: 1,
      kind: 'UI_PREPARE_BUILDER_TASK',
      correlationId: ids.correlation,
      actor: { kind: 'UI' },
      idempotencyKey: 'idem_00000000-0000-4000-8000-000000000101',
      projectId: ids.project,
      learningSpecId: ids.learningSpec,
      expectedSpecRevision: 1,
    })
    expect(unconfirmed).toMatchObject({
      success: false,
      error: { code: 'BUILDER_TASK_CONFIRMED_SPEC_REQUIRED' },
    })

    const confirmed = await service.executeUi({
      schemaVersion: 1,
      kind: 'UI_CONFIRM_LEARNING_SPEC',
      correlationId: ids.correlation,
      actor: { kind: 'UI' },
      idempotencyKey: 'idem_00000000-0000-4000-8000-000000000102',
      projectId: ids.project,
      learningSpecId: ids.learningSpec,
      expectedSpecRevision: 1,
    })
    expect(confirmed).toMatchObject({ success: true, data: { resourceRevision: 2 } })

    const prepareRequest = {
      schemaVersion: 1,
      kind: 'UI_PREPARE_BUILDER_TASK',
      correlationId: ids.correlation,
      actor: { kind: 'UI' },
      idempotencyKey: 'idem_00000000-0000-4000-8000-000000000103',
      projectId: ids.project,
      learningSpecId: ids.learningSpec,
      expectedSpecRevision: 2,
    } as const
    const prepared = await service.executeUi(prepareRequest)
    const replayed = await service.executeUi(prepareRequest)
    expect(replayed).toEqual(prepared)
    expect(prepared.success).toBe(true)
    if (!prepared.success) return
    const descriptor = preparedBuilderTaskDescriptorSchema.parse(prepared.data)
    expect(descriptor.workspacePath).toBe(`projects/${ids.project}`)
    expect(descriptor.task).toMatchObject({
      id: ids.task,
      status: 'PENDING',
      expectedConcepts: ['discriminated union'],
      excludedWork: ['Hosted sample storage'],
    })
    expect(descriptor.task.requirements).toContain(
      'Agent-supported implementation scope: Local application shell',
    )
    expect(descriptor.task.acceptanceCriteria.map((criterion) => criterion.key)).toEqual([
      'feature_01',
      'feature_02',
      'local_result',
      'tests_pass',
    ])
    expect((await stat(join(workspaceRoot, descriptor.workspacePath))).isDirectory()).toBe(true)
    expect(storage.repository.recoverProject(ids.project)).toMatchObject({
      activeTask: null,
      currentTask: { id: ids.task, status: 'PENDING' },
    })

    const duplicate = await service.executeUi({
      ...prepareRequest,
      idempotencyKey: 'idem_00000000-0000-4000-8000-000000000104',
    })
    expect(duplicate).toMatchObject({
      success: false,
      error: { code: 'BUILDER_TASK_ALREADY_PREPARED' },
    })

    const started = await service.executeAgent('BUILDER', {
      schemaVersion: 1,
      kind: 'BUILDER_START_TASK',
      correlationId: ids.correlation,
      actor: { kind: 'AGENT', role: 'BUILDER' },
      idempotencyKey: 'idem_00000000-0000-4000-8000-000000000105',
      projectId: ids.project,
      taskId: ids.task,
      expectedTaskRevision: 1,
    })
    expect(started).toMatchObject({ success: true, data: { resourceRevision: 2 } })

    const contextBase = {
      ...liveContextFixture,
      activeDecisionIds: [],
      relatedFiles: [],
      nextActions: ['Implement the validated MVP features.'],
    }
    const wrongFirst = await service.executeAgent('BUILDER', {
      schemaVersion: 1,
      kind: 'BUILDER_UPDATE_LIVE_CONTEXT',
      correlationId: ids.correlation,
      actor: { kind: 'AGENT', role: 'BUILDER' },
      idempotencyKey: 'idem_00000000-0000-4000-8000-000000000106',
      context: { ...contextBase, checkpoint: 'VALIDATION_STARTED' },
    })
    expect(wrongFirst).toMatchObject({
      success: false,
      error: { code: 'LIVE_CONTEXT_INITIAL_INVALID' },
    })

    const firstContext = { ...contextBase, checkpoint: 'TASK_STARTED' as const }
    expect(
      await service.executeAgent('BUILDER', {
        schemaVersion: 1,
        kind: 'BUILDER_UPDATE_LIVE_CONTEXT',
        correlationId: ids.correlation,
        actor: { kind: 'AGENT', role: 'BUILDER' },
        idempotencyKey: 'idem_00000000-0000-4000-8000-000000000107',
        context: firstContext,
      }),
    ).toMatchObject({ success: true, data: { resourceRevision: 1 } })

    const stale = await service.executeAgent('BUILDER', {
      schemaVersion: 1,
      kind: 'BUILDER_UPDATE_LIVE_CONTEXT',
      correlationId: ids.correlation,
      actor: { kind: 'AGENT', role: 'BUILDER' },
      idempotencyKey: 'idem_00000000-0000-4000-8000-000000000108',
      context: { ...firstContext, stage: 'Stale overwrite' },
    })
    expect(stale).toMatchObject({
      success: false,
      error: { category: 'STALE_CONTEXT', code: 'LIVE_CONTEXT_STALE' },
    })

    const validationContext = {
      ...firstContext,
      contextVersion: 2,
      expectedPreviousVersion: 1,
      checkpoint: 'VALIDATION_STARTED' as const,
      stage: 'Running tests',
    }
    expect(
      await service.executeAgent('BUILDER', {
        schemaVersion: 1,
        kind: 'BUILDER_UPDATE_LIVE_CONTEXT',
        correlationId: ids.correlation,
        actor: { kind: 'AGENT', role: 'BUILDER' },
        idempotencyKey: 'idem_00000000-0000-4000-8000-000000000109',
        context: validationContext,
      }),
    ).toMatchObject({ success: true, data: { resourceRevision: 2 } })
    expect(
      await service.executeAgent('HELPER', {
        schemaVersion: 1,
        kind: 'HELPER_GET_CONTEXT',
        correlationId: ids.correlation,
        actor: { kind: 'AGENT', role: 'HELPER' },
        projectId: ids.project,
        taskId: ids.task,
        question: 'What is happening now?',
        relatedConceptNames: [],
        observedContextVersion: 1,
      }),
    ).toMatchObject({
      success: true,
      data: {
        liveContext: { contextVersion: 2, stage: 'Running tests' },
        freshness: { currentContextVersion: 2, stale: true },
      },
    })

    const report = {
      schemaVersion: 1 as const,
      id: ids.completionReport,
      projectId: ids.project,
      taskId: ids.task,
      correlationId: ids.correlation,
      expectedTaskRevision: 2,
      implementedFeatures: ['Validated and rendered event variants.'],
      acceptanceResults: descriptor.task.acceptanceCriteria.map((criterion) => ({
        criterionKey: criterion.key,
        status: 'PASSED' as const,
        evidence: [],
      })),
      validationResults: [
        {
          name: 'generated project tests',
          status: 'PASSED' as const,
          summary: 'All tests passed.',
        },
      ],
      conceptUsage: [
        {
          conceptName: 'discriminated union',
          scope: 'LEARNER_FOCUS' as const,
          importance: 'CORE' as const,
          usageReason: 'The implementation narrows variants by a discriminant.',
          codeReferences: [],
        },
      ],
      appliedDecisionIds: [],
      codeReferences: [],
      diffReferences: [],
      specDeviations: [],
      remainingIssues: [],
      limitations: [],
      completedAt: timestamp,
      source: { kind: 'AGENT' as const, role: 'BUILDER' as const },
      redactionStatus: 'VERIFIED_REDACTED' as const,
    }
    expect(
      await service.executeAgent('BUILDER', {
        schemaVersion: 1,
        kind: 'BUILDER_COMPLETE_TASK',
        correlationId: ids.correlation,
        actor: { kind: 'AGENT', role: 'BUILDER' },
        idempotencyKey: 'idem_00000000-0000-4000-8000-000000000110',
        report,
      }),
    ).toMatchObject({ success: false, error: { code: 'TASK_COMPLETED_CONTEXT_REQUIRED' } })

    const completedContext = {
      ...validationContext,
      contextVersion: 3,
      expectedPreviousVersion: 2,
      checkpoint: 'TASK_COMPLETED' as const,
      stage: 'Completed',
      nextActions: ['Open the generated result.'],
    }
    expect(
      await service.executeAgent('BUILDER', {
        schemaVersion: 1,
        kind: 'BUILDER_UPDATE_LIVE_CONTEXT',
        correlationId: ids.correlation,
        actor: { kind: 'AGENT', role: 'BUILDER' },
        idempotencyKey: 'idem_00000000-0000-4000-8000-000000000111',
        context: completedContext,
      }),
    ).toMatchObject({ success: true, data: { resourceRevision: 3 } })
    expect(
      await service.executeAgent('BUILDER', {
        schemaVersion: 1,
        kind: 'BUILDER_COMPLETE_TASK',
        correlationId: ids.correlation,
        actor: { kind: 'AGENT', role: 'BUILDER' },
        idempotencyKey: 'idem_00000000-0000-4000-8000-000000000112',
        report,
      }),
    ).toMatchObject({ success: true, data: { resourceRevision: 3 } })
    expect(storage.repository.recoverProject(ids.project)).toMatchObject({
      project: { status: 'BUILDING' },
      activeTask: null,
      currentTask: null,
      liveContext: null,
    })
  })
})

describe('T11 Decision gate and Builder resume application flow', () => {
  const initialContext = {
    ...liveContextFixture,
    checkpoint: 'TASK_STARTED' as const,
    stage: 'Starting implementation',
    currentGoal: 'Implement the validated event parser.',
    recentChanges: [],
    activeDecisionIds: [],
    nextActions: ['Choose the unknown-field behavior when the parser reaches that boundary.'],
  }

  it('atomically blocks, hands off, resolves, resumes, applies, and completes a real Decision', async () => {
    let optionSequence = 0
    let generatedSequence = 200
    const { service, storage } = await createHarness({
      generateId: (prefix) => {
        if (prefix === 'decision') return ids.decision
        if (prefix === 'decision_option') {
          optionSequence += 1
          return optionSequence === 1 ? ids.optionA : ids.optionB
        }
        if (prefix === 'decision_application') return ids.decisionApplication
        generatedSequence += 1
        return `${prefix}_00000000-0000-4000-8000-${String(generatedSequence).padStart(12, '0')}`
      },
    })
    seedBuilderGraph(storage)
    storage.repository.appendLiveContext(initialContext)

    const requestDecision = {
      schemaVersion: 1,
      kind: 'BUILDER_REQUEST_DECISION',
      correlationId: ids.correlation,
      actor: { kind: 'AGENT', role: 'BUILDER' },
      idempotencyKey: 'idem_00000000-0000-4000-8000-000000000201',
      projectId: ids.project,
      taskId: ids.task,
      expectedTaskRevision: 1,
      expectedContextVersion: 1,
      decision: {
        category: 'DATA_MODEL',
        question: 'Should unknown fields be rejected or retained for inspection?',
        reasonRequiredNow: 'The parser result and UI behavior depend on this choice.',
        options: [
          {
            key: 'reject',
            label: 'Reject unknown fields',
            description: 'Keep the parser strict.',
            impacts: ['Typos fail at the input boundary.'],
            tradeoffs: ['Provider additions require a schema update.'],
          },
          {
            key: 'retain',
            label: 'Retain unknown fields',
            description: 'Expose unmodeled fields for inspection.',
            impacts: ['New provider fields remain visible.'],
            tradeoffs: ['Typos can be less obvious.'],
          },
        ],
        recommendedOptionKey: 'reject',
        recommendationRationale: 'Strict parsing catches invalid payloads at the boundary.',
        relatedConceptNames: ['runtime validation'],
        sourceReferences: [liveContextFixture.relatedFiles[0]],
        independentWorkCanContinue: false,
      },
      context: {
        stage: 'Waiting on parser behavior',
        currentGoal: 'Choose unknown-field behavior before implementing the parser branch.',
        recentChanges: ['Defined the known event variants.'],
        activeConceptNames: ['runtime validation'],
        relatedFiles: [liveContextFixture.relatedFiles[0]],
        nextActions: ['Apply the selected parser behavior.', 'Run parser tests.'],
        blockingReason: 'The parser branch depends on the user choice.',
      },
    } as const

    const requested = await service.executeAgent('BUILDER', requestDecision)
    const replayed = await service.executeAgent('BUILDER', requestDecision)
    expect(requested).toEqual(replayed)
    expect(requested).toMatchObject({
      success: true,
      data: { decisionId: ids.decision, resourceRevision: 2 },
    })
    expect(storage.repository.readBuilderTaskAggregate(ids.project, ids.task)).toMatchObject({
      task: { status: 'BLOCKED', revision: 2 },
      liveContext: {
        checkpoint: 'DECISION_REQUIRED',
        contextVersion: 2,
        activeDecisionIds: [ids.decision],
      },
      decisionRequests: [
        {
          id: ids.decision,
          recommendedOptionId: ids.optionA,
          source: { kind: 'AGENT', role: 'BUILDER' },
        },
      ],
    })

    expect(
      await service.executeUi({
        schemaVersion: 1,
        kind: 'UI_OPEN_HELPER',
        correlationId: ids.correlation,
        actor: { kind: 'UI' },
        projectId: ids.project,
        taskId: ids.task,
        question: 'Compare the parser options.',
      }),
    ).toMatchObject({
      success: true,
      data: { activeDecisions: [{ id: ids.decision }] },
    })

    const resolution = {
      ...decisionResolutionFixture,
      expectedContextVersion: 2,
    }
    expect(
      await service.executeUi({
        schemaVersion: 1,
        kind: 'UI_RESOLVE_DECISION',
        correlationId: ids.correlation,
        actor: { kind: 'UI' },
        idempotencyKey: 'idem_00000000-0000-4000-8000-000000000202',
        resolution,
      }),
    ).toMatchObject({ success: true, data: { resourceRevision: 3 } })
    expect(storage.repository.recoverProject(ids.project)).toMatchObject({
      activeTask: { status: 'ACTIVE', revision: 3 },
      pendingDecisions: [],
    })
    expect(
      await service.executeAgent('BUILDER', {
        schemaVersion: 1,
        kind: 'BUILDER_GET_DECISION_RESULT',
        correlationId: ids.correlation,
        actor: { kind: 'AGENT', role: 'BUILDER' },
        projectId: ids.project,
        taskId: ids.task,
        decisionId: ids.decision,
      }),
    ).toMatchObject({
      success: true,
      data: { resolution: { id: ids.resolution, helperUsed: true }, application: null },
    })

    const report = {
      schemaVersion: 1 as const,
      id: ids.completionReport,
      projectId: ids.project,
      taskId: ids.task,
      correlationId: ids.correlation,
      expectedTaskRevision: 3,
      implementedFeatures: ['Validated webhook variants with the selected strict behavior.'],
      acceptanceResults: [{ criterionKey: 'valid_event', status: 'PASSED' as const, evidence: [] }],
      validationResults: [
        { name: 'parser tests', status: 'PASSED' as const, summary: 'All tests passed.' },
      ],
      conceptUsage: [
        {
          conceptName: 'discriminated union',
          scope: 'LEARNER_FOCUS' as const,
          importance: 'CORE' as const,
          usageReason: 'The parser narrows each validated event variant.',
          codeReferences: [],
        },
      ],
      appliedDecisionIds: [ids.decision],
      codeReferences: [],
      diffReferences: [],
      specDeviations: [],
      remainingIssues: [],
      limitations: [],
      completedAt: timestamp,
      source: { kind: 'AGENT' as const, role: 'BUILDER' as const },
      redactionStatus: 'VERIFIED_REDACTED' as const,
    }
    expect(
      await service.executeAgent('BUILDER', {
        schemaVersion: 1,
        kind: 'BUILDER_COMPLETE_TASK',
        correlationId: ids.correlation,
        actor: { kind: 'AGENT', role: 'BUILDER' },
        idempotencyKey: 'idem_00000000-0000-4000-8000-000000000203',
        report,
      }),
    ).toMatchObject({ success: false, error: { code: 'TASK_DECISION_NOT_APPLIED' } })

    expect(
      await service.executeAgent('BUILDER', {
        schemaVersion: 1,
        kind: 'BUILDER_APPLY_DECISION',
        correlationId: ids.correlation,
        actor: { kind: 'AGENT', role: 'BUILDER' },
        idempotencyKey: 'idem_00000000-0000-4000-8000-000000000204',
        projectId: ids.project,
        taskId: ids.task,
        decisionId: ids.decision,
        expectedTaskRevision: 3,
        expectedContextVersion: 2,
        appliedResult: 'Rejected unknown fields at the parser boundary and added a failing case.',
        sourceReferences: [liveContextFixture.relatedFiles[0]],
        context: {
          stage: 'Applied strict parser behavior',
          currentGoal: 'Validate the selected behavior.',
          recentChanges: ['Implemented strict unknown-field rejection.'],
          activeConceptNames: ['runtime validation'],
          relatedFiles: [liveContextFixture.relatedFiles[0]],
          nextActions: ['Run parser tests.'],
        },
      }),
    ).toMatchObject({
      success: true,
      data: { decisionId: ids.decision, resourceRevision: 3 },
    })
    expect(storage.repository.readBuilderTaskAggregate(ids.project, ids.task)).toMatchObject({
      decisionApplications: [{ id: ids.decisionApplication, decisionId: ids.decision }],
      liveContext: { contextVersion: 3, activeDecisionIds: [] },
    })

    const completedContext = {
      ...initialContext,
      contextVersion: 4,
      expectedPreviousVersion: 3,
      checkpoint: 'TASK_COMPLETED' as const,
      stage: 'Completed',
      activeDecisionIds: [],
      recentChanges: ['Implemented and validated strict unknown-field rejection.'],
      nextActions: ['Open the generated result.'],
    }
    expect(
      await service.executeAgent('BUILDER', {
        schemaVersion: 1,
        kind: 'BUILDER_UPDATE_LIVE_CONTEXT',
        correlationId: ids.correlation,
        actor: { kind: 'AGENT', role: 'BUILDER' },
        idempotencyKey: 'idem_00000000-0000-4000-8000-000000000205',
        context: completedContext,
      }),
    ).toMatchObject({ success: true })
    expect(
      await service.executeAgent('BUILDER', {
        schemaVersion: 1,
        kind: 'BUILDER_COMPLETE_TASK',
        correlationId: ids.correlation,
        actor: { kind: 'AGENT', role: 'BUILDER' },
        idempotencyKey: 'idem_00000000-0000-4000-8000-000000000207',
        report: { ...report, appliedDecisionIds: [ids.decision, ids.decision] },
      }),
    ).toMatchObject({ success: false, error: { code: 'TASK_DECISION_NOT_APPLIED' } })
    expect(
      await service.executeAgent('BUILDER', {
        schemaVersion: 1,
        kind: 'BUILDER_COMPLETE_TASK',
        correlationId: ids.correlation,
        actor: { kind: 'AGENT', role: 'BUILDER' },
        idempotencyKey: 'idem_00000000-0000-4000-8000-000000000206',
        report,
      }),
    ).toMatchObject({ success: true, data: { resourceRevision: 4 } })
  })

  it('keeps the Task active when independent work can continue', async () => {
    let optionSequence = 0
    let generatedSequence = 220
    const { service, storage } = await createHarness({
      generateId: (prefix) => {
        if (prefix === 'decision') return ids.decision
        if (prefix === 'decision_option') {
          optionSequence += 1
          return optionSequence === 1 ? ids.optionA : ids.optionB
        }
        generatedSequence += 1
        return `${prefix}_00000000-0000-4000-8000-${String(generatedSequence).padStart(12, '0')}`
      },
    })
    seedBuilderGraph(storage)
    storage.repository.appendLiveContext(initialContext)

    expect(
      await service.executeAgent('BUILDER', {
        schemaVersion: 1,
        kind: 'BUILDER_REQUEST_DECISION',
        correlationId: ids.correlation,
        actor: { kind: 'AGENT', role: 'BUILDER' },
        idempotencyKey: 'idem_00000000-0000-4000-8000-000000000221',
        projectId: ids.project,
        taskId: ids.task,
        expectedTaskRevision: 1,
        expectedContextVersion: 1,
        decision: {
          category: 'PRODUCT_BEHAVIOR',
          question: 'Should invalid examples remain visible after a successful parse?',
          reasonRequiredNow: 'The result presentation depends on this behavior.',
          options: [
            {
              key: 'hide',
              label: 'Hide invalid examples',
              description: 'Show only the latest valid result.',
              impacts: ['The result stays concise.'],
              tradeoffs: ['Debugging history is unavailable.'],
            },
            {
              key: 'retain',
              label: 'Retain invalid examples',
              description: 'Keep a local debugging history.',
              impacts: ['Users can compare failures.'],
              tradeoffs: ['The result view is denser.'],
            },
          ],
          recommendedOptionKey: 'retain',
          recommendationRationale: 'Visible failures support the local debugging goal.',
          relatedConceptNames: ['result state'],
          sourceReferences: [],
          independentWorkCanContinue: true,
        },
        context: {
          stage: 'Continuing independent parser work',
          currentGoal: 'Finish parser validation while result behavior is pending.',
          recentChanges: ['Identified a presentation Decision.'],
          activeConceptNames: ['result state'],
          relatedFiles: [],
          nextActions: ['Finish parser tests independently.'],
        },
      }),
    ).toMatchObject({ success: true, data: { resourceRevision: 1 } })
    expect(storage.repository.recoverProject(ids.project)).toMatchObject({
      activeTask: { status: 'ACTIVE', revision: 1 },
      pendingDecisions: [{ id: ids.decision, independentWorkCanContinue: true }],
    })
    expect(
      await service.executeAgent('BUILDER', {
        schemaVersion: 1,
        kind: 'BUILDER_UPDATE_LIVE_CONTEXT',
        correlationId: ids.correlation,
        actor: { kind: 'AGENT', role: 'BUILDER' },
        idempotencyKey: 'idem_00000000-0000-4000-8000-000000000222',
        context: {
          ...initialContext,
          contextVersion: 3,
          expectedPreviousVersion: 2,
          checkpoint: 'CONCEPT_INTRODUCED',
          stage: 'Testing independent parser work',
          activeDecisionIds: [ids.decision],
          nextActions: ['Run parser tests while result behavior remains pending.'],
        },
      }),
    ).toMatchObject({ success: true, data: { resourceRevision: 3 } })
  })
})
