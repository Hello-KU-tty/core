import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'

import type { PersistenceError } from '@vibe-helper/application'
import {
  acceptedEvidenceSchema,
  activityEventSchema,
  analysisJobSchema,
  auditRecordSchema,
  baselineResultSchema,
  builderTaskSchema,
  candidateRoundSchema,
  canonicalConceptSchema,
  conceptAliasProposalSchema,
  conceptLedgerEntrySchema,
  contextRefreshRequestSchema,
  decisionApplicationSchema,
  decisionRequestSchema,
  decisionResolutionSchema,
  discoveryFeedbackSchema,
  discoverySessionSchema,
  episodeSchema,
  evidenceDecisionSchema,
  evidenceProposalSchema,
  evaluationRunSchema,
  learningSpecRevisionSchema,
  liveProjectContextSchema,
  misconceptionIssueSchema,
  personalizationTraceSchema,
  projectCandidateRevisionSchema,
  projectSchema,
} from '@vibe-helper/contracts'
import { describe, expect, it, vi } from 'vitest'

import { openInMemorySqliteStorage, openSqliteStorage } from '../src/index.js'
import {
  acceptedEvidenceFixture,
  activityEventFixture,
  analysisJobPendingFixture,
  auditRecordFixture,
  baselineResultFixture,
  builderTaskFixture,
  candidateFixture,
  candidateRoundFixture,
  canonicalConceptFixture,
  conceptLedgerFixture,
  contextRefreshRequestFixture,
  confirmedLearningSpecFixture,
  decisionApplicationFixture,
  decisionRequestFixture,
  decisionResolutionFixture,
  discoveryFeedbackFixture,
  discoverySessionFixture,
  draftLearningSpecFixture,
  episodeFixture,
  evidenceProposalFixture,
  evaluationRunFixture,
  ids,
  helperPersonalizationFixture,
  liveContextFixture,
  projectFixture,
  timestamp,
} from '../../contracts/test/fixtures.js'

const evidenceDecisionFixture = evidenceDecisionSchema.parse({
  schemaVersion: 1,
  id: ids.evidenceDecision,
  evidenceProposalId: ids.evidenceProposal,
  correlationId: ids.correlation,
  outcome: 'ACCEPTED',
  reasonCode: 'VALID_USER_EVIDENCE',
  explanation: 'The evidence is user-authored and supports the proposed state.',
  decidedAt: timestamp,
  source: { kind: 'CORE' },
})

const aliasProposalFixture = conceptAliasProposalSchema.parse({
  schemaVersion: 1,
  id: 'alias_proposal_00000000-0000-4000-8000-000000000061',
  correlationId: ids.correlation,
  proposedAlias: 'input validation',
  canonicalConceptId: ids.concept,
  rationale: 'The phrase refers to the same executable boundary check.',
  status: 'ACCEPTED',
  proposedAt: timestamp,
  source: { kind: 'AGENT', role: 'EVIDENCE_ANALYST' },
})

const misconceptionIssueFixture = misconceptionIssueSchema.parse({
  schemaVersion: 1,
  id: 'misconception_00000000-0000-4000-8000-000000000062',
  conceptId: ids.concept,
  projectId: ids.project,
  openedByEvidenceId: ids.evidence,
  status: 'OPEN',
  summary: 'Runtime validation was confused with static type checking.',
  supportingEvidenceIds: [ids.evidence],
  openedAt: timestamp,
  source: { kind: 'CORE' },
})

