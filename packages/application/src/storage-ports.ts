import type {
  AcceptedEvidence,
  AnalysisJob,
  ActivityEvent,
  AuditRecord,
  BaselineResult,
  BuilderTask,
  CandidateEnrichment,
  CandidatePreviewRound,
  CandidateRound,
  CanonicalConcept,
  ConceptAliasProposal,
  ConceptLedgerEntry,
  ContextRefreshRequest,
  DecisionApplication,
  DecisionRequest,
  DecisionResolution,
  DiscoveryFeedback,
  DiscoverySession,
  Episode,
  EvidenceDecision,
  EvidenceProposal,
  EvaluationRun,
  LearningSpecRevision,
  LiveProjectContext,
  MisconceptionIssue,
  PersonalizationTrace,
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
  readonly requestHash: string
  readonly responseJson: string
  readonly responseHash: string
  readonly resourceId: string
  readonly resourceRevision: number
  readonly recordedAt: string
}

export interface DiscoveryAggregate {
  readonly project: Project
  readonly session: DiscoverySession
  readonly rounds: readonly CandidateRound[]
  readonly previewRound: CandidatePreviewRound | null
  readonly candidateEnrichments: readonly CandidateEnrichment[]
  readonly candidates: readonly ProjectCandidateRevision[]
  readonly feedback: readonly DiscoveryFeedback[]
  readonly learningSpecs: readonly LearningSpecRevision[]
  readonly relevantLedgerEntries: readonly ConceptLedgerEntry[]
}

export interface BuilderTaskAggregate {
  readonly project: Project
  readonly learningSpec: LearningSpecRevision
  readonly task: BuilderTask
  readonly liveContext: LiveProjectContext | null
  readonly decisionRequests: readonly DecisionRequest[]
  readonly decisionResolutions: readonly DecisionResolution[]
  readonly decisionApplications: readonly DecisionApplication[]
  readonly contextRefreshRequests: readonly ContextRefreshRequest[]
  readonly completionReport: TaskCompletionReport | null
}

export interface EpisodeAggregate {
  readonly episode: Episode
  readonly events: readonly ActivityEvent[]
  readonly relevantLedgerEntries: readonly ConceptLedgerEntry[]
  readonly evidenceProposals: readonly EvidenceProposal[]
}

export interface ProjectRecoveryState {
  readonly project: Project
  readonly discoverySession: DiscoverySession | null
  readonly selectedCandidate: ProjectCandidateRevision | null
  readonly learningSpec: LearningSpecRevision | null
  readonly activeTask: BuilderTask | null
  readonly currentTask: BuilderTask | null
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
  appendCandidatePreviewRound(record: CandidatePreviewRound): PersistenceWriteResult
  appendCandidateEnrichment(record: CandidateEnrichment): PersistenceWriteResult
  appendCandidateRound(record: CandidateRound): PersistenceWriteResult
  appendDiscoveryFeedback(record: DiscoveryFeedback): PersistenceWriteResult
  appendLearningSpec(record: LearningSpecRevision): PersistenceWriteResult

  appendTask(record: BuilderTask): PersistenceWriteResult
  appendLiveContext(record: LiveProjectContext): PersistenceWriteResult
  appendContextRefreshRequest(record: ContextRefreshRequest): PersistenceWriteResult
  appendDecisionRequest(record: DecisionRequest): PersistenceWriteResult
  appendDecisionResolution(record: DecisionResolution): PersistenceWriteResult
  appendDecisionApplication(record: DecisionApplication): PersistenceWriteResult
  appendCompletionReport(record: TaskCompletionReport): PersistenceWriteResult

  appendActivityEvent(record: ActivityEvent): PersistenceWriteResult
  appendEpisode(record: Episode): PersistenceWriteResult
  appendAnalysisJob(record: AnalysisJob): PersistenceWriteResult

