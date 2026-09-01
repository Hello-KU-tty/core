import { randomUUID } from 'node:crypto'

import {
  type AgentRequest,
  type AgentRole,
  type AuditRecord,
  auditRecordSchema,
  type BuilderTaskContext,
  builderTaskContextSchema,
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
  type DecisionResult,
  decisionResultSchema,
  type DiscoveryContext,
  discoveryContextSchema,
  type DiscoveryFeedback,
  type EpisodeContext,
  episodeContextSchema,
  type EvidenceBatchApplicationResult,
  evidenceBatchApplicationResultSchema,
  type EvidenceProposal,
  type GeneratedResultDescriptor,
  generatedResultDescriptorSchema,
  type HelperContext,
  helperContextSchema,
  type LearningSpecRevision,
  type LiveProjectContext,
  type OperationError,
  type Project,
  type ProjectCandidateRevision,
  type PreparedBuilderTaskDescriptor,
  preparedBuilderTaskDescriptorSchema,
  liveProjectContextSchema,
  type UiRequest,
  uiRequestSchema,
  validateAgentRequest,
  validateContract,
} from '@vibe-helper/contracts'
import {
  applyDecision,
  applyMisconceptionProposal,
  confirmLearningSpec,
  evaluateEvidenceProposal,
  openDecision,
  reduceCandidateRevision,
  reduceConceptState,
  resolveDecision,
  planBuilderTask,
  transitionBuilderTask,
  supersedeLearningSpec,
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
  | HelperContext
  | EvidenceTrace
  | readonly EvidenceTrace[]
  | PreparedBuilderTaskDescriptor
  | GeneratedResultDescriptor

type IdPrefix =
  | 'discovery_session'
  | 'learning_spec'
  | 'task'
  | 'decision'
  | 'decision_option'
  | 'decision_application'
  | 'context_refresh'
  | 'audit'
  | 'concept'
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

  async #dispatchAgent(request: AgentRequest): Promise<AgentApplicationResponse> {
    switch (request.kind) {
      case 'DISCOVERY_GET_CONTEXT':
        return this.#getDiscoveryContext(request)
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
      case 'UI_OPEN_HELPER':
        return this.#openHelperFromUi(request)
      case 'UI_READ_EVIDENCE_TRACE':
        return this.#readEvidenceTrace(request)
      case 'UI_LAUNCH_RESULT':
        return this.#getResultDescriptor(request)
    }
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
    const aggregate = this.#storage.transaction((repository) =>
      repository.readDiscoveryAggregate(request.projectId, request.discoverySessionId),
    )
    if (aggregate === null) throw this.#notFound(request.correlationId, 'DISCOVERY_NOT_FOUND')
    return discoveryContextSchema.parse({
      schemaVersion: 1,
      correlationId: request.correlationId,
      project: aggregate.project,
      session: aggregate.session,
      rounds: aggregate.rounds,
      candidates: aggregate.candidates,
      feedback: aggregate.feedback,
      learningSpec: currentLearningSpec(aggregate),
      relevantLedgerEntries: aggregate.relevantLedgerEntries,
    })
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
          const latestRound = scoped.rounds.at(-1)
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
          for (const candidate of scoped.candidates) {
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
        const newSession = {
          schemaVersion: 1 as const,
          id: newSessionId,
          projectId: scoped.project.id,
          correlationId: request.correlationId,
          revision: 1,
          input: scoped.session.input,
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
          status: 'DISCOVERY',
          updatedAt: returnedAt,
          source: { kind: 'USER' },
        })
        this.#appendAudit(repository, {
          correlationId: request.correlationId,
          actor: { kind: 'USER' },
          action: 'UPDATED',
          resource: { type: 'DISCOVERY_SESSION', id: newSession.id, revision: 1 },
          summary: 'Returned to Discovery in a new session without reopening the selected session.',
          changedFields: ['status'],
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
        const aggregate = this.#requireBuilderAggregate(
          repository,
          request.resolution.projectId,
          request.resolution.taskId,
          request.correlationId,
        )
        const decision = aggregate.decisionRequests.find(
          (item) => item.id === request.resolution.decisionId,
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
          resolution: request.resolution,
          currentContextVersion: aggregate.liveContext?.contextVersion ?? 0,
        })
        if (reduced.outcome === 'REJECTED') {
          throw this.#domainError(request.correlationId, reduced.reasonCode)
        }
        repository.appendDecisionResolution(request.resolution)
        const resolvedDecisionIds = new Set([
          ...aggregate.decisionResolutions.map((resolution) => resolution.decisionId),
          request.resolution.decisionId,
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
            updatedAt: request.resolution.resolvedAt,
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
        this.#appendAudit(repository, {
          correlationId: request.correlationId,
          actor: { kind: 'USER' },
          action: 'RESOLVED',
          resource: { type: 'DECISION', id: decision.id },
          summary: 'Stored a validated user-authored Decision resolution.',
          changedFields: ['status'],
          occurredAt: request.resolution.resolvedAt,
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
      repository.readEvidenceTracesForProject(request.projectId),
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
    const relevantLedgerEntries = relevanceNames
      .flatMap((name) => {
        const trace = traces.find(
          (candidate) =>
            candidate.concept.canonicalName.toLocaleLowerCase('en-US') === name ||
            (candidate.ledger?.acceptedAliases ?? []).some(
              (alias) => alias.toLocaleLowerCase('en-US') === name,
            ),
        )
        return trace?.ledger === null || trace?.ledger === undefined ? [] : [trace.ledger]
      })
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
    })
    await this.#workspacePolicy.validateReferences(project, response, request.correlationId)
    return response
  }

  async #submitEvidenceProposals(
    request: Extract<AgentRequest, { kind: 'ANALYST_SUBMIT_EVIDENCE_PROPOSALS' }>,
  ): Promise<EvidenceBatchApplicationResult> {
    const projectId = request.batch.proposals[0]?.projectId
    if (projectId === undefined) {
      throw this.#validationError(
        request.correlationId,
        'EVIDENCE_BATCH_EMPTY',
        'Evidence batch must contain at least one proposal.',
      )
    }
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
            const priorTrace = repository.readEvidenceTrace(concept.id)
            const evaluation = evaluateEvidenceProposal({
              proposal,
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
            repository.appendEvidenceProposal(proposal)
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
              proposal,
              evidence: evaluation.evidence,
              ...(proposal.misconception.action === 'OPEN' &&
              proposal.misconception.issueId === undefined
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
                  proposal.concept.originalExpression,
                ]),
                state: stateResult.value,
                openIssues,
                relatedProjectIds: unique([
                  ...(currentLedger?.relatedProjectIds ?? []),
                  proposal.projectId,
                ]),
                relatedTaskIds: unique([
                  ...(currentLedger?.relatedTaskIds ?? []),
                  ...(proposal.taskId === undefined ? [] : [proposal.taskId]),
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
          return {
            response,
            resourceId: aggregate.episode.id,
            resourceRevision: aggregate.episode.revision,
          }
        },
      ),
    )
  }

  #readEvidenceTrace(
    request: Extract<UiRequest, { kind: 'UI_READ_EVIDENCE_TRACE' }>,
  ): EvidenceTrace | readonly EvidenceTrace[] {
    return this.#storage.transaction((repository) => {
      if (repository.recoverProject(request.projectId) === null) {
        throw this.#notFound(request.correlationId, 'PROJECT_NOT_FOUND')
      }
      if (request.conceptId === undefined) {
        return repository.readEvidenceTracesForProject(request.projectId)
      }
      const trace = repository.readEvidenceTrace(request.conceptId)
      if (trace === null) throw this.#notFound(request.correlationId, 'EVIDENCE_TRACE_NOT_FOUND')
      return trace
    })
  }

  async #getResultDescriptor(
    request: Extract<UiRequest, { kind: 'UI_LAUNCH_RESULT' }>,
  ): Promise<GeneratedResultDescriptor> {
    const project = this.#storage.transaction(
      (repository) => repository.recoverProject(request.projectId)?.project ?? null,
    )
    if (project === null) throw this.#notFound(request.correlationId, 'PROJECT_NOT_FOUND')
    if (project.status !== 'COMPLETED' || project.generatedWorkspacePath === undefined) {
      throw this.#validationError(
        request.correlationId,
        'GENERATED_RESULT_NOT_READY',
        'Generated result is not ready to launch.',
      )
    }
    await this.#workspacePolicy.resolveProjectWorkspace(project, request.correlationId)
    return generatedResultDescriptorSchema.parse({
      schemaVersion: 1,
      correlationId: request.correlationId,
      projectId: project.id,
      workspacePath: project.generatedWorkspacePath,
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
      throw this.#validationError(
        correlationId,
        'CANDIDATE_SUBMISSION_NOT_REQUESTED',
        'New Candidate revisions must correspond to refinement, merge, or regeneration Feedback.',
      )
    }
    if (regeneration !== undefined && regenerationSubmissionCount === 0) {
      throw this.#validationError(
        correlationId,
        'CANDIDATE_REGENERATION_EMPTY',
        'Regeneration Feedback must produce at least one new Candidate.',
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
    for (const reference of previousReferences) {
      if (!rejectedIds.has(reference.candidateId) && !replacementIds.has(reference.candidateId)) {
        expectedRoundKeys.add(candidateReferenceKey(reference))
      }
    }
    for (const key of submittedKeys) expectedRoundKeys.add(key)
    if (!sameStringSet(roundKeys, expectedRoundKeys)) {
      throw this.#validationError(
        correlationId,
        'CANDIDATE_ROUND_CONTENT_INVALID',
        'Candidate Round must preserve unaffected revisions and apply every Feedback result.',
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