const records = {
  project: projectSchema.parse(projectFixture),
  session: discoverySessionSchema.parse(discoverySessionFixture),
  candidate: projectCandidateRevisionSchema.parse(candidateFixture),
  round: candidateRoundSchema.parse(candidateRoundFixture),
  selection: discoveryFeedbackSchema.parse(discoveryFeedbackFixture),
  draftSpec: learningSpecRevisionSchema.parse(draftLearningSpecFixture),
  confirmedSpec: learningSpecRevisionSchema.parse(confirmedLearningSpecFixture),
  task: builderTaskSchema.parse(builderTaskFixture),
  context: liveProjectContextSchema.parse(liveContextFixture),
  contextRefresh: contextRefreshRequestSchema.parse(contextRefreshRequestFixture),
  decision: decisionRequestSchema.parse(decisionRequestFixture),
  event: activityEventSchema.parse(activityEventFixture),
  episode: episodeSchema.parse(episodeFixture),
  analysisJob: analysisJobSchema.parse(analysisJobPendingFixture),
  concept: canonicalConceptSchema.parse(canonicalConceptFixture),
  alias: aliasProposalFixture,
  evidenceProposal: evidenceProposalSchema.parse(evidenceProposalFixture),
  evidenceDecision: evidenceDecisionFixture,
  evidence: acceptedEvidenceSchema.parse(acceptedEvidenceFixture),
  issue: misconceptionIssueFixture,
  ledger: conceptLedgerEntrySchema.parse({
    ...conceptLedgerFixture,
    openIssues: [misconceptionIssueFixture],
  }),
  personalization: personalizationTraceSchema.parse(helperPersonalizationFixture),
  audit: auditRecordSchema.parse(auditRecordFixture),
}

const appendRecoveryGraph = (repository: ReturnType<typeof repositoryOf>): void => {
  repository.appendProject(records.project)
  repository.appendDiscoverySession(records.session)
  repository.appendCandidate(records.candidate)
  repository.appendCandidateRound(records.round)
  repository.appendDiscoveryFeedback(records.selection)
  repository.appendLearningSpec(records.draftSpec)
  repository.appendLearningSpec(records.confirmedSpec)
  repository.appendTask(records.task)
  repository.appendLiveContext(records.context)
  repository.appendContextRefreshRequest(records.contextRefresh)
  repository.appendDecisionRequest(records.decision)
  repository.appendActivityEvent(records.event)
  repository.appendEpisode(records.episode)
  repository.appendAnalysisJob(records.analysisJob)
  repository.appendCanonicalConcept(records.concept)
  repository.appendConceptAliasProposal(records.alias)
  repository.appendEvidenceProposal(records.evidenceProposal)
  repository.appendEvidenceDecision(records.evidenceDecision)
  repository.appendAcceptedEvidence(records.evidence)
  repository.appendMisconceptionIssue(records.issue)
  repository.appendConceptLedger(records.ledger)
  repository.appendPersonalizationTrace(records.personalization)
  repository.appendAuditRecord(records.audit)
}

const repositoryOf = (storage: Awaited<ReturnType<typeof openInMemorySqliteStorage>>) =>
  storage.repository

