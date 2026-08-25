import type {
  AcceptedEvidence,
  ActivityEvent,
  AuditRecord,
  BuilderTask,
  CandidateRound,
  CanonicalConcept,
  ConceptAliasProposal,
  ConceptLedgerEntry,
  DecisionApplication,
  DecisionRequest,
  DecisionResolution,
  DiscoveryFeedback,
  DiscoverySession,
  Episode,
  EvidenceDecision,
  EvidenceProposal,
  LearningSpecRevision,
  LiveProjectContext,
  MisconceptionIssue,
  Project,
  ProjectCandidateRevision,
  TaskCompletionReport,
} from '@vibe-helper/contracts'

export type PersistenceWriteOutcome = 'INSERTED' | 'NO_OP'

export type PersistenceErrorCode =
  | 'VALIDATION_FAILED'
  | 'UNSAFE_PAYLOAD'
  | 'REVISION_CONFLICT'
  | 'STORAGE_CONFLICT'
  | 'NOT_FOUND'
  | 'CORRUPT_DATABASE'
  | 'INTEGRITY_CHECK_FAILED'
  | 'MIGRATION_FAILED'
  | 'BACKUP_FAILED'
  | 'INVALID_STORAGE_PATH'
  | 'STORAGE_OPEN_FAILED'
  | 'STORAGE_CLOSED'
  | 'TRANSACTION_FAILED'

export class PersistenceError extends Error {
  readonly code: PersistenceErrorCode
  readonly resourceId: string | undefined

  constructor(code: PersistenceErrorCode, message: string, resourceId?: string) {
    super(message)
    this.name = 'PersistenceError'
    this.code = code
    this.resourceId = resourceId
  }
}

export interface PersistenceWriteResult {
  readonly outcome: PersistenceWriteOutcome
  readonly recordId: string
  readonly revision?: number
}

export interface IdempotencyReceipt {
  readonly key: string
  readonly correlationId: string
  readonly operation: string
  readonly resourceId: string
  readonly resourceRevision?: number
  readonly recordedAt: string
}

export interface ProjectRecoveryState {
  readonly project: Project
  readonly discoverySession: DiscoverySession | null
  readonly selectedCandidate: ProjectCandidateRevision | null
  readonly learningSpec: LearningSpecRevision | null
  readonly activeTask: BuilderTask | null
  readonly pendingDecisions: readonly DecisionRequest[]
  readonly liveContext: LiveProjectContext | null
}

export interface EvidenceTrace {
  readonly concept: CanonicalConcept
  readonly ledger: ConceptLedgerEntry | null
  readonly aliasProposals: readonly ConceptAliasProposal[]
  readonly proposals: readonly EvidenceProposal[]
  readonly decisions: readonly EvidenceDecision[]
  readonly acceptedEvidence: readonly AcceptedEvidence[]
  readonly misconceptionIssues: readonly MisconceptionIssue[]
  readonly auditRecords: readonly AuditRecord[]
}

export interface PersistenceRepository {
  appendProject(record: Project): PersistenceWriteResult
  appendDiscoverySession(record: DiscoverySession): PersistenceWriteResult
  appendCandidate(record: ProjectCandidateRevision): PersistenceWriteResult
  appendCandidateRound(record: CandidateRound): PersistenceWriteResult
  appendDiscoveryFeedback(record: DiscoveryFeedback): PersistenceWriteResult
  appendLearningSpec(record: LearningSpecRevision): PersistenceWriteResult

  appendTask(record: BuilderTask): PersistenceWriteResult
  appendLiveContext(record: LiveProjectContext): PersistenceWriteResult
  appendDecisionRequest(record: DecisionRequest): PersistenceWriteResult
  appendDecisionResolution(record: DecisionResolution): PersistenceWriteResult
  appendDecisionApplication(record: DecisionApplication): PersistenceWriteResult
  appendCompletionReport(record: TaskCompletionReport): PersistenceWriteResult

  appendActivityEvent(record: ActivityEvent): PersistenceWriteResult
  appendEpisode(record: Episode): PersistenceWriteResult

  appendCanonicalConcept(record: CanonicalConcept): PersistenceWriteResult
  appendConceptAliasProposal(record: ConceptAliasProposal): PersistenceWriteResult
  appendEvidenceProposal(record: EvidenceProposal): PersistenceWriteResult
  appendEvidenceDecision(record: EvidenceDecision): PersistenceWriteResult
  appendAcceptedEvidence(record: AcceptedEvidence): PersistenceWriteResult
  appendMisconceptionIssue(record: MisconceptionIssue): PersistenceWriteResult
  appendConceptLedger(record: ConceptLedgerEntry): PersistenceWriteResult
  appendAuditRecord(record: AuditRecord): PersistenceWriteResult
  appendIdempotencyReceipt(record: IdempotencyReceipt): PersistenceWriteResult

  recoverProject(projectId: string): ProjectRecoveryState | null
  readEvidenceTrace(conceptId: string): EvidenceTrace | null
}

export interface StorageUnitOfWork {
  transaction<T>(work: (repository: PersistenceRepository) => T): T
}
