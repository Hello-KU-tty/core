import { mkdir, mkdtemp, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  type ApplicationError,
  ApplicationService,
  WorkspacePathPolicy,
} from '@vibe-helper/application'
import {
  builderTaskSchema,
  analysisJobSchema,
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
  analysisJobFixture,
  analysisJobPendingFixture,
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
  options: { readonly generateId?: (prefix: string) => string; readonly now?: () => Date } = {},
) => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'vibe-helper-application-workspaces-'))
  const storage = await openInMemorySqliteStorage()
  const workspacePolicy = await WorkspacePathPolicy.create(workspaceRoot)
  const service = new ApplicationService({
    storage,
    workspacePolicy,
    now: options.now ?? (() => new Date(timestamp)),
    generateId: options.generateId ?? fixedIdGenerator,
  })
  return { service, storage, workspaceRoot, workspacePolicy }
}

const previewRoundId = 'candidate_preview_round_00000000-0000-4000-8000-000000000501'
const previewFinalRoundId = 'candidate_round_00000000-0000-4000-8000-000000000502'
const previewCandidateId = (position: number): string =>
  `candidate_00000000-0000-4000-8000-${String(510 + position).padStart(12, '0')}`
const previewFor = (position: number) => ({
  candidateId: previewCandidateId(position),
  position,
  title: `Preview ${String(position)}`,
  summary: `Distinct project direction ${String(position)} for the learning goal.`,
  coreInteraction: `Complete interaction ${String(position)} and inspect its typed result.`,
  appeal: `Direction ${String(position)} makes an invisible concept tangible.`,
  technologyNecessity: `The target technology controls interaction ${String(position)}.`,
  generationTags: ['DIRECT'] as const,
})

const enrichmentFor = (position: number) => {
  const preview = previewFor(position)
  return {
    schemaVersion: 1 as const,
    previewRoundId,
    discoverySessionId: ids.discoverySession,
    correlationId: ids.correlation,
    candidate: {
      schemaVersion: 1 as const,
      id: preview.candidateId,
      discoverySessionId: ids.discoverySession,
      correlationId: ids.correlation,
      revision: 1,
      parentRevisions: [],
      title: preview.title,
      summary: preview.summary,
      targetUsers: [`Learner ${String(position)}`],
      coreInteraction: preview.coreInteraction,
      usageMoment: `While practicing direction ${String(position)}.`,
      appeal: preview.appeal,
      technologyNecessity: preview.technologyNecessity,
      coreConcepts: ['runtime validation', `concept ${String(position)}`],
      mvpFeatures: ['Enter one example', 'Inspect one result'],
      suggestedScope: {
        learnerFocus: ['Model the core state'],
        agentSupport: ['Prepare the local shell'],
        excluded: ['Cloud sync'],
      },
      generationTags: preview.generationTags,
      createdAt: timestamp,
      source: { kind: 'AGENT' as const, role: 'DISCOVERY' as const },
      redactionStatus: 'NOT_REQUIRED' as const,
    },
    createdAt: timestamp,
    source: { kind: 'AGENT' as const, role: 'DISCOVERY' as const },
    redactionStatus: 'NOT_REQUIRED' as const,
  }
}

