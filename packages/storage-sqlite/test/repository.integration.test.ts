import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { PersistenceError } from '@vibe-helper/application'
import {
  acceptedEvidenceSchema,
  activityEventSchema,
  auditRecordSchema,
  builderTaskSchema,
  candidateRoundSchema,
  canonicalConceptSchema,
  conceptAliasProposalSchema,
  conceptLedgerEntrySchema,
  decisionApplicationSchema,
  decisionRequestSchema,
  decisionResolutionSchema,
  discoveryFeedbackSchema,
  discoverySessionSchema,
  episodeSchema,
  evidenceDecisionSchema,
  evidenceProposalSchema,
  learningSpecRevisionSchema,
  liveProjectContextSchema,
  misconceptionIssueSchema,
  projectCandidateRevisionSchema,
  projectSchema,
} from '@vibe-helper/contracts'
import { describe, expect, it } from 'vitest'

import { openInMemorySqliteStorage, openSqliteStorage } from '../src/index.js'
import {
  acceptedEvidenceFixture,
  activityEventFixture,
  auditRecordFixture,
  builderTaskFixture,
  candidateFixture,
  candidateRoundFixture,
  canonicalConceptFixture,
  conceptLedgerFixture,
  confirmedLearningSpecFixture,
  decisionApplicationFixture,
  decisionRequestFixture,
  decisionResolutionFixture,
  discoveryFeedbackFixture,
  discoverySessionFixture,
  draftLearningSpecFixture,
  episodeFixture,
  evidenceProposalFixture,
  ids,
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
  decision: decisionRequestSchema.parse(decisionRequestFixture),
  event: activityEventSchema.parse(activityEventFixture),
  episode: episodeSchema.parse(episodeFixture),
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
  repository.appendDecisionRequest(records.decision)
  repository.appendActivityEvent(records.event)
  repository.appendEpisode(records.episode)
  repository.appendCanonicalConcept(records.concept)
  repository.appendConceptAliasProposal(records.alias)
  repository.appendEvidenceProposal(records.evidenceProposal)
  repository.appendEvidenceDecision(records.evidenceDecision)
  repository.appendAcceptedEvidence(records.evidence)
  repository.appendMisconceptionIssue(records.issue)
  repository.appendConceptLedger(records.ledger)
  repository.appendAuditRecord(records.audit)
}

const repositoryOf = (storage: Awaited<ReturnType<typeof openInMemorySqliteStorage>>) =>
  storage.repository

describe('SQLite persistence repository', () => {
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
      pendingDecisions: [records.decision],
      liveContext: records.context,
    })
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
      resourceId: ids.project,
      resourceRevision: 1,
      recordedAt: timestamp,
    } as const
    expect(storage.repository.appendIdempotencyReceipt(receipt).outcome).toBe('INSERTED')
    expect(storage.repository.appendIdempotencyReceipt(receipt).outcome).toBe('NO_OP')
    expect(() =>
      storage.repository.appendIdempotencyReceipt({ ...receipt, operation: 'project.update' }),
    ).toThrowError(expect.objectContaining({ code: 'STORAGE_CONFLICT' }))
    storage.close()
  })
})