describe('SQLite persistence repository', () => {
  it('filters direct project Evidence membership before hydrating full Concept traces', async () => {
    const dataDirectory = await mkdtemp(join(tmpdir(), 'vibe-evidence-filter-'))
    const initial = await openSqliteStorage({ dataDirectory })
    const conceptId = 'concept_00000000-0000-4000-8000-000000985201'
    const unusedConceptId = 'concept_00000000-0000-4000-8000-000000985202'
    const foreignProjectId = 'project_00000000-0000-4000-8000-000000985201'
    try {
      appendRecoveryGraph(initial.repository)
      initial.repository.appendProject({
        ...records.project,
        id: foreignProjectId,
        title: 'Unrelated project',
      })
      for (const [id, canonicalName] of [
        [conceptId, 'Rejected-only concept'],
        [unusedConceptId, 'Unrelated concept'],
      ]) {
        if (!id || !canonicalName) throw new Error('FIXTURE_REQUIRED')
        initial.repository.appendCanonicalConcept({ ...records.concept, id, canonicalName })
      }
      const proposal = {
        ...records.evidenceProposal,
        id: 'evidence_proposal_00000000-0000-4000-8000-000000985201',
        concept: {
          ...records.evidenceProposal.concept,
          canonicalConceptId: conceptId,
          proposedCanonicalName: 'Rejected-only concept',
        },
      }
      initial.repository.appendEvidenceProposal(proposal)
      initial.repository.appendEvidenceDecision({
        ...records.evidenceDecision,
        id: 'evidence_decision_00000000-0000-4000-8000-000000985201',
        evidenceProposalId: proposal.id,
        outcome: 'REJECTED',
        reasonCode: 'INSUFFICIENT_EVIDENCE',
      })
    } finally {
      initial.close()
    }
    const storage = await openSqliteStorage({ dataDirectory })
    try {
      const r = storage.repository
      const all = r.readEvidenceTracesForProject(ids.project)
      expect(all.map((trace) => trace.concept.id)).toEqual([ids.concept, conceptId])
      const read = vi.spyOn(r, 'readEvidenceTrace')
      expect(r.readEvidenceTracesForProject(ids.project, ids.concept)).toEqual([all[0]])
      expect(read).toHaveBeenCalledExactlyOnceWith(ids.concept)
      read.mockClear()
      expect(r.readEvidenceTracesForProject(ids.project, conceptId)).toEqual([all[1]])
      expect(read).toHaveBeenCalledExactlyOnceWith(conceptId)
      read.mockClear()
      for (const [projectId, filteredConcept] of [
        [foreignProjectId, ids.concept],
        [ids.project, unusedConceptId],
        [ids.project, 'concept_00000000-0000-4000-8000-000000985299'],
      ]) {
        if (!projectId || !filteredConcept) throw new Error('FIXTURE_REQUIRED')
        expect(r.readEvidenceTracesForProject(projectId, filteredConcept)).toEqual([])
      }
      expect(read).not.toHaveBeenCalled()
      for (const [projectId, filteredConcept] of [
        ['invalid', ids.concept],
        [ids.project, 'invalid'],
      ]) {
        if (!projectId) throw new Error('FIXTURE_REQUIRED')
        expect(() => r.readEvidenceTracesForProject(projectId, filteredConcept)).toThrowError(
          expect.objectContaining({ code: 'VALIDATION_FAILED' }),
        )
      }
      if (storage.databasePath === null) throw new Error('FILE_DATABASE_REQUIRED')
      const tamper = new Database(storage.databasePath)
      try {
        tamper
          .prepare('UPDATE concept_ledger_revisions SET payload_hash = ? WHERE ledger_id = ?')
          .run('0'.repeat(64), records.ledger.id)
      } finally {
        tamper.close()
      }
      expect(() => r.readEvidenceTracesForProject(ids.project, ids.concept)).toThrowError(
        expect.objectContaining({ code: 'CORRUPT_DATABASE' }),
      )
    } finally {
      storage.close()
    }
  })

  it('still verifies stored Ledger hashes in the bounded read path', async () => {
    const dataDirectory = await mkdtemp(join(tmpdir(), 'vibe-ledger-read-integrity-'))
    const storage = await openSqliteStorage({ dataDirectory })
    try {
      appendRecoveryGraph(storage.repository)
      if (storage.databasePath === null) throw new Error('FILE_DATABASE_REQUIRED')
      const tamper = new Database(storage.databasePath)
      try {
        tamper
          .prepare('UPDATE concept_ledger_revisions SET payload_hash = ? WHERE ledger_id = ?')
          .run('0'.repeat(64), records.ledger.id)
      } finally {
        tamper.close()
      }
      expect(() => storage.repository.readRecentConceptLedgers(1)).toThrowError(
        expect.objectContaining({ code: 'CORRUPT_DATABASE' }),
      )
      expect(() => storage.repository.readRecentEvidenceTraces(1)).toThrowError(
        expect.objectContaining({ code: 'CORRUPT_DATABASE' }),
      )
    } finally {
      storage.close()
    }
  })

  it.each([false, true])(
    'preserves the original full-query order across tied Ledger timestamps (reverse=%s)',
    async (reverse) => {
      const dataDirectory = await mkdtemp(join(tmpdir(), 'vibe-ledger-tied-order-'))
      const storage = await openSqliteStorage({ dataDirectory })
      try {
        appendRecoveryGraph(storage.repository)
        const entries = Array.from({ length: 110 }, (_, n) => n + 1)
        if (reverse) entries.reverse()
        storage.transaction((r) => {
          for (const n of entries) {
            const identity = (prefix: string) =>
              `${prefix}_00000000-0000-4000-8000-${String(986000 + n).padStart(12, '0')}`
            const concept = {
              ...records.concept,
              id: identity('concept'),
              canonicalName: `Tied synthetic concept ${n}`,
            }
            const proposal = {
              ...records.evidenceProposal,
              id: identity('evidence_proposal'),
              concept: {
                ...records.evidenceProposal.concept,
                canonicalConceptId: concept.id,
                proposedCanonicalName: concept.canonicalName,
              },
            }
            const decision = {
              ...records.evidenceDecision,
              id: identity('evidence_decision'),
              evidenceProposalId: proposal.id,
            }
            const evidence = {
              ...records.evidence,
              id: identity('evidence'),
              conceptId: concept.id,
              evidenceProposalId: proposal.id,
              evidenceDecisionId: decision.id,
            }
            const ledger = {
              ...records.ledger,
              id: identity('concept_ledger'),
              concept,
              acceptedAliases: [],
              openIssues: [],
              state: {
                ...records.ledger.state,
                conceptId: concept.id,
                acceptedEvidenceIds: [evidence.id],
              },
            }
            r.appendCanonicalConcept(concept)
            r.appendEvidenceProposal(proposal)
            r.appendEvidenceDecision(decision)
            r.appendAcceptedEvidence(evidence)
            r.appendConceptLedger(ledger)
            // A current head need not be the first inserted revision. Keep all
            // updatedAt values tied, including the updated heads.
            if (n % 3 === 0) r.appendConceptLedger({ ...ledger, revision: 2 })
          }
        })
        if (storage.databasePath === null) throw new Error('FILE_DATABASE_REQUIRED')
        const audit = new Database(storage.databasePath, { readonly: true })
        let originalOrder: ReturnType<typeof conceptLedgerEntrySchema.parse>[]
        try {
          originalOrder = audit
            .prepare(`SELECT revisions.payload_json
            FROM concept_ledgers heads JOIN concept_ledger_revisions revisions
              ON revisions.ledger_id = heads.id AND revisions.revision = heads.head_revision
            ORDER BY revisions.updated_at DESC`)
            .all()
            .map((row) =>
              conceptLedgerEntrySchema.parse(
                JSON.parse((row as { payload_json: string }).payload_json),
              ),
            )
        } finally {
          audit.close()
        }
        expect(originalOrder).toHaveLength(111)
        for (const limit of [1, 5, 20, 100]) {
          expect(storage.repository.readRecentConceptLedgers(limit)).toEqual(
            originalOrder.slice(0, limit),
          )
          expect(
            storage.repository.readRecentEvidenceTraces(limit).map((trace) => trace.ledger),
          ).toEqual(originalOrder.slice(0, limit))
        }
        expect(storage.checkIntegrity()).toEqual({ quickCheck: 'ok', foreignKeyViolations: 0 })
      } finally {
        storage.close()
      }
    },
  )

  it('reads bounded recent Ledger heads without rebuilding Evidence histories', async () => {
    const storage = await openInMemorySqliteStorage()
    try {
      appendRecoveryGraph(storage.repository)
      const next = conceptLedgerEntrySchema.parse({
        ...records.ledger,
        revision: 2,
        updatedAt: '2026-08-25T04:00:00.000Z',
      })
      storage.repository.appendConceptLedger(next)
      const readTrace = vi.spyOn(storage.repository, 'readEvidenceTrace')
      expect(storage.repository.readRecentConceptLedgers(1)).toEqual([next])
      expect(readTrace).not.toHaveBeenCalled()
      expect(storage.repository.readRecentEvidenceTraces(1).map((trace) => trace.ledger)).toEqual([
        next,
      ])
      expect(readTrace).toHaveBeenCalledTimes(1)
      for (const limit of [0, -1, 101, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
        expect(() => storage.repository.readRecentConceptLedgers(limit)).toThrowError(
          expect.objectContaining({ code: 'VALIDATION_FAILED' }),
        )
        expect(() => storage.repository.readRecentEvidenceTraces(limit)).toThrowError(
          expect.objectContaining({ code: 'VALIDATION_FAILED' }),
        )
      }
    } finally {
      storage.close()
    }
  })

  it('keeps closed history status selection, latest revisions and event order after reopen', async () => {
    const dataDirectory = await mkdtemp(join(tmpdir(), 'vibe-closed-history-read-'))
    const first = await openSqliteStorage({ dataDirectory })
    appendRecoveryGraph(first.repository)
    const open = episodeSchema.parse({
      ...records.episode,
      id: 'episode_00000000-0000-4000-8000-000000000910',
      type: 'HELPER_CONVERSATION',
      status: 'OPEN',
      endedAt: undefined,
      closeReason: undefined,
    })
    first.repository.appendEpisode(open)
    first.repository.appendEpisode({
      ...records.episode,
      id: 'episode_00000000-0000-4000-8000-000000000911',
      type: 'BUILD_TASK',
      status: 'ANALYSIS_FAILED',
      endedAt: '2026-08-25T05:00:00.000Z',
    })
    first.repository.appendEpisode({
      ...records.episode,
      revision: 2,
      status: 'ANALYZED',
      endedAt: '2026-08-25T06:00:00.000Z',
    })
    const foreignProjectId = 'project_00000000-0000-4000-8000-000000000912'
    const foreignEventId = 'event_00000000-0000-4000-8000-000000000912'
    const foreignEpisodeId = 'episode_00000000-0000-4000-8000-000000000912'
    first.repository.appendProject({
      ...records.project,
      id: foreignProjectId,
      generatedWorkspacePath: 'projects/synthetic-foreign-history',
    })
    first.repository.appendActivityEvent({
      ...records.event,
      id: foreignEventId,
      projectId: foreignProjectId,
      taskId: undefined,
      decisionId: undefined,
    })
    first.repository.appendEpisode({
      ...records.episode,
      id: foreignEpisodeId,
      projectId: foreignProjectId,
      taskId: undefined,
      decisionId: undefined,
      eventIds: [foreignEventId],
      endedAt: '2026-08-25T07:00:00.000Z',
    })
    const full = first.repository.readRecentEpisodeAggregatesForProject(ids.project, 50)
    expect(full.map(({ episode }) => episode.status)).toEqual(['ANALYZED', 'ANALYSIS_FAILED'])
    first.close()
    const storage = await openSqliteStorage({ dataDirectory })
    try {
      const fullRead = vi.spyOn(storage.repository, 'readEpisodeAggregate')
      const expected = full.map(({ episode, events }) => ({ episode, events }))
      for (const history of expected)
        expect(storage.repository.readEpisodeHistory(ids.project, history.episode.id)).toEqual(
          history,
        )
      expect(storage.repository.readEpisodeHistory(ids.project, open.id)).toEqual({
        episode: open,
        events: [records.event],
      })
      expect(storage.repository.readEpisodeHistory(ids.project, foreignEpisodeId)).toBeNull()
      expect(storage.repository.readEpisodeHistory(foreignProjectId, ids.episode)).toBeNull()
      expect(
        storage.repository.readEpisodeHistory(
          ids.project,
          'episode_00000000-0000-4000-8000-000000000999',
        ),
      ).toBeNull()
      expect(
        storage.repository.readEpisodeHistory(foreignProjectId, foreignEpisodeId)?.episode.id,
      ).toBe(foreignEpisodeId)
      for (const [projectId, episodeId] of [
        ['../outside', ids.episode],
        [ids.project, '../outside'],
      ]) {
        if (!projectId || !episodeId) throw new Error('FIXTURE_REQUIRED')
        expect(() => storage.repository.readEpisodeHistory(projectId, episodeId)).toThrowError(
          expect.objectContaining({ code: 'VALIDATION_FAILED' }),
        )
      }
      expect(storage.repository.readRecentEpisodeHistoryForProject(ids.project, 50)).toEqual(
        expected,
      )
      expect(storage.repository.readRecentEpisodeHistoryForProject(ids.project, 1)).toEqual(
        expected.slice(0, 1),
      )
      expect(fullRead).not.toHaveBeenCalled()
      expect(
        storage.repository
          .readRecentEpisodeHistoryForProject(foreignProjectId, 50)
          .map(({ episode }) => episode.id),
      ).toEqual([foreignEpisodeId])
      expect(
        storage.repository.readRecentEpisodeHistoryForProject(
          'project_00000000-0000-4000-8000-000000000913',
          50,
        ),
      ).toEqual([])
      for (const limit of [0, -1, 51, 1.5, Number.NaN, Number.POSITIVE_INFINITY])
        expect(() =>
          storage.repository.readRecentEpisodeHistoryForProject(ids.project, limit),
        ).toThrowError(expect.objectContaining({ code: 'VALIDATION_FAILED' }))
      expect(() =>
        storage.repository.readRecentEpisodeHistoryForProject('../outside', 1),
      ).toThrowError(expect.objectContaining({ code: 'VALIDATION_FAILED' }))
    } finally {
      storage.close()
    }
  })

  it('reads scoped validated Helper history without full Evidence hydration after reopen', async () => {
    const dataDirectory = await mkdtemp(join(tmpdir(), 'vibe-helper-history-read-'))
    const first = await openSqliteStorage({ dataDirectory })
    appendRecoveryGraph(first.repository)
    first.repository.appendEpisode({
      ...records.episode,
      id: 'episode_00000000-0000-4000-8000-000000000901',
      type: 'HELPER_CONVERSATION',
      conversationId: ids.conversation,
    })
    const full = first.repository.readRecentHelperConversationAggregatesForProject(ids.project, 20)
    expect(full).toHaveLength(1)
    first.close()
    const storage = await openSqliteStorage({ dataDirectory })
    try {
      const readFull = vi.spyOn(storage.repository, 'readEpisodeAggregate')
      expect(
        storage.repository.readRecentHelperConversationHistoryForProject(ids.project, 20),
      ).toEqual(full.map(({ episode, events }) => ({ episode, events })))
      expect(readFull).not.toHaveBeenCalled()
      expect(
        storage.repository.readRecentHelperConversationHistoryForProject(
          'project_00000000-0000-4000-8000-000000000902',
          20,
        ),
      ).toEqual([])
      for (const limit of [0, 21, 1.5, Number.NaN])
        expect(() =>
          storage.repository.readRecentHelperConversationHistoryForProject(ids.project, limit),
        ).toThrowError(expect.objectContaining({ code: 'VALIDATION_FAILED' }))
      expect(() =>
        storage.repository.readRecentHelperConversationHistoryForProject('../outside', 1),
      ).toThrowError(expect.objectContaining({ code: 'VALIDATION_FAILED' }))
    } finally {
      storage.close()
    }
  })

  it('rejects corrupt Episode and Event hashes in the lightweight Helper history read', async () => {
    for (const table of ['episode_revisions', 'activity_events']) {
      const dataDirectory = await mkdtemp(join(tmpdir(), 'vibe-helper-history-integrity-'))
      const storage = await openSqliteStorage({ dataDirectory })
      try {
        appendRecoveryGraph(storage.repository)
        storage.repository.appendEpisode({
          ...records.episode,
          id: 'episode_00000000-0000-4000-8000-000000000903',
          type: 'HELPER_CONVERSATION',
          conversationId: ids.conversation,
        })
        const tamper = new Database(storage.databasePath)
        try {
          tamper.prepare(`UPDATE ${table} SET payload_hash = ?`).run('0'.repeat(64))
        } finally {
          tamper.close()
        }
        expect(() => storage.repository.readEpisodeHistory(ids.project, ids.episode)).toThrowError(
          expect.objectContaining({ code: 'CORRUPT_DATABASE' }),
        )
        expect(() =>
          storage.repository.readRecentHelperConversationHistoryForProject(ids.project, 20),
        ).toThrowError(expect.objectContaining({ code: 'CORRUPT_DATABASE' }))
        expect(() =>
          storage.repository.readRecentEpisodeHistoryForProject(ids.project, 20),
        ).toThrowError(expect.objectContaining({ code: 'CORRUPT_DATABASE' }))
      } finally {
        storage.close()
      }
    }
  })

  it('restores the current project and evidence projections after a close and reopen', async () => {
    const dataDirectory = await mkdtemp(join(tmpdir(), 'vibe-helper-recovery-'))
    const first = await openSqliteStorage({ dataDirectory })
    appendRecoveryGraph(first.repository)
    expect(first.repository.appendActivityEvent(records.event)).toEqual({
      outcome: 'NO_OP',
      recordId: ids.eventUser,
    })
    expect(first.repository.appendProject(records.project)).toEqual({
      outcome: 'NO_OP',
      recordId: ids.project,
      revision: 1,
    })
    first.close()

    const reopened = await openSqliteStorage({ dataDirectory })
    expect(reopened.checkIntegrity()).toEqual({ quickCheck: 'ok', foreignKeyViolations: 0 })
    expect(reopened.repository.recoverProject(ids.project)).toEqual({
      project: records.project,
      discoverySession: records.session,
      selectedCandidate: records.candidate,
      learningSpec: records.confirmedSpec,
      activeTask: records.task,
      currentTask: records.task,
      pendingDecisions: [records.decision],
      liveContext: records.context,
    })
    expect(reopened.repository.readProjects(10)).toEqual([records.project])
    expect(reopened.repository.countHelperConversationsForProject(ids.project)).toBe(0)
    expect(
      reopened.repository.readRecentHelperConversationAggregatesForProject(ids.project, 10),
    ).toEqual([])
    expect(reopened.repository.readEvidenceTrace(ids.concept)).toEqual({
      concept: records.concept,
      ledger: records.ledger,
      aliasProposals: [records.alias],
      proposals: [records.evidenceProposal],
      decisions: [records.evidenceDecision],
      acceptedEvidence: [records.evidence],
      misconceptionIssues: [records.issue],
      auditRecords: [records.audit],
    })
    expect(reopened.repository.readDiscoveryAggregate(ids.project, ids.discoverySession)).toEqual({
      project: records.project,
      session: records.session,
      rounds: [records.round],
      previewRound: null,
      candidateEnrichments: [],
      candidates: [records.candidate],
      feedback: [records.selection],
      learningSpecs: [records.draftSpec, records.confirmedSpec],
      relevantLedgerEntries: [records.ledger],
    })
    expect(reopened.repository.readBuilderTaskAggregate(ids.project, ids.task)).toEqual({
      project: records.project,
      learningSpec: records.confirmedSpec,
      task: records.task,
      liveContext: records.context,
      decisionRequests: [records.decision],
      decisionResolutions: [],
      decisionApplications: [],
      contextRefreshRequests: [records.contextRefresh],
      completionReport: null,
    })
    expect(reopened.repository.readEpisodeAggregate(ids.project, ids.episode)).toEqual({
      episode: records.episode,
      events: [records.event],
      relevantLedgerEntries: [records.ledger],
      evidenceProposals: [records.evidenceProposal],
    })
    expect(reopened.repository.readAnalysisJob(ids.project, ids.analysisJob)).toEqual(
      records.analysisJob,
    )
    expect(reopened.repository.readAnalysisJobForEpisode(ids.project, ids.episode)).toEqual(
      records.analysisJob,
    )
    expect(reopened.repository.readPendingAnalysisJobs(10)).toEqual([records.analysisJob])
    expect(reopened.repository.readAnalysisJobsForProject(ids.project, 'PENDING', 10)).toEqual([
      records.analysisJob,
    ])
    expect(reopened.repository.readCanonicalConceptById(ids.concept)).toEqual(records.concept)
    expect(reopened.repository.readCanonicalConceptByName('RUNTIME VALIDATION')).toEqual(
      records.concept,
    )
    expect(reopened.repository.readEvidenceTracesForProject(ids.project)).toHaveLength(1)
    expect(reopened.repository.readPersonalizationTrace(ids.personalization)).toEqual(
      records.personalization,
    )
    expect(reopened.repository.readPersonalizationTracesForProject(ids.project, 10)).toEqual([
      records.personalization,
    ])
    reopened.close()
  })

  it('rejects conflicting revisions without changing the stored head', async () => {
    const storage = await openInMemorySqliteStorage()
    storage.repository.appendProject(records.project)

    expect(() =>
      storage.repository.appendProject({ ...records.project, title: 'Conflicting title' }),
    ).toThrowError(
      expect.objectContaining<Partial<PersistenceError>>({ code: 'REVISION_CONFLICT' }),
    )
    expect(storage.repository.recoverProject(ids.project)?.project).toEqual(records.project)
    storage.close()
  })

  it('persists revisioned Evaluation runs and immutable baseline results', async () => {
    const storage = await openInMemorySqliteStorage()
    const pending = evaluationRunSchema.parse({
      ...evaluationRunFixture,
      status: 'PENDING',
      completedAt: undefined,
      results: [],
    })
    const completed = evaluationRunSchema.parse({ ...evaluationRunFixture, revision: 2 })
    const baseline = baselineResultSchema.parse(baselineResultFixture)

    expect(storage.repository.appendEvaluationRun(pending)).toEqual({
      outcome: 'INSERTED',
      recordId: pending.id,
      revision: 1,
    })
    expect(storage.repository.appendEvaluationRun(completed)).toEqual({
      outcome: 'INSERTED',
      recordId: completed.id,
      revision: 2,
    })
    expect(storage.repository.appendEvaluationRun(completed).outcome).toBe('NO_OP')
    expect(storage.repository.appendBaselineResult(baseline).outcome).toBe('INSERTED')
    expect(storage.repository.appendBaselineResult(baseline).outcome).toBe('NO_OP')
    expect(storage.repository.readEvaluationRun(completed.id)).toEqual(completed)
    expect(storage.repository.readBaselineResult(baseline.id)).toEqual(baseline)

    expect(() =>
      storage.repository.appendEvaluationRun({
        ...completed,
        evaluatorVersion: '1.0.1',
      }),
    ).toThrowError(
      expect.objectContaining<Partial<PersistenceError>>({ code: 'REVISION_CONFLICT' }),
    )
    expect(storage.repository.readEvaluationRun(completed.id)).toEqual(completed)
    storage.close()
  })

  it('updates the pending Decision projection through resolution and application', async () => {
    const storage = await openInMemorySqliteStorage()
    appendRecoveryGraph(storage.repository)
    const resolution = decisionResolutionSchema.parse(decisionResolutionFixture)
    const application = decisionApplicationSchema.parse(decisionApplicationFixture)

    expect(storage.repository.appendDecisionResolution(resolution).outcome).toBe('INSERTED')
    expect(storage.repository.recoverProject(ids.project)?.pendingDecisions).toEqual([])
    expect(storage.repository.appendDecisionApplication(application).outcome).toBe('INSERTED')
    expect(storage.repository.appendDecisionApplication(application).outcome).toBe('NO_OP')
    expect(storage.repository.recoverProject(ids.project)?.pendingDecisions).toEqual([])
    storage.close()
  })

  it('rolls back all writes when a Unit of Work callback fails', async () => {
    const storage = await openInMemorySqliteStorage()
    expect(() =>
      storage.transaction((repository) => {
        repository.appendProject(records.project)
        throw new Error('caller failure')
      }),
    ).toThrowError(
      expect.objectContaining<Partial<PersistenceError>>({ code: 'TRANSACTION_FAILED' }),
    )
    expect(storage.repository.recoverProject(ids.project)).toBeNull()
    storage.close()
  })

  it('rejects credential-like contract payloads without echoing the secret', async () => {
    const storage = await openInMemorySqliteStorage()
    const secret = 'Bearer abcdefghijklmnopqrstuvwxyz123456'
    let caught: unknown
    try {
      storage.repository.appendProject({ ...records.project, learningGoal: secret })
    } catch (error) {
      caught = error
    }
    expect(caught).toMatchObject({ code: 'UNSAFE_PAYLOAD' })
    expect(String(caught)).not.toContain(secret)
    expect(storage.repository.recoverProject(ids.project)).toBeNull()
    storage.close()
  })

  it('stores idempotency receipts as immutable replay-safe records', async () => {
    const storage = await openInMemorySqliteStorage()
    const receipt = {
      key: ids.idempotency,
      correlationId: ids.correlation,
      operation: 'project.create',
      requestHash: 'a'.repeat(64),
      responseJson: '{"accepted":true}',
      responseHash: '11a49f853eb8befe94fef278d487125cd20930b9e41c4c0934394443e7f00878',
      resourceId: ids.project,
      resourceRevision: 1,
      recordedAt: timestamp,
    } as const
    expect(storage.repository.appendIdempotencyReceipt(receipt).outcome).toBe('INSERTED')
    expect(storage.repository.appendIdempotencyReceipt(receipt).outcome).toBe('NO_OP')
    expect(storage.repository.readIdempotencyReceipt(ids.idempotency)).toEqual(receipt)
    expect(() =>
      storage.repository.appendIdempotencyReceipt({ ...receipt, operation: 'project.update' }),
    ).toThrowError(expect.objectContaining({ code: 'STORAGE_CONFLICT' }))
    expect(() =>
      storage.repository.appendIdempotencyReceipt({
        ...receipt,
        key: 'idem_00000000-0000-4000-8000-000000000099',
        responseJson: '',
        responseHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      }),
    ).toThrowError(expect.objectContaining({ code: 'VALIDATION_FAILED' }))
    storage.close()
  })
})