const previewCommand = {
  schemaVersion: 1 as const,
  kind: 'DISCOVERY_SUBMIT_CANDIDATE_PREVIEWS' as const,
  correlationId: ids.correlation,
  actor: { kind: 'AGENT' as const, role: 'DISCOVERY' as const },
  idempotencyKey: 'idem_00000000-0000-4000-8000-000000000501',
  expectedSessionRevision: 1,
  previewRound: {
    schemaVersion: 1 as const,
    id: previewRoundId,
    finalRoundId: previewFinalRoundId,
    discoverySessionId: ids.discoverySession,
    correlationId: ids.correlation,
    inputSnapshot: discoveryInputFixture,
    previews: Array.from({ length: 10 }, (_, index) => previewFor(index + 1)),
    generationRationale: 'Ten distinct interaction directions were selected before enrichment.',
    createdAt: timestamp,
    source: { kind: 'AGENT' as const, role: 'DISCOVERY' as const },
    redactionStatus: 'NOT_REQUIRED' as const,
  },
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
  it('keeps preview identity durable and materializes the full Candidate Round only after both enrichment batches', async () => {
    const { service, storage } = await createHarness()
    storage.transaction((repository) => {
      repository.appendProject(
        projectSchema.parse({
          ...projectFixture,
          status: 'DISCOVERY',
          generatedWorkspacePath: undefined,
        }),
      )
      repository.appendDiscoverySession(discoverySessionSchema.parse(discoverySessionFixture))
    })

    await expect(service.executeAgent('DISCOVERY', previewCommand)).resolves.toMatchObject({
      success: true,
      data: { resourceRevision: 1 },
    })
    expect(storage.repository.readDiscoveryAggregate(ids.project)).toMatchObject({
      session: { revision: 1 },
      previewRound: {
        id: previewRoundId,
        previews: expect.arrayContaining([expect.objectContaining({ position: 10 })]),
      },
      candidateEnrichments: [],
      candidates: [],
      rounds: [],
    })

    const submitBatch = (batch: 'FIRST' | 'SECOND', start: number, idempotencyKey: string) =>
      service.executeAgent('DISCOVERY', {
        schemaVersion: 1,
        kind: 'DISCOVERY_SUBMIT_CANDIDATE_ENRICHMENTS',
        correlationId: ids.correlation,
        actor: { kind: 'AGENT', role: 'DISCOVERY' },
        idempotencyKey,
        expectedSessionRevision: 1,
        previewRoundId,
        batch,
        enrichments: Array.from({ length: 5 }, (_, index) => enrichmentFor(start + index)),
      })

    await expect(
      submitBatch('FIRST', 1, 'idem_00000000-0000-4000-8000-000000000502'),
    ).resolves.toMatchObject({ success: true, data: { resourceRevision: 1 } })
    expect(storage.repository.readDiscoveryAggregate(ids.project)).toMatchObject({
      session: { revision: 1 },
      candidateEnrichments: expect.arrayContaining([
        expect.objectContaining({
          candidate: expect.objectContaining({ id: previewCandidateId(1) }),
        }),
      ]),
      candidates: [],
      rounds: [],
    })

    await expect(
      submitBatch('SECOND', 6, 'idem_00000000-0000-4000-8000-000000000503'),
    ).resolves.toMatchObject({ success: true, data: { resourceRevision: 2 } })
    const completed = storage.repository.readDiscoveryAggregate(ids.project)
    expect(completed).toMatchObject({
      session: { revision: 2 },
      previewRound: { id: previewRoundId },
      candidateEnrichments: expect.arrayContaining([
        expect.objectContaining({
          candidate: expect.objectContaining({ id: previewCandidateId(10) }),
        }),
      ]),
      rounds: [
        {
          id: previewFinalRoundId,
          roundIndex: 1,
          candidates: expect.arrayContaining([
            expect.objectContaining({ candidateId: previewCandidateId(1), revision: 1 }),
            expect.objectContaining({ candidateId: previewCandidateId(10), revision: 1 }),
          ]),
        },
      ],
    })
    expect(completed?.candidateEnrichments).toHaveLength(10)
    expect(completed?.candidates).toHaveLength(10)
    expect(completed?.rounds[0]?.candidates).toHaveLength(10)
  })

  it('keeps the atomic Candidate Round fallback available after previews and rejects late enrichment', async () => {
    const { service, storage } = await createHarness()
    storage.transaction((repository) => {
      repository.appendProject(
        projectSchema.parse({
          ...projectFixture,
          status: 'DISCOVERY',
          generatedWorkspacePath: undefined,
        }),
      )
      repository.appendDiscoverySession(discoverySessionSchema.parse(discoverySessionFixture))
    })
    await service.executeAgent('DISCOVERY', previewCommand)

    await expect(
      service.executeAgent('DISCOVERY', {
        schemaVersion: 1,
        kind: 'DISCOVERY_SUBMIT_CANDIDATE_ROUND',
        correlationId: ids.correlation,
        actor: { kind: 'AGENT', role: 'DISCOVERY' },
        idempotencyKey: 'idem_00000000-0000-4000-8000-000000000504',
        expectedSessionRevision: 1,
        round: candidateRoundFixture,
        candidates: [candidateFixture],
      }),
    ).resolves.toMatchObject({ success: true, data: { resourceRevision: 2 } })

    await expect(
      service.executeAgent('DISCOVERY', {
        schemaVersion: 1,
        kind: 'DISCOVERY_SUBMIT_CANDIDATE_ENRICHMENTS',
        correlationId: ids.correlation,
        actor: { kind: 'AGENT', role: 'DISCOVERY' },
        idempotencyKey: 'idem_00000000-0000-4000-8000-000000000505',
        expectedSessionRevision: 1,
        previewRoundId,
        batch: 'FIRST',
        enrichments: Array.from({ length: 5 }, (_, index) => enrichmentFor(index + 1)),
      }),
    ).resolves.toMatchObject({
      success: false,
      error: { code: 'DISCOVERY_SESSION_STALE', category: 'STALE_CONTEXT' },
    })
    expect(storage.repository.readDiscoveryAggregate(ids.project)).toMatchObject({
      session: { revision: 2 },
      previewRound: { id: previewRoundId },
      candidateEnrichments: [],
      rounds: [{ id: candidateRoundFixture.id }],
      candidates: [{ id: candidateFixture.id }],
    })
  })

  it('materializes only selected previews and applies feedback without waiting for background enrichment', async () => {
    const { service, storage } = await createHarness()
    storage.transaction((repository) => {
      repository.appendProject(
        projectSchema.parse({
          ...projectFixture,
          status: 'DISCOVERY',
          generatedWorkspacePath: undefined,
        }),
      )
      repository.appendDiscoverySession(discoverySessionSchema.parse(discoverySessionFixture))
    })
    await service.executeAgent('DISCOVERY', previewCommand)

    await expect(
      service.executeAgent('DISCOVERY', {
        schemaVersion: 1,
        kind: 'DISCOVERY_SUBMIT_CANDIDATE_ENRICHMENTS',
        correlationId: ids.correlation,
        actor: { kind: 'AGENT', role: 'DISCOVERY' },
        idempotencyKey: 'idem_00000000-0000-4000-8000-000000000506',
        expectedSessionRevision: 1,
        previewRoundId,
        batch: 'SELECTED',
        enrichments: [enrichmentFor(3)],
      }),
    ).resolves.toMatchObject({ success: true, data: { resourceRevision: 1 } })

    await expect(
      service.executeUi({
        schemaVersion: 1,
        kind: 'UI_RECORD_DISCOVERY_FEEDBACK',
        correlationId: ids.correlation,
        actor: { kind: 'UI' },
        idempotencyKey: 'idem_00000000-0000-4000-8000-000000000507',
        expectedSessionRevision: 1,
        feedback: {
          schemaVersion: 1,
          id: 'feedback_00000000-0000-4000-8000-000000000507',
          discoverySessionId: ids.discoverySession,
          roundId: previewFinalRoundId,
          correlationId: ids.correlation,
          intent: 'SELECT',
          targets: [{ candidateId: previewCandidateId(3), revision: 1 }],
          createdAt: timestamp,
          source: { kind: 'USER' },
          redactionStatus: 'NOT_REQUIRED',
        },
      }),
    ).resolves.toMatchObject({ success: true, data: { resourceRevision: 2 } })

    const selected = storage.repository.readDiscoveryAggregate(ids.project)
    expect(selected).toMatchObject({
      project: { status: 'SPEC_REVIEW' },
      session: { status: 'SELECTED', revision: 2 },
      rounds: [
        {
          id: previewFinalRoundId,
          candidates: [{ candidateId: previewCandidateId(3), revision: 1 }],
        },
      ],
      candidates: [{ id: previewCandidateId(3), revision: 1 }],
    })
    expect(selected?.candidateEnrichments).toHaveLength(1)

    await expect(
      service.executeAgent('DISCOVERY', {
        schemaVersion: 1,
        kind: 'DISCOVERY_SUBMIT_CANDIDATE_ENRICHMENTS',
        correlationId: ids.correlation,
        actor: { kind: 'AGENT', role: 'DISCOVERY' },
        idempotencyKey: 'idem_00000000-0000-4000-8000-000000000508',
        expectedSessionRevision: 1,
        previewRoundId,
        batch: 'FIRST',
        enrichments: Array.from({ length: 5 }, (_, index) => enrichmentFor(index + 1)),
      }),
    ).resolves.toMatchObject({
      success: false,
      error: { code: 'DISCOVERY_SESSION_STALE', category: 'STALE_CONTEXT' },
    })
  })

  it('lists durable Project History and restores the current session read model', async () => {
    const { service, storage } = await createHarness()
    seedBuilderGraph(storage)
    storage.transaction((repository) => {
      repository.appendLiveContext(liveContextFixture)
      repository.appendDecisionRequest(decisionRequestFixture)
    })

    const exchange = await service.executeUi({
      schemaVersion: 1,
      kind: 'UI_RECORD_HELPER_EXCHANGE',
      correlationId: ids.correlation,
      actor: { kind: 'UI' },
      idempotencyKey: 'idem_00000000-0000-4000-8000-000000000401',
      projectId: ids.project,
      taskId: ids.task,
      decisionId: ids.decision,
      conversationId: ids.conversation,
      userMessage: 'token=synthetic-secret should be redacted before recovery.',
      helperResponseSummary: 'Compared strict and permissive runtime validation.',
      closeConversation: false,
    })
    expect(exchange).toMatchObject({ success: true, data: { status: 'OPEN' } })

    const history = await service.executeUi({
      schemaVersion: 1,
      kind: 'UI_LIST_PROJECTS',
      correlationId: ids.correlation,
      actor: { kind: 'UI' },
      limit: 25,
    })
    expect(history).toMatchObject({
      success: true,
      data: {
        projects: [
          {
            project: { id: ids.project, status: 'BUILDING' },
            suggestedSurface: 'BUILD',
            activeTask: { id: ids.task, status: 'ACTIVE' },
            pendingDecisionCount: 1,
            currentContextVersion: 1,
            helperConversationCount: 1,
          },
        ],
      },
    })

    const restored = await service.executeUi({
      schemaVersion: 1,
      kind: 'UI_RESTORE_PROJECT_SESSION',
      correlationId: ids.correlation,
      actor: { kind: 'UI' },
      projectId: ids.project,
      helperConversationLimit: 10,
    })
    expect(restored).toMatchObject({
      success: true,
      data: {
        project: { id: ids.project },
        suggestedSurface: 'BUILD',
        activeTask: { id: ids.task },
        currentTask: { id: ids.task },
        liveContext: { id: ids.context, contextVersion: 1 },
        pendingDecisions: [{ id: ids.decision }],
        helperConversations: [
          {
            conversationId: ids.conversation,
            status: 'OPEN',
            redactedUserExcerpts: ['token=[REDACTED] should be redacted before recovery.'],
            helperResponseSummaries: ['Compared strict and permissive runtime validation.'],
          },
        ],
      },
    })
    expect(JSON.stringify(restored)).not.toContain('synthetic-secret')
  })

  it('returns the canonical Builder workspace only for an available matching Task', async () => {
    const { service, storage, workspacePolicy } = await createHarness()
    seedBuilderGraph(storage)

    await expect(
      service.executeUi({
        schemaVersion: 1,
        kind: 'UI_PREPARE_BUILDER_SESSION',
        correlationId: ids.correlation,
        actor: { kind: 'UI' },
        projectId: ids.project,
        taskId: ids.task,
      }),
    ).resolves.toEqual({
      success: true,
      data: {
        schemaVersion: 1,
        correlationId: ids.correlation,
        projectId: ids.project,
        taskId: ids.task,
        workspaceDirectory: join(workspacePolicy.generatedWorkspaceRoot, 'generated/webhook-lens'),
        status: 'READY',
      },
    })

    await expect(
      service.executeUi({
        schemaVersion: 1,
        kind: 'UI_PREPARE_BUILDER_SESSION',
        correlationId: ids.correlation,
        actor: { kind: 'UI' },
        projectId: ids.project,
        taskId: 'task_00000000-0000-4000-8000-999999999999',
      }),
    ).resolves.toMatchObject({
      success: false,
      error: { code: 'BUILDER_TASK_NOT_FOUND' },
    })

    storage.repository.appendTask(
      builderTaskSchema.parse({
        ...builderTaskFixture,
        revision: 2,
        status: 'COMPLETED',
      }),
    )
    await expect(
      service.executeUi({
        schemaVersion: 1,
        kind: 'UI_PREPARE_BUILDER_SESSION',
        correlationId: ids.correlation,
        actor: { kind: 'UI' },
        projectId: ids.project,
        taskId: ids.task,
      }),
    ).resolves.toMatchObject({
      success: false,
      error: { code: 'BUILDER_SESSION_NOT_AVAILABLE' },
    })
  })

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

  it('persists a missing Context refresh request and fulfills it on the next Builder Context', async () => {
    const { service, storage } = await createHarness()
    seedBuilderGraph(storage)

    await expect(
      service.executeAgent('HELPER', {
        schemaVersion: 1,
        kind: 'HELPER_GET_CONTEXT',
        correlationId: ids.correlation,
        actor: { kind: 'AGENT', role: 'HELPER' },
        projectId: ids.project,
        taskId: ids.task,
        question: 'What is happening now?',
        relatedConceptNames: [],
      }),
    ).resolves.toMatchObject({
      success: true,
      data: {
        relevantLedgerEntries: [],
        freshness: {
          currentContextVersion: null,
          status: 'MISSING',
          stale: true,
          refreshRequired: true,
        },
      },
    })

    const refreshCommand = {
      schemaVersion: 1,
      kind: 'HELPER_REQUEST_CONTEXT_REFRESH',
      correlationId: ids.correlation,
      actor: { kind: 'AGENT', role: 'HELPER' },
      idempotencyKey: 'idem_00000000-0000-4000-8000-000000000201',
      projectId: ids.project,
      taskId: ids.task,
      reason: 'Context is missing; apiKey=do-not-store from /Users/example/private.',
    } as const
    const firstRefresh = await service.executeAgent('HELPER', refreshCommand)
    expect(await service.executeAgent('HELPER', refreshCommand)).toEqual(firstRefresh)
    expect(firstRefresh).toMatchObject({ success: true, data: { resourceRevision: 1 } })

    const pending = storage.repository.readBuilderTaskAggregate(ids.project, ids.task)
      ?.contextRefreshRequests[0]
    expect(pending).toMatchObject({ status: 'PENDING', revision: 1 })
    expect(pending?.reason).toContain('[REDACTED]')
    expect(pending?.reason).not.toContain('do-not-store')
    expect(pending?.reason).not.toContain('/Users/example')
    await expect(
      service.executeAgent('BUILDER', {
        schemaVersion: 1,
        kind: 'BUILDER_GET_TASK',
        correlationId: ids.correlation,
        actor: { kind: 'AGENT', role: 'BUILDER' },
        projectId: ids.project,
        taskId: ids.task,
      }),
    ).resolves.toMatchObject({
      success: true,
      data: { pendingContextRefreshRequests: [{ status: 'PENDING' }] },
    })

    const firstContext = {
      ...liveContextFixture,
      checkpoint: 'TASK_STARTED' as const,
      activeDecisionIds: [],
      blockingReason: undefined,
    }
    await expect(
      service.executeAgent('BUILDER', {
        schemaVersion: 1,
        kind: 'BUILDER_UPDATE_LIVE_CONTEXT',
        correlationId: ids.correlation,
        actor: { kind: 'AGENT', role: 'BUILDER' },
        idempotencyKey: 'idem_00000000-0000-4000-8000-000000000202',
        context: firstContext,
      }),
    ).resolves.toMatchObject({ success: true })

    expect(
      storage.repository.readBuilderTaskAggregate(ids.project, ids.task)?.contextRefreshRequests,
    ).toEqual([
      expect.objectContaining({
        id: pending?.id,
        revision: 2,
        status: 'FULFILLED',
        fulfilledByContextVersion: 1,
      }),
    ])
  })

  it('assembles focused, redacted Helper context and remains available after Task completion', async () => {
    const { service, storage, workspaceRoot } = await createHarness()
    seedBuilderGraph(storage)
    const sourceDirectory = join(
      workspaceRoot,
      ...projectFixture.generatedWorkspacePath.split('/'),
      'src',
    )
    await mkdir(sourceDirectory, { recursive: true })
    await writeFile(
      join(sourceDirectory, 'events.ts'),
      'const apiKey = "do-not-expose";\nexport const config = { "clientSecret": "do-not-expose-json" };\nexport const rejectUnknown = true;\n',
      'utf8',
    )
    storage.transaction((repository) => {
      repository.appendLiveContext(liveContextFixture)
      repository.appendDecisionRequest(decisionRequestSchema.parse(decisionRequestFixture))
      repository.appendActivityEvent(activityEventSchema.parse(activityEventFixture))
      repository.appendEpisode(episodeSchema.parse(episodeFixture))
      repository.appendAnalysisJob(analysisJobSchema.parse(analysisJobPendingFixture))
      repository.appendAnalysisJob(analysisJobSchema.parse(analysisJobFixture))
      repository.appendCanonicalConcept(canonicalConceptSchema.parse(canonicalConceptFixture))
    })
    await expect(
      service.executeAgent('EVIDENCE_ANALYST', {
        schemaVersion: 1,
        kind: 'ANALYST_SUBMIT_EVIDENCE_PROPOSALS',
        correlationId: ids.correlation,
        actor: { kind: 'AGENT', role: 'EVIDENCE_ANALYST' },
        idempotencyKey: 'idem_00000000-0000-4000-8000-000000000203',
        analysisJobId: ids.analysisJob,
        expectedJobRevision: 2,
        attempt: 1,
        batch: evidenceProposalBatchFixture,
      }),
    ).resolves.toMatchObject({ success: true })

    await expect(
      service.executeAgent('HELPER', {
        schemaVersion: 1,
        kind: 'HELPER_GET_CONTEXT',
        correlationId: ids.correlation,
        actor: { kind: 'AGENT', role: 'HELPER' },
        projectId: ids.project,
        taskId: ids.task,
        decisionId: ids.decision,
        question: 'How does runtime validation affect this Decision?',
        relatedConceptNames: ['runtime validation'],
        observedContextVersion: 1,
      }),
    ).resolves.toMatchObject({
      success: true,
      data: {
        focusedDecision: { id: ids.decision },
        relevantLedgerEntries: [{ state: { state: 'DEMONSTRATED' } }],
        recentEpisodes: [
          {
            episodeId: ids.episode,
            redactedUserExcerpts: ['Rejecting unknown fields should catch typos at the boundary.'],
          },
        ],
        sourceExcerpts: [
          {
            reference: { kind: 'CODE', path: 'src/events.ts' },
            redactionStatus: 'VERIFIED_REDACTED',
          },
        ],
        referenceDetails: [{ availability: 'EXCERPT_INCLUDED' }],
        freshness: { status: 'CURRENT', refreshRequired: false },
      },
    })
    const helper = await service.executeAgent('HELPER', {
      schemaVersion: 1,
      kind: 'HELPER_GET_CONTEXT',
      correlationId: ids.correlation,
      actor: { kind: 'AGENT', role: 'HELPER' },
      projectId: ids.project,
      taskId: ids.task,
      question: 'Show the current code.',
      relatedConceptNames: [],
    })
    expect(helper.success && helper.data).toMatchObject({
      sourceExcerpts: [
        expect.objectContaining({ redactedExcerpt: expect.stringContaining('[REDACTED]') }),
      ],
    })
    expect(JSON.stringify(helper)).not.toContain('do-not-expose')
    expect(JSON.stringify(helper)).not.toContain('do-not-expose-json')

    storage.transaction((repository) => {
      repository.appendTask(
        builderTaskSchema.parse({
          ...builderTaskFixture,
          revision: 2,
          status: 'COMPLETED',
        }),
      )
    })
    await expect(
      service.executeAgent('HELPER', {
        schemaVersion: 1,
        kind: 'HELPER_GET_CONTEXT',
        correlationId: ids.correlation,
        actor: { kind: 'AGENT', role: 'HELPER' },
        projectId: ids.project,
        question: 'Can I still ask about the completed Task?',
        relatedConceptNames: ['runtime validation'],
      }),
    ).resolves.toMatchObject({ success: true, data: { task: { status: 'COMPLETED' } } })
  })

  it('applies Analyst proposals through deterministic Evidence reducers and replays the result', async () => {
    const { service, storage } = await createHarness()
    seedBuilderGraph(storage)
    storage.transaction((repository) => {
      repository.appendDecisionRequest(decisionRequestSchema.parse(decisionRequestFixture))
      repository.appendActivityEvent(activityEventSchema.parse(activityEventFixture))
      repository.appendEpisode(episodeSchema.parse(episodeFixture))
      repository.appendAnalysisJob(analysisJobSchema.parse(analysisJobPendingFixture))
      repository.appendAnalysisJob(analysisJobSchema.parse(analysisJobFixture))
      repository.appendCanonicalConcept(canonicalConceptSchema.parse(canonicalConceptFixture))
    })
    const request = {
      schemaVersion: 1,
      kind: 'ANALYST_SUBMIT_EVIDENCE_PROPOSALS',
      correlationId: ids.correlation,
      actor: { kind: 'AGENT', role: 'EVIDENCE_ANALYST' },
      idempotencyKey: ids.idempotency,
      analysisJobId: ids.analysisJob,
      expectedJobRevision: 2,
      attempt: 1,
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

  it('adds MORE Candidates while preserving every current Candidate reference', async () => {
    const { service, storage } = await createHarness()
    const addedCandidateId = 'candidate_00000000-0000-4000-8000-000000000073'
    const moreFeedbackId = 'feedback_00000000-0000-4000-8000-000000000074'
    const nextRoundId = 'candidate_round_00000000-0000-4000-8000-000000000075'
    storage.transaction((repository) => {
      repository.appendProject(
        projectSchema.parse({
          ...projectFixture,
          status: 'DISCOVERY',
          generatedWorkspacePath: undefined,
        }),
      )
      repository.appendDiscoverySession(discoverySessionSchema.parse(discoverySessionFixture))
    })

    await expect(
      service.executeAgent('DISCOVERY', {
        schemaVersion: 1,
        kind: 'DISCOVERY_SUBMIT_CANDIDATE_ROUND',
        correlationId: ids.correlation,
        actor: { kind: 'AGENT', role: 'DISCOVERY' },
        idempotencyKey: 'idem_00000000-0000-4000-8000-000000000073',
        expectedSessionRevision: 1,
        round: candidateRoundFixture,
        candidates: [candidateFixture],
      }),
    ).resolves.toMatchObject({ success: true, data: { resourceRevision: 2 } })

    await expect(
      service.executeUi({
        schemaVersion: 1,
        kind: 'UI_RECORD_DISCOVERY_FEEDBACK',
        correlationId: ids.correlation,
        actor: { kind: 'UI' },
        idempotencyKey: 'idem_00000000-0000-4000-8000-000000000074',
        expectedSessionRevision: 2,
        feedback: {
          ...discoveryFeedbackFixture,
          id: moreFeedbackId,
          intent: 'MORE',
          targets: [],
          message: 'Keep this Candidate and add distinct directions.',
        },
      }),
    ).resolves.toMatchObject({ success: true, data: { resourceRevision: 3 } })

    const addedCandidate = {
      ...candidateFixture,
      id: addedCandidateId,
      title: 'Typed Event Route Map',
      coreInteraction: 'Route variant-shaped events and inspect the safe branch selected for each.',
    }
    const added = await service.executeAgent('DISCOVERY', {
      schemaVersion: 1,
      kind: 'DISCOVERY_SUBMIT_CANDIDATE_ROUND',
      correlationId: ids.correlation,
      actor: { kind: 'AGENT', role: 'DISCOVERY' },
      idempotencyKey: 'idem_00000000-0000-4000-8000-000000000075',
      expectedSessionRevision: 3,
      round: {
        ...candidateRoundFixture,
        id: nextRoundId,
        roundIndex: 2,
        appliedFeedbackIds: [moreFeedbackId],
        candidates: [
          { candidateId: ids.candidate, revision: 1 },
          { candidateId: addedCandidateId, revision: 1 },
        ],
      },
      candidates: [addedCandidate],
    })

    expect(added).toMatchObject({ success: true, data: { resourceRevision: 4 } })
    expect(storage.repository.readDiscoveryAggregate(ids.project)).toMatchObject({
      rounds: [
        { roundIndex: 1 },
        {
          roundIndex: 2,
          appliedFeedbackIds: [moreFeedbackId],
          candidates: [
            { candidateId: ids.candidate, revision: 1 },
            { candidateId: addedCandidateId, revision: 1 },
          ],
        },
      ],
    })
  })

  it('narrows a MERGE Round to the merged result while preserving prior Candidates in history', async () => {
    const { service, storage } = await createHarness()
    const secondCandidateId = 'candidate_00000000-0000-4000-8000-000000000076'
    const thirdCandidateId = 'candidate_00000000-0000-4000-8000-000000000077'
    const fourthCandidateId = 'candidate_00000000-0000-4000-8000-000000000078'
    const mergeFeedbackId = 'feedback_00000000-0000-4000-8000-000000000079'
    const narrowRoundId = 'candidate_round_00000000-0000-4000-8000-000000000080'
    const secondCandidate = {
      ...candidateFixture,
      id: secondCandidateId,
      title: 'Scheduled Digest Worker',
    }
    const thirdCandidate = {
      ...candidateFixture,
      id: thirdCandidateId,
      title: 'Shared Resource Booking',
    }
    const fourthCandidate = {
      ...candidateFixture,
      id: fourthCandidateId,
      title: 'Monthly Spending Report',
    }
    storage.transaction((repository) => {
      repository.appendProject(
        projectSchema.parse({
          ...projectFixture,
          status: 'DISCOVERY',
          generatedWorkspacePath: undefined,
        }),
      )
      repository.appendDiscoverySession(discoverySessionSchema.parse(discoverySessionFixture))
    })

    await expect(
      service.executeAgent('DISCOVERY', {
        schemaVersion: 1,
        kind: 'DISCOVERY_SUBMIT_CANDIDATE_ROUND',
        correlationId: ids.correlation,
        actor: { kind: 'AGENT', role: 'DISCOVERY' },
        idempotencyKey: 'idem_00000000-0000-4000-8000-000000000076',
        expectedSessionRevision: 1,
        round: {
          ...candidateRoundFixture,
          candidates: [candidateFixture, secondCandidate, thirdCandidate, fourthCandidate].map(
            (candidate) => ({ candidateId: candidate.id, revision: 1 }),
          ),
        },
        candidates: [candidateFixture, secondCandidate, thirdCandidate, fourthCandidate],
      }),
    ).resolves.toMatchObject({ success: true, data: { resourceRevision: 2 } })

    await expect(
      service.executeUi({
        schemaVersion: 1,
        kind: 'UI_RECORD_DISCOVERY_FEEDBACK',
        correlationId: ids.correlation,
        actor: { kind: 'UI' },
        idempotencyKey: 'idem_00000000-0000-4000-8000-000000000077',
        expectedSessionRevision: 2,
        feedback: {
          ...discoveryFeedbackFixture,
          id: mergeFeedbackId,
          intent: 'MERGE',
          targets: [
            { candidateId: secondCandidateId, revision: 1 },
            { candidateId: thirdCandidateId, revision: 1 },
          ],
          message: 'Combine the autonomous schedule with the practical booking flow.',
        },
      }),
    ).resolves.toMatchObject({ success: true, data: { resourceRevision: 3 } })

    const mergedCandidate = {
      ...secondCandidate,
      revision: 2,
      parentRevisions: [
        { candidateId: secondCandidateId, revision: 1 },
        { candidateId: thirdCandidateId, revision: 1 },
      ],
      title: 'Scheduled Resource Booking Keeper',
    }
    const carriedRound = {
      ...candidateRoundFixture,
      id: narrowRoundId,
      roundIndex: 2,
      appliedFeedbackIds: [mergeFeedbackId],
      candidates: [
        { candidateId: ids.candidate, revision: 1 },
        { candidateId: fourthCandidateId, revision: 1 },
        { candidateId: secondCandidateId, revision: 2 },
      ],
    }
    await expect(
      service.executeAgent('DISCOVERY', {
        schemaVersion: 1,
        kind: 'DISCOVERY_SUBMIT_CANDIDATE_ROUND',
        correlationId: ids.correlation,
        actor: { kind: 'AGENT', role: 'DISCOVERY' },
        idempotencyKey: 'idem_00000000-0000-4000-8000-000000000078',
        expectedSessionRevision: 3,
        round: carriedRound,
        candidates: [mergedCandidate],
      }),
    ).resolves.toMatchObject({
      success: false,
      error: { code: 'CANDIDATE_ROUND_CONTENT_INVALID' },
    })

    await expect(
      service.executeAgent('DISCOVERY', {
        schemaVersion: 1,
        kind: 'DISCOVERY_SUBMIT_CANDIDATE_ROUND',
        correlationId: ids.correlation,
        actor: { kind: 'AGENT', role: 'DISCOVERY' },
        idempotencyKey: 'idem_00000000-0000-4000-8000-000000000079',
        expectedSessionRevision: 3,
        round: {
          ...carriedRound,
          candidates: [{ candidateId: secondCandidateId, revision: 2 }],
        },
        candidates: [mergedCandidate],
      }),
    ).resolves.toMatchObject({ success: true, data: { resourceRevision: 4 } })

    expect(storage.repository.readDiscoveryAggregate(ids.project)).toMatchObject({
      rounds: [
        { roundIndex: 1 },
        {
          roundIndex: 2,
          candidates: [{ candidateId: secondCandidateId, revision: 2 }],
        },
      ],
      candidates: expect.arrayContaining([
        expect.objectContaining({ id: ids.candidate, revision: 1 }),
        expect.objectContaining({ id: fourthCandidateId, revision: 1 }),
        expect.objectContaining({
          id: secondCandidateId,
          revision: 2,
          parentRevisions: [
            { candidateId: secondCandidateId, revision: 1 },
            { candidateId: thirdCandidateId, revision: 1 },
          ],
        }),
      ]),
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
      input: {
        ...discoveryInputFixture,
        learningGoal: 'Learn runtime validation through a smaller local tool',
      },
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
      project: {
        status: 'DISCOVERY',
        learningGoal: 'Learn runtime validation through a smaller local tool',
      },
      session: {
        revision: 1,
        status: 'ACTIVE',
        input: {
          ...discoveryInputFixture,
          learningGoal: 'Learn runtime validation through a smaller local tool',
        },
      },
    })
    await expect(
      service.executeUi({
        schemaVersion: 1,
        kind: 'UI_RESTORE_PROJECT_SESSION',
        correlationId: ids.correlation,
        actor: { kind: 'UI' },
        projectId: ids.project,
        helperConversationLimit: 10,
      }),
    ).resolves.toMatchObject({
      success: true,
      data: { selectedCandidate: null, learningSpec: null },
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

    await expect(
      service.executeUi({
        schemaVersion: 1,
        kind: 'UI_LIST_PROJECTS',
        correlationId: ids.correlation,
        actor: { kind: 'UI' },
        limit: 25,
      }),
    ).resolves.toMatchObject({
      success: true,
      data: {
        projects: [
          {
            project: { id: ids.project, status: 'SPEC_REVIEW' },
            suggestedSurface: 'BUILD',
            activeTask: null,
          },
        ],
      },
    })
    await expect(
      service.executeUi({
        schemaVersion: 1,
        kind: 'UI_RESTORE_PROJECT_SESSION',
        correlationId: ids.correlation,
        actor: { kind: 'UI' },
        projectId: ids.project,
        helperConversationLimit: 10,
      }),
    ).resolves.toMatchObject({
      success: true,
      data: {
        project: { id: ids.project, status: 'SPEC_REVIEW' },
        suggestedSurface: 'BUILD',
        activeTask: null,
        currentTask: { id: ids.task, status: 'PENDING' },
      },
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
      project: {
        status: 'BUILDING',
        generatedWorkspacePath: `projects/${ids.project}`,
      },
      activeTask: null,
      currentTask: null,
      liveContext: null,
    })
    expect(storage.repository.readLatestTaskForProject(ids.project)).toMatchObject({
      id: ids.task,
      status: 'COMPLETED',
    })
    expect(storage.repository.readBuilderTaskAggregate(ids.project, ids.task)).toMatchObject({
      completionReport: { id: ids.completionReport },
    })
    const launch = await service.executeUi({
      schemaVersion: 1,
      kind: 'UI_LAUNCH_RESULT',
      correlationId: ids.correlation,
      actor: { kind: 'UI' },
      idempotencyKey: 'idem_00000000-0000-4000-8000-000000000113',
      projectId: ids.project,
    })
    expect(launch, JSON.stringify(launch)).toMatchObject({
      success: true,
      data: {
        projectId: ids.project,
        workspacePath: `projects/${ids.project}`,
        status: 'READY',
      },
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
    await expect(
      service.executeUi({
        schemaVersion: 1,
        kind: 'UI_RESTORE_PROJECT_SESSION',
        correlationId: ids.correlation,
        actor: { kind: 'UI' },
        projectId: ids.project,
        helperConversationLimit: 10,
      }),
    ).resolves.toMatchObject({
      success: true,
      data: {
        decisions: [{ request: { id: ids.decision }, resolution: null, application: null }],
        completionReport: null,
      },
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
    await expect(
      service.executeUi({
        schemaVersion: 1,
        kind: 'UI_RESTORE_PROJECT_SESSION',
        correlationId: ids.correlation,
        actor: { kind: 'UI' },
        projectId: ids.project,
        helperConversationLimit: 10,
      }),
    ).resolves.toMatchObject({
      success: true,
      data: {
        decisions: [
          {
            request: { id: ids.decision },
            resolution: { id: ids.resolution },
            application: null,
          },
        ],
      },
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
    await expect(
      service.executeUi({
        schemaVersion: 1,
        kind: 'UI_RESTORE_PROJECT_SESSION',
        correlationId: ids.correlation,
        actor: { kind: 'UI' },
        projectId: ids.project,
        helperConversationLimit: 10,
      }),
    ).resolves.toMatchObject({
      success: true,
      data: {
        decisions: [
          {
            request: { id: ids.decision },
            resolution: { id: ids.resolution },
            application: { id: ids.decisionApplication },
          },
        ],
      },
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
    await expect(
      service.executeUi({
        schemaVersion: 1,
        kind: 'UI_RESTORE_PROJECT_SESSION',
        correlationId: ids.correlation,
        actor: { kind: 'UI' },
        projectId: ids.project,
        helperConversationLimit: 10,
      }),
    ).resolves.toMatchObject({
      success: true,
      data: {
        currentTask: { id: ids.task, status: 'COMPLETED' },
        completionReport: { id: ids.completionReport },
      },
    })
    const observationTrace = storage.repository
      .readEvidenceTracesForProject(ids.project)
      .find((trace) => trace.concept.canonicalName === 'discriminated union')
    expect(observationTrace).toMatchObject({
      ledger: { state: { state: 'OBSERVED' } },
      proposals: [],
      acceptedEvidence: [
        {
          kind: 'CONCEPT_OBSERVATION',
          projectId: ids.project,
          taskId: ids.task,
          supportsState: 'OBSERVED',
          source: { kind: 'CORE' },
        },
      ],
    })
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

  it('normalizes a Helper exchange, queues one job and accepts an empty analysis result', async () => {
    const { service, storage } = await createHarness()
    seedBuilderGraph(storage)

    const recorded = await service.executeUi({
      schemaVersion: 1,
      kind: 'UI_RECORD_HELPER_EXCHANGE',
      correlationId: ids.correlation,
      actor: { kind: 'UI' },
      idempotencyKey: 'idem_00000000-0000-4000-8000-000000000301',
      projectId: ids.project,
      taskId: ids.task,
      userMessage: 'Why is runtime validation needed here?',
      helperResponseSummary: 'It checks unknown input before typed code uses it.',
      closeConversation: true,
    })
    expect(recorded).toMatchObject({
      success: true,
      data: { episodeRevision: 3, status: 'PENDING_ANALYSIS' },
    })
    if (!recorded.success || !('episodeId' in recorded.data)) throw new Error('missing episode')

    const pendingResult = await service.executeAnalysis({
      schemaVersion: 1,
      kind: 'ANALYSIS_LIST_PENDING',
      correlationId: ids.correlation,
      actor: { kind: 'KIRO_ADAPTER' },
      limit: 10,
    })
    if (!pendingResult.success) throw new Error('pending job query failed')
    const pending = analysisJobSchema.array().parse(pendingResult.data)
    expect(pending).toHaveLength(1)
    const pendingJob = pending[0]
    if (pendingJob === undefined) throw new Error('pending job missing')
    expect(pendingJob).toMatchObject({
      episodeId: recorded.data.episodeId,
      episodeRevision: 3,
      status: 'PENDING',
      attempt: 0,
    })

    const claimedResult = await service.executeAnalysis({
      schemaVersion: 1,
      kind: 'ANALYSIS_CLAIM_JOB',
      correlationId: ids.correlation,
      actor: { kind: 'KIRO_ADAPTER' },
      projectId: ids.project,
      analysisJobId: pendingJob.id,
      expectedJobRevision: pendingJob.revision,
      runtimeHandle: 'kiro-session-helper-empty',
    })
    if (!claimedResult.success) throw new Error('job claim failed')
    const claimed = analysisJobSchema.parse(claimedResult.data)
    expect(claimed).toMatchObject({ status: 'RUNNING', attempt: 1, revision: 2 })

    const context = await service.executeAgent('EVIDENCE_ANALYST', {
      schemaVersion: 1,
      kind: 'ANALYST_GET_EPISODE_CONTEXT',
      correlationId: ids.correlation,
      actor: { kind: 'AGENT', role: 'EVIDENCE_ANALYST' },
      projectId: ids.project,
      episodeId: claimed.episodeId,
      expectedEpisodeRevision: claimed.episodeRevision,
    })
    expect(context).toMatchObject({
      success: true,
      data: {
        episode: { type: 'HELPER_CONVERSATION', status: 'PENDING_ANALYSIS' },
        events: [
          { actor: { kind: 'USER' }, payload: { type: 'USER_MESSAGE' } },
          { actor: { kind: 'AGENT', role: 'HELPER' }, payload: { type: 'HELPER_RESPONSE' } },
        ],
        analysisJob: { id: claimed.id, status: 'RUNNING', attempt: 1 },
      },
    })

    const emptyResult = {
      schemaVersion: 1,
      episodeId: claimed.episodeId,
      episodeRevision: claimed.episodeRevision,
      correlationId: claimed.correlationId,
      proposals: [],
      noEvidenceReason: 'The user asked a question but did not explain or apply the concept.',
    } as const
    const submitted = await service.executeAnalysis({
      schemaVersion: 1,
      kind: 'ANALYSIS_SUBMIT_RESULT',
      correlationId: ids.correlation,
      actor: { kind: 'KIRO_ADAPTER' },
      idempotencyKey: 'idem_00000000-0000-4000-8000-000000000302',
      projectId: ids.project,
      analysisJobId: claimed.id,
      expectedJobRevision: claimed.revision,
      attempt: claimed.attempt,
      result: emptyResult,
    })
    expect(submitted).toMatchObject({ success: true, data: { outcomes: [] } })
    expect(storage.repository.readAnalysisJob(ids.project, claimed.id)).toMatchObject({
      status: 'SUCCEEDED',
      revision: 3,
      resultSummary: {
        proposalCount: 0,
        acceptedCount: 0,
        rejectedCount: 0,
        noEvidenceReason: emptyResult.noEvidenceReason,
      },
    })
    expect(
      storage.repository.readEpisodeAggregate(ids.project, claimed.episodeId)?.episode,
    ).toMatchObject({ status: 'ANALYZED', revision: 4 })

    const late = await service.executeAnalysis({
      schemaVersion: 1,
      kind: 'ANALYSIS_SUBMIT_RESULT',
      correlationId: ids.correlation,
      actor: { kind: 'KIRO_ADAPTER' },
      idempotencyKey: 'idem_00000000-0000-4000-8000-000000000303',
      projectId: ids.project,
      analysisJobId: claimed.id,
      expectedJobRevision: claimed.revision,
      attempt: claimed.attempt,
      result: emptyResult,
    })
    expect(late).toMatchObject({ success: false, error: { code: 'ANALYSIS_JOB_STALE' } })
  })

  it('keeps a Helper quick action out of user-authored evidence', async () => {
    const { service, storage } = await createHarness()
    seedBuilderGraph(storage)

    const recorded = await service.executeUi({
      schemaVersion: 1,
      kind: 'UI_RECORD_HELPER_EXCHANGE',
      correlationId: ids.correlation,
      actor: { kind: 'UI' },
      idempotencyKey: 'idem_00000000-0000-4000-8000-000000000304',
      projectId: ids.project,
      taskId: ids.task,
      conversationId: ids.conversation,
      userMessage: '추천 이유 설명해줘',
      helperResponseSummary: 'Strict parsing exposes invalid input at the boundary.',
      origin: 'QUICK_ACTION',
      closeConversation: true,
    })
    expect(recorded).toMatchObject({
      success: true,
      data: { episodeRevision: 2, status: 'PENDING_ANALYSIS' },
    })
    if (!recorded.success || !('episodeId' in recorded.data)) throw new Error('missing episode')

    expect(
      storage.repository.readEpisodeAggregate(ids.project, recorded.data.episodeId),
    ).toMatchObject({
      events: [
        {
          actor: { kind: 'AGENT', role: 'HELPER' },
          payload: { type: 'HELPER_RESPONSE' },
        },
      ],
    })
    await expect(
      service.executeUi({
        schemaVersion: 1,
        kind: 'UI_RESTORE_PROJECT_SESSION',
        correlationId: ids.correlation,
        actor: { kind: 'UI' },
        projectId: ids.project,
        helperConversationLimit: 10,
      }),
    ).resolves.toMatchObject({
      success: true,
      data: {
        helperConversations: [
          {
            conversationId: ids.conversation,
            redactedUserExcerpts: [],
            helperResponseSummaries: ['Strict parsing exposes invalid input at the boundary.'],
          },
        ],
      },
    })
  })

  it('retries one failed Analyst attempt, dead-letters the second and supports manual retry', async () => {
    const { service, storage } = await createHarness()
    seedBuilderGraph(storage)

    const recorded = await service.executeUi({
      schemaVersion: 1,
      kind: 'UI_RECORD_HELPER_EXCHANGE',
      correlationId: ids.correlation,
      actor: { kind: 'UI' },
      idempotencyKey: 'idem_00000000-0000-4000-8000-000000000311',
      projectId: ids.project,
      taskId: ids.task,
      userMessage: 'Can you explain this validation branch?',
      helperResponseSummary: 'The branch rejects malformed external input.',
      closeConversation: true,
    })
    if (!recorded.success || !('episodeId' in recorded.data)) throw new Error('missing episode')
    const initial = storage.repository.readAnalysisJobForEpisode(
      ids.project,
      recorded.data.episodeId,
    )
    if (initial === null) throw new Error('missing analysis job')

    const claim = async (job: typeof initial, handle: string) => {
      const result = await service.executeAnalysis({
        schemaVersion: 1,
        kind: 'ANALYSIS_CLAIM_JOB',
        correlationId: ids.correlation,
        actor: { kind: 'KIRO_ADAPTER' },
        projectId: ids.project,
        analysisJobId: job.id,
        expectedJobRevision: job.revision,
        runtimeHandle: handle,
      })
      if (!result.success) throw new Error('job claim failed')
      return analysisJobSchema.parse(result.data)
    }
    const fail = async (job: typeof initial) => {
      const result = await service.executeAnalysis({
        schemaVersion: 1,
        kind: 'ANALYSIS_FAIL_ATTEMPT',
        correlationId: ids.correlation,
        actor: { kind: 'KIRO_ADAPTER' },
        projectId: ids.project,
        analysisJobId: job.id,
        expectedJobRevision: job.revision,
        attempt: job.attempt,
        failure: {
          code: 'ANALYST_TIMEOUT',
          message: 'The 30 second deadline elapsed.',
          retryable: true,
        },
      })
      if (!result.success) throw new Error('job failure transition failed')
      return analysisJobSchema.parse(result.data)
    }

    const firstRunning = await claim(initial, 'kiro-session-first')
    const firstFailed = await fail(firstRunning)
    expect(firstFailed).toMatchObject({ status: 'PENDING', attempt: 1, revision: 3 })
    const secondRunning = await claim(firstFailed, 'kiro-session-second')
    const deadLetter = await fail(secondRunning)
    expect(deadLetter).toMatchObject({
      status: 'FAILED',
      attempt: 2,
      revision: 5,
      lastFailure: { code: 'ANALYST_TIMEOUT', retryable: true },
    })
    expect(
      storage.repository.readEpisodeAggregate(ids.project, initial.episodeId)?.episode,
    ).toMatchObject({ status: 'ANALYSIS_FAILED', revision: 4 })

    const visibleFailure = await service.executeUi({
      schemaVersion: 1,
      kind: 'UI_READ_ANALYSIS_JOBS',
      correlationId: ids.correlation,
      actor: { kind: 'UI' },
      projectId: ids.project,
      status: 'FAILED',
      limit: 10,
    })
    expect(visibleFailure).toMatchObject({
      success: true,
      data: [
        {
          id: deadLetter.id,
          status: 'FAILED',
          attempt: 2,
          lastFailure: { code: 'ANALYST_TIMEOUT', retryable: true },
        },
      ],
    })

    const retried = await service.executeUi({
      schemaVersion: 1,
      kind: 'UI_RETRY_ANALYSIS',
      correlationId: ids.correlation,
      actor: { kind: 'UI' },
      idempotencyKey: 'idem_00000000-0000-4000-8000-000000000312',
      projectId: ids.project,
      analysisJobId: deadLetter.id,
      expectedJobRevision: deadLetter.revision,
    })
    expect(retried).toMatchObject({
      success: true,
      data: { status: 'PENDING', attempt: 0, revision: 6, episodeRevision: 5 },
    })
    expect(
      storage.repository.readEpisodeAggregate(ids.project, initial.episodeId)?.episode,
    ).toMatchObject({ status: 'PENDING_ANALYSIS', revision: 5 })
  })

  it('recovers expired running attempts after an Analyst runtime restart', async () => {
    let currentTime = new Date(timestamp)
    const { service, storage } = await createHarness({ now: () => currentTime })
    seedBuilderGraph(storage)

    const recorded = await service.executeUi({
      schemaVersion: 1,
      kind: 'UI_RECORD_HELPER_EXCHANGE',
      correlationId: ids.correlation,
      actor: { kind: 'UI' },
      idempotencyKey: 'idem_00000000-0000-4000-8000-000000000321',
      projectId: ids.project,
      taskId: ids.task,
      userMessage: 'Why validate this external payload?',
      helperResponseSummary: 'Validation protects the runtime input boundary.',
      closeConversation: true,
    })
    if (!recorded.success || !('episodeId' in recorded.data)) throw new Error('missing episode')
    const initial = storage.repository.readAnalysisJobForEpisode(
      ids.project,
      recorded.data.episodeId,
    )
    if (initial === null) throw new Error('missing analysis job')

    const claim = async (job: typeof initial, runtimeHandle: string) => {
      const response = await service.executeAnalysis({
        schemaVersion: 1,
        kind: 'ANALYSIS_CLAIM_JOB',
        correlationId: ids.correlation,
        actor: { kind: 'KIRO_ADAPTER' },
        projectId: ids.project,
        analysisJobId: job.id,
        expectedJobRevision: job.revision,
        runtimeHandle,
      })
      if (!response.success) throw new Error('claim failed')
      return analysisJobSchema.parse(response.data)
    }
    const firstRunning = await claim(initial, 'abandoned-runtime-1')
    expect(firstRunning.deadlineAt).toBe('2026-08-25T03:00:30.000Z')

    currentTime = new Date('2026-08-25T03:00:31.000Z')
    const firstRecovery = await service.executeAnalysis({
      schemaVersion: 1,
      kind: 'ANALYSIS_RECOVER_EXPIRED',
      correlationId: ids.correlation,
      actor: { kind: 'KIRO_ADAPTER' },
      limit: 10,
    })
    if (!firstRecovery.success) throw new Error('first recovery failed')
    const retryPending = analysisJobSchema.array().parse(firstRecovery.data)
    expect(retryPending).toMatchObject([
      { id: initial.id, status: 'PENDING', attempt: 1, revision: 3 },
    ])

    const recoveredJob = retryPending[0]
    if (recoveredJob === undefined) throw new Error('recovered job missing')
    const secondRunning = await claim(recoveredJob, 'abandoned-runtime-2')
    expect(secondRunning.deadlineAt).toBe('2026-08-25T03:01:01.000Z')
    currentTime = new Date('2026-08-25T03:01:02.000Z')
    const secondRecovery = await service.executeAnalysis({
      schemaVersion: 1,
      kind: 'ANALYSIS_RECOVER_EXPIRED',
      correlationId: ids.correlation,
      actor: { kind: 'KIRO_ADAPTER' },
      limit: 10,
    })
    if (!secondRecovery.success) throw new Error('second recovery failed')
    expect(analysisJobSchema.array().parse(secondRecovery.data)).toMatchObject([
      { id: initial.id, status: 'FAILED', attempt: 2, revision: 5 },
    ])
    expect(
      storage.repository.readEpisodeAggregate(ids.project, initial.episodeId)?.episode,
    ).toMatchObject({ status: 'ANALYSIS_FAILED', revision: 4 })
  })
})
