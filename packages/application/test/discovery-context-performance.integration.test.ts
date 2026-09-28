import { mkdir, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { ApplicationService, WorkspacePathPolicy } from '@vibe-helper/application'
import { analysisJobSchema } from '@vibe-helper/contracts'
import { openInMemorySqliteStorage } from '../../storage-sqlite/src/index.js'
import * as f from '../../contracts/test/fixtures.js'

const id = (prefix: string, n: number) =>
  `${prefix}_00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const meta = { schemaVersion: 1, actor: { kind: 'UI' }, correlationId: id('corr', 900000) } as const

async function harness(concepts: number, now = () => new Date('2026-09-28T00:00:00.000Z')) {
  const storage = await openInMemorySqliteStorage()
  const r = storage.repository
  storage.transaction(() => {
    r.appendProject(f.projectFixture)
    r.appendDiscoverySession(f.discoverySessionFixture)
    r.appendCandidate(f.candidateFixture)
    r.appendCandidateRound(f.candidateRoundFixture)
    r.appendDiscoveryFeedback(f.discoveryFeedbackFixture)
    r.appendLearningSpec(f.draftLearningSpecFixture)
    r.appendLearningSpec(f.confirmedLearningSpecFixture)
    r.appendTask(f.builderTaskFixture)
    r.appendLiveContext(f.liveContextFixture)
    r.appendDecisionRequest(f.decisionRequestFixture)
    r.appendActivityEvent(f.activityEventFixture)
    r.appendEpisode(f.episodeFixture)
    for (let n = 1; n <= concepts; n++) {
      const at = new Date(Date.parse(f.timestamp) + n * 1000).toISOString()
      const concept = {
        ...f.canonicalConceptFixture,
        id: id('concept', 10000 + n),
        canonicalName: `Synthetic concept ${n}`,
      }
      const proposal = {
        ...f.evidenceProposalFixture,
        id: id('evidence_proposal', 10000 + n),
        concept: {
          ...f.evidenceProposalFixture.concept,
          canonicalConceptId: concept.id,
          proposedCanonicalName: concept.canonicalName,
        },
      }
      const decision = {
        schemaVersion: 1,
        id: id('evidence_decision', 10000 + n),
        evidenceProposalId: proposal.id,
        correlationId: f.ids.correlation,
        outcome: 'ACCEPTED',
        reasonCode: 'VALID_USER_EVIDENCE',
        explanation: 'Synthetic fixture only.',
        decidedAt: at,
        source: { kind: 'CORE' },
      } as const
      const evidence = {
        ...f.acceptedEvidenceFixture,
        id: id('evidence', 10000 + n),
        conceptId: concept.id,
        evidenceProposalId: proposal.id,
        evidenceDecisionId: decision.id,
        acceptedAt: at,
      }
      r.appendCanonicalConcept(concept)
      r.appendEvidenceProposal(proposal)
      r.appendEvidenceDecision(decision)
      r.appendAcceptedEvidence(evidence)
      r.appendConceptLedger({
        ...f.conceptLedgerFixture,
        id: id('concept_ledger', 10000 + n),
        concept,
        acceptedAliases: [],
        updatedAt: at,
        state: {
          ...f.conceptLedgerFixture.state,
          conceptId: concept.id,
          acceptedEvidenceIds: [evidence.id],
          updatedAt: at,
        },
      })
    }
  })
  const workspace = await mkdtemp(join(tmpdir(), 'vibe-discovery-context-perf-'))
  await mkdir(join(workspace, f.projectFixture.generatedWorkspacePath), { recursive: true })
  const service = new ApplicationService({
    storage,
    workspacePolicy: await WorkspacePathPolicy.create(workspace),
    now,
  })
  return { storage, service }
}

describe('bounded Discovery context reads', () => {
  it.each(['FREE_TEXT', 'QUICK_ACTION'] as const)(
    'keeps %s lifecycle bounded while retaining full Analyst context and evaluation',
    async (origin) => {
      let currentTime = Date.parse(f.timestamp)
      const { storage, service } = await harness(100, () => new Date(currentTime))
      const r = storage.repository
      const full = vi.spyOn(r, 'readEpisodeAggregate')
      const history = vi.spyOn(r, 'readEpisodeHistory')
      const runtime = {
        schemaVersion: 1,
        actor: { kind: 'KIRO_ADAPTER' },
        correlationId: f.ids.correlation,
      } as const
      try {
        const recorded = await service.executeUi({
          ...meta,
          correlationId: f.ids.correlation,
          kind: 'UI_RECORD_HELPER_EXCHANGE',
          projectId: f.ids.project,
          taskId: f.ids.task,
          idempotencyKey: id('idem', 970000),
          userMessage: 'Why is this boundary checked?',
          helperResponseSummary: 'The boundary rejects malformed external input.',
          origin,
          closeConversation: true,
        })
        expect(recorded.success).toBe(true)
        if (!recorded.success || !('episodeId' in recorded.data))
          throw new Error('EPISODE_REQUIRED')
        let job = analysisJobSchema.parse(
          r.readAnalysisJobForEpisode(f.ids.project, recorded.data.episodeId),
        )
        const claim = async () => {
          const response = await service.executeAnalysis({
            ...runtime,
            kind: 'ANALYSIS_CLAIM_JOB',
            projectId: f.ids.project,
            analysisJobId: job.id,
            expectedJobRevision: job.revision,
            runtimeHandle: 'synthetic-lifecycle',
          })
          expect(response.success).toBe(true)
          if (!response.success) throw new Error('CLAIM_REQUIRED')
          job = analysisJobSchema.parse(response.data)
        }
        await claim()
        const failed = await service.executeAnalysis({
          ...runtime,
          kind: 'ANALYSIS_FAIL_ATTEMPT',
          projectId: f.ids.project,
          analysisJobId: job.id,
          expectedJobRevision: job.revision,
          attempt: job.attempt,
          failure: {
            code: 'ANALYST_INVALID_OUTPUT',
            message: 'Synthetic terminal failure.',
            retryable: false,
          },
        })
        expect(failed.success).toBe(true)
        if (!failed.success) throw new Error('FAILURE_REQUIRED')
        job = analysisJobSchema.parse(failed.data)
        expect(job.status).toBe('FAILED')
        const retry = async (suffix: number) => {
          const response = await service.executeUi({
            ...meta,
            kind: 'UI_RETRY_ANALYSIS',
            projectId: f.ids.project,
            analysisJobId: job.id,
            expectedJobRevision: job.revision,
            idempotencyKey: id('idem', suffix),
          })
          expect(response.success).toBe(true)
          if (!response.success) throw new Error('RETRY_REQUIRED')
          job = analysisJobSchema.parse(response.data)
        }
        await retry(970001)
        for (let attempt = 1; attempt <= 2; attempt++) {
          await claim()
          currentTime += job.timeoutMs + 1
          const recovered = await service.executeAnalysis({
            ...runtime,
            kind: 'ANALYSIS_RECOVER_EXPIRED',
            limit: 10,
          })
          expect(recovered.success).toBe(true)
          if (!recovered.success) throw new Error('RECOVERY_REQUIRED')
          const recoveredJob = analysisJobSchema.array().parse(recovered.data)[0]
          if (!recoveredJob) throw new Error('RECOVERED_JOB_REQUIRED')
          job = recoveredJob
          expect(job.status).toBe(attempt === 1 ? 'PENDING' : 'FAILED')
        }
        await retry(970002)
        await claim()
        expect(full).not.toHaveBeenCalled()
        expect(history).toHaveBeenCalledTimes(5)
        const context = await service.executeAgent('EVIDENCE_ANALYST', {
          schemaVersion: 1,
          actor: { kind: 'AGENT', role: 'EVIDENCE_ANALYST' },
          correlationId: f.ids.correlation,
          kind: 'ANALYST_GET_EPISODE_CONTEXT',
          projectId: f.ids.project,
          episodeId: job.episodeId,
          expectedEpisodeRevision: job.episodeRevision,
        })
        expect(context.success).toBe(true)
        expect(full).toHaveBeenCalledTimes(1)
        const submitted = await service.executeAnalysis({
          ...runtime,
          kind: 'ANALYSIS_SUBMIT_RESULT',
          projectId: f.ids.project,
          analysisJobId: job.id,
          expectedJobRevision: job.revision,
          attempt: job.attempt,
          idempotencyKey: id('idem', 970003),
          result: {
            schemaVersion: 1,
            episodeId: job.episodeId,
            episodeRevision: job.episodeRevision,
            correlationId: job.correlationId,
            proposals: [],
            noEvidenceReason: 'A synthetic explanation request is not independent evidence.',
          },
        })
        expect(submitted).toMatchObject({ success: true, data: { outcomes: [] } })
        expect(full).toHaveBeenCalledTimes(2)
        expect(history).toHaveBeenCalledTimes(6)
        expect(r.readAnalysisJob(f.ids.project, job.id)).toMatchObject({
          status: 'SUCCEEDED',
          resultSummary: { proposalCount: 0, acceptedCount: 0, rejectedCount: 0 },
        })
        expect(r.readEpisodeHistory(f.ids.project, job.episodeId)).toMatchObject({
          episode: { status: 'ANALYZED' },
          events:
            origin === 'FREE_TEXT'
              ? [{ actor: { kind: 'USER' } }, { actor: { kind: 'AGENT', role: 'HELPER' } }]
              : [{ actor: { kind: 'AGENT', role: 'HELPER' } }],
        })
        expect(storage.checkIntegrity()).toEqual({ quickCheck: 'ok', foreignKeyViolations: 0 })
      } finally {
        storage.close()
      }
    },
  )

  it('reuses Evidence trace sources per request without retaining old revisions', async () => {
    const { storage, service } = await harness(10)
    const r = storage.repository
    try {
      const rejectedProposal = {
        ...f.evidenceProposalFixture,
        id: id('evidence_proposal', 985001),
        concept: { ...f.evidenceProposalFixture.concept, canonicalConceptId: id('concept', 10001) },
      }
      r.appendEvidenceProposal(rejectedProposal)
      r.appendEvidenceDecision({
        schemaVersion: 1,
        id: id('evidence_decision', 985001),
        evidenceProposalId: rejectedProposal.id,
        correlationId: f.ids.correlation,
        outcome: 'REJECTED',
        reasonCode: 'INSUFFICIENT_EVIDENCE',
        explanation: 'Synthetic rejected proposal remains visible.',
        decidedAt: f.timestamp,
        source: { kind: 'CORE' },
      })
      const readTrace = vi.spyOn(r, 'readEvidenceTrace')
      const readFullEpisode = vi.spyOn(r, 'readEpisodeAggregate')
      const readEpisode = vi.spyOn(r, 'readEpisodeHistory')
      const recover = vi.spyOn(r, 'recoverProject')
      const request = { ...meta, kind: 'UI_READ_EVIDENCE_TRACE', projectId: f.ids.project } as const
      const first = await service.executeUi(request)
      expect(first.success).toBe(true)
      if (!first.success) throw new Error('TRACE_REQUIRED')
      expect(first.data.concepts.map((c) => c.conceptId)).toEqual(
        Array.from({ length: 10 }, (_, n) => id('concept', 10001 + n)),
      )
      expect(first.data.concepts.every((c) => c.evidence.length === 1)).toBe(true)
      expect(first.data.concepts[0]?.rejectedEvidence).toEqual([
        expect.objectContaining({
          proposalId: rejectedProposal.id,
          reasonCode: 'INSUFFICIENT_EVIDENCE',
        }),
      ])
      expect(readTrace).toHaveBeenCalledTimes(10)
      expect(readEpisode).toHaveBeenCalledExactlyOnceWith(f.ids.project, f.ids.episode)
      expect(readFullEpisode).not.toHaveBeenCalled()
      expect(recover).toHaveBeenCalledExactlyOnceWith(f.ids.project)
      r.appendProject({ ...f.projectFixture, revision: 2, title: 'Renamed source project' })
      r.appendEpisode({ ...f.episodeFixture, revision: 2, status: 'ANALYZED' })
      const concept = r.readCanonicalConceptById(id('concept', 10001))
      if (concept === null) throw new Error('CONCEPT_REQUIRED')
      r.appendCanonicalConcept({
        ...concept,
        revision: 2,
        canonicalName: 'Renamed current concept',
      })
      readTrace.mockClear()
      readEpisode.mockClear()
      recover.mockClear()
      const second = await service.executeUi({ ...request, conceptId: concept.id })
      expect(second.success && second.data.concepts).toEqual([
        expect.objectContaining({
          conceptName: 'Renamed current concept',
          evidence: [
            expect.objectContaining({
              projectTitle: 'Renamed source project',
              episodeStatus: 'ANALYZED',
            }),
          ],
          rejectedEvidence: [expect.objectContaining({ projectTitle: 'Renamed source project' })],
        }),
      ])
      expect(readTrace).toHaveBeenCalledExactlyOnceWith(concept.id)
      expect(readEpisode).toHaveBeenCalledExactlyOnceWith(f.ids.project, f.ids.episode)
      expect(recover).toHaveBeenCalledExactlyOnceWith(f.ids.project)
      const absent = await service.executeUi({ ...request, conceptId: id('concept', 999999) })
      expect(absent).toMatchObject({ success: false, error: { code: 'EVIDENCE_TRACE_NOT_FOUND' } })
      expect(storage.checkIntegrity()).toEqual({ quickCheck: 'ok', foreignKeyViolations: 0 })
    } finally {
      storage.close()
    }
  })

  it('keeps cross-project Evidence limited to the delivered personalization basis', async () => {
    const { storage, service } = await harness(10)
    const r = storage.repository
    try {
      const projectId = id('project', 985100)
      const metadata = { ...meta, correlationId: id('corr', 985100) }
      expect(
        (
          await service.executeUi({
            ...metadata,
            kind: 'UI_START_DISCOVERY',
            projectId,
            idempotencyKey: id('idem', 985100),
            input: {
              learningGoal: 'Build a local tool',
              currentLevel: 'BEGINNER',
              interestAreas: [],
            },
          })
        ).success,
      ).toBe(true)
      expect(
        (
          await service.executeUi({
            ...metadata,
            kind: 'UI_PREPARE_DISCOVERY_AGENT_CONTEXT',
            projectId,
            helperConversationLimit: 20,
          })
        ).success,
      ).toBe(true)
      const trace = r.readPersonalizationTracesForProject(projectId, 100)[0]
      if (!trace) throw new Error('PERSONALIZATION_REQUIRED')
      expect(trace.basis).toHaveLength(5)
      // Same session queried repeatedly, plus a stale correlation that must
      // never authorize its additional concept or Evidence.
      r.appendPersonalizationTrace({ ...trace, id: id('personalization', 985101) })
      r.appendPersonalizationTrace({
        ...trace,
        id: id('personalization', 985102),
        correlationId: id('corr', 985102),
        basis: [
          {
            ...trace.basis[0]!,
            conceptId: id('concept', 10001),
            evidenceIds: [id('evidence', 10001)],
          },
        ],
      })
      const readDiscovery = vi.spyOn(r, 'readDiscoveryAggregate')
      const readTrace = vi.spyOn(r, 'readEvidenceTrace')
      const readEpisode = vi.spyOn(r, 'readEpisodeHistory')
      const recover = vi.spyOn(r, 'recoverProject')
      const response = await service.executeUi({
        ...metadata,
        kind: 'UI_READ_EVIDENCE_TRACE',
        projectId,
      })
      expect(response.success).toBe(true)
      if (!response.success) throw new Error('TRACE_REQUIRED')
      expect(response.data.personalization).toHaveLength(2)
      expect(response.data.concepts.map((c) => c.conceptId)).toEqual(
        trace.basis.map((b) => b.conceptId),
      )
      const allowed = trace.basis.flatMap((b) => b.evidenceIds)
      expect(response.data.concepts.flatMap((c) => c.evidence.map((e) => e.evidenceId))).toEqual(
        allowed,
      )
      expect(response.data.concepts.every((c) => c.rejectedEvidence.length === 0)).toBe(true)
      expect(response.data.concepts.flatMap((c) => c.stateEvidenceIds)).toEqual(allowed)
      expect(readDiscovery).toHaveBeenCalledTimes(1)
      expect(readTrace).toHaveBeenCalledTimes(5)
      expect(readEpisode).toHaveBeenCalledExactlyOnceWith(f.ids.project, f.ids.episode)
      expect(recover).toHaveBeenCalledTimes(2)
      expect(
        await service.executeUi({
          ...metadata,
          kind: 'UI_READ_EVIDENCE_TRACE',
          projectId,
          conceptId: id('concept', 10001),
        }),
      ).toMatchObject({ success: false, error: { code: 'EVIDENCE_TRACE_NOT_FOUND' } })
      expect(storage.checkIntegrity()).toEqual({ quickCheck: 'ok', foreignKeyViolations: 0 })
    } finally {
      storage.close()
    }
  })

  it('keeps the complete Helper context equal while reading only closed Episode history', async () => {
    let nowMs = Date.parse('2026-09-28T00:00:00.000Z')
    const { storage, service } = await harness(10, () => new Date(nowMs))
    try {
      for (let n = 1; n <= 25; n++) {
        nowMs += 1000
        expect(
          (
            await service.executeUi({
              ...meta,
              kind: 'UI_RECORD_HELPER_EXCHANGE',
              idempotencyKey: id('idem', 982000 + n),
              projectId: f.ids.project,
              taskId: f.ids.task,
              conversationId: id('conversation', 982000 + n),
              userMessage: `Closed history question ${n}: token=synthetic-history-secret`,
              helperResponseSummary: `Closed history answer ${n}.`,
              closeConversation: n !== 23 && n !== 25,
            })
          ).success,
        ).toBe(true)
      }
      for (let n = 1; n <= 7; n++) {
        nowMs += 1000
        expect(
          (
            await service.executeUi({
              ...meta,
              kind: 'UI_RECORD_HELPER_EXCHANGE',
              idempotencyKey: id('idem', 983000 + n),
              projectId: f.ids.project,
              taskId: f.ids.task,
              conversationId: id('conversation', 982023),
              userMessage: `History follow-up ${n}.`,
              helperResponseSummary: `History follow-up answer ${n}.`,
              closeConversation: n === 7,
            })
          ).success,
        ).toBe(true)
      }
      const old = storage.repository.readRecentEpisodeAggregatesForProject(f.ids.project, 20)
      expect(old).toHaveLength(20)
      expect(old.every(({ episode }) => episode.status !== 'OPEN')).toBe(true)
      const expected = old.slice(0, 5).map(({ episode, events }) => ({
        episodeId: episode.id,
        type: episode.type,
        endedAt: episode.endedAt,
        conceptNames: episode.conceptCandidates.map((c) => c.originalExpression),
        redactedUserExcerpts: events
          .flatMap((e) => (e.payload.type === 'USER_MESSAGE' ? [e.payload.redactedExcerpt] : []))
          .slice(0, 5),
        helperResponseSummaries: events
          .flatMap((e) => (e.payload.type === 'HELPER_RESPONSE' ? [e.payload.summary] : []))
          .slice(0, 5),
        contextReferences: episode.contextReferences.slice(0, 10),
      }))
      const full = vi.spyOn(storage.repository, 'readRecentEpisodeAggregatesForProject')
      const history = vi.spyOn(storage.repository, 'readRecentEpisodeHistoryForProject')
      const request = {
        schemaVersion: 1,
        actor: { kind: 'AGENT', role: 'HELPER' },
        kind: 'HELPER_GET_CONTEXT',
        projectId: f.ids.project,
        taskId: f.ids.task,
        correlationId: id('corr', 983100),
        question: 'How does Synthetic concept 10 help this task?',
        relatedConceptNames: [],
      } as const
      const current = await service.executeAgent('HELPER', request)
      expect(current.success).toBe(true)
      if (!current.success) throw new Error('HELPER_CONTEXT_REQUIRED')
      expect(current.data.recentEpisodes).toEqual(expected)
      expect(current.data.recentEpisodes[0]?.helperResponseSummaries).toEqual([
        'Closed history answer 23.',
        ...[1, 2, 3, 4].map((n) => `History follow-up answer ${n}.`),
      ])
      expect(JSON.stringify(current)).not.toContain('synthetic-history-secret')
      expect(full).not.toHaveBeenCalled()
      expect(history).toHaveBeenCalledExactlyOnceWith(f.ids.project, 20)
      history.mockImplementation((projectId, limit) =>
        storage.repository
          .readRecentEpisodeAggregatesForProject(projectId, limit)
          .map(({ episode, events }) => ({ episode, events })),
      )
      const reference = await service.executeAgent('HELPER', request)
      expect(reference.success).toBe(true)
      expect(reference).toEqual(current)
    } finally {
      storage.close()
    }
  })

  it('restores exactly the recent Helper summaries without loading each Evidence aggregate', async () => {
    let nowMs = Date.parse('2026-09-28T00:00:00.000Z')
    const { storage, service } = await harness(10, () => new Date(nowMs))
    try {
      for (let n = 1; n <= 25; n++) {
        nowMs += 1000
        const result = await service.executeUi({
          ...meta,
          kind: 'UI_RECORD_HELPER_EXCHANGE',
          idempotencyKey: id('idem', 980000 + n),
          projectId: f.ids.project,
          taskId: f.ids.task,
          conversationId: id('conversation', 980000 + n),
          userMessage: `Synthetic conversation ${n}: token=synthetic-secret`,
          helperResponseSummary: `Synthetic answer ${n}.`,
          closeConversation: false,
        })
        expect(result.success).toBe(true)
      }
      for (let n = 1; n <= 7; n++) {
        nowMs += 1000
        const result = await service.executeUi({
          ...meta,
          kind: 'UI_RECORD_HELPER_EXCHANGE',
          idempotencyKey: id('idem', 981000 + n),
          projectId: f.ids.project,
          taskId: f.ids.task,
          conversationId: id('conversation', 980001),
          userMessage: `Follow-up ${n}.`,
          helperResponseSummary: `Follow-up answer ${n}.`,
          closeConversation: n === 7,
        })
        expect(result.success).toBe(true)
      }
      const old = storage.repository.readRecentHelperConversationAggregatesForProject(
        f.ids.project,
        20,
      )
      const expected = old.map(({ episode, events }) => ({
        conversationId: episode.conversationId,
        episodeId: episode.id,
        correlationId: episode.correlationId,
        taskId: episode.taskId,
        status: episode.status,
        startedAt: episode.startedAt,
        ...(episode.endedAt === undefined ? {} : { endedAt: episode.endedAt }),
        redactedUserExcerpts: events
          .flatMap((event) =>
            event.payload.type === 'USER_MESSAGE' ? [event.payload.redactedExcerpt] : [],
          )
          .slice(-5),
        helperResponseSummaries: events
          .flatMap((event) =>
            event.payload.type === 'HELPER_RESPONSE' ? [event.payload.summary] : [],
          )
          .slice(-5),
      }))
      const aggregate = vi.spyOn(storage.repository, 'readEpisodeAggregate')
      const fullHistory = vi.spyOn(
        storage.repository,
        'readRecentHelperConversationAggregatesForProject',
      )
      const history = vi.spyOn(storage.repository, 'readRecentHelperConversationHistoryForProject')
      const restored = await service.executeUi({
        ...meta,
        kind: 'UI_RESTORE_PROJECT_SESSION',
        projectId: f.ids.project,
        helperConversationLimit: 20,
      })
      expect(restored.success).toBe(true)
      if (!restored.success) throw new Error('RESTORE_REQUIRED')
      expect(restored.data.helperConversations).toEqual(expected)
      expect(restored.data.helperConversations).toHaveLength(20)
      expect(
        restored.data.helperConversations.find(
          (item) => item.conversationId === id('conversation', 980001),
        ),
      ).toMatchObject({
        status: 'PENDING_ANALYSIS',
        redactedUserExcerpts: [3, 4, 5, 6, 7].map((n) => `Follow-up ${n}.`),
        helperResponseSummaries: [3, 4, 5, 6, 7].map((n) => `Follow-up answer ${n}.`),
      })
      expect(JSON.stringify(restored)).not.toContain('synthetic-secret')
      expect(aggregate).not.toHaveBeenCalled()
      expect(fullHistory).not.toHaveBeenCalled()
      expect(history).toHaveBeenCalledExactlyOnceWith(f.ids.project, 20)
    } finally {
      storage.close()
    }
  })

  it('reuses verified Helper reads only within one request and observes later Project revisions', async () => {
    const { storage, service } = await harness(10)
    try {
      const recent = vi.spyOn(storage.repository, 'readRecentEvidenceTraces')
      const heads = vi.spyOn(storage.repository, 'readRecentConceptLedgers')
      const recover = vi.spyOn(storage.repository, 'recoverProject')
      const request = {
        schemaVersion: 1,
        actor: { kind: 'AGENT', role: 'HELPER' },
        kind: 'HELPER_GET_CONTEXT',
        projectId: f.ids.project,
        taskId: f.ids.task,
        correlationId: id('corr', 940000),
        question: 'How does Synthetic concept 10 help here?',
        relatedConceptNames: [],
      } as const
      const first = await service.executeAgent('HELPER', request)
      expect(first.success).toBe(true)
      if (!first.success) throw new Error('HELPER_CONTEXT_REQUIRED')
      expect(first.data.personalization.basis).toHaveLength(5)
      expect(
        first.data.personalization.basis.every(
          (b) => b.sourceProjectTitles[0] === f.projectFixture.title,
        ),
      ).toBe(true)
      expect(recent).not.toHaveBeenCalled()
      expect(heads).toHaveBeenCalledTimes(1)
      // One authoritative Helper project read and one source-project lookup.
      expect(recover).toHaveBeenCalledTimes(2)
      storage.repository.appendProject({
        ...f.projectFixture,
        revision: 2,
        title: 'Renamed synthetic source',
        updatedAt: '2026-09-28T00:01:00.000Z',
      })
      const second = await service.executeAgent('HELPER', {
        ...request,
        correlationId: id('corr', 940001),
      })
      expect(second.success).toBe(true)
      if (!second.success) throw new Error('HELPER_CONTEXT_REQUIRED')
      expect(
        second.data.personalization.basis.every(
          (b) => b.sourceProjectTitles[0] === 'Renamed synthetic source',
        ),
      ).toBe(true)
      expect(
        first.data.personalization.basis.every(
          (b) => b.sourceProjectTitles[0] === f.projectFixture.title,
        ),
      ).toBe(true)
      expect(recent).not.toHaveBeenCalled()
      expect(heads).toHaveBeenCalledTimes(2)
      expect(recover).toHaveBeenCalledTimes(4)
    } finally {
      storage.close()
    }
  })

  it('matches the latest Canonical Concept head before hydrating only relevant Helper history', async () => {
    const { storage, service } = await harness(100)
    try {
      const conceptId = id('concept', 10001)
      const original = storage.repository.readCanonicalConceptById(conceptId)
      if (original === null) throw new Error('CONCEPT_REQUIRED')
      storage.repository.appendCanonicalConcept({
        ...original,
        revision: 2,
        canonicalName: 'Renamed boundary concept',
        updatedAt: '2026-09-28T00:01:00.000Z',
      })
      const trace = vi.spyOn(storage.repository, 'readEvidenceTrace')
      const request = {
        schemaVersion: 1,
        actor: { kind: 'AGENT', role: 'HELPER' },
        kind: 'HELPER_GET_CONTEXT',
        projectId: f.ids.project,
        taskId: f.ids.task,
        correlationId: id('corr', 940010),
        question: 'How does Renamed boundary concept help here?',
        relatedConceptNames: [],
      } as const
      const first = await service.executeAgent('HELPER', request)
      expect(first.success).toBe(true)
      if (!first.success) throw new Error('HELPER_CONTEXT_REQUIRED')
      expect(first.data.personalization.basis).toContainEqual(
        expect.objectContaining({
          conceptId,
          conceptName: 'Renamed boundary concept',
          purpose: 'HELPER_EXPLANATION_START',
        }),
      )
      // One relevant lexical trace plus the existing bounded ten task traces;
      // no full history for the remaining unrelated recent concepts.
      expect(trace).toHaveBeenCalledTimes(11)
      expect(
        first.data.relevantLedgerEntries.find((entry) => entry.concept.id === conceptId)?.concept
          .canonicalName,
      ).toBe('Synthetic concept 1')
      trace.mockClear()
      const replay = await service.executeAgent('HELPER', request)
      expect(replay).toEqual(first)
      // Persisted personalization still hydrates exactly its five basis traces.
      expect(trace).toHaveBeenCalledTimes(5)
    } finally {
      storage.close()
    }
  })

  it('keeps the recent-window ordering and limit before hydrating traces', async () => {
    const { storage } = await harness(110)
    try {
      const trace = vi.spyOn(storage.repository, 'readEvidenceTrace')
      const recent = storage.repository.readRecentConceptLedgers(100)
      expect(recent).toHaveLength(100)
      expect(recent[0]?.concept.id).toBe(id('concept', 10110))
      expect(recent.at(-1)?.concept.id).toBe(id('concept', 10011))
      expect(storage.repository.readRecentConceptLedgers(1)).toEqual(recent.slice(0, 1))
      expect(trace).not.toHaveBeenCalled()
      expect(storage.repository.readRecentEvidenceTraces(1).map((t) => t.ledger)).toEqual(
        recent.slice(0, 1),
      )
      expect(trace).toHaveBeenCalledTimes(1)
    } finally {
      storage.close()
    }
  })

  it('keeps the first five eligible bases and does not rebuild unused Evidence histories', async () => {
    const { storage, service } = await harness(100)
    try {
      const projectId = id('project', 900000)
      const started = await service.executeUi({
        ...meta,
        kind: 'UI_START_DISCOVERY',
        projectId,
        idempotencyKey: id('idem', 900000),
        input: {
          learningGoal: 'TypeScript discriminated unions',
          currentLevel: 'BEGINNER',
          interestAreas: [],
        },
      })
      expect(started.success).toBe(true)
      const trace = vi.spyOn(storage.repository, 'readEvidenceTrace')
      const fullRecent = vi.spyOn(storage.repository, 'readRecentEvidenceTraces')
      const request = {
        ...meta,
        kind: 'UI_RESTORE_PROJECT_SESSION',
        projectId,
        helperConversationLimit: 20,
      } as const
      const before = await service.executeUi(request)
      expect(before.success).toBe(true)
      if (!before.success || !before.data.discoveryContext) throw new Error('CONTEXT_REQUIRED')
      const context = before.data.discoveryContext
      const expectedConcepts = [100, 99, 98, 97, 96].map((n) => id('concept', 10000 + n))
      expect(context.personalization.mode).toBe('EVIDENCE_AWARE')
      expect(context.personalization.basis.map((b) => b.conceptId)).toEqual(expectedConcepts)
      expect(context.relevantLedgerEntries.map((e) => e.concept.id)).toEqual(expectedConcepts)
      expect(
        context.personalization.basis.every(
          (b) =>
            b.sourceProjectIds.length === 1 &&
            b.sourceProjectIds[0] === f.ids.project &&
            b.purpose === 'DISCOVERY_TIE_BREAK',
        ),
      ).toBe(true)
      expect(trace).toHaveBeenCalledTimes(5)
      expect(fullRecent).not.toHaveBeenCalled()
      expect(storage.repository.readPersonalizationTracesForProject(projectId, 10)).toEqual([])

      expect(
        await service.executeUi({ ...request, kind: 'UI_PREPARE_DISCOVERY_AGENT_CONTEXT' }),
      ).toEqual(before)
      trace.mockClear()
      expect(await service.executeUi(request)).toEqual(before)
      expect(trace).not.toHaveBeenCalled()
      expect(fullRecent).not.toHaveBeenCalled()
      expect(storage.repository.readPersonalizationTracesForProject(projectId, 10)).toHaveLength(1)
      expect(storage.checkIntegrity()).toEqual({ quickCheck: 'ok', foreignKeyViolations: 0 })
    } finally {
      storage.close()
    }
  })

  it('does not treat current-project Evidence as prior-project personalization', async () => {
    const { storage, service } = await harness(10)
    try {
      const result = await service.executeUi({
        ...meta,
        kind: 'UI_RESTORE_PROJECT_SESSION',
        projectId: f.ids.project,
        helperConversationLimit: 20,
      })
      expect(result).toMatchObject({
        success: true,
        data: {
          discoveryContext: {
            personalization: {
              mode: 'NO_RELEVANT_EVIDENCE',
              basis: [],
              fallbackReason: 'NO_PRIOR_PROJECT_EVIDENCE',
            },
            relevantLedgerEntries: [],
          },
        },
      })
    } finally {
      storage.close()
    }
  })
})
