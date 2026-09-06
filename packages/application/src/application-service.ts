import { randomUUID } from 'node:crypto'

import {
  type AnalysisJob,
  analysisJobSchema,
  type AnalysisRuntimeRequest,
  analysisRuntimeRequestSchema,
  analystSubmitEvidenceProposalsCommandSchema,
  ANALYSIS_MAX_ATTEMPTS,
  ANALYSIS_SOFT_TIMEOUT_MS,
  acceptedEvidenceSchema,
  type ActivityEvent,
  activityEventSchema,
  type AgentRequest,
  type AgentRole,
  type AuditRecord,
  auditRecordSchema,
  type BuilderTaskContext,
  builderTaskContextSchema,
  type BuilderSessionBindingDescriptor,
  builderSessionBindingDescriptorSchema,
  type CandidateRound,
  type CanonicalConcept,
  canonicalConceptSchema,
  type CommandReceipt,
  commandReceiptSchema,
  type ContractError,
  contextRefreshRequestSchema,
  correlationIdSchema,
  type DecisionCommandReceipt,
  decisionCommandReceiptSchema,
  decisionApplicationSchema,
  decisionRequestSchema,
  decisionResolutionSchema,
  type DecisionResult,
  decisionResultSchema,
  type DiscoveryContext,
  discoveryContextSchema,
  type DiscoveryFeedback,
  type EpisodeContext,
  type Episode,
  episodeSchema,
  episodeContextSchema,
  type EvidenceBatchApplicationResult,
  evidenceBatchApplicationResultSchema,
  type EvidenceProposal,
  evidenceProposalBatchSchema,
  evidenceProposalSchema,
  type HelperExchangeReceipt,
  helperExchangeReceiptSchema,
  type GeneratedResultDescriptor,
  generatedResultDescriptorSchema,
  type HelperContext,
  helperContextSchema,
  type HelperConversationSummary,
  helperConversationSummarySchema,
  type LearningSpecRevision,
  type LiveProjectContext,
  type OperationError,
  type Project,
  type ProjectHistory,
  projectHistorySchema,
  type ProjectEvidenceTrace,
  projectEvidenceTraceSchema,
  type ProjectCandidateRevision,
  type ProjectSessionSnapshot,
  projectSessionSnapshotSchema,
  type PreparedBuilderTaskDescriptor,
  preparedBuilderTaskDescriptorSchema,
  type PersonalizationBasis,
  type PersonalizationTrace,
  personalizationTraceSchema,
  liveProjectContextSchema,
  type UiRequest,
  uiRequestSchema,
  validateAgentRequest,
  validateContract,
} from '@vibe-helper/contracts'
import {
  appendEpisodeEvent,
  applyDecision,
  applyMisconceptionProposal,
  confirmLearningSpec,
  closeEpisode,
  evaluateEvidenceProposal,
  openDecision,
  reduceCandidateRevision,
  reduceConceptState,
  resolveDecision,
  planBuilderTask,
  transitionBuilderTask,
  supersedeLearningSpec,
  transitionAnalysisJob,
  transitionEpisodeAnalysis,
  updateLiveContext as reduceLiveContext,
  writeLearningSpecDraft,
} from '@vibe-helper/domain'

import { ApplicationError, type ApplicationResult, createOperationError } from './errors.js'
import {
  canonicalJson,
  MAX_APPLICATION_PAYLOAD_BYTES,
  payloadBytes,
  redactSensitiveText,
  sha256,
  type WorkspacePathPolicy,
} from './security.js'
import {
  type BuilderTaskAggregate,
  type DiscoveryAggregate,
  type EpisodeAggregate,
  type EvidenceTrace,
  type IdempotencyReceipt,
  PersistenceError,
  type PersistenceRepository,
  type StorageUnitOfWork,
} from './storage-ports.js'

export type AgentApplicationResponse =
  | DiscoveryContext
  | BuilderTaskContext
  | DecisionResult
  | DecisionCommandReceipt
  | HelperContext
  | EpisodeContext
  | CommandReceipt
  | EvidenceBatchApplicationResult

export type UiApplicationResponse =
  | CommandReceipt
  | AnalysisJob
  | readonly AnalysisJob[]
  | HelperExchangeReceipt
  | HelperContext
  | ProjectEvidenceTrace
  | PreparedBuilderTaskDescriptor
  | BuilderSessionBindingDescriptor
  | GeneratedResultDescriptor
  | ProjectHistory
  | ProjectSessionSnapshot

export type AnalysisApplicationResponse =
  | AnalysisJob
  | readonly AnalysisJob[]
  | EvidenceBatchApplicationResult

type IdPrefix =
  | 'discovery_session'
  | 'learning_spec'
  | 'task'
  | 'decision'
  | 'decision_option'
  | 'decision_application'
  | 'context_refresh'
  | 'conversation'
  | 'message'
  | 'event'
  | 'episode'
  | 'analysis_job'
  | 'audit'
  | 'concept'
  | 'evidence_proposal'
  | 'evidence_decision'
  | 'evidence'
  | 'misconception'
  | 'concept_ledger'

interface ResponseSchema<T> {
  parse(value: unknown): T
}

interface IdempotentWorkResult<T> {
  readonly response: T
  readonly resourceId: string
  readonly resourceRevision: number
}

export interface ApplicationServiceOptions {
  readonly storage: StorageUnitOfWork
  readonly workspacePolicy: WorkspacePathPolicy
  readonly now?: () => Date
  readonly generateId?: (prefix: IdPrefix) => string
  readonly maxPayloadBytes?: number
}

function defaultGenerateId(prefix: IdPrefix): string {
  return `${prefix}_${randomUUID()}`
}

function latestByRevision<T extends { readonly revision: number }>(items: readonly T[]): T | null {
  return items.reduce<T | null>(
    (latest, item) => (latest === null || item.revision > latest.revision ? item : latest),
    null,
  )
}

function unique<T>(items: readonly T[]): T[] {
  return [...new Set(items)]
}

function deterministicPersonalizationId(key: string): string {
  const digest = sha256(key)
  return `personalization_${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-8${digest.slice(17, 20)}-${digest.slice(20, 32)}`
}

function normalizedConceptName(value: string): string {
  return value.trim().toLocaleLowerCase('en-US')
}

function candidateReferenceKey(reference: {
  readonly candidateId: string
  readonly revision: number
}): string {
  return `${reference.candidateId}:${reference.revision}`
}

function candidateRecordKey(candidate: ProjectCandidateRevision): string {
  return `${candidate.id}:${candidate.revision}`
}

function selectedFeedback(aggregate: DiscoveryAggregate): DiscoveryFeedback | undefined {
  return [...aggregate.feedback].reverse().find((feedback) => feedback.intent === 'SELECT')
}

function selectedCandidate(
  aggregate: DiscoveryAggregate,
  selection: DiscoveryFeedback | undefined = selectedFeedback(aggregate),
): ProjectCandidateRevision | undefined {
  const target = selection?.targets[0]
  return target === undefined
    ? undefined
    : aggregate.candidates.find(
        (candidate) =>
          candidate.id === target.candidateId && candidate.revision === target.revision,
      )
}

function currentLearningSpec(
  aggregate: DiscoveryAggregate,
  selection: DiscoveryFeedback | undefined = selectedFeedback(aggregate),
): LearningSpecRevision | null {
  const target = selection?.targets[0]
  if (target === undefined) return null
  return latestByRevision(
    aggregate.learningSpecs.filter(
      (spec) =>
        spec.selectedCandidate.candidateId === target.candidateId &&
        spec.selectedCandidate.revision === target.revision,
    ),
  )
}

function sameStringSet(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  return left.size === right.size && [...left].every((value) => right.has(value))
}

function readCorrelationId(input: unknown): string | undefined {
  if (typeof input !== 'object' || input === null || !('correlationId' in input)) return undefined
  const parsed = correlationIdSchema.safeParse(input.correlationId)
  return parsed.success ? parsed.data : undefined
}

function suggestedSurface(
  project: Project,
  hasCurrentBuilderTask = false,
): 'DISCOVERY' | 'SPEC' | 'BUILD' {
  if (hasCurrentBuilderTask) return 'BUILD'
  if (project.status === 'DISCOVERY') return 'DISCOVERY'
  if (project.status === 'SPEC_REVIEW') return 'SPEC'
  return 'BUILD'
}

export class ApplicationService {
  readonly #storage: StorageUnitOfWork
  readonly #workspacePolicy: WorkspacePathPolicy
  readonly #now: () => Date
  readonly #generateId: (prefix: IdPrefix) => string
  readonly #maxPayloadBytes: number

  constructor(options: ApplicationServiceOptions) {
    this.#storage = options.storage
    this.#workspacePolicy = options.workspacePolicy
    this.#now = options.now ?? (() => new Date())
    this.#generateId = options.generateId ?? defaultGenerateId
    this.#maxPayloadBytes = options.maxPayloadBytes ?? MAX_APPLICATION_PAYLOAD_BYTES
  }

  async executeAgent(
    authenticatedRole: AgentRole,
    input: unknown,
  ): Promise<ApplicationResult<AgentApplicationResponse>> {
    const sizeError = this.#sizeError(input)
    if (sizeError !== null) return { success: false, error: sizeError }
    const validated = validateAgentRequest(authenticatedRole, input)
    if (!validated.success) return validated

    try {
      return { success: true, data: await this.#dispatchAgent(validated.data as AgentRequest) }
    } catch (error) {
      return { success: false, error: this.#mapError(error, validated.data.correlationId) }
    }
  }

  async executeUi(input: unknown): Promise<ApplicationResult<UiApplicationResponse>> {
    const sizeError = this.#sizeError(input)
    if (sizeError !== null) return { success: false, error: sizeError }
    const validated = validateContract(uiRequestSchema, input)
    if (!validated.success) return validated

    try {
      return { success: true, data: await this.#dispatchUi(validated.data) }
    } catch (error) {
      return { success: false, error: this.#mapError(error, validated.data.correlationId) }
    }
  }

  async executeAnalysis(input: unknown): Promise<ApplicationResult<AnalysisApplicationResponse>> {
    const sizeError = this.#sizeError(input)
    if (sizeError !== null) return { success: false, error: sizeError }
    const validated = validateContract(analysisRuntimeRequestSchema, input)
    if (!validated.success) return validated

    try {
      return { success: true, data: await this.#dispatchAnalysis(validated.data) }
    } catch (error) {
      return { success: false, error: this.#mapError(error, validated.data.correlationId) }
    }
  }

  async #dispatchAgent(request: AgentRequest): Promise<AgentApplicationResponse> {
    switch (request.kind) {
      case 'DISCOVERY_GET_CONTEXT':
        return this.#getDiscoveryContext(request)
      case 'DISCOVERY_SUBMIT_CANDIDATE_PREVIEWS':
        return this.#submitCandidatePreviews(request)
      case 'DISCOVERY_SUBMIT_CANDIDATE_ENRICHMENTS':
        return this.#submitCandidateEnrichments(request)
      case 'DISCOVERY_SUBMIT_CANDIDATE_ROUND':
        return this.#submitCandidateRound(request)
      case 'DISCOVERY_SUBMIT_LEARNING_SPEC':
        return this.#submitLearningSpec(request)
      case 'BUILDER_GET_TASK':
        return this.#getBuilderTask(request)
      case 'BUILDER_GET_DECISION_RESULT':
        return this.#getDecisionResult(request)
      case 'BUILDER_START_TASK':
        return this.#startTask(request)
      case 'BUILDER_UPDATE_LIVE_CONTEXT':
        return this.#updateLiveContext(request)
      case 'BUILDER_REQUEST_DECISION':
        return this.#requestDecision(request)
      case 'BUILDER_APPLY_DECISION':
        return this.#applyDecision(request)
      case 'BUILDER_COMPLETE_TASK':
        return this.#completeTask(request)
      case 'HELPER_GET_CONTEXT':
        return this.#getHelperContext(request)
      case 'HELPER_REQUEST_CONTEXT_REFRESH':
        return this.#requestContextRefresh(request)
      case 'ANALYST_GET_EPISODE_CONTEXT':
        return this.#getEpisodeContext(request)
      case 'ANALYST_SUBMIT_EVIDENCE_PROPOSALS':
        return this.#submitEvidenceProposals(request)
    }
  }

  async #dispatchUi(request: UiRequest): Promise<UiApplicationResponse> {
    switch (request.kind) {
      case 'UI_START_DISCOVERY':
        return this.#startDiscovery(request)
      case 'UI_RECORD_DISCOVERY_FEEDBACK':
        return this.#recordDiscoveryFeedback(request)
      case 'UI_UPDATE_LEARNING_SPEC':
        return this.#updateLearningSpec(request)
      case 'UI_CONFIRM_LEARNING_SPEC':
        return this.#confirmLearningSpec(request)
      case 'UI_PREPARE_BUILDER_TASK':
        return this.#prepareBuilderTask(request)
      case 'UI_RETURN_TO_DISCOVERY':
        return this.#returnToDiscovery(request)
      case 'UI_RESOLVE_DECISION':
        return this.#resolveUserDecision(request)
      case 'UI_LIST_PROJECTS':
        return this.#listProjects(request)
      case 'UI_RESTORE_PROJECT_SESSION':
        return this.#restoreProjectSession(request)
      case 'UI_PREPARE_DISCOVERY_AGENT_CONTEXT':
        return this.#restoreProjectSession(request, true)
      case 'UI_OPEN_HELPER':
        return this.#openHelperFromUi(request)
      case 'UI_PREPARE_BUILDER_SESSION':
        return this.#prepareBuilderSession(request)
      case 'UI_RECORD_HELPER_EXCHANGE':
        return this.#recordHelperExchange(request)
      case 'UI_RETRY_ANALYSIS':
        return this.#retryAnalysis(request)
      case 'UI_READ_ANALYSIS_JOBS':
        return this.#readAnalysisJobs(request)
      case 'UI_READ_EVIDENCE_TRACE':
        return this.#readEvidenceTrace(request)
      case 'UI_LAUNCH_RESULT':
        return this.#getResultDescriptor(request)
    }
  }

  #listProjects(request: Extract<UiRequest, { kind: 'UI_LIST_PROJECTS' }>): ProjectHistory {
    return this.#storage.transaction((repository) =>
      projectHistorySchema.parse({
        schemaVersion: 1,
        correlationId: request.correlationId,
        projects: repository.readProjects(request.limit).map((project) => {
          const recovery = repository.recoverProject(project.id)
          if (recovery === null) {
            throw new PersistenceError(
              'CORRUPT_DATABASE',
              'Project head disappeared during History assembly',
              project.id,
            )
          }
          const task =
            recovery.activeTask ??
            recovery.currentTask ??
            repository.readLatestTaskForProject(project.id)
          const taskAggregate =
            task === null ? null : repository.readBuilderTaskAggregate(project.id, task.id)
          return {
            project,
            suggestedSurface: suggestedSurface(project, task !== null),
            activeTask: recovery.activeTask,
            pendingDecisionCount: recovery.pendingDecisions.length,
            currentContextVersion: taskAggregate?.liveContext?.contextVersion ?? null,
            helperConversationCount: repository.countHelperConversationsForProject(project.id),
          }
        }),
      }),
    )
  }

  #restoreProjectSession(
    request: Extract<
      UiRequest,
      { kind: 'UI_RESTORE_PROJECT_SESSION' | 'UI_PREPARE_DISCOVERY_AGENT_CONTEXT' }
    >,
    recordDiscoveryDelivery = false,
  ): ProjectSessionSnapshot {
    return this.#storage.transaction((repository) => {
      const recovery = repository.recoverProject(request.projectId)
      if (recovery === null) throw this.#notFound(request.correlationId, 'PROJECT_NOT_FOUND')
      const currentTask =
        recovery.activeTask ??
        recovery.currentTask ??
        repository.readLatestTaskForProject(request.projectId)
      const taskAggregate =
        currentTask === null
          ? null
          : repository.readBuilderTaskAggregate(request.projectId, currentTask.id)
      const helperConversations = repository
        .readRecentHelperConversationAggregatesForProject(
          request.projectId,
          request.helperConversationLimit,
        )
        .map((aggregate) => this.#helperConversationSummary(aggregate))
      const discoveryAggregate =
        recovery.discoverySession === null
          ? null
          : repository.readDiscoveryAggregate(request.projectId, recovery.discoverySession.id)
      const discoveryPersonalization =
        discoveryAggregate === null
          ? null
          : this.#discoveryPersonalization(repository, discoveryAggregate, recordDiscoveryDelivery)
      const discoveryBasisIds = new Set(
        discoveryPersonalization?.basis.map((basis) => basis.conceptId) ?? [],
      )
      const discoveryContext =
        discoveryAggregate === null || discoveryPersonalization === null
          ? null
          : discoveryContextSchema.parse({
              schemaVersion: 1,
              correlationId: request.correlationId,
              project: discoveryAggregate.project,
              session: discoveryAggregate.session,
              rounds: discoveryAggregate.rounds,
              candidates: discoveryAggregate.candidates,
              feedback: discoveryAggregate.feedback,
              learningSpec: currentLearningSpec(discoveryAggregate),
              previewRound: discoveryAggregate.previewRound,
              candidateEnrichments: discoveryAggregate.candidateEnrichments,
              relevantLedgerEntries: repository
                .readRecentEvidenceTraces(100)
                .flatMap((trace) => (trace.ledger === null ? [] : [trace.ledger]))
                .filter((entry) => discoveryBasisIds.has(entry.concept.id)),
              personalization: discoveryPersonalization,
            })
      const scopedLearningSpec =
        discoveryAggregate === null
          ? recovery.learningSpec
          : currentLearningSpec(discoveryAggregate)
      const scopedSelectedCandidate =
        recovery.discoverySession?.status === 'SELECTED' ? recovery.selectedCandidate : null

      return projectSessionSnapshotSchema.parse({
        schemaVersion: 1,
        correlationId: request.correlationId,
        project: recovery.project,
        suggestedSurface: suggestedSurface(recovery.project, currentTask !== null),
        discoverySession: recovery.discoverySession,
        discoveryContext,
        selectedCandidate: scopedSelectedCandidate,
        learningSpec: scopedLearningSpec,
        activeTask: recovery.activeTask,
        currentTask,
        liveContext: taskAggregate?.liveContext ?? recovery.liveContext,
        pendingDecisions: recovery.pendingDecisions,
        decisions:
          taskAggregate?.decisionRequests.map((decision) => ({
            request: decision,
            resolution:
              taskAggregate.decisionResolutions.find(
                (resolution) => resolution.decisionId === decision.id,
              ) ?? null,
            application:
              taskAggregate.decisionApplications.find(
                (application) => application.decisionId === decision.id,
              ) ?? null,
          })) ?? [],
        completionReport: taskAggregate?.completionReport ?? null,
        helperConversations,
      })
    })
  }