  appendCanonicalConcept(record: CanonicalConcept): PersistenceWriteResult
  appendConceptAliasProposal(record: ConceptAliasProposal): PersistenceWriteResult
  appendEvidenceProposal(record: EvidenceProposal): PersistenceWriteResult
  appendEvidenceDecision(record: EvidenceDecision): PersistenceWriteResult
  appendAcceptedEvidence(record: AcceptedEvidence): PersistenceWriteResult
  appendMisconceptionIssue(record: MisconceptionIssue): PersistenceWriteResult
  appendConceptLedger(record: ConceptLedgerEntry): PersistenceWriteResult
  appendPersonalizationTrace(record: PersonalizationTrace): PersistenceWriteResult
  appendAuditRecord(record: AuditRecord): PersistenceWriteResult
  appendEvaluationRun(record: EvaluationRun): PersistenceWriteResult
  appendBaselineResult(record: BaselineResult): PersistenceWriteResult
  appendIdempotencyReceipt(record: IdempotencyReceipt): PersistenceWriteResult

  recoverProject(projectId: string): ProjectRecoveryState | null
  readDiscoveryAggregate(projectId: string, discoverySessionId?: string): DiscoveryAggregate | null
  readDiscoveryAggregateBySession(discoverySessionId: string): DiscoveryAggregate | null
  readProjects(limit: number): readonly Project[]
  readBuilderTaskAggregate(projectId: string, taskId: string): BuilderTaskAggregate | null
  readLatestTaskForProject(projectId: string): BuilderTask | null
  readEpisodeAggregate(projectId: string, episodeId: string): EpisodeAggregate | null
  readAnalysisJob(projectId: string, analysisJobId: string): AnalysisJob | null
  readAnalysisJobForEpisode(projectId: string, episodeId: string): AnalysisJob | null
  readPendingAnalysisJobs(limit: number): readonly AnalysisJob[]
  readExpiredRunningAnalysisJobs(asOf: string, limit: number): readonly AnalysisJob[]
  readAnalysisJobsForProject(
    projectId: string,
    status: AnalysisJob['status'] | undefined,
    limit: number,
  ): readonly AnalysisJob[]
  readOpenEpisode(
    projectId: string,
    type: Episode['type'],
    scope: {
      readonly taskId?: string
      readonly decisionId?: string
      readonly conversationId?: string
    },
  ): Episode | null
  nextActivitySequence(projectId: string): number
  readRecentEpisodeAggregatesForProject(
    projectId: string,
    limit: number,
  ): readonly EpisodeAggregate[]
  readRecentHelperConversationAggregatesForProject(
    projectId: string,
    limit: number,
  ): readonly EpisodeAggregate[]
  countHelperConversationsForProject(projectId: string): number
  readCanonicalConceptById(conceptId: string): CanonicalConcept | null
  readCanonicalConceptByName(canonicalName: string): CanonicalConcept | null
  readIdempotencyReceipt(key: string): IdempotencyReceipt | null
  readEvaluationRun(evaluationRunId: string): EvaluationRun | null
  readBaselineResult(baselineResultId: string): BaselineResult | null
  readEvidenceTrace(conceptId: string): EvidenceTrace | null
  readEvidenceTracesForProject(projectId: string): readonly EvidenceTrace[]
  readRecentEvidenceTraces(limit: number): readonly EvidenceTrace[]
  readRecentUserEvidenceTracesForTasks(
    projectId: string,
    taskIds: readonly string[],
    limit: number,
  ): readonly EvidenceTrace[]
  readPersonalizationTrace(personalizationTraceId: string): PersonalizationTrace | null
  readPersonalizationTraceForDiscoverySession(
    discoverySessionId: string,
  ): PersonalizationTrace | null
  readPersonalizationTracesForProject(
    projectId: string,
    limit: number,
  ): readonly PersonalizationTrace[]
}

export interface StorageUnitOfWork {
  transaction<T>(work: (repository: PersistenceRepository) => T): T
}