  #helperConversationSummary(aggregate: EpisodeAggregate): HelperConversationSummary {
    const userExcerpts = aggregate.events.flatMap((event) =>
      event.payload.type === 'USER_MESSAGE' ? [event.payload.redactedExcerpt] : [],
    )
    const helperSummaries = aggregate.events.flatMap((event) =>
      event.payload.type === 'HELPER_RESPONSE' ? [event.payload.summary] : [],
    )
    return helperConversationSummarySchema.parse({
      conversationId: aggregate.episode.conversationId,
      episodeId: aggregate.episode.id,
      taskId: aggregate.episode.taskId,
      ...(aggregate.episode.decisionId === undefined
        ? {}
        : { decisionId: aggregate.episode.decisionId }),
      status: aggregate.episode.status,
      startedAt: aggregate.episode.startedAt,
      ...(aggregate.episode.endedAt === undefined ? {} : { endedAt: aggregate.episode.endedAt }),
      redactedUserExcerpts: userExcerpts.slice(-5),
      helperResponseSummaries: helperSummaries.slice(-5),
    })
  }

  async #dispatchAnalysis(request: AnalysisRuntimeRequest): Promise<AnalysisApplicationResponse> {
    switch (request.kind) {
      case 'ANALYSIS_LIST_PENDING':
        return this.#storage.transaction((repository) =>
          repository.readPendingAnalysisJobs(request.limit),
        )
      case 'ANALYSIS_RECOVER_EXPIRED':
        return this.#recoverExpiredAnalysisJobs(request)
      case 'ANALYSIS_CLAIM_JOB':
        return this.#claimAnalysisJob(request)
      case 'ANALYSIS_FAIL_ATTEMPT':
        return this.#failAnalysisAttempt(request)
      case 'ANALYSIS_SUBMIT_RESULT':
        return this.#submitAnalysisResult(request)
    }
  }

  #personalizationBasis(
    repository: PersistenceRepository,
    trace: EvidenceTrace,
    evidenceRecords: EvidenceTrace['acceptedEvidence'],
    purpose: PersonalizationBasis['purpose'],
  ): PersonalizationBasis | null {
    if (trace.ledger === null) return null
    const evidence = [...evidenceRecords]
      .sort((left, right) => right.acceptedAt.localeCompare(left.acceptedAt))
      .slice(0, 5)
    if (evidence.length === 0) return null
    const sourceProjects = unique(
      evidence.flatMap((record) => {
        const recovery = repository.recoverProject(record.projectId)
        return recovery === null ? [] : [{ id: recovery.project.id, title: recovery.project.title }]
      }),
    ).filter(
      (project, index, projects) =>
        projects.findIndex((candidate) => candidate.id === project.id) === index,
    )
    if (sourceProjects.length === 0) return null
    const proposal = evidence
      .flatMap((record) =>
        'evidenceProposalId' in record
          ? trace.proposals.filter((candidate) => candidate.id === record.evidenceProposalId)
          : [],
      )
      .at(0)
    return {
      conceptId: trace.concept.id,
      conceptName: trace.concept.canonicalName,
      ledgerRevision: trace.ledger.revision,
      state: trace.ledger.state.state,
      evidenceIds: evidence.map((record) => record.id),
      episodeIds: unique(evidence.map((record) => record.episodeId)),
      sourceProjectIds: sourceProjects.map((project) => project.id),
      sourceProjectTitles: sourceProjects.map((project) => project.title),
      openIssueIds: trace.ledger.openIssues.slice(0, 10).map((issue) => issue.id),
      purpose,
      ...(proposal === undefined
        ? {}
        : {
            redactedEvidenceExcerpt: redactSensitiveText(proposal.redactedEvidenceExcerpt).slice(
              0,
              240,
            ),
          }),
    }
  }

  #discoveryPersonalization(
    repository: PersistenceRepository,
    aggregate: DiscoveryAggregate,
    recordDelivery = true,
  ): PersonalizationTrace {
    const personalizationId = deterministicPersonalizationId(
      `discovery:${aggregate.session.id}:${aggregate.session.correlationId}`,
    )
    const existing = repository.readPersonalizationTrace(personalizationId)
    if (existing !== null) return existing
    const traces = repository.readRecentEvidenceTraces(100)
    const basis = traces
      .flatMap((trace) => {
        const priorEvidence = trace.acceptedEvidence.filter(
          (evidence) => evidence.projectId !== aggregate.project.id,
        )
        const item = this.#personalizationBasis(
          repository,
          trace,
          priorEvidence,
          'DISCOVERY_TIE_BREAK',
        )
        return item === null ? [] : [item]
      })
      .slice(0, 5)
    const personalization = personalizationTraceSchema.parse({
      schemaVersion: 1,
      id: personalizationId,
      projectId: aggregate.project.id,
      correlationId: aggregate.session.correlationId,
      target: { kind: 'DISCOVERY_SESSION', discoverySessionId: aggregate.session.id },
      mode: basis.length === 0 ? 'NO_RELEVANT_EVIDENCE' : 'EVIDENCE_AWARE',
      basis,
      ...(basis.length > 0
        ? {}
        : { fallbackReason: traces.length === 0 ? 'NO_LEDGER' : 'NO_PRIOR_PROJECT_EVIDENCE' }),
      createdAt: this.#timestamp(),
      source: { kind: 'CORE' },
      redactionStatus: 'VERIFIED_REDACTED',
    })
    if (recordDelivery) repository.appendPersonalizationTrace(personalization)
    return personalization
  }

  #helperPersonalization(
    repository: PersistenceRepository,
    input: {
      readonly projectId: string
      readonly taskId: string
      readonly decisionId?: string
      readonly correlationId: string
      readonly question: string
      readonly relatedConceptNames: readonly string[]
    },
  ): PersonalizationTrace {
    const personalizationId = deterministicPersonalizationId(
      `helper:${input.projectId}:${input.taskId}:${input.correlationId}`,
    )
    const existing = repository.readPersonalizationTrace(personalizationId)
    if (existing !== null) return existing
    const traces = repository.readRecentEvidenceTraces(100)
    const explicitNames = new Set(input.relatedConceptNames.map(normalizedConceptName))
    const question = normalizedConceptName(input.question)
    const relevantTraces = traces.filter((trace) => {
      const names = [trace.concept.canonicalName, ...(trace.ledger?.acceptedAliases ?? [])].map(
        normalizedConceptName,
      )
      return names.some((name) => explicitNames.has(name) || question.includes(name))
    })
    const basis = relevantTraces
      .flatMap((trace) => {
        const purpose = trace.acceptedEvidence.some(
          (evidence) => evidence.projectId !== input.projectId,
        )
          ? ('HELPER_PAST_EXPERIENCE_CONNECTION' as const)
          : ('HELPER_EXPLANATION_START' as const)
        const item = this.#personalizationBasis(repository, trace, trace.acceptedEvidence, purpose)
        return item === null ? [] : [item]
      })
      .slice(0, 5)
    const personalization = personalizationTraceSchema.parse({
      schemaVersion: 1,
      id: personalizationId,
      projectId: input.projectId,
      correlationId: input.correlationId,
      target: {
        kind: 'HELPER_TURN',
        taskId: input.taskId,
        ...(input.decisionId === undefined ? {} : { decisionId: input.decisionId }),
      },
      mode: basis.length === 0 ? 'NO_RELEVANT_EVIDENCE' : 'EVIDENCE_AWARE',
      basis,
      ...(basis.length > 0
        ? {}
        : { fallbackReason: traces.length === 0 ? 'NO_LEDGER' : 'NO_RELEVANT_CONCEPT' }),
      createdAt: this.#timestamp(),
      source: { kind: 'CORE' },
      redactionStatus: 'VERIFIED_REDACTED',
    })
    repository.appendPersonalizationTrace(personalization)
    return personalization
  }

  #startDiscovery(request: Extract<UiRequest, { kind: 'UI_START_DISCOVERY' }>): CommandReceipt {
    const createdAt = this.#timestamp()
    const sessionId = this.#generateId('discovery_session')
    return this.#storage.transaction((repository) =>
      this.#idempotent(repository, request, 'ui.start_discovery', commandReceiptSchema, () => {
        if (repository.recoverProject(request.projectId) !== null) {
          throw this.#validationError(
            request.correlationId,
            'PROJECT_ALREADY_EXISTS',
            'Project already exists.',
          )
        }
        const project: Project = {
          schemaVersion: 1,
          id: request.projectId,
          correlationId: request.correlationId,
          revision: 1,
          title: request.input.learningGoal.slice(0, 120),
          learningGoal: request.input.learningGoal,
          status: 'DISCOVERY',
          createdAt,
          updatedAt: createdAt,
          source: { kind: 'USER' },
          redactionStatus: 'NOT_REQUIRED',
        }
        const session = {
          schemaVersion: 1 as const,
          id: sessionId,
          projectId: request.projectId,
          correlationId: request.correlationId,
          revision: 1,
          input: request.input,
          status: 'ACTIVE' as const,
          openedAt: createdAt,
          updatedAt: createdAt,
          source: { kind: 'USER' as const },
          redactionStatus: 'NOT_REQUIRED' as const,
        }
        repository.appendProject(project)
        repository.appendDiscoverySession(session)
        this.#appendAudit(repository, {
          correlationId: request.correlationId,
          actor: request.actor,
          action: 'CREATED',
          resource: { type: 'DISCOVERY_SESSION', id: session.id, revision: 1 },
          summary: 'Created a Discovery session from validated user input.',
          changedFields: ['status'],
          occurredAt: createdAt,
        })
        const response = this.#receipt(request.correlationId, 1)
        return { response, resourceId: session.id, resourceRevision: 1 }
      }),
    )
  }

  #getDiscoveryContext(
    request: Extract<AgentRequest, { kind: 'DISCOVERY_GET_CONTEXT' }>,
  ): DiscoveryContext {
    const scoped = this.#storage.transaction((repository) => {
      const aggregate = repository.readDiscoveryAggregate(
        request.projectId,
        request.discoverySessionId,
      )
      if (aggregate === null) return null
      return {
        aggregate,
        personalization: this.#discoveryPersonalization(repository, aggregate),
        ledgerEntries: repository
          .readRecentEvidenceTraces(100)
          .flatMap((trace) => (trace.ledger === null ? [] : [trace.ledger])),
      }
    })
    if (scoped === null) throw this.#notFound(request.correlationId, 'DISCOVERY_NOT_FOUND')
    const { aggregate, personalization } = scoped
    const basisIds = new Set(personalization.basis.map((basis) => basis.conceptId))
    return discoveryContextSchema.parse({
      schemaVersion: 1,
      correlationId: request.correlationId,
      project: aggregate.project,
      session: aggregate.session,
      rounds: aggregate.rounds,
      candidates: aggregate.candidates,
      feedback: aggregate.feedback,
      learningSpec: currentLearningSpec(aggregate),
      previewRound: aggregate.previewRound,
      candidateEnrichments: aggregate.candidateEnrichments,
      relevantLedgerEntries: scoped.ledgerEntries.filter((entry) => basisIds.has(entry.concept.id)),
      personalization,
    })
  }

  #submitCandidatePreviews(
    request: Extract<AgentRequest, { kind: 'DISCOVERY_SUBMIT_CANDIDATE_PREVIEWS' }>,
  ): CommandReceipt {
    return this.#storage.transaction((repository) =>
      this.#idempotent(
        repository,
        request,
        'discovery.submit_candidate_previews',
        commandReceiptSchema,
        () => {
          const scoped = this.#readDiscoveryBySession(
            repository,
            request.previewRound.discoverySessionId,
            request.correlationId,
          )
          this.#assertRevision(
            request.expectedSessionRevision,
            scoped.session.revision,
            request.correlationId,
            'DISCOVERY_SESSION_STALE',
          )
          if (scoped.session.status !== 'ACTIVE' || scoped.project.status !== 'DISCOVERY') {
            throw this.#validationError(
              request.correlationId,
              'DISCOVERY_SESSION_NOT_ACTIVE',
              'Candidate previews can be submitted only while Discovery is active.',
            )
          }
          if (scoped.rounds.length > 0) {
            throw this.#validationError(
              request.correlationId,
              'CANDIDATE_ROUND_ALREADY_EXISTS',
              'Candidate previews cannot replace an existing Candidate Round.',
            )
          }
          if (scoped.previewRound !== null) {
            throw this.#validationError(
              request.correlationId,
              'CANDIDATE_PREVIEW_ALREADY_EXISTS',
              'A Candidate Preview Round is already staged for this Session.',
            )
          }
          if (
            request.previewRound.correlationId !== request.correlationId ||
            canonicalJson(request.previewRound.inputSnapshot) !==
              canonicalJson(scoped.session.input)
          ) {
            throw this.#validationError(
              request.correlationId,
              'CANDIDATE_PREVIEW_SCOPE_INVALID',
              'Candidate previews must match the current Discovery Session and input.',
            )
          }
          repository.appendCandidatePreviewRound(request.previewRound)
          this.#appendAudit(repository, {
            correlationId: request.correlationId,
            actor: request.actor,
            action: 'SUBMITTED',
            resource: {
              type: 'CANDIDATE_PREVIEW_ROUND',
              id: request.previewRound.id,
              revision: 1,
            },
            summary: 'Stored ten fixed Candidate preview identities for background enrichment.',
            changedFields: ['previews'],
            occurredAt: request.previewRound.createdAt,
          })
          const response = this.#receipt(request.correlationId, scoped.session.revision)
          return {
            response,
            resourceId: request.previewRound.id,
            resourceRevision: scoped.session.revision,
          }
        },
      ),
    )
  }

  #submitCandidateEnrichments(
    request: Extract<AgentRequest, { kind: 'DISCOVERY_SUBMIT_CANDIDATE_ENRICHMENTS' }>,
  ): CommandReceipt {
    const completedAt = this.#timestamp()
    return this.#storage.transaction((repository) =>
      this.#idempotent(
        repository,
        request,
        'discovery.submit_candidate_enrichments',
        commandReceiptSchema,
        () => {
          const firstEnrichment = request.enrichments[0]
          if (firstEnrichment === undefined) {
            throw this.#validationError(
              request.correlationId,
              'CANDIDATE_ENRICHMENT_EMPTY',
              'Candidate enrichment batch cannot be empty.',
            )
          }
          const scoped = this.#readDiscoveryBySession(
            repository,
            firstEnrichment.discoverySessionId,
            request.correlationId,
          )
          this.#assertRevision(
            request.expectedSessionRevision,
            scoped.session.revision,
            request.correlationId,
            'DISCOVERY_SESSION_STALE',
          )
          if (
            scoped.session.status !== 'ACTIVE' ||
            scoped.project.status !== 'DISCOVERY' ||
            scoped.rounds.length > 0
          ) {
            throw this.#validationError(
              request.correlationId,
              'DISCOVERY_ENRICHMENT_NOT_ACTIVE',
              'Candidate enrichment requires an active Session without a completed Round.',
            )
          }
          const previewRound = scoped.previewRound
          if (previewRound === null || previewRound.id !== request.previewRoundId) {
            throw this.#validationError(
              request.correlationId,
              'CANDIDATE_PREVIEW_NOT_FOUND',
              'Candidate enrichment must reference the staged Preview Round.',
            )
          }
          const enrichmentsByCandidate = new Map(
            request.enrichments.map((enrichment) => [enrichment.candidate.id, enrichment]),
          )
          const requestedPreviews = previewRound.previews.filter((preview) => {
            if (request.batch === 'FIRST') return preview.position <= 5
            if (request.batch === 'SECOND') return preview.position > 5
            return enrichmentsByCandidate.has(preview.candidateId)
          })
          const expectedSize = request.batch === 'SELECTED' ? request.enrichments.length : 5
          if (
            enrichmentsByCandidate.size !== expectedSize ||
            requestedPreviews.length !== expectedSize ||
            requestedPreviews.some((preview) => !enrichmentsByCandidate.has(preview.candidateId))
          ) {
            throw this.#validationError(
              request.correlationId,
              'CANDIDATE_ENRICHMENT_BATCH_INVALID',
              request.batch === 'SELECTED'
                ? 'Selected Candidate enrichment must contain only unique identities from the staged Preview Round.'
                : 'Candidate enrichment must contain exactly the five identities assigned to its batch.',
            )
          }
          const existingCandidateIds = new Set(
            scoped.candidateEnrichments.map((enrichment) => enrichment.candidate.id),
          )
          for (const preview of requestedPreviews) {
            const enrichment = enrichmentsByCandidate.get(preview.candidateId)
            if (enrichment === undefined) continue
            const candidate = enrichment.candidate
            const previewMeaning = {
              title: preview.title,
              summary: preview.summary,
              coreInteraction: preview.coreInteraction,
              appeal: preview.appeal,
              technologyNecessity: preview.technologyNecessity,
              generationTags: preview.generationTags,
            }
            const candidateMeaning = {
              title: candidate.title,
              summary: candidate.summary,
              coreInteraction: candidate.coreInteraction,
              appeal: candidate.appeal,
              technologyNecessity: candidate.technologyNecessity,
              generationTags: candidate.generationTags,
            }
            if (
              enrichment.previewRoundId !== previewRound.id ||
              enrichment.discoverySessionId !== scoped.session.id ||
              enrichment.correlationId !== request.correlationId ||
              candidate.discoverySessionId !== scoped.session.id ||
              candidate.correlationId !== request.correlationId ||
              candidate.revision !== 1 ||
              candidate.parentRevisions.length !== 0 ||
              canonicalJson(previewMeaning) !== canonicalJson(candidateMeaning)
            ) {
              throw this.#validationError(
                request.correlationId,
                'CANDIDATE_ENRICHMENT_IDENTITY_CHANGED',
                'Candidate enrichment cannot change its preview identity or core meaning.',
              )
            }
            if (!existingCandidateIds.has(candidate.id)) {
              repository.appendCandidateEnrichment(enrichment)
            }
          }

          const updated = this.#readDiscoveryBySession(
            repository,
            scoped.session.id,
            request.correlationId,
          )
          const completeByCandidate = new Map(
            updated.candidateEnrichments.map((enrichment) => [enrichment.candidate.id, enrichment]),
          )
          const orderedEnrichments = previewRound.previews.flatMap((preview) => {
            const enrichment = completeByCandidate.get(preview.candidateId)
            return enrichment === undefined ? [] : [enrichment]
          })
          if (orderedEnrichments.length === 10) {
            for (const enrichment of orderedEnrichments) {
              repository.appendCandidate(enrichment.candidate)
            }
            const round: CandidateRound = {
              schemaVersion: 1,
              id: previewRound.finalRoundId,
              discoverySessionId: scoped.session.id,
              correlationId: request.correlationId,
              roundIndex: 1,
              inputSnapshot: scoped.session.input,
              appliedFeedbackIds: [],
              candidates: orderedEnrichments.map((enrichment) => ({
                candidateId: enrichment.candidate.id,
                revision: enrichment.candidate.revision,
              })),
              generationRationale: previewRound.generationRationale,
              diversityCheck: {
                dimensionsReviewed: [
                  'PROBLEM_DOMAIN',
                  'TARGET_USER',
                  'CORE_INTERACTION',
                  'DATA_SHAPE',
                  'USER_APPEAL',
                ],
                modeCollapseDetected: false,
                rationale:
                  'Fixed preview identities were checked before their details were enriched.',
              },
              createdAt: completedAt,
              source: { kind: 'AGENT', role: 'DISCOVERY' },
              redactionStatus: 'NOT_REQUIRED',
            }
            repository.appendCandidateRound(round)
            const nextSession = {
              ...scoped.session,
              revision: scoped.session.revision + 1,
              updatedAt: completedAt,
            }
            repository.appendDiscoverySession(nextSession)
            this.#appendAudit(repository, {
              correlationId: request.correlationId,
              actor: request.actor,
              action: 'SUBMITTED',
              resource: {
                type: 'CANDIDATE_REVISION',
                id: orderedEnrichments[0]?.candidate.id ?? previewRound.finalRoundId,
                revision: 1,
              },
              summary: 'Materialized ten enriched Candidates and their Round atomically.',
              changedFields: ['revision'],
              occurredAt: completedAt,
            })
            const response = this.#receipt(request.correlationId, nextSession.revision)
            return {
              response,
              resourceId: scoped.session.id,
              resourceRevision: nextSession.revision,
            }
          }

          const response = this.#receipt(request.correlationId, scoped.session.revision)
          return {
            response,
            resourceId: previewRound.id,
            resourceRevision: scoped.session.revision,
          }
        },
      ),
    )
  }

  #submitCandidateRound(
    request: Extract<AgentRequest, { kind: 'DISCOVERY_SUBMIT_CANDIDATE_ROUND' }>,
  ): CommandReceipt {
    return this.#storage.transaction((repository) =>
      this.#idempotent(
        repository,
        request,
        'discovery.submit_candidate_round',
        commandReceiptSchema,
        () => {
          const scoped = this.#readDiscoveryBySession(
            repository,
            request.round.discoverySessionId,
            request.correlationId,
          )
          this.#assertRevision(
            request.expectedSessionRevision,
            scoped.session.revision,
            request.correlationId,
            'DISCOVERY_SESSION_STALE',
          )
          if (scoped.session.status !== 'ACTIVE' || scoped.project.status !== 'DISCOVERY') {
            throw this.#validationError(
              request.correlationId,
              'DISCOVERY_SESSION_NOT_ACTIVE',
              'Candidate Rounds can be submitted only while Discovery is active.',
            )
          }
          if (
            request.round.roundIndex !== scoped.rounds.length + 1 ||
            canonicalJson(request.round.inputSnapshot) !== canonicalJson(scoped.session.input)
          ) {
            throw this.#validationError(
              request.correlationId,
              'CANDIDATE_ROUND_SEQUENCE_INVALID',
              'Candidate Round does not immediately follow the stored Discovery state.',
            )
          }
          const feedbackByCandidate = this.#validateCandidateRoundLoop(
            scoped,
            request.round,
            request.candidates,
            request.correlationId,
          )
          let history = [...scoped.candidates]
          for (const candidate of request.candidates) {
            const feedback = feedbackByCandidate.get(candidateRecordKey(candidate))
            const result = reduceCandidateRevision({
              existing: history,
              proposed: candidate,
              ...(feedback === undefined ? {} : { feedback }),
            })
            if (result.outcome === 'REJECTED') {
              throw this.#domainError(request.correlationId, result.reasonCode)
            }
            history = [...result.value]
            repository.appendCandidate(candidate)
          }
          repository.appendCandidateRound(request.round)
          const nextSession = {
            ...scoped.session,
            revision: scoped.session.revision + 1,
            updatedAt: request.round.createdAt,
          }
          repository.appendDiscoverySession(nextSession)
          this.#appendAudit(repository, {
            correlationId: request.correlationId,
            actor: request.actor,
            action: 'SUBMITTED',
            resource: {
              type: 'CANDIDATE_REVISION',
              id: request.candidates[0]?.id ?? request.round.id,
              revision: request.candidates[0]?.revision ?? 1,
            },
            summary: 'Applied a validated Candidate Round through the application boundary.',
            changedFields: ['revision'],
            occurredAt: request.round.createdAt,
          })
          const response = this.#receipt(request.correlationId, nextSession.revision)
          return {
            response,
            resourceId: scoped.session.id,
            resourceRevision: nextSession.revision,
          }
        },
      ),
    )
  }

  #submitLearningSpec(
    request: Extract<AgentRequest, { kind: 'DISCOVERY_SUBMIT_LEARNING_SPEC' }>,
  ): CommandReceipt {
    return this.#storage.transaction((repository) =>
      this.#idempotent(
        repository,
        request,
        'discovery.submit_learning_spec',
        commandReceiptSchema,
        () => {
          const scoped = this.#readDiscoveryByProject(
            repository,
            request.learningSpec.projectId,
            request.correlationId,
          )
          this.#assertRevision(
            request.expectedSessionRevision,
            scoped.session.revision,
            request.correlationId,
            'DISCOVERY_SESSION_STALE',
          )
          if (
            scoped.project.status !== 'SPEC_REVIEW' ||
            scoped.session.status !== 'SELECTED' ||
            scoped.session.correlationId !== request.correlationId
          ) {
            throw this.#validationError(
              request.correlationId,
              'LEARNING_SPEC_REVIEW_NOT_ACTIVE',
              'Learning Spec drafts require a selected Candidate in active Spec review.',
            )
          }
          const selected = selectedFeedback(scoped)
          const selectedCandidateRecord = selectedCandidate(scoped, selected)
          if (
            selected === undefined ||
            selectedCandidateRecord === undefined ||
            request.learningSpec.selectedCandidate.candidateId !== selectedCandidateRecord.id ||
            request.learningSpec.selectedCandidate.revision !== selectedCandidateRecord.revision
          ) {
            throw this.#validationError(
              request.correlationId,
              'LEARNING_SPEC_CANDIDATE_NOT_SELECTED',
              'Learning Spec must reference the user-selected Candidate revision.',
            )
          }
          const current = currentLearningSpec(scoped, selected)
          this.#assertRevision(
            request.expectedSpecRevision,
            current?.revision ?? 0,
            request.correlationId,
            'LEARNING_SPEC_STALE',
          )
          if (current !== null && current.id !== request.learningSpec.id) {
            throw this.#validationError(
              request.correlationId,
              'LEARNING_SPEC_IDENTITY_CHANGED',
              'Learning Spec refinement must keep the current Spec identity.',
            )
          }
          const history = scoped.learningSpecs.filter((spec) => spec.id === request.learningSpec.id)
          const reduced = writeLearningSpecDraft({
            history,
            proposed: request.learningSpec,
            selectedCandidate: selectedCandidateRecord,
            selection: selected,
          })
          if (reduced.outcome === 'REJECTED') {
            throw this.#domainError(request.correlationId, reduced.reasonCode)
          }
          repository.appendLearningSpec(request.learningSpec)
          const nextSession = {
            ...scoped.session,
            revision: scoped.session.revision + 1,
            updatedAt: request.learningSpec.updatedAt,
          }
          repository.appendDiscoverySession(nextSession)
          this.#appendAudit(repository, {
            correlationId: request.correlationId,
            actor: request.actor,
            action: 'SUBMITTED',
            resource: {
              type: 'LEARNING_SPEC',
              id: request.learningSpec.id,
              revision: request.learningSpec.revision,
            },
            summary: 'Stored a validated Discovery-authored Learning Spec draft.',
            changedFields: ['status', 'revision'],
            occurredAt: request.learningSpec.updatedAt,
          })
          const response = this.#receipt(request.correlationId, request.learningSpec.revision)
          return {
            response,
            resourceId: request.learningSpec.id,
            resourceRevision: request.learningSpec.revision,
          }
        },
      ),
    )
  }

  #updateLearningSpec(
    request: Extract<UiRequest, { kind: 'UI_UPDATE_LEARNING_SPEC' }>,
  ): CommandReceipt {
    const updatedAt = this.#timestamp()
    return this.#storage.transaction((repository) =>
      this.#idempotent(repository, request, 'ui.update_learning_spec', commandReceiptSchema, () => {
        const scoped = this.#readDiscoveryByProject(
          repository,
          request.projectId,
          request.correlationId,
        )
        this.#assertRevision(
          request.expectedSessionRevision,
          scoped.session.revision,
          request.correlationId,
          'DISCOVERY_SESSION_STALE',
        )
        const selection = selectedFeedback(scoped)
        const selectedCandidateRecord = selectedCandidate(scoped, selection)
        const history = scoped.learningSpecs.filter((spec) => spec.id === request.learningSpecId)
        const current = latestByRevision(history)
        this.#assertRevision(
          request.expectedSpecRevision,
          current?.revision ?? 0,
          request.correlationId,
          'LEARNING_SPEC_STALE',
        )
        if (
          scoped.project.status !== 'SPEC_REVIEW' ||
          scoped.session.status !== 'SELECTED' ||
          selection === undefined ||
          selectedCandidateRecord === undefined ||
          current === null
        ) {
          throw this.#validationError(
            request.correlationId,
            'LEARNING_SPEC_NOT_EDITABLE',
            'A current draft in selected Spec review is required for direct editing.',
          )
        }
        const proposed: LearningSpecRevision = {
          ...current,
          ...request.draft,
          revision: current.revision + 1,
          parentRevision: current.revision,
          status: 'DRAFT',
          updatedAt,
          source: { kind: 'USER' },
        }
        const reduced = writeLearningSpecDraft({
          history,
          proposed,
          selectedCandidate: selectedCandidateRecord,
          selection,
        })
        if (reduced.outcome === 'REJECTED') {
          throw this.#domainError(request.correlationId, reduced.reasonCode)
        }
        repository.appendLearningSpec(proposed)
        const nextSession = {
          ...scoped.session,
          revision: scoped.session.revision + 1,
          updatedAt,
        }
        repository.appendDiscoverySession(nextSession)
        this.#appendAudit(repository, {
          correlationId: request.correlationId,
          actor: { kind: 'USER' },
          action: 'UPDATED',
          resource: { type: 'LEARNING_SPEC', id: proposed.id, revision: proposed.revision },
          summary: 'Stored a user-authored Learning Spec draft revision.',
          changedFields: ['revision'],
          occurredAt: updatedAt,
        })
        const response = this.#receipt(request.correlationId, proposed.revision)
        return { response, resourceId: proposed.id, resourceRevision: proposed.revision }
      }),
    )
  }

  #recordDiscoveryFeedback(
    request: Extract<UiRequest, { kind: 'UI_RECORD_DISCOVERY_FEEDBACK' }>,
  ): CommandReceipt {
    return this.#storage.transaction((repository) =>
      this.#idempotent(
        repository,
        request,
        'ui.record_discovery_feedback',
        commandReceiptSchema,
        () => {
          const scoped = this.#readDiscoveryBySession(
            repository,
            request.feedback.discoverySessionId,
            request.correlationId,
          )
          this.#assertRevision(
            request.expectedSessionRevision,
            scoped.session.revision,
            request.correlationId,
            'DISCOVERY_SESSION_STALE',
          )
          if (
            scoped.session.status !== 'ACTIVE' ||
            scoped.project.status !== 'DISCOVERY' ||
            scoped.session.correlationId !== request.correlationId
          ) {
            throw this.#validationError(
              request.correlationId,
              'DISCOVERY_SESSION_NOT_ACTIVE',
              'Discovery Feedback can be recorded only for the active Discovery session.',
            )
          }
          let latestRound = scoped.rounds.at(-1)
          let feedbackCandidates = scoped.candidates
          if (latestRound === undefined) {
            const previewRound = scoped.previewRound
            const targetIds = new Set(request.feedback.targets.map((target) => target.candidateId))
            const enrichmentsByCandidate = new Map(
              scoped.candidateEnrichments.map((enrichment) => [
                enrichment.candidate.id,
                enrichment,
              ]),
            )
            const orderedEnrichments =
              previewRound === null
                ? []
                : previewRound.previews.flatMap((preview) => {
                    if (!targetIds.has(preview.candidateId)) return []
                    const enrichment = enrichmentsByCandidate.get(preview.candidateId)
                    return enrichment === undefined ? [] : [enrichment]
                  })
            const canMaterializeReferencedPreviews =
              previewRound !== null &&
              request.feedback.roundId === previewRound.finalRoundId &&
              request.feedback.targets.length > 0 &&
              targetIds.size === request.feedback.targets.length &&
              request.feedback.targets.every((target) => target.revision === 1) &&
              orderedEnrichments.length === targetIds.size
            if (canMaterializeReferencedPreviews && previewRound !== null) {
              for (const enrichment of orderedEnrichments) {
                repository.appendCandidate(enrichment.candidate)
              }
              latestRound = {
                schemaVersion: 1,
                id: previewRound.finalRoundId,
                discoverySessionId: scoped.session.id,
                correlationId: request.correlationId,
                roundIndex: 1,
                inputSnapshot: scoped.session.input,
                appliedFeedbackIds: [],
                candidates: orderedEnrichments.map((enrichment) => ({
                  candidateId: enrichment.candidate.id,
                  revision: enrichment.candidate.revision,
                })),
                generationRationale: previewRound.generationRationale,
                diversityCheck: {
                  dimensionsReviewed: [
                    'PROBLEM_DOMAIN',
                    'TARGET_USER',
                    'CORE_INTERACTION',
                    'DATA_SHAPE',
                    'USER_APPEAL',
                  ],
                  modeCollapseDetected: false,
                  rationale:
                    'Only the preview identities referenced by the user were enriched before continuing.',
                },
                createdAt: request.feedback.createdAt,
                source: { kind: 'AGENT', role: 'DISCOVERY' },
                redactionStatus: 'NOT_REQUIRED',
              }
              repository.appendCandidateRound(latestRound)
              feedbackCandidates = [
                ...scoped.candidates,
                ...orderedEnrichments.map((enrichment) => enrichment.candidate),
              ]
            }
          }
          if (latestRound === undefined || latestRound.id !== request.feedback.roundId) {
            throw this.#validationError(
              request.correlationId,
              'DISCOVERY_ROUND_NOT_CURRENT',
              'Discovery Feedback must reference the current Candidate Round.',
            )
          }
          const candidateKeys = new Set(latestRound.candidates.map(candidateReferenceKey))
          if (
            request.feedback.targets.some(
              (target) => !candidateKeys.has(candidateReferenceKey(target)),
            )
          ) {
            throw this.#validationError(
              request.correlationId,
              'DISCOVERY_CANDIDATE_NOT_FOUND',
              'Discovery Feedback targets must be visible in the current Candidate Round.',
            )
          }
          const latestRevisionByCandidate = new Map<string, number>()
          for (const candidate of feedbackCandidates) {
            latestRevisionByCandidate.set(
              candidate.id,
              Math.max(latestRevisionByCandidate.get(candidate.id) ?? 0, candidate.revision),
            )
          }
          if (
            request.feedback.targets.some(
              (target) => latestRevisionByCandidate.get(target.candidateId) !== target.revision,
            )
          ) {
            throw this.#validationError(
              request.correlationId,
              'DISCOVERY_CANDIDATE_STALE',
              'Discovery Feedback cannot target a superseded Candidate revision.',
            )
          }
          repository.appendDiscoveryFeedback(request.feedback)
          const selected = request.feedback.intent === 'SELECT'
          const nextSession = {
            ...scoped.session,
            revision: scoped.session.revision + 1,
            status: selected ? ('SELECTED' as const) : scoped.session.status,
            updatedAt: request.feedback.createdAt,
            ...(selected ? { closedAt: request.feedback.createdAt } : {}),
          }
          repository.appendDiscoverySession(nextSession)
          if (selected && scoped.project.status === 'DISCOVERY') {
            repository.appendProject({
              ...scoped.project,
              revision: scoped.project.revision + 1,
              status: 'SPEC_REVIEW',
              updatedAt: request.feedback.createdAt,
              source: { kind: 'CORE' },
            })
          }
          this.#appendAudit(repository, {
            correlationId: request.correlationId,
            actor: request.actor,
            action: selected ? 'ACCEPTED' : 'UPDATED',
            resource: {
              type: 'DISCOVERY_SESSION',
              id: scoped.session.id,
              revision: nextSession.revision,
            },
            summary: 'Applied validated user-authored Discovery feedback.',
            changedFields: ['revision', ...(selected ? ['status'] : [])],
            occurredAt: request.feedback.createdAt,
          })
          const response = this.#receipt(request.correlationId, nextSession.revision)
          return {
            response,
            resourceId: scoped.session.id,
            resourceRevision: nextSession.revision,
          }
        },
      ),
    )
  }

  #confirmLearningSpec(
    request: Extract<UiRequest, { kind: 'UI_CONFIRM_LEARNING_SPEC' }>,
  ): CommandReceipt {
    const confirmedAt = this.#timestamp()
    return this.#storage.transaction((repository) =>
      this.#idempotent(
        repository,
        request,
        'ui.confirm_learning_spec',
        commandReceiptSchema,
        () => {
          const scoped = this.#readDiscoveryByProject(
            repository,
            request.projectId,
            request.correlationId,
          )
          const history = scoped.learningSpecs.filter((spec) => spec.id === request.learningSpecId)
          const current = latestByRevision(history)
          this.#assertRevision(
            request.expectedSpecRevision,
            current?.revision ?? 0,
            request.correlationId,
            'LEARNING_SPEC_STALE',
          )
          if (current === null)
            throw this.#notFound(request.correlationId, 'LEARNING_SPEC_NOT_FOUND')
          const selection = selectedFeedback(scoped)
          const selectedCandidateRecord = selectedCandidate(scoped, selection)
          if (
            scoped.project.status !== 'SPEC_REVIEW' ||
            scoped.session.status !== 'SELECTED' ||
            selection === undefined ||
            selectedCandidateRecord === undefined
          ) {
            throw this.#validationError(
              request.correlationId,
              'LEARNING_SPEC_SELECTION_REQUIRED',
              'Learning Spec confirmation requires a stored user selection.',
            )
          }
          const proposed: LearningSpecRevision = {
            ...current,
            revision: current.revision + 1,
            parentRevision: current.revision,
            status: 'CONFIRMED',
            confirmation: { confirmedAt, confirmedBy: { kind: 'USER' } },
            updatedAt: confirmedAt,
            source: { kind: 'USER' },
          }
          const reduced = confirmLearningSpec({
            history,
            proposed,
            selectedCandidate: selectedCandidateRecord,
            selection,
          })
          if (reduced.outcome === 'REJECTED') {
            throw this.#domainError(request.correlationId, reduced.reasonCode)
          }
          repository.appendLearningSpec(proposed)
          this.#appendAudit(repository, {
            correlationId: request.correlationId,
            actor: { kind: 'USER' },
            action: 'ACCEPTED',
            resource: { type: 'LEARNING_SPEC', id: proposed.id, revision: proposed.revision },
            summary: 'Confirmed the current Learning Spec without changing its content.',
            changedFields: ['status', 'confirmation', 'revision'],
            occurredAt: confirmedAt,
          })
          const response = this.#receipt(request.correlationId, proposed.revision)
          return { response, resourceId: proposed.id, resourceRevision: proposed.revision }
        },
      ),
    )
  }

  async #prepareBuilderTask(
    request: Extract<UiRequest, { kind: 'UI_PREPARE_BUILDER_TASK' }>,
  ): Promise<PreparedBuilderTaskDescriptor> {
    const preparedAt = this.#timestamp()
    const taskId = this.#generateId('task')
    const workspacePath = this.#workspacePolicy.projectWorkspacePath(request.projectId)
    const existingReceipt = this.#storage.transaction((repository) =>
      repository.readIdempotencyReceipt(request.idempotencyKey),
    )
    if (
      existingReceipt !== null &&
      (existingReceipt.operation !== 'ui.prepare_builder_task' ||
        existingReceipt.correlationId !== request.correlationId ||
        existingReceipt.requestHash !== sha256(canonicalJson(request)))
    ) {
      throw this.#validationError(
        request.correlationId,
        'IDEMPOTENCY_KEY_REUSE',
        'Idempotency key was already used for a different request.',
      )
    }
    if (existingReceipt === null) {
      this.#storage.transaction((repository) => {
        const scoped = this.#readDiscoveryByProject(
          repository,
          request.projectId,
          request.correlationId,
        )
        const current = latestByRevision(
          scoped.learningSpecs.filter((spec) => spec.id === request.learningSpecId),
        )
        this.#assertRevision(
          request.expectedSpecRevision,
          current?.revision ?? 0,
          request.correlationId,
          'LEARNING_SPEC_STALE',
        )
        if (current === null) {
          throw this.#notFound(request.correlationId, 'LEARNING_SPEC_NOT_FOUND')
        }
        if (
          current.status !== 'CONFIRMED' ||
          current.correlationId !== request.correlationId ||
          scoped.project.correlationId !== request.correlationId ||
          scoped.project.status !== 'SPEC_REVIEW'
        ) {
          throw this.#validationError(
            request.correlationId,
            'BUILDER_TASK_CONFIRMED_SPEC_REQUIRED',
            'Builder Task preparation requires the current confirmed Learning Spec.',
          )
        }
      })
    }
    await this.#workspacePolicy.provisionProjectWorkspace(workspacePath, request.correlationId)

    return this.#storage.transaction((repository) =>
      this.#idempotent(
        repository,
        request,
        'ui.prepare_builder_task',
        preparedBuilderTaskDescriptorSchema,
        () => {
          const scoped = this.#readDiscoveryByProject(
            repository,
            request.projectId,
            request.correlationId,
          )
          const current = latestByRevision(
            scoped.learningSpecs.filter((spec) => spec.id === request.learningSpecId),
          )
          this.#assertRevision(
            request.expectedSpecRevision,
            current?.revision ?? 0,
            request.correlationId,
            'LEARNING_SPEC_STALE',
          )
          if (current === null) {
            throw this.#notFound(request.correlationId, 'LEARNING_SPEC_NOT_FOUND')
          }
          if (
            current.correlationId !== request.correlationId ||
            scoped.project.correlationId !== request.correlationId
          ) {
            throw this.#validationError(
              request.correlationId,
              'BUILDER_TASK_CORRELATION_MISMATCH',
              'Builder Task preparation must stay in the confirmed Spec correlation.',
            )
          }
          const recovery = repository.recoverProject(request.projectId)
          if (recovery?.currentTask !== null && recovery?.currentTask !== undefined) {
            throw this.#validationError(
              request.correlationId,
              'BUILDER_TASK_ALREADY_PREPARED',
              'Project already has a pending or running Builder Task.',
            )
          }
          if (
            scoped.project.generatedWorkspacePath !== undefined &&
            scoped.project.generatedWorkspacePath !== workspacePath
          ) {
            throw this.#validationError(
              request.correlationId,
              'WORKSPACE_ASSIGNMENT_CONFLICT',
              'Project already has a different generated workspace assignment.',
            )
          }

          const planned = planBuilderTask({
            project: scoped.project,
            spec: current,
            taskId,
            sequence: 1,
            now: preparedAt,
          })
          if (planned.outcome === 'REJECTED') {
            throw this.#domainError(request.correlationId, planned.reasonCode)
          }
          const task = planned.value
          const project: Project = {
            ...scoped.project,
            revision: scoped.project.revision + 1,
            generatedWorkspacePath: workspacePath,
            updatedAt: preparedAt,
            source: { kind: 'CORE' },
          }
          repository.appendProject(project)
          repository.appendTask(task)
          this.#appendAudit(repository, {
            correlationId: request.correlationId,
            actor: { kind: 'CORE' },
            action: 'CREATED',
            resource: { type: 'BUILDER_TASK', id: task.id, revision: task.revision },
            summary: 'Prepared a Builder Task and assigned its generated workspace.',
            changedFields: ['status', 'generatedWorkspacePath'],
            occurredAt: preparedAt,
          })
          const response = preparedBuilderTaskDescriptorSchema.parse({
            schemaVersion: 1,
            correlationId: request.correlationId,
            projectId: request.projectId,
            workspacePath,
            task,
            status: 'READY',
          })
          return { response, resourceId: task.id, resourceRevision: task.revision }
        },
      ),
    )
  }

  #returnToDiscovery(
    request: Extract<UiRequest, { kind: 'UI_RETURN_TO_DISCOVERY' }>,
  ): CommandReceipt {
    const returnedAt = this.#timestamp()
    const newSessionId = this.#generateId('discovery_session')
    return this.#storage.transaction((repository) =>
      this.#idempotent(repository, request, 'ui.return_to_discovery', commandReceiptSchema, () => {
        const scoped = this.#readDiscoveryBySession(
          repository,
          request.discoverySessionId,
          request.correlationId,
        )
        this.#assertRevision(
          request.expectedSessionRevision,
          scoped.session.revision,
          request.correlationId,
          'DISCOVERY_SESSION_STALE',
        )
        if (
          scoped.project.id !== request.projectId ||
          scoped.project.status !== 'SPEC_REVIEW' ||
          scoped.session.status !== 'SELECTED' ||
          scoped.session.correlationId !== request.correlationId
        ) {
          throw this.#validationError(
            request.correlationId,
            'LEARNING_SPEC_REVIEW_NOT_ACTIVE',
            'Returning to Discovery requires the selected Spec review session.',
          )
        }
        const current = currentLearningSpec(scoped)
        this.#assertRevision(
          request.expectedSpecRevision,
          current?.revision ?? 0,
          request.correlationId,
          'LEARNING_SPEC_STALE',
        )
        if (current !== null) {
          const history = scoped.learningSpecs.filter((spec) => spec.id === current.id)
          const proposed: LearningSpecRevision = {
            ...current,
            revision: current.revision + 1,
            parentRevision: current.revision,
            status: 'SUPERSEDED',
            updatedAt: returnedAt,
            source: { kind: 'CORE' },
          }
          const reduced = supersedeLearningSpec({ history, proposed })
          if (reduced.outcome === 'REJECTED') {
            throw this.#domainError(request.correlationId, reduced.reasonCode)
          }
          repository.appendLearningSpec(proposed)
        }
        const nextInput = request.input ?? scoped.session.input
        const newSession = {
          schemaVersion: 1 as const,
          id: newSessionId,
          projectId: scoped.project.id,
          correlationId: request.correlationId,
          revision: 1,
          input: nextInput,
          status: 'ACTIVE' as const,
          openedAt: returnedAt,
          updatedAt: returnedAt,
          source: { kind: 'USER' as const },
          redactionStatus: scoped.session.redactionStatus,
        }
        repository.appendDiscoverySession(newSession)
        repository.appendProject({
          ...scoped.project,
          revision: scoped.project.revision + 1,
          title: nextInput.learningGoal.slice(0, 120),
          learningGoal: nextInput.learningGoal,
          status: 'DISCOVERY',
          updatedAt: returnedAt,
          source: { kind: 'USER' },
        })
        this.#appendAudit(repository, {
          correlationId: request.correlationId,
          actor: { kind: 'USER' },
          action: 'UPDATED',
          resource: { type: 'DISCOVERY_SESSION', id: newSession.id, revision: 1 },
          summary:
            'Started a new Discovery session from the selected Spec without reopening its session.',
          changedFields: ['status', 'input', 'learningGoal'],
          occurredAt: returnedAt,
        })
        const response = this.#receipt(request.correlationId, 1)
        return { response, resourceId: newSession.id, resourceRevision: 1 }
      }),
    )
  }

  async #getBuilderTask(
    request: Extract<AgentRequest, { kind: 'BUILDER_GET_TASK' }>,
  ): Promise<BuilderTaskContext> {
    const aggregate = this.#storage.transaction((repository) =>
      repository.readBuilderTaskAggregate(request.projectId, request.taskId),
    )
    if (aggregate === null) throw this.#notFound(request.correlationId, 'BUILDER_TASK_NOT_FOUND')
    const response = this.#builderContext(aggregate, request.correlationId)
    await this.#workspacePolicy.validateReferences(
      aggregate.project,
      response,
      request.correlationId,
    )
    return response
  }

  #startTask(request: Extract<AgentRequest, { kind: 'BUILDER_START_TASK' }>): CommandReceipt {
    const startedAt = this.#timestamp()
    return this.#storage.transaction((repository) =>
      this.#idempotent(repository, request, 'builder.start_task', commandReceiptSchema, () => {
        const aggregate = this.#requireBuilderAggregate(
          repository,
          request.projectId,
          request.taskId,
          request.correlationId,
        )
        this.#assertRevision(
          request.expectedTaskRevision,
          aggregate.task.revision,
          request.correlationId,
          'BUILDER_TASK_STALE',
        )
        const proposed = {
          ...aggregate.task,
          revision: aggregate.task.revision + 1,
          status: 'ACTIVE' as const,
          updatedAt: startedAt,
        }
        const reduced = transitionBuilderTask({ current: aggregate.task, proposed })
        if (reduced.outcome === 'REJECTED') {
          throw this.#domainError(request.correlationId, reduced.reasonCode)
        }
        repository.appendTask(proposed)
        if (aggregate.project.status !== 'BUILDING') {
          repository.appendProject({
            ...aggregate.project,
            revision: aggregate.project.revision + 1,
            status: 'BUILDING',
            updatedAt: startedAt,
            source: { kind: 'CORE' },
          })
        }
        const event = this.#appendActivityEvent(repository, {
          projectId: proposed.projectId,
          taskId: proposed.id,
          correlationId: proposed.correlationId,
          actor: request.actor,
          occurredAt: startedAt,
          payload: { type: 'TASK_STARTED', taskId: proposed.id },
          sourceReferences: [],
        })
        this.#openEpisode(repository, {
          type: 'BUILD_TASK',
          event,
          taskId: proposed.id,
          conceptNames: proposed.expectedConcepts,
        })
        this.#appendAudit(repository, {
          correlationId: request.correlationId,
          actor: request.actor,
          action: 'UPDATED',
          resource: { type: 'BUILDER_TASK', id: proposed.id, revision: proposed.revision },
          summary: 'Started a validated pending Builder Task.',
          changedFields: ['status', 'revision'],
          occurredAt: startedAt,
        })
        const response = this.#receipt(request.correlationId, proposed.revision)
        return { response, resourceId: proposed.id, resourceRevision: proposed.revision }
      }),
    )
  }

  async #updateLiveContext(
    request: Extract<AgentRequest, { kind: 'BUILDER_UPDATE_LIVE_CONTEXT' }>,
  ): Promise<CommandReceipt> {
    const aggregate = this.#storage.transaction((repository) =>
      repository.readBuilderTaskAggregate(request.context.projectId, request.context.taskId),
    )
    if (aggregate === null) throw this.#notFound(request.correlationId, 'BUILDER_TASK_NOT_FOUND')
    await this.#workspacePolicy.validateReferences(
      aggregate.project,
      request.context,
      request.correlationId,
    )
    return this.#storage.transaction((repository) =>
      this.#idempotent(
        repository,
        request,
        'builder.update_live_context',
        commandReceiptSchema,
        () => {
          const current = this.#requireBuilderAggregate(
            repository,
            request.context.projectId,
            request.context.taskId,
            request.correlationId,
          )
          const reduced = reduceLiveContext({
            task: current.task,
            ...(current.liveContext === null ? {} : { current: current.liveContext }),
            proposed: request.context,
          })
          if (reduced.outcome === 'REJECTED') {
            throw this.#domainError(request.correlationId, reduced.reasonCode)
          }
          if (reduced.outcome === 'NO_OP') {
            const response = this.#receipt(request.correlationId, request.context.contextVersion)
            return {
              response,
              resourceId: request.context.id,
              resourceRevision: request.context.contextVersion,
            }
          }
          repository.appendLiveContext(request.context)
          this.#fulfillContextRefreshRequests(repository, current, request.context)
          const event = this.#appendActivityEvent(repository, {
            projectId: request.context.projectId,
            taskId: request.context.taskId,
            correlationId: current.task.correlationId,
            actor: request.actor,
            occurredAt: request.context.updatedAt,
            payload: {
              type: 'LIVE_CONTEXT_UPDATED',
              taskId: request.context.taskId,
              liveContextId: request.context.id,
              contextVersion: request.context.contextVersion,
            },
            sourceReferences: request.context.relatedFiles,
          })
          const buildEpisode = repository.readOpenEpisode(request.context.projectId, 'BUILD_TASK', {
            taskId: request.context.taskId,
          })
          if (buildEpisode === null) {
            this.#openEpisode(repository, {
              type: 'BUILD_TASK',
              event,
              taskId: request.context.taskId,
              conceptNames: request.context.activeConceptNames,
              contextReferences: request.context.relatedFiles,
            })
          } else {
            this.#appendEpisodeEvent(
              repository,
              buildEpisode,
              event,
              request.context.activeConceptNames,
              request.context.relatedFiles,
            )
          }
          this.#appendAudit(repository, {
            correlationId: request.correlationId,
            actor: request.actor,
            action: 'UPDATED',
            resource: {
              type: 'LIVE_CONTEXT',
              id: request.context.id,
              revision: request.context.contextVersion,
            },
            summary: 'Updated the validated Live Project Context snapshot.',
            changedFields: ['checkpoint', 'contextVersion'],
            occurredAt: request.context.updatedAt,
          })
          const response = this.#receipt(request.correlationId, request.context.contextVersion)
          return {
            response,
            resourceId: request.context.id,
            resourceRevision: request.context.contextVersion,
          }
        },
      ),
    )
  }

  async #requestDecision(
    request: Extract<AgentRequest, { kind: 'BUILDER_REQUEST_DECISION' }>,
  ): Promise<DecisionCommandReceipt> {
    const aggregate = this.#storage.transaction((repository) =>
      repository.readBuilderTaskAggregate(request.projectId, request.taskId),
    )
    if (aggregate === null) throw this.#notFound(request.correlationId, 'BUILDER_TASK_NOT_FOUND')
    await this.#workspacePolicy.validateReferences(
      aggregate.project,
      request,
      request.correlationId,
    )
    return this.#storage.transaction((repository) =>
      this.#idempotent(
        repository,
        request,
        'builder.request_decision',
        decisionCommandReceiptSchema,
        () => {
          const current = this.#requireBuilderAggregate(
            repository,
            request.projectId,
            request.taskId,
            request.correlationId,
          )
          this.#assertRevision(
            request.expectedTaskRevision,
            current.task.revision,
            request.correlationId,
            'BUILDER_TASK_STALE',
          )
          if (current.liveContext === null) {
            throw this.#validationError(
              request.correlationId,
              'LIVE_CONTEXT_REQUIRED',
              'A current Live Context is required before requesting a Decision.',
            )
          }
          this.#assertRevision(
            request.expectedContextVersion,
            current.liveContext.contextVersion,
            request.correlationId,
            'LIVE_CONTEXT_STALE',
          )
          const requestedAt = this.#timestamp()
          const decisionId = this.#generateId('decision')
          const optionIds = new Map(
            request.decision.options.map((option) => [
              option.key,
              this.#generateId('decision_option'),
            ]),
          )
          const decision = decisionRequestSchema.parse({
            schemaVersion: 1,
            id: decisionId,
            projectId: request.projectId,
            taskId: request.taskId,
            correlationId: request.correlationId,
            contextVersion: current.liveContext.contextVersion + 1,
            category: request.decision.category,
            question: request.decision.question,
            reasonRequiredNow: request.decision.reasonRequiredNow,
            options: request.decision.options.map(({ key, ...option }) => ({
              id: optionIds.get(key),
              ...option,
            })),
            recommendedOptionId: optionIds.get(request.decision.recommendedOptionKey),
            recommendationRationale: request.decision.recommendationRationale,
            relatedConceptNames: request.decision.relatedConceptNames,
            sourceReferences: request.decision.sourceReferences,
            independentWorkCanContinue: request.decision.independentWorkCanContinue,
            requestedAt,
            source: { kind: 'AGENT', role: 'BUILDER' },
            redactionStatus: 'VERIFIED_REDACTED',
          })
          const context = liveProjectContextSchema.parse({
            schemaVersion: 1,
            id: current.liveContext.id,
            projectId: request.projectId,
            taskId: request.taskId,
            correlationId: request.correlationId,
            contextVersion: current.liveContext.contextVersion + 1,
            expectedPreviousVersion: current.liveContext.contextVersion,
            checkpoint: 'DECISION_REQUIRED',
            stage: request.context.stage,
            currentGoal: request.context.currentGoal,
            recentChanges: request.context.recentChanges,
            activeDecisionIds: unique([...current.liveContext.activeDecisionIds, decisionId]),
            activeConceptNames: request.context.activeConceptNames,
            relatedFiles: request.context.relatedFiles,
            nextActions: request.context.nextActions,
            ...(request.context.blockingReason === undefined
              ? {}
              : { blockingReason: request.context.blockingReason }),
            updatedAt: requestedAt,
            source: { kind: 'AGENT', role: 'BUILDER' },
            redactionStatus: 'VERIFIED_REDACTED',
          })
          const contextResult = reduceLiveContext({
            task: current.task,
            current: current.liveContext,
            proposed: context,
          })
          if (contextResult.outcome === 'REJECTED') {
            throw this.#domainError(request.correlationId, contextResult.reasonCode)
          }
          const reduced = openDecision({
            task: current.task,
            liveContext: contextResult.value,
            request: decision,
          })
          if (reduced.outcome === 'REJECTED') {
            throw this.#domainError(request.correlationId, reduced.reasonCode)
          }
          let nextTask = current.task
          if (!decision.independentWorkCanContinue) {
            const proposedTask = {
              ...current.task,
              revision: current.task.revision + 1,
              status: 'BLOCKED' as const,
              updatedAt: decision.requestedAt,
            }
            const taskResult = transitionBuilderTask({
              current: current.task,
              proposed: proposedTask,
            })
            if (taskResult.outcome === 'REJECTED') {
              throw this.#domainError(request.correlationId, taskResult.reasonCode)
            }
            nextTask = taskResult.value
          }
          repository.appendLiveContext(contextResult.value)
          this.#fulfillContextRefreshRequests(repository, current, contextResult.value)
          repository.appendDecisionRequest(decision)
          if (nextTask.revision !== current.task.revision) repository.appendTask(nextTask)
          const contextEvent = this.#appendActivityEvent(repository, {
            projectId: decision.projectId,
            taskId: decision.taskId,
            correlationId: current.task.correlationId,
            actor: request.actor,
            occurredAt: requestedAt,
            payload: {
              type: 'LIVE_CONTEXT_UPDATED',
              taskId: decision.taskId,
              liveContextId: contextResult.value.id,
              contextVersion: contextResult.value.contextVersion,
            },
            sourceReferences: contextResult.value.relatedFiles,
          })
          const buildEpisode = repository.readOpenEpisode(decision.projectId, 'BUILD_TASK', {
            taskId: decision.taskId,
          })
          if (buildEpisode === null) {
            this.#openEpisode(repository, {
              type: 'BUILD_TASK',
              event: contextEvent,
              taskId: decision.taskId,
              conceptNames: contextResult.value.activeConceptNames,
              contextReferences: contextResult.value.relatedFiles,
            })
          } else {
            this.#appendEpisodeEvent(
              repository,
              buildEpisode,
              contextEvent,
              contextResult.value.activeConceptNames,
              contextResult.value.relatedFiles,
            )
          }
          const decisionEvent = this.#appendActivityEvent(repository, {
            projectId: decision.projectId,
            taskId: decision.taskId,
            decisionId: decision.id,
            correlationId: decision.correlationId,
            actor: request.actor,
            occurredAt: decision.requestedAt,
            payload: { type: 'DECISION_REQUESTED', decisionId: decision.id },
            sourceReferences: decision.sourceReferences,
          })
          this.#openEpisode(repository, {
            type: 'DECISION',
            event: decisionEvent,
            taskId: decision.taskId,
            decisionId: decision.id,
            conceptNames: decision.relatedConceptNames,
            contextReferences: decision.sourceReferences,
          })
          this.#appendAudit(repository, {
            correlationId: request.correlationId,
            actor: request.actor,
            action: 'UPDATED',
            resource: {
              type: 'LIVE_CONTEXT',
              id: contextResult.value.id,
              revision: contextResult.value.contextVersion,
            },
            summary: 'Stored the Decision gate Live Context snapshot.',
            changedFields: ['checkpoint', 'activeDecisionIds', 'contextVersion'],
            occurredAt: contextResult.value.updatedAt,
          })
          this.#appendAudit(repository, {
            correlationId: request.correlationId,
            actor: request.actor,
            action: 'SUBMITTED',
            resource: { type: 'DECISION', id: decision.id },
            summary: 'Opened a validated Builder Decision request.',
            changedFields: ['status'],
            occurredAt: decision.requestedAt,
          })
          if (nextTask.status === 'BLOCKED') {
            this.#appendAudit(repository, {
              correlationId: request.correlationId,
              actor: { kind: 'CORE' },
              action: 'UPDATED',
              resource: {
                type: 'BUILDER_TASK',
                id: nextTask.id,
                revision: nextTask.revision,
              },
              summary: 'Blocked the Task at a Decision gate with no independent work.',
              changedFields: ['status', 'revision'],
              occurredAt: nextTask.updatedAt,
            })
          }
          const response = decisionCommandReceiptSchema.parse({
            ...this.#receipt(request.correlationId, nextTask.revision),
            decisionId: decision.id,
          })
          return {
            response,
            resourceId: decision.id,
            resourceRevision: nextTask.revision,
          }
        },
      ),
    )
  }

  #getDecisionResult(
    request: Extract<AgentRequest, { kind: 'BUILDER_GET_DECISION_RESULT' }>,
  ): DecisionResult {
    const aggregate = this.#storage.transaction((repository) =>
      repository.readBuilderTaskAggregate(request.projectId, request.taskId),
    )
    if (aggregate === null) throw this.#notFound(request.correlationId, 'BUILDER_TASK_NOT_FOUND')
    const decision = aggregate.decisionRequests.find((item) => item.id === request.decisionId)
    if (decision === undefined) throw this.#notFound(request.correlationId, 'DECISION_NOT_FOUND')
    return decisionResultSchema.parse({
      schemaVersion: 1,
      correlationId: request.correlationId,
      request: decision,
      resolution:
        aggregate.decisionResolutions.find((item) => item.decisionId === decision.id) ?? null,
      application:
        aggregate.decisionApplications.find((item) => item.decisionId === decision.id) ?? null,
    })
  }

  #resolveUserDecision(
    request: Extract<UiRequest, { kind: 'UI_RESOLVE_DECISION' }>,
  ): CommandReceipt {
    return this.#storage.transaction((repository) =>
      this.#idempotent(repository, request, 'ui.resolve_decision', commandReceiptSchema, () => {
        const resolution = decisionResolutionSchema.parse({
          ...request.resolution,
          ...(request.resolution.customProposal === undefined
            ? {}
            : { customProposal: redactSensitiveText(request.resolution.customProposal) }),
          ...(request.resolution.rationale === undefined
            ? {}
            : { rationale: redactSensitiveText(request.resolution.rationale) }),
          redactionStatus: 'VERIFIED_REDACTED',
        })
        const aggregate = this.#requireBuilderAggregate(
          repository,
          resolution.projectId,
          resolution.taskId,
          request.correlationId,
        )
        const decision = aggregate.decisionRequests.find(
          (item) => item.id === resolution.decisionId,
        )
        if (decision === undefined)
          throw this.#notFound(request.correlationId, 'DECISION_NOT_FOUND')
        const existingResolution = aggregate.decisionResolutions.find(
          (item) => item.decisionId === decision.id,
        )
        const existingApplication = aggregate.decisionApplications.find(
          (item) => item.decisionId === decision.id,
        )
        const reduced = resolveDecision({
          aggregate: {
            request: decision,
            ...(existingResolution === undefined ? {} : { resolution: existingResolution }),
            ...(existingApplication === undefined ? {} : { application: existingApplication }),
          },
          task: aggregate.task,
          resolution,
          currentContextVersion: aggregate.liveContext?.contextVersion ?? 0,
        })
        if (reduced.outcome === 'REJECTED') {
          throw this.#domainError(request.correlationId, reduced.reasonCode)
        }
        repository.appendDecisionResolution(resolution)
        const resolvedDecisionIds = new Set([
          ...aggregate.decisionResolutions.map((resolution) => resolution.decisionId),
          resolution.decisionId,
        ])
        const hasUnresolvedBlockingDecision = aggregate.decisionRequests.some(
          (item) => !item.independentWorkCanContinue && !resolvedDecisionIds.has(item.id),
        )
        let nextTask = aggregate.task
        if (
          aggregate.task.status === 'BLOCKED' &&
          !decision.independentWorkCanContinue &&
          !hasUnresolvedBlockingDecision
        ) {
          const proposedTask = {
            ...aggregate.task,
            revision: aggregate.task.revision + 1,
            status: 'ACTIVE' as const,
            updatedAt: resolution.resolvedAt,
          }
          const taskResult = transitionBuilderTask({
            current: aggregate.task,
            proposed: proposedTask,
          })
          if (taskResult.outcome === 'REJECTED') {
            throw this.#domainError(request.correlationId, taskResult.reasonCode)
          }
          nextTask = taskResult.value
          repository.appendTask(nextTask)
        }
        const event = this.#appendActivityEvent(repository, {
          projectId: decision.projectId,
          taskId: decision.taskId,
          decisionId: decision.id,
          correlationId: decision.correlationId,
          actor: { kind: 'USER' },
          occurredAt: resolution.resolvedAt,
          payload: {
            type: 'DECISION_RESOLVED',
            decisionId: decision.id,
            resolutionId: resolution.id,
            rationaleProvided: resolution.rationale !== undefined,
          },
          sourceReferences: [{ kind: 'USER_DECISION', decisionId: decision.id }],
        })
        const decisionEpisode = repository.readOpenEpisode(decision.projectId, 'DECISION', {
          decisionId: decision.id,
        })
        const currentEpisode =
          decisionEpisode === null
            ? this.#openEpisode(repository, {
                type: 'DECISION',
                event,
                taskId: decision.taskId,
                decisionId: decision.id,
                conceptNames: decision.relatedConceptNames,
                contextReferences: decision.sourceReferences,
              })
            : this.#appendEpisodeEvent(repository, decisionEpisode, event)
        this.#closeEpisodeAndQueue(
          repository,
          currentEpisode,
          resolution.resolvedAt,
          'User resolved the Decision.',
        )
        this.#closeHelperEpisodes(
          repository,
          decision.projectId,
          { decisionId: decision.id },
          resolution.resolvedAt,
          'Related Decision was resolved.',
          decision.correlationId,
        )
        this.#appendAudit(repository, {
          correlationId: request.correlationId,
          actor: { kind: 'USER' },
          action: 'RESOLVED',
          resource: { type: 'DECISION', id: decision.id },
          summary: 'Stored a validated user-authored Decision resolution.',
          changedFields: ['status'],
          occurredAt: resolution.resolvedAt,
        })
        if (nextTask.revision !== aggregate.task.revision) {
          this.#appendAudit(repository, {
            correlationId: request.correlationId,
            actor: { kind: 'CORE' },
            action: 'UPDATED',
            resource: {
              type: 'BUILDER_TASK',
              id: nextTask.id,
              revision: nextTask.revision,
            },
            summary: 'Resumed the Task after its blocking Decision was resolved.',
            changedFields: ['status', 'revision'],
            occurredAt: nextTask.updatedAt,
          })
        }
        const response = this.#receipt(request.correlationId, nextTask.revision)
        return {
          response,
          resourceId: decision.id,
          resourceRevision: nextTask.revision,
        }
      }),
    )
  }

  async #applyDecision(
    request: Extract<AgentRequest, { kind: 'BUILDER_APPLY_DECISION' }>,
  ): Promise<DecisionCommandReceipt> {
    const aggregate = this.#storage.transaction((repository) =>
      repository.readBuilderTaskAggregate(request.projectId, request.taskId),
    )
    if (aggregate === null) throw this.#notFound(request.correlationId, 'BUILDER_TASK_NOT_FOUND')
    await this.#workspacePolicy.validateReferences(
      aggregate.project,
      request,
      request.correlationId,
    )
    return this.#storage.transaction((repository) =>
      this.#idempotent(
        repository,
        request,
        'builder.apply_decision',
        decisionCommandReceiptSchema,
        () => {
          const current = this.#requireBuilderAggregate(
            repository,
            request.projectId,
            request.taskId,
            request.correlationId,
          )
          this.#assertRevision(
            request.expectedTaskRevision,
            current.task.revision,
            request.correlationId,
            'BUILDER_TASK_STALE',
          )
          if (current.liveContext === null) {
            throw this.#validationError(
              request.correlationId,
              'LIVE_CONTEXT_REQUIRED',
              'A current Live Context is required before applying a Decision.',
            )
          }
          this.#assertRevision(
            request.expectedContextVersion,
            current.liveContext.contextVersion,
            request.correlationId,
            'LIVE_CONTEXT_STALE',
          )
          const decision = current.decisionRequests.find((item) => item.id === request.decisionId)
          if (decision === undefined)
            throw this.#notFound(request.correlationId, 'DECISION_NOT_FOUND')
          const resolution = current.decisionResolutions.find(
            (item) => item.decisionId === decision.id,
          )
          if (resolution === undefined) {
            throw this.#domainError(request.correlationId, 'DECISION_NOT_RESOLVED')
          }
          const existingApplication = current.decisionApplications.find(
            (item) => item.decisionId === decision.id,
          )
          const appliedAt = this.#timestamp()
          const application = decisionApplicationSchema.parse({
            schemaVersion: 1,
            id: this.#generateId('decision_application'),
            decisionId: decision.id,
            resolutionId: resolution.id,
            projectId: request.projectId,
            taskId: request.taskId,
            correlationId: request.correlationId,
            appliedResult: request.appliedResult,
            sourceReferences: request.sourceReferences,
            appliedAt,
            source: { kind: 'AGENT', role: 'BUILDER' },
            redactionStatus: 'VERIFIED_REDACTED',
          })
          const decisionResult = applyDecision({
            aggregate: {
              request: decision,
              ...(resolution === undefined ? {} : { resolution }),
              ...(existingApplication === undefined ? {} : { application: existingApplication }),
            },
            task: current.task,
            application,
          })
          if (decisionResult.outcome === 'REJECTED') {
            throw this.#domainError(request.correlationId, decisionResult.reasonCode)
          }
          if (!current.liveContext.activeDecisionIds.includes(decision.id)) {
            throw this.#validationError(
              request.correlationId,
              'DECISION_APPLICATION_CONTEXT_INVALID',
              'The current Context must contain the Decision being applied.',
            )
          }
          const context = liveProjectContextSchema.parse({
            schemaVersion: 1,
            id: current.liveContext.id,
            projectId: request.projectId,
            taskId: request.taskId,
            correlationId: request.correlationId,
            contextVersion: current.liveContext.contextVersion + 1,
            expectedPreviousVersion: current.liveContext.contextVersion,
            checkpoint: 'DIRECTION_CHANGED',
            stage: request.context.stage,
            currentGoal: request.context.currentGoal,
            recentChanges: request.context.recentChanges,
            activeDecisionIds: current.liveContext.activeDecisionIds.filter(
              (decisionId) => decisionId !== decision.id,
            ),
            activeConceptNames: request.context.activeConceptNames,
            relatedFiles: request.context.relatedFiles,
            nextActions: request.context.nextActions,
            updatedAt: appliedAt,
            source: { kind: 'AGENT', role: 'BUILDER' },
            redactionStatus: 'VERIFIED_REDACTED',
          })
          const contextResult = reduceLiveContext({
            task: current.task,
            current: current.liveContext,
            proposed: context,
          })
          if (contextResult.outcome === 'REJECTED') {
            throw this.#domainError(request.correlationId, contextResult.reasonCode)
          }
          repository.appendDecisionApplication(application)
          repository.appendLiveContext(contextResult.value)
          this.#fulfillContextRefreshRequests(repository, current, contextResult.value)
          const event = this.#appendActivityEvent(repository, {
            projectId: application.projectId,
            taskId: application.taskId,
            correlationId: current.task.correlationId,
            actor: request.actor,
            occurredAt: application.appliedAt,
            payload: {
              type: 'LIVE_CONTEXT_UPDATED',
              taskId: application.taskId,
              liveContextId: contextResult.value.id,
              contextVersion: contextResult.value.contextVersion,
            },
            sourceReferences: application.sourceReferences,
          })
          const buildEpisode = repository.readOpenEpisode(application.projectId, 'BUILD_TASK', {
            taskId: application.taskId,
          })
          if (buildEpisode === null) {
            this.#openEpisode(repository, {
              type: 'BUILD_TASK',
              event,
              taskId: application.taskId,
              conceptNames: contextResult.value.activeConceptNames,
              contextReferences: application.sourceReferences,
            })
          } else {
            this.#appendEpisodeEvent(
              repository,
              buildEpisode,
              event,
              contextResult.value.activeConceptNames,
              application.sourceReferences,
            )
          }
          this.#appendAudit(repository, {
            correlationId: request.correlationId,
            actor: request.actor,
            action: 'UPDATED',
            resource: { type: 'DECISION', id: decision.id },
            summary: 'Recorded the Builder application of the user Decision.',
            changedFields: ['status'],
            occurredAt: application.appliedAt,
          })
          this.#appendAudit(repository, {
            correlationId: request.correlationId,
            actor: request.actor,
            action: 'UPDATED',
            resource: {
              type: 'LIVE_CONTEXT',
              id: contextResult.value.id,
              revision: contextResult.value.contextVersion,
            },
            summary: 'Stored the post-Decision Builder resume Context.',
            changedFields: ['checkpoint', 'activeDecisionIds', 'contextVersion'],
            occurredAt: contextResult.value.updatedAt,
          })
          const response = decisionCommandReceiptSchema.parse({
            ...this.#receipt(request.correlationId, current.task.revision),
            decisionId: decision.id,
          })
          return {
            response,
            resourceId: decision.id,
            resourceRevision: current.task.revision,
          }
        },
      ),
    )
  }

  async #completeTask(
    request: Extract<AgentRequest, { kind: 'BUILDER_COMPLETE_TASK' }>,
  ): Promise<CommandReceipt> {
    const aggregate = this.#storage.transaction((repository) =>
      repository.readBuilderTaskAggregate(request.report.projectId, request.report.taskId),
    )
    if (aggregate === null) throw this.#notFound(request.correlationId, 'BUILDER_TASK_NOT_FOUND')
    await this.#workspacePolicy.validateReferences(
      aggregate.project,
      request.report,
      request.correlationId,
    )
    return this.#storage.transaction((repository) =>
      this.#idempotent(repository, request, 'builder.complete_task', commandReceiptSchema, () => {
        const current = this.#requireBuilderAggregate(
          repository,
          request.report.projectId,
          request.report.taskId,
          request.correlationId,
        )
        const requestedDecisionIds = new Set(
          current.decisionRequests.map((decision) => decision.id),
        )
        const appliedDecisionIds = new Set(
          current.decisionApplications.map((application) => application.decisionId),
        )
        if (
          !sameStringSet(requestedDecisionIds, appliedDecisionIds) ||
          !sameStringSet(new Set(request.report.appliedDecisionIds), appliedDecisionIds) ||
          request.report.appliedDecisionIds.length !==
            new Set(request.report.appliedDecisionIds).size ||
          (current.liveContext?.activeDecisionIds.length ?? 0) > 0
        ) {
          throw this.#validationError(
            request.correlationId,
            'TASK_DECISION_NOT_APPLIED',
            'Every requested Decision must be applied and cleared before Task completion.',
          )
        }
        if (
          current.liveContext?.checkpoint !== 'TASK_COMPLETED' ||
          current.liveContext.updatedAt > request.report.completedAt
        ) {
          throw this.#validationError(
            request.correlationId,
            'TASK_COMPLETED_CONTEXT_REQUIRED',
            'A current TASK_COMPLETED Live Context is required before Task completion.',
          )
        }
        const scopeByConcept = new Map<string, string>()
        for (const item of current.learningSpec.scope) {
          for (const conceptName of item.conceptNames) {
            scopeByConcept.set(conceptName.toLocaleLowerCase('en-US'), item.category)
          }
        }
        for (const usage of request.report.conceptUsage) {
          const expectedScope = scopeByConcept.get(usage.conceptName.toLocaleLowerCase('en-US'))
          if (expectedScope === undefined || expectedScope !== usage.scope) {
            throw this.#validationError(
              request.correlationId,
              'TASK_CONCEPT_SCOPE_MISMATCH',
              'Completion concept usage must match the confirmed Learning Spec scope.',
            )
          }
          if (usage.scope === 'EXCLUDED') {
            throw this.#validationError(
              request.correlationId,
              'TASK_EXCLUDED_CONCEPT_REPORTED',
              'Completion cannot report excluded concepts as implemented usage.',
            )
          }
        }
        const proposed = {
          ...current.task,
          revision: current.task.revision + 1,
          status: 'COMPLETED' as const,
          updatedAt: request.report.completedAt,
        }
        const reduced = transitionBuilderTask({
          current: current.task,
          proposed,
          completionReport: request.report,
        })
        if (reduced.outcome === 'REJECTED') {
          throw this.#domainError(request.correlationId, reduced.reasonCode)
        }
        repository.appendCompletionReport(request.report)
        repository.appendTask(proposed)
        let buildEpisode = repository.readOpenEpisode(proposed.projectId, 'BUILD_TASK', {
          taskId: proposed.id,
        })
        const conceptNames = request.report.conceptUsage.map((usage) => usage.conceptName)
        if (conceptNames.length > 0) {
          const conceptReferences = request.report.conceptUsage.flatMap(
            (usage) => usage.codeReferences,
          )
          const conceptEvent = this.#appendActivityEvent(repository, {
            projectId: proposed.projectId,
            taskId: proposed.id,
            correlationId: proposed.correlationId,
            actor: request.actor,
            occurredAt: request.report.completedAt,
            payload: { type: 'CONCEPT_REPORTED', taskId: proposed.id, conceptNames },
            sourceReferences: conceptReferences,
          })
          buildEpisode =
            buildEpisode === null
              ? this.#openEpisode(repository, {
                  type: 'BUILD_TASK',
                  event: conceptEvent,
                  taskId: proposed.id,
                  conceptNames,
                  contextReferences: conceptReferences,
                })
              : this.#appendEpisodeEvent(
                  repository,
                  buildEpisode,
                  conceptEvent,
                  conceptNames,
                  conceptReferences,
                )
        }
        for (const validation of request.report.validationResults) {
          if (validation.status === 'NOT_RUN' || validation.reference === undefined) continue
          const validationEvent = this.#appendActivityEvent(repository, {
            projectId: proposed.projectId,
            taskId: proposed.id,
            correlationId: proposed.correlationId,
            actor: request.actor,
            occurredAt: request.report.completedAt,
            payload: {
              type: 'VALIDATION_RESULT',
              taskId: proposed.id,
              result: validation.status,
              reference: validation.reference,
            },
            sourceReferences: [validation.reference],
          })
          buildEpisode =
            buildEpisode === null
              ? this.#openEpisode(repository, {
                  type: 'BUILD_TASK',
                  event: validationEvent,
                  taskId: proposed.id,
                })
              : this.#appendEpisodeEvent(repository, buildEpisode, validationEvent)
        }
        const completionEvent = this.#appendActivityEvent(repository, {
          projectId: proposed.projectId,
          taskId: proposed.id,
          correlationId: proposed.correlationId,
          actor: request.actor,
          occurredAt: request.report.completedAt,
          payload: {
            type: 'TASK_COMPLETED',
            taskId: proposed.id,
            completionReportId: request.report.id,
          },
          sourceReferences: [
            ...request.report.codeReferences,
            ...request.report.diffReferences,
            ...request.report.validationResults.flatMap((validation) =>
              validation.reference === undefined ? [] : [validation.reference],
            ),
          ].slice(0, 30),
        })
        buildEpisode =
          buildEpisode === null
            ? this.#openEpisode(repository, {
                type: 'BUILD_TASK',
                event: completionEvent,
                taskId: proposed.id,
                conceptNames,
              })
            : this.#appendEpisodeEvent(repository, buildEpisode, completionEvent)
        const analysisJob = this.#closeEpisodeAndQueue(
          repository,
          buildEpisode,
          request.report.completedAt,
          'Builder Task completed.',
        )
        this.#closeHelperEpisodes(
          repository,
          proposed.projectId,
          { taskId: proposed.id },
          request.report.completedAt,
          'Builder Task completed.',
          proposed.correlationId,
        )
        for (const usage of request.report.conceptUsage) {
          const contextSources =
            usage.codeReferences.length > 0
              ? usage.codeReferences
              : [{ kind: 'EVENT' as const, eventId: completionEvent.id }]
          this.#recordConceptObservation(repository, {
            projectId: proposed.projectId,
            taskId: proposed.id,
            episodeId: analysisJob.episodeId,
            correlationId: proposed.correlationId,
            conceptName: usage.conceptName,
            contextSources,
            observedAt: request.report.completedAt,
            description: usage.usageReason,
          })
        }
        this.#appendAudit(repository, {
          correlationId: request.correlationId,
          actor: request.actor,
          action: 'UPDATED',
          resource: { type: 'BUILDER_TASK', id: proposed.id, revision: proposed.revision },
          summary: 'Completed a Builder Task with passing acceptance results.',
          changedFields: ['status', 'revision'],
          occurredAt: request.report.completedAt,
        })
        const response = this.#receipt(request.correlationId, proposed.revision)
        return { response, resourceId: proposed.id, resourceRevision: proposed.revision }
      }),
    )
  }

  async #getHelperContext(
    request: Extract<AgentRequest, { kind: 'HELPER_GET_CONTEXT' }>,
  ): Promise<HelperContext> {
    const aggregate = this.#readHelperAggregate(
      request.projectId,
      request.taskId,
      request.correlationId,
    )
    const traces = this.#storage.transaction((repository) =>
      repository.readRecentEvidenceTraces(100),
    )
    const currentVersion = aggregate.liveContext?.contextVersion ?? null
    if (
      currentVersion !== null &&
      request.observedContextVersion !== undefined &&
      request.observedContextVersion > currentVersion
    ) {
      throw this.#validationError(
        request.correlationId,
        'LIVE_CONTEXT_VERSION_INVALID',
        'Observed Live Context version is ahead of Core state.',
      )
    }
    const activeDecisions = aggregate.decisionRequests.filter(
      (decision) =>
        !aggregate.decisionResolutions.some((resolution) => resolution.decisionId === decision.id),
    )
    const focusedDecision =
      request.decisionId === undefined
        ? (activeDecisions[0] ?? null)
        : (aggregate.decisionRequests.find((decision) => decision.id === request.decisionId) ??
          null)
    if (request.decisionId !== undefined && focusedDecision === null) {
      throw this.#notFound(request.correlationId, 'DECISION_NOT_FOUND')
    }
    const question = request.question.toLocaleLowerCase('en-US')
    const relevanceNames = unique([
      ...request.relatedConceptNames,
      ...(aggregate.liveContext?.activeConceptNames ?? []),
      ...(focusedDecision?.relatedConceptNames ?? []),
      ...activeDecisions.flatMap((decision) => decision.relatedConceptNames),
      ...traces.flatMap((trace) => {
        const names = [trace.concept.canonicalName, ...(trace.ledger?.acceptedAliases ?? [])]
        return names.some((name) => question.includes(name.toLocaleLowerCase('en-US')))
          ? [trace.concept.canonicalName]
          : []
      }),
    ]).map((name) => name.toLocaleLowerCase('en-US'))
    const personalization = this.#storage.transaction((repository) =>
      this.#helperPersonalization(repository, {
        projectId: request.projectId,
        taskId: aggregate.task.id,
        ...(request.decisionId === undefined ? {} : { decisionId: request.decisionId }),
        correlationId: request.correlationId,
        question: request.question,
        relatedConceptNames: relevanceNames,
      }),
    )
    const personalizationConceptIds = new Set(personalization.basis.map((basis) => basis.conceptId))
    const relevantLedgerEntries = traces
      .flatMap((trace) => (trace.ledger === null ? [] : [trace.ledger]))
      .filter((entry) => personalizationConceptIds.has(entry.concept.id))
      .filter(
        (entry, index, entries) =>
          entries.findIndex((candidate) => candidate.id === entry.id) === index,
      )
      .slice(0, 5)
    const recentEpisodeAggregates = this.#storage.transaction((repository) =>
      repository.readRecentEpisodeAggregatesForProject(request.projectId, 20),
    )
    const relevantNameSet = new Set(relevanceNames)
    const recentEpisodes = recentEpisodeAggregates
      .filter((candidate) => {
        const sameTask = candidate.episode.taskId === aggregate.task.id
        const relatedConcept = candidate.episode.conceptCandidates.some((concept) =>
          relevantNameSet.has(concept.originalExpression.toLocaleLowerCase('en-US')),
        )
        return sameTask || relatedConcept
      })
      .slice(0, 5)
      .map((candidate) => ({
        episodeId: candidate.episode.id,
        type: candidate.episode.type,
        endedAt: candidate.episode.endedAt,
        conceptNames: candidate.episode.conceptCandidates.map(
          (concept) => concept.originalExpression,
        ),
        redactedUserExcerpts: candidate.events
          .flatMap((event) =>
            event.payload.type === 'USER_MESSAGE' ? [event.payload.redactedExcerpt] : [],
          )
          .slice(0, 5),
        helperResponseSummaries: candidate.events
          .flatMap((event) =>
            event.payload.type === 'HELPER_RESPONSE' ? [event.payload.summary] : [],
          )
          .slice(0, 5),
        contextReferences: candidate.episode.contextReferences.slice(0, 10),
      }))
    const rawReferences = [
      ...(aggregate.liveContext?.relatedFiles ?? []),
      ...(focusedDecision?.sourceReferences ?? []),
      ...activeDecisions.flatMap((decision) => decision.sourceReferences),
      ...(aggregate.completionReport?.codeReferences ?? []),
      ...(aggregate.completionReport?.diffReferences ?? []),
      ...recentEpisodes.flatMap((episode) => episode.contextReferences),
    ]
    const contextReferences = rawReferences
      .filter(
        (reference, index, references) =>
          references.findIndex(
            (candidate) => canonicalJson(candidate) === canonicalJson(reference),
          ) === index,
      )
      .slice(0, 30)
    const sourceExcerpts = []
    const referenceDetails = []
    for (const reference of contextReferences) {
      if (reference.kind !== 'CODE') {
        referenceDetails.push({
          reference,
          availability: 'REFERENCE_ONLY' as const,
          reason: 'Raw diff and conversation content is not persisted in Helper context.',
        })
        continue
      }
      if (sourceExcerpts.length >= 3) {
        referenceDetails.push({
          reference,
          availability: 'REFERENCE_ONLY' as const,
          reason: 'Bounded Helper context includes at most three code excerpts.',
        })
        continue
      }
      const excerpt = await this.#workspacePolicy.readCodeExcerpt(
        aggregate.project,
        reference,
        request.correlationId,
      )
      if (excerpt === null) {
        referenceDetails.push({
          reference,
          availability: 'UNAVAILABLE' as const,
          reason: 'Referenced code is missing, empty, non-text, or exceeds the read limit.',
        })
        continue
      }
      sourceExcerpts.push({
        reference,
        ...excerpt,
        redactionStatus: 'VERIFIED_REDACTED' as const,
      })
      referenceDetails.push({ reference, availability: 'EXCERPT_INCLUDED' as const })
    }
    const freshnessStatus =
      currentVersion === null
        ? ('MISSING' as const)
        : request.observedContextVersion !== undefined &&
            request.observedContextVersion !== currentVersion
          ? ('STALE' as const)
          : ('CURRENT' as const)
    const pendingContextRefreshRequests = aggregate.contextRefreshRequests.filter(
      (refresh) => refresh.status === 'PENDING',
    )
    const response = helperContextSchema.parse({
      schemaVersion: 1,
      correlationId: request.correlationId,
      project: aggregate.project,
      learningSpec: aggregate.learningSpec,
      task: aggregate.task,
      liveContext: aggregate.liveContext,
      activeDecisions: activeDecisions.slice(0, 10),
      focusedDecision,
      relevantLedgerEntries,
      personalization,
      recentEpisodes,
      contextReferences,
      referenceDetails,
      sourceExcerpts,
      pendingContextRefreshRequests,
      freshness: {
        currentContextVersion: currentVersion,
        observedContextVersion: request.observedContextVersion ?? null,
        status: freshnessStatus,
        stale: freshnessStatus !== 'CURRENT',
        refreshRequired: freshnessStatus !== 'CURRENT',
      },
    })
    await this.#workspacePolicy.validateReferences(
      aggregate.project,
      response,
      request.correlationId,
    )
    return response
  }

  #requestContextRefresh(
    request: Extract<AgentRequest, { kind: 'HELPER_REQUEST_CONTEXT_REFRESH' }>,
  ): CommandReceipt {
    const requestedAt = this.#timestamp()
    return this.#storage.transaction((repository) =>
      this.#idempotent(
        repository,
        request,
        'helper.request_context_refresh',
        commandReceiptSchema,
        () => {
          const aggregate = this.#requireBuilderAggregate(
            repository,
            request.projectId,
            request.taskId,
            request.correlationId,
          )
          const currentVersion = aggregate.liveContext?.contextVersion ?? 0
          if (
            request.observedContextVersion !== undefined &&
            request.observedContextVersion > currentVersion
          ) {
            throw this.#validationError(
              request.correlationId,
              'LIVE_CONTEXT_VERSION_INVALID',
              'Observed Live Context version is ahead of Core state.',
            )
          }
          const refresh = contextRefreshRequestSchema.parse({
            schemaVersion: 1,
            id: this.#generateId('context_refresh'),
            projectId: request.projectId,
            taskId: request.taskId,
            correlationId: request.correlationId,
            revision: 1,
            ...(request.observedContextVersion === undefined
              ? {}
              : { observedContextVersion: request.observedContextVersion }),
            reason: redactSensitiveText(request.reason),
            status: 'PENDING',
            requestedAt,
            source: request.actor,
            redactionStatus: 'VERIFIED_REDACTED',
          })
          repository.appendContextRefreshRequest(refresh)
          this.#appendAudit(repository, {
            correlationId: request.correlationId,
            actor: request.actor,
            action: 'SUBMITTED',
            resource: {
              type: 'CONTEXT_REFRESH_REQUEST',
              id: refresh.id,
              revision: refresh.revision,
            },
            summary: 'Recorded a read-only Helper request for Builder context refresh.',
            changedFields: [],
            occurredAt: requestedAt,
          })
          const response = this.#receipt(request.correlationId, refresh.revision)
          return {
            response,
            resourceId: refresh.id,
            resourceRevision: refresh.revision,
          }
        },
      ),
    )
  }

  async #openHelperFromUi(
    request: Extract<UiRequest, { kind: 'UI_OPEN_HELPER' }>,
  ): Promise<HelperContext> {
    return this.#getHelperContext({
      schemaVersion: 1,
      kind: 'HELPER_GET_CONTEXT',
      correlationId: request.correlationId,
      actor: { kind: 'AGENT', role: 'HELPER' },
      projectId: request.projectId,
      ...(request.taskId === undefined ? {} : { taskId: request.taskId }),
      ...(request.decisionId === undefined ? {} : { decisionId: request.decisionId }),
      question: request.question ?? 'Explain the current project context.',
      relatedConceptNames: [],
    })
  }

  async #prepareBuilderSession(
    request: Extract<UiRequest, { kind: 'UI_PREPARE_BUILDER_SESSION' }>,
  ): Promise<BuilderSessionBindingDescriptor> {
    const aggregate = this.#storage.transaction((repository) =>
      repository.readBuilderTaskAggregate(request.projectId, request.taskId),
    )
    if (aggregate === null) throw this.#notFound(request.correlationId, 'BUILDER_TASK_NOT_FOUND')
    if (!['PENDING', 'ACTIVE', 'BLOCKED'].includes(aggregate.task.status)) {
      throw this.#validationError(
        request.correlationId,
        'BUILDER_SESSION_NOT_AVAILABLE',
        'Builder session is only available for a pending, active, or blocked Task.',
      )
    }
    if (aggregate.project.generatedWorkspacePath === undefined) {
      throw this.#validationError(
        request.correlationId,
        'BUILDER_WORKSPACE_NOT_ASSIGNED',
        'Builder Task does not have a generated workspace assignment.',
      )
    }
    const workspaceDirectory = await this.#workspacePolicy.resolveProjectWorkspace(
      aggregate.project,
      request.correlationId,
    )
    return builderSessionBindingDescriptorSchema.parse({
      schemaVersion: 1,
      correlationId: request.correlationId,
      projectId: aggregate.project.id,
      taskId: aggregate.task.id,
      workspaceDirectory,
      status: 'READY',
    })
  }

  #recordHelperExchange(
    request: Extract<UiRequest, { kind: 'UI_RECORD_HELPER_EXCHANGE' }>,
  ): HelperExchangeReceipt {
    const recordedAt = this.#timestamp()
    return this.#storage.transaction((repository) =>
      this.#idempotent(
        repository,
        request,
        'ui.record_helper_exchange',
        helperExchangeReceiptSchema,
        () => {
          const recovery = repository.recoverProject(request.projectId)
          if (recovery === null) throw this.#notFound(request.correlationId, 'PROJECT_NOT_FOUND')
          const task =
            request.taskId === undefined
              ? recovery.currentTask
              : (repository.readBuilderTaskAggregate(request.projectId, request.taskId)?.task ??
                null)
          if (task === null) throw this.#notFound(request.correlationId, 'BUILDER_TASK_NOT_FOUND')
          const conversationId = request.conversationId ?? this.#generateId('conversation')
          const helperMessageId = this.#generateId('message')
          const existing = repository.readOpenEpisode(request.projectId, 'HELPER_CONVERSATION', {
            conversationId,
          })
          const episodeCorrelationId = existing?.correlationId ?? request.correlationId
          let episode = existing
          if (request.origin === 'FREE_TEXT') {
            const userMessageId = this.#generateId('message')
            const userEvent = this.#appendActivityEvent(repository, {
              projectId: request.projectId,
              taskId: task.id,
              ...(request.decisionId === undefined ? {} : { decisionId: request.decisionId }),
              conversationId,
              correlationId: episodeCorrelationId,
              actor: { kind: 'USER' },
              occurredAt: recordedAt,
              payload: {
                type: 'USER_MESSAGE',
                conversationId,
                messageId: userMessageId,
                redactedExcerpt: redactSensitiveText(request.userMessage),
              },
              sourceReferences: [
                { kind: 'USER_MESSAGE', conversationId, messageId: userMessageId },
              ],
            })
            episode =
              episode === null
                ? this.#openEpisode(repository, {
                    type: 'HELPER_CONVERSATION',
                    event: userEvent,
                    taskId: task.id,
                    ...(request.decisionId === undefined ? {} : { decisionId: request.decisionId }),
                    conversationId,
                  })
                : this.#appendEpisodeEvent(repository, episode, userEvent)
          }
          const helperEvent = this.#appendActivityEvent(repository, {
            projectId: request.projectId,
            taskId: task.id,
            ...(request.decisionId === undefined ? {} : { decisionId: request.decisionId }),
            conversationId,
            correlationId: episodeCorrelationId,
            actor: { kind: 'AGENT', role: 'HELPER' },
            occurredAt: recordedAt,
            payload: {
              type: 'HELPER_RESPONSE',
              conversationId,
              messageId: helperMessageId,
              summary: redactSensitiveText(request.helperResponseSummary),
            },
            sourceReferences: [
              { kind: 'AGENT_MESSAGE', conversationId, messageId: helperMessageId },
            ],
          })
          episode =
            episode === null
              ? this.#openEpisode(repository, {
                  type: 'HELPER_CONVERSATION',
                  event: helperEvent,
                  taskId: task.id,
                  ...(request.decisionId === undefined ? {} : { decisionId: request.decisionId }),
                  conversationId,
                })
              : this.#appendEpisodeEvent(repository, episode, helperEvent)
          if (request.closeConversation) {
            this.#closeEpisodeAndQueue(
              repository,
              episode,
              recordedAt,
              'Helper conversation explicitly ended.',
            )
          }
          const response = helperExchangeReceiptSchema.parse({
            schemaVersion: 1,
            correlationId: request.correlationId,
            conversationId,
            episodeId: episode.id,
            episodeRevision: request.closeConversation ? episode.revision + 1 : episode.revision,
            status: request.closeConversation ? 'PENDING_ANALYSIS' : 'OPEN',
          })
          return {
            response,
            resourceId: episode.id,
            resourceRevision: response.episodeRevision,
          }
        },
      ),
    )
  }

  #retryAnalysis(request: Extract<UiRequest, { kind: 'UI_RETRY_ANALYSIS' }>): AnalysisJob {
    const retriedAt = this.#timestamp()
    return this.#storage.transaction((repository) =>
      this.#idempotent(repository, request, 'ui.retry_analysis', analysisJobSchema, () => {
        const current = repository.readAnalysisJob(request.projectId, request.analysisJobId)
        if (current === null) throw this.#notFound(request.correlationId, 'ANALYSIS_JOB_NOT_FOUND')
        this.#assertRevision(
          request.expectedJobRevision,
          current.revision,
          request.correlationId,
          'ANALYSIS_JOB_STALE',
        )
        if (current.status !== 'FAILED') {
          throw this.#validationError(
            request.correlationId,
            'ANALYSIS_RETRY_NOT_ALLOWED',
            'Only a failed Analysis Job can be retried manually.',
          )
        }
        const aggregate = repository.readEpisodeAggregate(request.projectId, current.episodeId)
        if (aggregate === null) throw this.#notFound(request.correlationId, 'EPISODE_NOT_FOUND')
        const episodeResult = transitionEpisodeAnalysis({
          current: aggregate.episode,
          status: 'PENDING_ANALYSIS',
          changedAt: retriedAt,
        })
        if (episodeResult.outcome === 'REJECTED') {
          throw this.#domainError(request.correlationId, episodeResult.reasonCode)
        }
        repository.appendEpisode(episodeResult.value)
        const proposed = analysisJobSchema.parse({
          ...current,
          episodeRevision: episodeResult.value.revision,
          revision: current.revision + 1,
          status: 'PENDING',
          attempt: 0,
          updatedAt: retriedAt,
          lastFailure: undefined,
          startedAt: undefined,
          completedAt: undefined,
        })
        const jobResult = transitionAnalysisJob({ current, proposed })
        if (jobResult.outcome === 'REJECTED') {
          throw this.#domainError(request.correlationId, jobResult.reasonCode)
        }
        repository.appendAnalysisJob(jobResult.value)
        this.#appendAudit(repository, {
          correlationId: request.correlationId,
          actor: request.actor,
          action: 'UPDATED',
          resource: {
            type: 'ANALYSIS_JOB',
            id: jobResult.value.id,
            revision: jobResult.value.revision,
          },
          summary: 'Reset a failed Analysis Job for an explicit user retry.',
          changedFields: ['status', 'attempt', 'revision', 'episodeRevision'],
          occurredAt: retriedAt,
        })
        return {
          response: jobResult.value,
          resourceId: jobResult.value.id,
          resourceRevision: jobResult.value.revision,
        }
      }),
    )
  }

  #readAnalysisJobs(
    request: Extract<UiRequest, { kind: 'UI_READ_ANALYSIS_JOBS' }>,
  ): readonly AnalysisJob[] {
    return this.#storage.transaction((repository) => {
      if (repository.recoverProject(request.projectId) === null) {
        throw this.#notFound(request.correlationId, 'PROJECT_NOT_FOUND')
      }
      return repository.readAnalysisJobsForProject(request.projectId, request.status, request.limit)
    })
  }

  #claimAnalysisJob(
    request: Extract<AnalysisRuntimeRequest, { kind: 'ANALYSIS_CLAIM_JOB' }>,
  ): AnalysisJob {
    const startedAt = this.#timestamp()
    return this.#storage.transaction((repository) => {
      const current = repository.readAnalysisJob(request.projectId, request.analysisJobId)
      if (current === null) throw this.#notFound(request.correlationId, 'ANALYSIS_JOB_NOT_FOUND')
      this.#assertRevision(
        request.expectedJobRevision,
        current.revision,
        request.correlationId,
        'ANALYSIS_JOB_STALE',
      )
      const proposed = analysisJobSchema.parse({
        ...current,
        revision: current.revision + 1,
        status: 'RUNNING',
        attempt: current.attempt + 1,
        runtimeHandle: request.runtimeHandle,
        deadlineAt: new Date(Date.parse(startedAt) + current.timeoutMs).toISOString(),
        lastFailure: undefined,
        updatedAt: startedAt,
        startedAt,
        completedAt: undefined,
      })
      const result = transitionAnalysisJob({ current, proposed })
      if (result.outcome === 'REJECTED') {
        throw this.#domainError(request.correlationId, result.reasonCode)
      }
      repository.appendAnalysisJob(result.value)
      this.#appendAudit(repository, {
        correlationId: request.correlationId,
        actor: request.actor,
        action: 'UPDATED',
        resource: { type: 'ANALYSIS_JOB', id: result.value.id, revision: result.value.revision },
        summary: 'Claimed a pending Analysis Job for one bounded Analyst attempt.',
        changedFields: ['status', 'attempt', 'revision'],
        occurredAt: startedAt,
      })
      return result.value
    })
  }

  #recoverExpiredAnalysisJobs(
    request: Extract<AnalysisRuntimeRequest, { kind: 'ANALYSIS_RECOVER_EXPIRED' }>,
  ): readonly AnalysisJob[] {
    const recoveredAt = this.#timestamp()
    return this.#storage.transaction((repository) =>
      repository.readExpiredRunningAnalysisJobs(recoveredAt, request.limit).map((current) => {
        const terminal = current.attempt >= current.maxAttempts
        const proposed = analysisJobSchema.parse({
          ...current,
          revision: current.revision + 1,
          status: terminal ? 'FAILED' : 'PENDING',
          runtimeHandle: undefined,
          deadlineAt: undefined,
          lastFailure: {
            code: 'ANALYST_TIMEOUT',
            message: 'Recovered an expired Analyst attempt after runtime interruption.',
            retryable: true,
          },
          updatedAt: recoveredAt,
          ...(terminal ? { completedAt: recoveredAt } : { completedAt: undefined }),
        })
        const result = transitionAnalysisJob({ current, proposed })
        if (result.outcome === 'REJECTED') {
          throw this.#domainError(request.correlationId, result.reasonCode)
        }
        repository.appendAnalysisJob(result.value)
        if (terminal) {
          const aggregate = repository.readEpisodeAggregate(current.projectId, current.episodeId)
          if (aggregate === null) throw this.#notFound(request.correlationId, 'EPISODE_NOT_FOUND')
          const episodeResult = transitionEpisodeAnalysis({
            current: aggregate.episode,
            status: 'ANALYSIS_FAILED',
            changedAt: recoveredAt,
          })
          if (episodeResult.outcome === 'REJECTED') {
            throw this.#domainError(request.correlationId, episodeResult.reasonCode)
          }
          repository.appendEpisode(episodeResult.value)
        }
        this.#appendAudit(repository, {
          correlationId: current.correlationId,
          actor: request.actor,
          action: 'UPDATED',
          resource: {
            type: 'ANALYSIS_JOB',
            id: result.value.id,
            revision: result.value.revision,
          },
          summary: terminal
            ? 'Recovered an expired Analysis Job as a terminal failure.'
            : 'Recovered an expired Analysis Job for its remaining retry.',
          changedFields: ['status', 'revision', 'lastFailure'],
          occurredAt: recoveredAt,
        })
        return result.value
      }),
    )
  }

  #failAnalysisAttempt(
    request: Extract<AnalysisRuntimeRequest, { kind: 'ANALYSIS_FAIL_ATTEMPT' }>,
  ): AnalysisJob {
    const failedAt = this.#timestamp()
    return this.#storage.transaction((repository) => {
      const current = repository.readAnalysisJob(request.projectId, request.analysisJobId)
      if (current === null) throw this.#notFound(request.correlationId, 'ANALYSIS_JOB_NOT_FOUND')
      this.#assertRevision(
        request.expectedJobRevision,
        current.revision,
        request.correlationId,
        'ANALYSIS_JOB_STALE',
      )
      if (current.status !== 'RUNNING' || current.attempt !== request.attempt) {
        throw this.#validationError(
          request.correlationId,
          'ANALYSIS_RESULT_STALE',
          'Analysis failure does not match the current running attempt.',
        )
      }
      const terminal = !request.failure.retryable || current.attempt >= current.maxAttempts
      const proposed = analysisJobSchema.parse({
        ...current,
        revision: current.revision + 1,
        status: terminal ? 'FAILED' : 'PENDING',
        runtimeHandle: undefined,
        deadlineAt: undefined,
        lastFailure: request.failure,
        updatedAt: failedAt,
        ...(terminal ? { completedAt: failedAt } : { completedAt: undefined }),
      })
      const result = transitionAnalysisJob({ current, proposed })
      if (result.outcome === 'REJECTED') {
        throw this.#domainError(request.correlationId, result.reasonCode)
      }
      repository.appendAnalysisJob(result.value)
      if (terminal) {
        const aggregate = repository.readEpisodeAggregate(request.projectId, current.episodeId)
        if (aggregate === null) throw this.#notFound(request.correlationId, 'EPISODE_NOT_FOUND')
        const episodeResult = transitionEpisodeAnalysis({
          current: aggregate.episode,
          status: 'ANALYSIS_FAILED',
          changedAt: failedAt,
        })
        if (episodeResult.outcome === 'REJECTED') {
          throw this.#domainError(request.correlationId, episodeResult.reasonCode)
        }
        repository.appendEpisode(episodeResult.value)
      }
      this.#appendAudit(repository, {
        correlationId: request.correlationId,
        actor: request.actor,
        action: 'UPDATED',
        resource: { type: 'ANALYSIS_JOB', id: result.value.id, revision: result.value.revision },
        summary: terminal
          ? 'Recorded a terminal Analysis Job failure after the retry budget was exhausted.'
          : 'Recorded a retryable Analysis Job attempt failure.',
        changedFields: ['status', 'revision', 'lastFailure'],
        occurredAt: failedAt,
      })
      return result.value
    })
  }

  async #submitAnalysisResult(
    request: Extract<AnalysisRuntimeRequest, { kind: 'ANALYSIS_SUBMIT_RESULT' }>,
  ): Promise<EvidenceBatchApplicationResult> {
    const submittedAt = this.#timestamp()
    const context = this.#storage.transaction((repository) => {
      const job = repository.readAnalysisJob(request.projectId, request.analysisJobId)
      if (job === null) throw this.#notFound(request.correlationId, 'ANALYSIS_JOB_NOT_FOUND')
      this.#assertRevision(
        request.expectedJobRevision,
        job.revision,
        request.correlationId,
        'ANALYSIS_JOB_STALE',
      )
      const aggregate = repository.readEpisodeAggregate(request.projectId, job.episodeId)
      if (aggregate === null) throw this.#notFound(request.correlationId, 'EPISODE_NOT_FOUND')
      return { job, episode: aggregate.episode }
    })
    if (
      request.result.episodeId !== context.job.episodeId ||
      request.result.episodeRevision !== context.job.episodeRevision ||
      request.result.correlationId !== context.job.correlationId ||
      request.attempt !== context.job.attempt
    ) {
      throw this.#validationError(
        request.correlationId,
        'ANALYSIS_RESULT_STALE',
        'Semantic Analyst result does not match the current job attempt.',
      )
    }
    const batch = evidenceProposalBatchSchema.parse({
      schemaVersion: 1,
      projectId: request.projectId,
      episodeId: context.job.episodeId,
      correlationId: context.job.correlationId,
      episodeRevision: context.job.episodeRevision,
      proposals: request.result.proposals.map((draft) => ({
        schemaVersion: 1,
        id: this.#generateId('evidence_proposal'),
        projectId: request.projectId,
        ...(context.episode.taskId === undefined ? {} : { taskId: context.episode.taskId }),
        episodeId: context.job.episodeId,
        correlationId: context.job.correlationId,
        ...draft,
        redactedEvidenceExcerpt: redactSensitiveText(draft.redactedEvidenceExcerpt),
        rationale: redactSensitiveText(draft.rationale),
        ...(draft.uncertainty === undefined
          ? {}
          : { uncertainty: redactSensitiveText(draft.uncertainty) }),
        misconception: {
          ...draft.misconception,
          ...(draft.misconception.summary === undefined
            ? {}
            : { summary: redactSensitiveText(draft.misconception.summary) }),
        },
        proposedAt: submittedAt,
        source: { kind: 'AGENT', role: 'EVIDENCE_ANALYST' },
        redactionStatus: 'VERIFIED_REDACTED',
      })),
      ...(request.result.noEvidenceReason === undefined
        ? {}
        : { noEvidenceReason: redactSensitiveText(request.result.noEvidenceReason) }),
      submittedAt,
      source: { kind: 'AGENT', role: 'EVIDENCE_ANALYST' },
    })
    return this.#submitEvidenceProposals(
      analystSubmitEvidenceProposalsCommandSchema.parse({
        schemaVersion: 1,
        kind: 'ANALYST_SUBMIT_EVIDENCE_PROPOSALS',
        correlationId: request.correlationId,
        actor: { kind: 'AGENT', role: 'EVIDENCE_ANALYST' },
        idempotencyKey: request.idempotencyKey,
        analysisJobId: request.analysisJobId,
        expectedJobRevision: request.expectedJobRevision,
        attempt: request.attempt,
        batch,
      }),
    )
  }

  async #getEpisodeContext(
    request: Extract<AgentRequest, { kind: 'ANALYST_GET_EPISODE_CONTEXT' }>,
  ): Promise<EpisodeContext> {
    const aggregate = this.#storage.transaction((repository) =>
      repository.readEpisodeAggregate(request.projectId, request.episodeId),
    )
    if (aggregate === null) throw this.#notFound(request.correlationId, 'EPISODE_NOT_FOUND')
    this.#assertRevision(
      request.expectedEpisodeRevision,
      aggregate.episode.revision,
      request.correlationId,
      'EPISODE_STALE',
    )
    const project = this.#storage.transaction(
      (repository) => repository.recoverProject(request.projectId)?.project ?? null,
    )
    if (project === null) throw this.#notFound(request.correlationId, 'PROJECT_NOT_FOUND')
    const response = episodeContextSchema.parse({
      schemaVersion: 1,
      correlationId: request.correlationId,
      episode: aggregate.episode,
      events: aggregate.events,
      relevantLedgerEntries: aggregate.relevantLedgerEntries,
      analysisJob: this.#storage.transaction((repository) =>
        repository.readAnalysisJobForEpisode(request.projectId, request.episodeId),
      ),
      decisionContext:
        aggregate.episode.decisionId === undefined || aggregate.episode.taskId === undefined
          ? null
          : this.#storage.transaction((repository) => {
              const task = repository.readBuilderTaskAggregate(
                request.projectId,
                aggregate.episode.taskId as string,
              )
              const decision = task?.decisionRequests.find(
                (candidate) => candidate.id === aggregate.episode.decisionId,
              )
              return decision === undefined
                ? null
                : {
                    request: decision,
                    resolution:
                      task?.decisionResolutions.find(
                        (candidate) => candidate.decisionId === decision.id,
                      ) ?? null,
                  }
            }),
    })
    await this.#workspacePolicy.validateReferences(project, response, request.correlationId)
    return response
  }

  async #submitEvidenceProposals(
    request: Extract<AgentRequest, { kind: 'ANALYST_SUBMIT_EVIDENCE_PROPOSALS' }>,
  ): Promise<EvidenceBatchApplicationResult> {
    const projectId = request.batch.projectId
    const project = this.#storage.transaction(
      (repository) => repository.recoverProject(projectId)?.project ?? null,
    )
    if (project === null) throw this.#notFound(request.correlationId, 'PROJECT_NOT_FOUND')
    await this.#workspacePolicy.validateReferences(project, request.batch, request.correlationId)

    return this.#storage.transaction((repository) =>
      this.#idempotent(
        repository,
        request,
        'analyst.submit_evidence_proposals',
        evidenceBatchApplicationResultSchema,
        () => {
          const job = repository.readAnalysisJob(projectId, request.analysisJobId)
          if (job === null) throw this.#notFound(request.correlationId, 'ANALYSIS_JOB_NOT_FOUND')
          this.#assertRevision(
            request.expectedJobRevision,
            job.revision,
            request.correlationId,
            'ANALYSIS_JOB_STALE',
          )
          if (
            job.status !== 'RUNNING' ||
            job.attempt !== request.attempt ||
            job.episodeId !== request.batch.episodeId ||
            job.episodeRevision !== request.batch.episodeRevision ||
            job.correlationId !== request.batch.correlationId
          ) {
            throw this.#validationError(
              request.correlationId,
              'ANALYSIS_RESULT_STALE',
              'Evidence result does not match the current running Analysis attempt.',
            )
          }
          const aggregate = repository.readEpisodeAggregate(projectId, request.batch.episodeId)
          if (aggregate === null) throw this.#notFound(request.correlationId, 'EPISODE_NOT_FOUND')
          this.#assertRevision(
            request.batch.episodeRevision,
            aggregate.episode.revision,
            request.correlationId,
            'EPISODE_STALE',
          )
          const existingProposalIds = aggregate.evidenceProposals.map((proposal) => proposal.id)
          const outcomes: EvidenceBatchApplicationResult['outcomes'][number][] = []
          for (const proposal of request.batch.proposals) {
            const concept = this.#resolveConcept(repository, proposal, request.batch.submittedAt)
            const resolvedProposal = evidenceProposalSchema.parse({
              ...proposal,
              concept: { ...proposal.concept, canonicalConceptId: concept.id },
            })
            const priorTrace = repository.readEvidenceTrace(concept.id)
            const evaluation = evaluateEvidenceProposal({
              proposal: resolvedProposal,
              episode: aggregate.episode,
              episodeRevision: request.batch.episodeRevision,
              events: aggregate.events,
              concept,
              existingProposalIds: [
                ...existingProposalIds,
                ...outcomes.map((item) => item.proposalId),
              ],
              priorAcceptedEvidence: priorTrace?.acceptedEvidence ?? [],
              metadata: {
                proposalId: proposal.id,
                decisionId: this.#generateId('evidence_decision'),
                acceptedEvidenceId: this.#generateId('evidence'),
                decidedAt: request.batch.submittedAt,
                acceptedAt: request.batch.submittedAt,
              },
            })
            repository.appendEvidenceProposal(resolvedProposal)
            repository.appendEvidenceDecision(evaluation.decision)
            if (evaluation.outcome === 'REJECTED') {
              outcomes.push({
                proposalId: proposal.id,
                decision: evaluation.decision,
                conceptId: concept.id,
              })
              continue
            }
            repository.appendAcceptedEvidence(evaluation.evidence)
            const currentTrace = repository.readEvidenceTrace(concept.id)
            const issuesResult = applyMisconceptionProposal({
              issues: currentTrace?.misconceptionIssues ?? [],
              proposal: resolvedProposal,
              evidence: evaluation.evidence,
              ...(resolvedProposal.misconception.action === 'OPEN' &&
              resolvedProposal.misconception.issueId === undefined
                ? { newIssueId: this.#generateId('misconception') }
                : {}),
              appliedAt: request.batch.submittedAt,
            })
            if (issuesResult.outcome === 'REJECTED') {
              throw this.#domainError(request.correlationId, issuesResult.reasonCode)
            }
            for (const issue of issuesResult.value) repository.appendMisconceptionIssue(issue)

            const acceptedEvidence = currentTrace?.acceptedEvidence ?? [evaluation.evidence]
            const currentLedger = currentTrace?.ledger ?? null
            const supportingEvidence = acceptedEvidence.filter(
              (evidence) => evidence.kind !== 'MISCONCEPTION_SIGNAL',
            )
            let ledgerRevision: number | undefined
            if (supportingEvidence.length > 0) {
              const stateResult = reduceConceptState({
                conceptId: concept.id,
                ...(currentLedger === null ? {} : { current: currentLedger.state }),
                acceptedEvidence,
                nextRevision: currentLedger === null ? 1 : currentLedger.state.revision + 1,
                updatedAt: request.batch.submittedAt,
              })
              if (stateResult.outcome === 'REJECTED') {
                throw this.#domainError(request.correlationId, stateResult.reasonCode)
              }
              const openIssues = issuesResult.value.filter((issue) => issue.status === 'OPEN')
              const ledger = {
                schemaVersion: 1 as const,
                id: currentLedger?.id ?? this.#generateId('concept_ledger'),
                concept,
                acceptedAliases: unique([
                  ...(currentLedger?.acceptedAliases ?? []),
                  resolvedProposal.concept.originalExpression,
                ]),
                state: stateResult.value,
                openIssues,
                relatedProjectIds: unique([
                  ...(currentLedger?.relatedProjectIds ?? []),
                  resolvedProposal.projectId,
                ]),
                relatedTaskIds: unique([
                  ...(currentLedger?.relatedTaskIds ?? []),
                  ...(resolvedProposal.taskId === undefined ? [] : [resolvedProposal.taskId]),
                ]),
                revision: currentLedger === null ? 1 : currentLedger.revision + 1,
                updatedAt: request.batch.submittedAt,
                source: { kind: 'CORE' as const },
              }
              repository.appendConceptLedger(ledger)
              ledgerRevision = ledger.revision
            }
            this.#appendAudit(repository, {
              correlationId: request.correlationId,
              actor: { kind: 'CORE' },
              action: 'ACCEPTED',
              resource: { type: 'EVIDENCE', id: evaluation.evidence.id },
              summary: 'Applied an Evidence Proposal through deterministic Core policy.',
              changedFields: ledgerRevision === undefined ? [] : ['state.acceptedEvidenceIds'],
              occurredAt: request.batch.submittedAt,
            })
            outcomes.push({
              proposalId: proposal.id,
              decision: evaluation.decision,
              acceptedEvidenceId: evaluation.evidence.id,
              conceptId: concept.id,
              ...(ledgerRevision === undefined ? {} : { ledgerRevision }),
            })
          }
          const response = evidenceBatchApplicationResultSchema.parse({
            schemaVersion: 1,
            episodeId: aggregate.episode.id,
            episodeRevision: aggregate.episode.revision,
            correlationId: request.correlationId,
            outcomes,
          })
          const analyzedAt = request.batch.submittedAt
          const episodeResult = transitionEpisodeAnalysis({
            current: aggregate.episode,
            status: 'ANALYZED',
            changedAt: analyzedAt,
          })
          if (episodeResult.outcome === 'REJECTED') {
            throw this.#domainError(request.correlationId, episodeResult.reasonCode)
          }
          repository.appendEpisode(episodeResult.value)
          const completedJob = analysisJobSchema.parse({
            ...job,
            revision: job.revision + 1,
            status: 'SUCCEEDED',
            runtimeHandle: undefined,
            deadlineAt: undefined,
            lastFailure: undefined,
            resultSummary: {
              proposalCount: request.batch.proposals.length,
              acceptedCount: outcomes.filter((outcome) => outcome.decision.outcome === 'ACCEPTED')
                .length,
              rejectedCount: outcomes.filter((outcome) => outcome.decision.outcome === 'REJECTED')
                .length,
              ...(request.batch.noEvidenceReason === undefined
                ? {}
                : { noEvidenceReason: request.batch.noEvidenceReason }),
            },
            updatedAt: analyzedAt,
            completedAt: analyzedAt,
          })
          const jobResult = transitionAnalysisJob({ current: job, proposed: completedJob })
          if (jobResult.outcome === 'REJECTED') {
            throw this.#domainError(request.correlationId, jobResult.reasonCode)
          }
          repository.appendAnalysisJob(jobResult.value)
          this.#appendAudit(repository, {
            correlationId: request.correlationId,
            actor: { kind: 'CORE' },
            action: 'UPDATED',
            resource: {
              type: 'ANALYSIS_JOB',
              id: jobResult.value.id,
              revision: jobResult.value.revision,
            },
            summary: 'Completed an Analysis Job after deterministic Evidence processing.',
            changedFields: ['status', 'revision'],
            occurredAt: analyzedAt,
          })
          return {
            response,
            resourceId: jobResult.value.id,
            resourceRevision: jobResult.value.revision,
          }
        },
      ),
    )
  }

  #readEvidenceTrace(
    request: Extract<UiRequest, { kind: 'UI_READ_EVIDENCE_TRACE' }>,
  ): ProjectEvidenceTrace {
    return this.#storage.transaction((repository) => {
      const recovery = repository.recoverProject(request.projectId)
      if (recovery === null) {
        throw this.#notFound(request.correlationId, 'PROJECT_NOT_FOUND')
      }
      const personalization = repository
        .readPersonalizationTracesForProject(request.projectId, 100)
        .filter((trace) => {
          if (trace.target.kind !== 'DISCOVERY_SESSION') return true
          const aggregate = repository.readDiscoveryAggregate(
            trace.projectId,
            trace.target.discoverySessionId,
          )
          return aggregate?.session.correlationId === trace.correlationId
        })
      const personalizationEvidenceIds = new Set(
        personalization.flatMap((trace) => trace.basis.flatMap((basis) => basis.evidenceIds)),
      )
      const personalizationIssueIds = new Set(
        personalization.flatMap((trace) => trace.basis.flatMap((basis) => basis.openIssueIds)),
      )
      const directTraces = repository.readEvidenceTracesForProject(request.projectId)
      const allowedConceptIds = new Set([
        ...directTraces.map((trace) => trace.concept.id),
        ...personalization.flatMap((trace) => trace.basis.map((basis) => basis.conceptId)),
      ])
      if (request.conceptId !== undefined && !allowedConceptIds.has(request.conceptId)) {
        throw this.#notFound(request.correlationId, 'EVIDENCE_TRACE_NOT_FOUND')
      }
      const conceptIds =
        request.conceptId === undefined ? [...allowedConceptIds] : [request.conceptId]
      const concepts = conceptIds.flatMap((conceptId) => {
        const trace = repository.readEvidenceTrace(conceptId)
        if (trace === null) return []
        const evidence = trace.acceptedEvidence.flatMap((record) => {
          if (
            record.projectId !== request.projectId &&
            !personalizationEvidenceIds.has(record.id)
          ) {
            return []
          }
          const episode = repository.readEpisodeAggregate(record.projectId, record.episodeId)
          const sourceProject = repository.recoverProject(record.projectId)
          if (episode === null || sourceProject === null) return []
          const proposal =
            'evidenceProposalId' in record
              ? trace.proposals.find((candidate) => candidate.id === record.evidenceProposalId)
              : undefined
          return [
            {
              evidenceId: record.id,
              kind: record.kind,
              projectId: record.projectId,
              projectTitle: sourceProject.project.title,
              ...(record.taskId === undefined ? {} : { taskId: record.taskId }),
              episodeId: record.episodeId,
              episodeType: episode.episode.type,
              episodeStatus: episode.episode.status,
              ...(episode.episode.endedAt === undefined
                ? {}
                : { episodeEndedAt: episode.episode.endedAt }),
              acceptedAt: record.acceptedAt,
              ...('supportsState' in record ? { supportsState: record.supportsState } : {}),
              ...('signal' in record ? { signal: record.signal } : {}),
              ...('strength' in record ? { strength: record.strength } : {}),
              ...('promptDependence' in record
                ? { promptDependence: record.promptDependence }
                : {}),
              ...(proposal === undefined
                ? {}
                : {
                    redactedEvidenceExcerpt: proposal.redactedEvidenceExcerpt,
                    rationale: proposal.rationale,
                  }),
            },
          ]
        })
        const rejectedEvidence = trace.decisions.flatMap((decision) => {
          if (decision.outcome !== 'REJECTED') return []
          const proposal = trace.proposals.find(
            (candidate) => candidate.id === decision.evidenceProposalId,
          )
          if (proposal === undefined || proposal.projectId !== request.projectId) return []
          const episode = repository.readEpisodeAggregate(proposal.projectId, proposal.episodeId)
          const sourceProject = repository.recoverProject(proposal.projectId)
          if (episode === null || sourceProject === null) return []
          return [
            {
              proposalId: proposal.id,
              evidenceDecisionId: decision.id,
              projectId: proposal.projectId,
              projectTitle: sourceProject.project.title,
              episodeId: proposal.episodeId,
              episodeType: episode.episode.type,
              proposedConceptName: proposal.concept.proposedCanonicalName,
              signal: proposal.signal,
              strength: proposal.strength,
              promptDependence: proposal.promptDependence,
              redactedEvidenceExcerpt: proposal.redactedEvidenceExcerpt,
              reasonCode: decision.reasonCode,
              explanation: decision.explanation,
              decidedAt: decision.decidedAt,
            },
          ]
        })
        const visibleEvidenceIds = new Set(evidence.map((item) => item.evidenceId))
        return [
          {
            conceptId: trace.concept.id,
            conceptName: trace.concept.canonicalName,
            description: trace.concept.description,
            state: trace.ledger?.state.state ?? null,
            stateRevision: trace.ledger?.state.revision ?? null,
            reducerVersion: trace.ledger?.state.reducerVersion ?? null,
            updatedAt: trace.ledger?.updatedAt ?? null,
            stateEvidenceIds:
              trace.ledger?.state.acceptedEvidenceIds.filter((id) => visibleEvidenceIds.has(id)) ??
              [],
            evidence,
            rejectedEvidence,
            openIssues: trace.misconceptionIssues.filter(
              (issue) =>
                issue.status === 'OPEN' &&
                (issue.projectId === request.projectId || personalizationIssueIds.has(issue.id)),
            ),
          },
        ]
      })
      const analysis = repository.readAnalysisJobsForProject(request.projectId, undefined, 100)
      const noEvidenceReason = analysis.find(
        (job) => job.status === 'SUCCEEDED' && job.resultSummary?.noEvidenceReason !== undefined,
      )?.resultSummary?.noEvidenceReason
      return projectEvidenceTraceSchema.parse({
        schemaVersion: 1,
        correlationId: request.correlationId,
        projectId: request.projectId,
        concepts,
        analysis: analysis.map((job) => ({
          analysisJobId: job.id,
          episodeId: job.episodeId,
          status: job.status,
          revision: job.revision,
          ...(job.resultSummary === undefined ? {} : { resultSummary: job.resultSummary }),
          ...(job.lastFailure === undefined ? {} : { lastFailure: job.lastFailure }),
          updatedAt: job.updatedAt,
        })),
        personalization,
        ...(concepts.length > 0
          ? {}
          : {
              emptyReason:
                noEvidenceReason ??
                '아직 검증된 사용자 Evidence가 없습니다. 작업과 대화가 분석되면 여기에 표시됩니다.',
            }),
        redactionStatus: 'VERIFIED_REDACTED',
      })
    })
  }

  async #getResultDescriptor(
    request: Extract<UiRequest, { kind: 'UI_LAUNCH_RESULT' }>,
  ): Promise<GeneratedResultDescriptor> {
    const result = this.#storage.transaction((repository) => {
      const recovery = repository.recoverProject(request.projectId)
      if (recovery === null) return null
      const task =
        recovery.currentTask ?? repository.readLatestTaskForProject(request.projectId) ?? null
      const aggregate =
        task === null ? null : repository.readBuilderTaskAggregate(request.projectId, task.id)
      return {
        project: recovery.project,
        task,
        completionReport: aggregate?.completionReport ?? null,
      }
    })
    if (result === null) throw this.#notFound(request.correlationId, 'PROJECT_NOT_FOUND')
    if (
      result.project.generatedWorkspacePath === undefined ||
      result.task?.status !== 'COMPLETED' ||
      result.completionReport === null
    ) {
      throw this.#validationError(
        request.correlationId,
        'GENERATED_RESULT_NOT_READY',
        'Generated result is not ready to launch.',
      )
    }
    await this.#workspacePolicy.resolveProjectWorkspace(result.project, request.correlationId)
    return generatedResultDescriptorSchema.parse({
      schemaVersion: 1,
      correlationId: request.correlationId,
      projectId: result.project.id,
      workspacePath: result.project.generatedWorkspacePath,
      status: 'READY',
    })
  }

  #validateCandidateRoundLoop(
    scoped: DiscoveryAggregate,
    round: CandidateRound,
    submittedCandidates: readonly ProjectCandidateRevision[],
    correlationId: string,
  ): ReadonlyMap<string, DiscoveryFeedback> {
    if (round.correlationId !== scoped.session.correlationId) {
      throw this.#validationError(
        correlationId,
        'DISCOVERY_CORRELATION_MISMATCH',
        'Candidate Round must remain in the Discovery session correlation scope.',
      )
    }

    const existingByKey = new Map(
      scoped.candidates.map((candidate) => [candidateRecordKey(candidate), candidate]),
    )
    const latestByCandidate = new Map<string, ProjectCandidateRevision>()
    for (const candidate of scoped.candidates) {
      const latest = latestByCandidate.get(candidate.id)
      if (latest === undefined || candidate.revision > latest.revision) {
        latestByCandidate.set(candidate.id, candidate)
      }
    }
    const submittedByKey = new Map(
      submittedCandidates.map((candidate) => [candidateRecordKey(candidate), candidate]),
    )
    const roundKeys = new Set(round.candidates.map(candidateReferenceKey))
    const submittedKeys = new Set(submittedByKey.keys())

    for (const [key, candidate] of submittedByKey) {
      if (existingByKey.has(key)) {
        throw this.#validationError(
          correlationId,
          'CANDIDATE_ALREADY_STORED',
          'Candidate Round submissions must contain only new Candidate revisions.',
        )
      }
      if (
        candidate.discoverySessionId !== scoped.session.id ||
        candidate.correlationId !== scoped.session.correlationId
      ) {
        throw this.#validationError(
          correlationId,
          'CANDIDATE_SCOPE_MISMATCH',
          'Submitted Candidate must remain in the active Discovery scope.',
        )
      }
    }

    for (const reference of round.candidates) {
      const key = candidateReferenceKey(reference)
      const existing = existingByKey.get(key)
      if (existing === undefined && !submittedByKey.has(key)) {
        throw this.#validationError(
          correlationId,
          'CANDIDATE_ROUND_REFERENCE_NOT_FOUND',
          'Candidate Round references must be either stored or submitted in the same command.',
        )
      }
      if (
        existing !== undefined &&
        latestByCandidate.get(existing.id)?.revision !== existing.revision
      ) {
        throw this.#validationError(
          correlationId,
          'CANDIDATE_ROUND_REFERENCE_STALE',
          'Candidate Round cannot carry a superseded Candidate revision.',
        )
      }
    }

    if (round.roundIndex === 1) {
      if (
        scoped.rounds.length !== 0 ||
        scoped.candidates.length !== 0 ||
        round.appliedFeedbackIds.length !== 0 ||
        !sameStringSet(roundKeys, submittedKeys)
      ) {
        throw this.#validationError(
          correlationId,
          'INITIAL_CANDIDATE_ROUND_INVALID',
          'The initial Candidate Round must contain only its new submissions and no Feedback.',
        )
      }
      return new Map()
    }

    const previousRound = scoped.rounds.at(-1)
    if (previousRound === undefined) {
      throw this.#validationError(
        correlationId,
        'CANDIDATE_ROUND_PREDECESSOR_MISSING',
        'A refinement Candidate Round requires a preceding Round.',
      )
    }
    const pendingFeedback = scoped.feedback.filter(
      (feedback) => feedback.roundId === previousRound.id && feedback.intent !== 'SELECT',
    )
    const pendingFeedbackIds = new Set(pendingFeedback.map((feedback) => feedback.id))
    const appliedFeedbackIds = new Set(round.appliedFeedbackIds)
    if (
      pendingFeedback.length === 0 ||
      !sameStringSet(pendingFeedbackIds, appliedFeedbackIds) ||
      pendingFeedback.some((feedback) => feedback.createdAt > round.createdAt)
    ) {
      throw this.#validationError(
        correlationId,
        'CANDIDATE_ROUND_FEEDBACK_MISMATCH',
        'A refinement Round must apply exactly the pending Feedback from the preceding Round.',
      )
    }

    const previousReferences = previousRound.candidates
    const previousIds = new Set(previousReferences.map((reference) => reference.candidateId))
    const pinnedIds = new Set(
      pendingFeedback
        .filter((feedback) => feedback.intent === 'PIN')
        .flatMap((feedback) => feedback.targets.map((target) => target.candidateId)),
    )
    const rejectedIds = new Set(
      pendingFeedback
        .filter((feedback) => feedback.intent === 'REJECT')
        .flatMap((feedback) => feedback.targets.map((target) => target.candidateId)),
    )
    const regenerations = pendingFeedback.filter((feedback) => feedback.intent === 'REGENERATE')
    if (regenerations.length > 1) {
      throw this.#validationError(
        correlationId,
        'DISCOVERY_REGENERATION_CONFLICT',
        'Only one regeneration request can be applied by a Candidate Round.',
      )
    }
    const regeneration = regenerations[0]
    const additions = pendingFeedback.filter((feedback) => feedback.intent === 'MORE')
    if (additions.length > 1 || (additions.length > 0 && regeneration !== undefined)) {
      throw this.#validationError(
        correlationId,
        'DISCOVERY_ADDITION_CONFLICT',
        'A Candidate Round can apply only one addition request and cannot regenerate at the same time.',
      )
    }
    const addition = additions[0]
    const regeneratedIds = new Set(
      regeneration === undefined
        ? []
        : regeneration.targets.length === 0
          ? previousReferences
              .filter((reference) => !pinnedIds.has(reference.candidateId))
              .map((reference) => reference.candidateId)
          : regeneration.targets.map((target) => target.candidateId),
    )
    const replacementIds = new Set(regeneratedIds)
    const feedbackByCandidate = new Map<string, DiscoveryFeedback>()

    const registerExpectedRevision = (
      feedback: DiscoveryFeedback,
      target: { readonly candidateId: string; readonly revision: number },
    ): void => {
      const expectedKey = `${target.candidateId}:${target.revision + 1}`
      if (feedbackByCandidate.has(expectedKey)) {
        throw this.#validationError(
          correlationId,
          'DISCOVERY_FEEDBACK_CONFLICT',
          'Multiple Feedback records cannot create the same Candidate revision.',
        )
      }
      replacementIds.add(target.candidateId)
      feedbackByCandidate.set(expectedKey, feedback)
    }

    for (const feedback of pendingFeedback) {
      if (['REVISE', 'SHRINK', 'EXPAND'].includes(feedback.intent)) {
        const target = feedback.targets[0]
        if (target !== undefined) registerExpectedRevision(feedback, target)
      } else if (feedback.intent === 'MERGE') {
        const primary = feedback.targets[0]
        if (primary !== undefined) registerExpectedRevision(feedback, primary)
        for (const target of feedback.targets) replacementIds.add(target.candidateId)
      }
    }

    const conflictingId = [...rejectedIds].find(
      (candidateId) => pinnedIds.has(candidateId) || replacementIds.has(candidateId),
    )
    const pinnedRegenerationConflict = [...pinnedIds].find((candidateId) =>
      regeneratedIds.has(candidateId),
    )
    if (conflictingId !== undefined || pinnedRegenerationConflict !== undefined) {
      throw this.#validationError(
        correlationId,
        'DISCOVERY_FEEDBACK_CONFLICT',
        'Pinned, rejected, and replaced Candidate targets must not conflict.',
      )
    }

    let regenerationSubmissionCount = 0
    let additionSubmissionCount = 0
    for (const [key, candidate] of submittedByKey) {
      const creatingFeedback = feedbackByCandidate.get(key)
      if (creatingFeedback !== undefined) continue
      if (
        regeneration !== undefined &&
        candidate.revision === 1 &&
        candidate.parentRevisions.length === 0 &&
        !previousIds.has(candidate.id)
      ) {
        feedbackByCandidate.set(key, regeneration)
        regenerationSubmissionCount += 1
        continue
      }
      if (
        addition !== undefined &&
        candidate.revision === 1 &&
        candidate.parentRevisions.length === 0 &&
        !previousIds.has(candidate.id)
      ) {
        feedbackByCandidate.set(key, addition)
        additionSubmissionCount += 1
        continue
      }
      throw this.#validationError(
        correlationId,
        'CANDIDATE_SUBMISSION_NOT_REQUESTED',
        'New Candidate revisions must correspond to refinement, merge, regeneration, or addition Feedback.',
      )
    }
    if (regeneration !== undefined && regenerationSubmissionCount === 0) {
      throw this.#validationError(
        correlationId,
        'CANDIDATE_REGENERATION_EMPTY',
        'Regeneration Feedback must produce at least one new Candidate.',
      )
    }
    if (addition !== undefined && additionSubmissionCount === 0) {
      throw this.#validationError(
        correlationId,
        'CANDIDATE_ADDITION_EMPTY',
        'MORE Feedback must add at least one new Candidate.',
      )
    }
    for (const expectedKey of feedbackByCandidate.keys()) {
      if (!submittedByKey.has(expectedKey)) {
        throw this.#validationError(
          correlationId,
          'CANDIDATE_FEEDBACK_RESULT_MISSING',
          'Every refinement or merge Feedback must produce its next Candidate revision.',
        )
      }
    }

    const expectedRoundKeys = new Set<string>()
    const narrowsToSelectedResults = pendingFeedback.some((feedback) =>
      ['MERGE', 'REVISE', 'SHRINK', 'EXPAND'].includes(feedback.intent),
    )
    for (const reference of previousReferences) {
      const keepsUnchangedReference =
        !narrowsToSelectedResults || pinnedIds.has(reference.candidateId)
      if (
        keepsUnchangedReference &&
        !rejectedIds.has(reference.candidateId) &&
        !replacementIds.has(reference.candidateId)
      ) {
        expectedRoundKeys.add(candidateReferenceKey(reference))
      }
    }
    for (const key of submittedKeys) expectedRoundKeys.add(key)
    if (!sameStringSet(roundKeys, expectedRoundKeys)) {
      throw this.#validationError(
        correlationId,
        'CANDIDATE_ROUND_CONTENT_INVALID',
        narrowsToSelectedResults
          ? 'A selection refinement Round must contain only its results and explicitly pinned Candidates.'
          : 'Candidate Round must preserve unaffected revisions and apply every Feedback result.',
      )
    }

    return feedbackByCandidate
  }

  #readDiscoveryBySession(
    repository: PersistenceRepository,
    sessionId: string,
    correlationId: string,
  ): DiscoveryAggregate {
    const aggregate = repository.readDiscoveryAggregateBySession(sessionId)
    if (aggregate === null) throw this.#notFound(correlationId, 'DISCOVERY_NOT_FOUND')
    return aggregate
  }

  #readDiscoveryByProject(
    repository: PersistenceRepository,
    projectId: string,
    correlationId: string,
  ): DiscoveryAggregate {
    const aggregate = repository.readDiscoveryAggregate(projectId)
    if (aggregate === null) throw this.#notFound(correlationId, 'DISCOVERY_NOT_FOUND')
    return aggregate
  }

  #requireBuilderAggregate(
    repository: PersistenceRepository,
    projectId: string,
    taskId: string,
    correlationId: string,
  ): BuilderTaskAggregate {
    const aggregate = repository.readBuilderTaskAggregate(projectId, taskId)
    if (aggregate === null) throw this.#notFound(correlationId, 'BUILDER_TASK_NOT_FOUND')
    return aggregate
  }

  #readHelperAggregate(
    projectId: string,
    taskId: string | undefined,
    correlationId: string,
  ): BuilderTaskAggregate {
    return this.#storage.transaction((repository) => {
      const recovery = repository.recoverProject(projectId)
      const resolvedTaskId =
        taskId ??
        recovery?.activeTask?.id ??
        recovery?.currentTask?.id ??
        repository.readLatestTaskForProject(projectId)?.id
      if (resolvedTaskId === undefined) {
        throw this.#notFound(correlationId, 'ACTIVE_TASK_NOT_FOUND')
      }
      return this.#requireBuilderAggregate(repository, projectId, resolvedTaskId, correlationId)
    })
  }

  #builderContext(aggregate: BuilderTaskAggregate, correlationId: string): BuilderTaskContext {
    return builderTaskContextSchema.parse({
      schemaVersion: 1,
      correlationId,
      project: aggregate.project,
      learningSpec: aggregate.learningSpec,
      task: aggregate.task,
      liveContext: aggregate.liveContext,
      decisionRequests: aggregate.decisionRequests,
      decisionResolutions: aggregate.decisionResolutions,
      decisionApplications: aggregate.decisionApplications,
      pendingContextRefreshRequests: aggregate.contextRefreshRequests.filter(
        (request) => request.status === 'PENDING',
      ),
    })
  }

  #fulfillContextRefreshRequests(
    repository: PersistenceRepository,
    aggregate: BuilderTaskAggregate,
    context: LiveProjectContext,
  ): void {
    for (const refresh of aggregate.contextRefreshRequests.filter(
      (candidate) =>
        candidate.status === 'PENDING' &&
        context.contextVersion > (candidate.observedContextVersion ?? 0),
    )) {
      repository.appendContextRefreshRequest(
        contextRefreshRequestSchema.parse({
          ...refresh,
          revision: refresh.revision + 1,
          status: 'FULFILLED',
          fulfilledAt: context.updatedAt,
          fulfilledByContextVersion: context.contextVersion,
        }),
      )
      this.#appendAudit(repository, {
        correlationId: context.correlationId,
        actor: { kind: 'AGENT', role: 'BUILDER' },
        action: 'RESOLVED',
        resource: {
          type: 'CONTEXT_REFRESH_REQUEST',
          id: refresh.id,
          revision: refresh.revision + 1,
        },
        summary: 'Fulfilled a pending Helper Context refresh request.',
        changedFields: ['status', 'revision', 'fulfilledByContextVersion'],
        occurredAt: context.updatedAt,
      })
    }
  }

  #appendActivityEvent(
    repository: PersistenceRepository,
    input: Omit<ActivityEvent, 'schemaVersion' | 'id' | 'sequence' | 'redactionStatus'>,
  ): ActivityEvent {
    const event = activityEventSchema.parse({
      schemaVersion: 1,
      id: this.#generateId('event'),
      ...input,
      sequence: repository.nextActivitySequence(input.projectId),
      redactionStatus: 'VERIFIED_REDACTED',
    })
    repository.appendActivityEvent(event)
    return event
  }

  #openEpisode(
    repository: PersistenceRepository,
    input: {
      readonly type: Episode['type']
      readonly event: ActivityEvent
      readonly taskId?: string
      readonly decisionId?: string
      readonly conversationId?: string
      readonly conceptNames?: readonly string[]
      readonly contextReferences?: Episode['contextReferences']
    },
  ): Episode {
    const episode = episodeSchema.parse({
      schemaVersion: 1,
      id: this.#generateId('episode'),
      projectId: input.event.projectId,
      ...(input.taskId === undefined ? {} : { taskId: input.taskId }),
      ...(input.decisionId === undefined ? {} : { decisionId: input.decisionId }),
      ...(input.conversationId === undefined ? {} : { conversationId: input.conversationId }),
      correlationId: input.event.correlationId,
      revision: 1,
      type: input.type,
      status: 'OPEN',
      eventIds: [input.event.id],
      conceptCandidates: unique(input.conceptNames ?? []).map((originalExpression) => ({
        originalExpression,
      })),
      contextReferences: input.contextReferences ?? [],
      startedAt: input.event.occurredAt,
      source: { kind: 'CORE' },
      redactionStatus: 'VERIFIED_REDACTED',
    })
    repository.appendEpisode(episode)
    return episode
  }

  #appendEpisodeEvent(
    repository: PersistenceRepository,
    current: Episode,
    event: ActivityEvent,
    conceptNames: readonly string[] = [],
    contextReferences: Episode['contextReferences'] = [],
  ): Episode {
    const result = appendEpisodeEvent({ current, event })
    if (result.outcome === 'REJECTED') {
      throw this.#domainError(event.correlationId, result.reasonCode)
    }
    if (result.outcome === 'NO_OP') return result.value
    const next = episodeSchema.parse({
      ...result.value,
      conceptCandidates: [
        ...result.value.conceptCandidates,
        ...unique(conceptNames)
          .filter(
            (name) =>
              !result.value.conceptCandidates.some(
                (candidate) => candidate.originalExpression.toLowerCase() === name.toLowerCase(),
              ),
          )
          .map((originalExpression) => ({ originalExpression })),
      ],
      contextReferences: [...result.value.contextReferences, ...contextReferences].slice(0, 100),
    })
    repository.appendEpisode(next)
    return next
  }

  #closeEpisodeAndQueue(
    repository: PersistenceRepository,
    current: Episode,
    endedAt: string,
    closeReason: string,
  ): AnalysisJob {
    const aggregate = repository.readEpisodeAggregate(current.projectId, current.id)
    if (aggregate === null) throw this.#notFound(current.correlationId, 'EPISODE_NOT_FOUND')
    const proposed = episodeSchema.parse({
      ...current,
      revision: current.revision + 1,
      status: 'PENDING_ANALYSIS',
      endedAt,
      closeReason,
    })
    const result = closeEpisode({ current, proposed, events: aggregate.events })
    if (result.outcome === 'REJECTED') {
      throw this.#domainError(current.correlationId, result.reasonCode)
    }
    repository.appendEpisode(result.value)
    const job = analysisJobSchema.parse({
      schemaVersion: 1,
      id: this.#generateId('analysis_job'),
      projectId: current.projectId,
      episodeId: current.id,
      episodeRevision: result.value.revision,
      correlationId: current.correlationId,
      revision: 1,
      status: 'PENDING',
      attempt: 0,
      maxAttempts: ANALYSIS_MAX_ATTEMPTS,
      timeoutMs: ANALYSIS_SOFT_TIMEOUT_MS,
      createdAt: endedAt,
      updatedAt: endedAt,
      source: { kind: 'CORE' },
      redactionStatus: 'VERIFIED_REDACTED',
    })
    repository.appendAnalysisJob(job)
    this.#appendAudit(repository, {
      correlationId: current.correlationId,
      actor: { kind: 'CORE' },
      action: 'CREATED',
      resource: { type: 'ANALYSIS_JOB', id: job.id, revision: job.revision },
      summary: 'Queued one durable Analysis Job for the closed Episode.',
      changedFields: ['status', 'revision'],
      occurredAt: endedAt,
    })
    return job
  }

  #closeHelperEpisodes(
    repository: PersistenceRepository,
    projectId: string,
    scope: { readonly taskId?: string; readonly decisionId?: string },
    endedAt: string,
    closeReason: string,
    correlationId: string,
  ): void {
    for (let count = 0; count < 50; count += 1) {
      const episode = repository.readOpenEpisode(projectId, 'HELPER_CONVERSATION', scope)
      if (episode === null) return
      this.#closeEpisodeAndQueue(repository, episode, endedAt, closeReason)
    }
    throw this.#validationError(
      correlationId,
      'HELPER_EPISODE_LIMIT_EXCEEDED',
      'Too many open Helper Episodes matched one close operation.',
    )
  }

  #recordConceptObservation(
    repository: PersistenceRepository,
    input: {
      readonly projectId: string
      readonly taskId: string
      readonly episodeId: string
      readonly correlationId: string
      readonly conceptName: string
      readonly contextSources: ActivityEvent['sourceReferences']
      readonly observedAt: string
      readonly description: string
    },
  ): void {
    let concept = repository.readCanonicalConceptByName(input.conceptName)
    if (concept === null) {
      concept = canonicalConceptSchema.parse({
        schemaVersion: 1,
        id: this.#generateId('concept'),
        canonicalName: input.conceptName,
        description: input.description,
        revision: 1,
        createdAt: input.observedAt,
        updatedAt: input.observedAt,
        source: { kind: 'CORE' },
      })
      repository.appendCanonicalConcept(concept)
    }
    const evidence = acceptedEvidenceSchema.parse({
      schemaVersion: 1,
      id: this.#generateId('evidence'),
      kind: 'CONCEPT_OBSERVATION',
      projectId: input.projectId,
      taskId: input.taskId,
      episodeId: input.episodeId,
      conceptId: concept.id,
      correlationId: input.correlationId,
      supportsState: 'OBSERVED',
      contextSources: input.contextSources,
      acceptedAt: input.observedAt,
      source: { kind: 'CORE' },
      redactionStatus: 'VERIFIED_REDACTED',
    })
    repository.appendAcceptedEvidence(evidence)
    const trace = repository.readEvidenceTrace(concept.id)
    const acceptedEvidence = trace?.acceptedEvidence ?? [evidence]
    const currentLedger = trace?.ledger ?? null
    const stateResult = reduceConceptState({
      conceptId: concept.id,
      ...(currentLedger === null ? {} : { current: currentLedger.state }),
      acceptedEvidence,
      nextRevision: currentLedger === null ? 1 : currentLedger.state.revision + 1,
      updatedAt: input.observedAt,
    })
    if (stateResult.outcome === 'REJECTED') {
      throw this.#domainError(input.correlationId, stateResult.reasonCode)
    }
    repository.appendConceptLedger({
      schemaVersion: 1,
      id: currentLedger?.id ?? this.#generateId('concept_ledger'),
      concept,
      acceptedAliases: unique([...(currentLedger?.acceptedAliases ?? []), input.conceptName]),
      state: stateResult.value,
      openIssues: currentLedger?.openIssues ?? [],
      relatedProjectIds: unique([...(currentLedger?.relatedProjectIds ?? []), input.projectId]),
      relatedTaskIds: unique([...(currentLedger?.relatedTaskIds ?? []), input.taskId]),
      revision: currentLedger === null ? 1 : currentLedger.revision + 1,
      updatedAt: input.observedAt,
      source: { kind: 'CORE' },
    })
  }

  #resolveConcept(
    repository: PersistenceRepository,
    proposal: EvidenceProposal,
    createdAt: string,
  ): CanonicalConcept {
    const existing =
      proposal.concept.canonicalConceptId === undefined
        ? repository.readCanonicalConceptByName(proposal.concept.proposedCanonicalName)
        : repository.readCanonicalConceptById(proposal.concept.canonicalConceptId)
    if (existing !== null) return existing
    if (proposal.concept.canonicalConceptId !== undefined) {
      throw this.#notFound(proposal.correlationId, 'CANONICAL_CONCEPT_NOT_FOUND')
    }
    const concept = canonicalConceptSchema.parse({
      schemaVersion: 1,
      id: this.#generateId('concept'),
      canonicalName: proposal.concept.proposedCanonicalName,
      description: proposal.rationale,
      revision: 1,
      createdAt,
      updatedAt: createdAt,
      source: { kind: 'CORE' },
    })
    repository.appendCanonicalConcept(concept)
    return concept
  }

  #idempotent<T>(
    repository: PersistenceRepository,
    request: { readonly idempotencyKey: string; readonly correlationId: string },
    operation: string,
    responseSchema: ResponseSchema<T>,
    work: () => IdempotentWorkResult<T>,
  ): T {
    const requestHash = sha256(canonicalJson(request))
    const existing = repository.readIdempotencyReceipt(request.idempotencyKey)
    if (existing !== null) {
      if (
        existing.operation !== operation ||
        existing.correlationId !== request.correlationId ||
        existing.requestHash !== requestHash
      ) {
        throw this.#validationError(
          request.correlationId,
          'IDEMPOTENCY_KEY_REUSE',
          'Idempotency key was already used for a different request.',
        )
      }
      return responseSchema.parse(JSON.parse(existing.responseJson))
    }
    const result = work()
    const responseJson = canonicalJson(result.response)
    const receipt: IdempotencyReceipt = {
      key: request.idempotencyKey,
      correlationId: request.correlationId,
      operation,
      requestHash,
      responseJson,
      responseHash: sha256(responseJson),
      resourceId: result.resourceId,
      resourceRevision: result.resourceRevision,
      recordedAt: this.#timestamp(),
    }
    repository.appendIdempotencyReceipt(receipt)
    return result.response
  }

  #appendAudit(
    repository: PersistenceRepository,
    input: Omit<AuditRecord, 'schemaVersion' | 'id' | 'outcome' | 'redactionStatus'>,
  ): void {
    repository.appendAuditRecord(
      auditRecordSchema.parse({
        schemaVersion: 1,
        id: this.#generateId('audit'),
        ...input,
        outcome: 'SUCCEEDED',
        redactionStatus: 'VERIFIED_REDACTED',
      }),
    )
  }

  #receipt(correlationId: string, resourceRevision: number): CommandReceipt {
    return commandReceiptSchema.parse({
      schemaVersion: 1,
      correlationId,
      accepted: true,
      resourceRevision,
    })
  }

  #sizeError(input: unknown): ContractError | OperationError | null {
    let size: number
    try {
      size = payloadBytes(input)
    } catch {
      const validation = validateContract(uiRequestSchema, input)
      return validation.success
        ? createOperationError({
            category: 'VALIDATION',
            code: 'PAYLOAD_NOT_SERIALIZABLE',
            disposition: 'PERMANENT',
            message: 'Request payload is not JSON serializable.',
            correlationId: validation.data.correlationId,
          })
        : validation.error
    }
    if (size <= this.#maxPayloadBytes) return null
    const correlationId = readCorrelationId(input)
    if (correlationId === undefined) {
      const validation = validateContract(uiRequestSchema, input)
      return validation.success
        ? createOperationError({
            category: 'VALIDATION',
            code: 'PAYLOAD_TOO_LARGE',
            disposition: 'PERMANENT',
            message: `Request exceeds the ${this.#maxPayloadBytes} byte application limit.`,
            correlationId: validation.data.correlationId,
          })
        : validation.error
    }
    return createOperationError({
      category: 'VALIDATION',
      code: 'PAYLOAD_TOO_LARGE',
      disposition: 'PERMANENT',
      message: `Request exceeds the ${this.#maxPayloadBytes} byte application limit.`,
      correlationId,
    })
  }

  #assertRevision(expected: number, actual: number, correlationId: string, code: string): void {
    if (expected === actual) return
    throw new ApplicationError(
      createOperationError({
        category: 'STALE_CONTEXT',
        code,
        disposition: 'RETRYABLE',
        message: `Expected revision ${expected}; current revision is ${actual}.`,
        correlationId,
        issues: [
          {
            path: ['expectedRevision'],
            code: 'stale_revision',
            message: `Current revision is ${actual}.`,
          },
        ],
      }),
    )
  }

  #domainError(correlationId: string, reasonCode: string): ApplicationError {
    const stale = reasonCode.includes('REVISION') || reasonCode.includes('STALE')
    return new ApplicationError(
      createOperationError({
        category: stale ? 'STALE_CONTEXT' : 'VALIDATION',
        code: reasonCode,
        disposition: stale ? 'RETRYABLE' : 'PERMANENT',
        message: 'Domain policy rejected the requested state transition.',
        correlationId,
      }),
    )
  }

  #validationError(correlationId: string, code: string, message: string): ApplicationError {
    return new ApplicationError(
      createOperationError({
        category: 'VALIDATION',
        code,
        disposition: 'PERMANENT',
        message,
        correlationId,
      }),
    )
  }

  #notFound(correlationId: string, code: string): ApplicationError {
    return new ApplicationError(
      createOperationError({
        category: 'VALIDATION',
        code,
        disposition: 'USER_ACTION_REQUIRED',
        message: 'Requested application resource was not found.',
        correlationId,
      }),
    )
  }

  #mapError(error: unknown, correlationId: string): OperationError {
    if (error instanceof ApplicationError) return error.operationError
    if (error instanceof PersistenceError) {
      const stale = error.code === 'REVISION_CONFLICT'
      return createOperationError({
        category: stale ? 'STALE_CONTEXT' : 'STORAGE',
        code: error.code,
        disposition: stale ? 'RETRYABLE' : 'USER_ACTION_REQUIRED',
        message: stale
          ? 'Stored revision changed before the operation committed.'
          : 'Storage rejected the operation without committing partial state.',
        correlationId,
      })
    }
    return createOperationError({
      category: 'VALIDATION',
      code: 'APPLICATION_OPERATION_FAILED',
      disposition: 'PERMANENT',
      message: 'Application operation failed without committing partial state.',
      correlationId,
    })
  }

  #timestamp(): string {
    return this.#now().toISOString()
  }
}
