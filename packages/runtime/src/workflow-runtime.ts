import { randomUUID } from 'node:crypto'
import type { ApplicationService, ApplicationResult } from '@vibe-helper/application'
import { redactSensitiveText } from '@vibe-helper/application/redaction'
import {
  LOCAL_PROTOCOL_VERSION,
  localRunRequestSchema,
  localRunSchema,
  projectSessionSnapshotSchema,
  type LocalRun,
  type LocalRunEvent,
  type LocalRunRequest,
  type ProjectSessionSnapshot,
  type UiRequest,
} from '@vibe-helper/contracts'
import {
  createDiscoveryEphemeralContext,
  type DiscoveryAgentPhase,
} from '@vibe-helper/kiro-adapter/crew-app'
import { EvidenceAnalystJobAdapter } from '@vibe-helper/kiro-adapter/evidence-analyst'
import type { KiroAcpEvent } from '@vibe-helper/kiro-adapter/acp-node'

export interface AgentInvocation {
  readonly mode: DiscoveryAgentPhase | 'SPEC_RECOVERY' | 'BUILDER' | 'HELPER' | 'EVIDENCE_ANALYST'
  readonly projectId: string
  readonly correlationId: string
  readonly discoverySessionId?: string
  readonly requestedCandidateIds?: readonly string[]
  readonly taskId?: string
  /** Exact UI-authored question; transport adapters must not parse it from a prompt. */
  readonly helperQuestion?: string
  readonly helperDecisionId?: string
  readonly message: string
  readonly signal: AbortSignal
  readonly onEvent: (event: KiroAcpEvent) => void
}
export interface WorkflowAgentPort {
  invoke(request: AgentInvocation): Promise<{ readonly text: string; readonly stopReason: string }>
}
export class WorkflowError extends Error {
  constructor(readonly code: string) {
    super(code)
    this.name = 'WorkflowError'
  }
}
interface Entry {
  run: LocalRun
  readonly input: LocalRunRequest
  readonly fingerprint: string
  readonly controller: AbortController
  readonly events: LocalRunEvent[]
  readonly listeners: Set<(event: LocalRunEvent) => void>
  operation: Promise<void>
  bytes: number
}
const id = (prefix: string): string => `${prefix}_${randomUUID()}`
const uiMeta = (correlationId: string) => ({
  schemaVersion: 1 as const,
  correlationId,
  actor: { kind: 'UI' as const },
})
const terminal = (run: LocalRun) => !['ACCEPTED', 'RUNNING'].includes(run.status)
function unwrap<T>(result: ApplicationResult<T>): T {
  if (!result.success) throw new WorkflowError(result.error.code)
  return result.data
}

/** Owns transient turns, not Core state. History reads never dispatch a model. */
export class WorkflowRuntime {
  readonly #entries = new Map<string, Entry>()
  readonly #keys = new Map<string, string>()
  readonly #application: ApplicationService
  readonly #agents: WorkflowAgentPort
  readonly #analyst: EvidenceAnalystJobAdapter
  readonly #analystAbort = new AbortController()
  readonly #instanceId: string
  #closed = false
  #worker: ReturnType<typeof setTimeout> | undefined
  #analysisWork: Promise<void> = Promise.resolve()
  constructor(options: {
    application: ApplicationService
    agents: WorkflowAgentPort
    instanceId: string
  }) {
    this.#application = options.application
    this.#agents = options.agents
    this.#instanceId = options.instanceId
    this.#analyst = new EvidenceAnalystJobAdapter(options.application)
  }
  get(id: string): LocalRun {
    const entry = this.#entry(id)
    return structuredClone(entry.run)
  }
  list(projectId: string): LocalRun[] {
    return [...this.#entries.values()]
      .filter((e) => e.run.projectId === projectId)
      .map((e) => structuredClone(e.run))
  }
  subscribe(id: string, after: number, listener: (event: LocalRunEvent) => void): () => void {
    const entry = this.#entry(id)
    for (const event of entry.events) if (event.sequence > after) listener(structuredClone(event))
    entry.listeners.add(listener)
    return () => entry.listeners.delete(listener)
  }
  async start(input: unknown): Promise<LocalRun> {
    if (this.#closed) throw new WorkflowError('RUNTIME_CLOSED')
    const request = localRunRequestSchema.parse(input)
    const fingerprint = JSON.stringify(request)
    const existingId = this.#keys.get(request.idempotencyKey)
    if (existingId !== undefined) {
      const existing = this.#entry(existingId)
      if (existing.fingerprint !== fingerprint) throw new WorkflowError('RUN_IDEMPOTENCY_CONFLICT')
      return this.get(existingId)
    }
    const active = [...this.#entries.values()].filter((e) => !terminal(e.run))
    if (active.some((e) => e.run.projectId === request.projectId && e.run.kind === request.kind))
      throw new WorkflowError('RUN_BUSY')
    if (active.length >= 4) throw new WorkflowError('RUNTIME_CAPACITY')
    const snapshot = await this.#snapshot(request.projectId)
    this.#validate(request, snapshot)
    if (this.#closed) throw new WorkflowError('RUNTIME_CLOSED')
    const acceptedDuringRead = this.#keys.get(request.idempotencyKey)
    if (acceptedDuringRead !== undefined) {
      if (this.#entry(acceptedDuringRead).fingerprint !== fingerprint)
        throw new WorkflowError('RUN_IDEMPOTENCY_CONFLICT')
      return this.get(acceptedDuringRead)
    }
    if ([...this.#entries.values()].filter((e) => !terminal(e.run)).length >= 4)
      throw new WorkflowError('RUNTIME_CAPACITY')
    // Reserve synchronously after the await too: concurrent HTTP starts must not both dispatch.
    if (
      [...this.#entries.values()].some(
        (e) =>
          !terminal(e.run) && e.run.projectId === request.projectId && e.run.kind === request.kind,
      )
    )
      throw new WorkflowError('RUN_BUSY')
    while (this.#entries.size >= 100) {
      const oldest = [...this.#entries.entries()].find(
        ([, e]) => terminal(e.run) && e.listeners.size === 0,
      )
      if (oldest === undefined) throw new WorkflowError('RUNTIME_CAPACITY')
      this.#entries.delete(oldest[0])
      this.#keys.delete(oldest[1].input.idempotencyKey)
    }
    const now = new Date().toISOString()
    const entry: Entry = {
      input: request,
      fingerprint,
      controller: new AbortController(),
      events: [],
      listeners: new Set(),
      operation: Promise.resolve(),
      bytes: 0,
      run: localRunSchema.parse({
        protocolVersion: LOCAL_PROTOCOL_VERSION,
        backendInstanceId: this.#instanceId,
        id: id('run'),
        projectId: request.projectId,
        kind: request.kind,
        phase: request.kind === 'DISCOVERY' ? request.phase : request.kind,
        status: 'ACCEPTED',
        outcome: 'PENDING',
        createdAt: now,
        updatedAt: now,
        errorCode: null,
        lastSequence: 0,
        retainedFromSequence: 1,
      }),
    }
    this.#entries.set(entry.run.id, entry)
    this.#keys.set(request.idempotencyKey, entry.run.id)
    this.#state(entry, {})
    entry.operation = this.#execute(entry)
    return this.get(entry.run.id)
  }
  async cancel(id: string): Promise<LocalRun> {
    const entry = this.#entry(id)
    if (!terminal(entry.run)) {
      entry.controller.abort()
      await entry.operation
    }
    return this.get(id)
  }
  /** Invalidate any in-flight Discovery authority before a user changes its source revision. */
  async beforeUi(request: UiRequest): Promise<void> {
    if (
      ![
        'UI_RECORD_DISCOVERY_FEEDBACK',
        'UI_RETURN_TO_DISCOVERY',
        'UI_UPDATE_LEARNING_SPEC',
        'UI_CONFIRM_LEARNING_SPEC',
      ].includes(request.kind)
    )
      return
    const projectId = 'projectId' in request ? request.projectId : undefined
    const sessionId =
      request.kind === 'UI_RECORD_DISCOVERY_FEEDBACK'
        ? request.feedback.discoverySessionId
        : undefined
    const relevant = [...this.#entries.values()].filter(
      (e) =>
        !terminal(e.run) &&
        e.input.kind === 'DISCOVERY' &&
        (e.run.projectId === projectId || e.input.discoverySessionId === sessionId),
    )
    await Promise.all(relevant.map((e) => this.cancel(e.run.id)))
  }
  startAnalystWorker(): void {
    if (this.#worker !== undefined || this.#closed) return
    const tick = (): void => {
      this.#analysisWork = this.#analyse()
        .catch(() => undefined)
        .finally(() => {
          if (!this.#closed) this.#worker = setTimeout(tick, 2_000)
        })
    }
    this.#worker = setTimeout(tick, 0)
  }
  async close(): Promise<void> {
    this.#closed = true
    if (this.#worker !== undefined) clearTimeout(this.#worker)
    this.#analystAbort.abort()
    for (const entry of this.#entries.values()) entry.controller.abort()
    await Promise.all([...this.#entries.values()].map((e) => e.operation))
    await this.#analysisWork
  }
  #entry(id: string): Entry {
    const entry = this.#entries.get(id)
    if (entry === undefined) throw new WorkflowError('RUN_NOT_FOUND_RESTORE_PROJECT')
    return entry
  }
  async #snapshot(projectId: string, prepare = false): Promise<ProjectSessionSnapshot> {
    return projectSessionSnapshotSchema.parse(
      unwrap(
        await this.#application.executeUi({
          ...uiMeta(id('corr')),
          projectId,
          helperConversationLimit: 20,
          kind: prepare ? 'UI_PREPARE_DISCOVERY_AGENT_CONTEXT' : 'UI_RESTORE_PROJECT_SESSION',
        }),
      ),
    )
  }
  #validate(request: LocalRunRequest, snapshot: ProjectSessionSnapshot): void {
    if (request.kind === 'DISCOVERY') {
      if (
        snapshot.discoverySession?.id !== request.discoverySessionId ||
        snapshot.discoverySession.revision !== request.expectedSessionRevision
      )
        throw new WorkflowError('STALE_DISCOVERY_REVISION')
      if (
        request.expectedSpecRevision !== undefined &&
        (snapshot.learningSpec?.revision ?? 0) !== request.expectedSpecRevision
      )
        throw new WorkflowError('STALE_SPEC_REVISION')
      if (snapshot.learningSpec?.status === 'CONFIRMED' || snapshot.currentTask !== null)
        throw new WorkflowError('DISCOVERY_ALREADY_CONFIRMED')
      if (request.phase === 'SPEC' && snapshot.selectedCandidate === null)
        throw new WorkflowError('CANDIDATE_SELECTION_REQUIRED')
      if (
        request.phase === 'SPEC' &&
        request.message !== undefined &&
        request.expectedSpecRevision === undefined
      )
        throw new WorkflowError('SPEC_REVISION_REQUIRED')
    } else {
      if (snapshot.currentTask?.id !== request.taskId)
        throw new WorkflowError('TASK_BINDING_MISMATCH')
      if (
        request.kind === 'BUILDER' &&
        snapshot.currentTask.revision !== request.expectedTaskRevision
      )
        throw new WorkflowError('STALE_TASK_REVISION')
      if (request.kind === 'BUILDER' && snapshot.currentTask.status === 'COMPLETED')
        throw new WorkflowError('TASK_ALREADY_COMPLETED')
      if (
        request.kind === 'HELPER' &&
        request.decisionId !== undefined &&
        !snapshot.decisions.some((d) => d.request.id === request.decisionId)
      )
        throw new WorkflowError('DECISION_BINDING_MISMATCH')
    }
  }
  #emit(
    entry: Entry,
    event: Omit<
      LocalRunEvent,
      'runId' | 'projectId' | 'sequence' | 'transient' | 'redactionStatus'
    >,
  ): void {
    entry.run.lastSequence++
    const value: LocalRunEvent = {
      ...event,
      runId: entry.run.id,
      projectId: entry.run.projectId,
      sequence: entry.run.lastSequence,
      transient: true,
      redactionStatus: 'VERIFIED_REDACTED',
    }
    entry.events.push(value)
    entry.bytes += JSON.stringify(value).length
    while (entry.events.length > 500 || entry.bytes > 1_048_576) {
      const removed = entry.events.shift()
      if (removed) entry.bytes -= JSON.stringify(removed).length
    }
    entry.run.retainedFromSequence = entry.events[0]?.sequence ?? entry.run.lastSequence
    for (const listener of entry.listeners) {
      try {
        listener(structuredClone(value))
      } catch {
        entry.listeners.delete(listener)
      }
    }
  }
  #state(entry: Entry, patch: Partial<LocalRun>): void {
    Object.assign(entry.run, patch, { updatedAt: new Date().toISOString() })
    this.#emit(entry, {
      kind: 'STATE',
      run: { ...entry.run, lastSequence: entry.run.lastSequence + 1 },
    })
  }
  async #invoke(
    entry: Entry,
    mode: AgentInvocation['mode'],
    snapshot: ProjectSessionSnapshot,
    message: string,
    turnCorrelationId?: string,
  ): Promise<string> {
    if (entry.controller.signal.aborted) throw new WorkflowError('CANCELLED')
    const request = entry.input
    this.#state(entry, { phase: mode })
    const response = await this.#agents.invoke({
      mode,
      projectId: snapshot.project.id,
      correlationId:
        turnCorrelationId ??
        (request.kind === 'DISCOVERY'
          ? (snapshot.discoverySession?.correlationId ?? snapshot.project.correlationId)
          : (snapshot.currentTask?.correlationId ?? snapshot.project.correlationId)),
      ...(request.kind === 'DISCOVERY'
        ? { discoverySessionId: request.discoverySessionId }
        : { taskId: request.taskId }),
      ...(request.kind === 'DISCOVERY' && mode === 'ENRICH_SELECTED'
        ? { requestedCandidateIds: request.candidateIds }
        : {}),
      ...(request.kind === 'HELPER'
        ? {
            helperQuestion: request.message,
            ...(request.decisionId === undefined ? {} : { helperDecisionId: request.decisionId }),
          }
        : {}),
      message,
      signal: entry.controller.signal,
      onEvent: (event) => {
        if (entry.controller.signal.aborted) return
        if (event.kind === 'TEXT')
          this.#emit(entry, {
            kind: 'TEXT',
            text: redactSensitiveText(event.text).slice(0, 65_536),
          })
        else if (event.kind === 'TOOL')
          this.#emit(entry, {
            kind: 'TOOL',
            update:
              JSON.stringify(event.update).length <= 65_536
                ? event.update
                : {
                    sessionUpdate: 'tool_call_update',
                    status: 'truncated',
                    summary: 'TOOL_OUTPUT_TOO_LARGE',
                  },
          })
        else this.#emit(entry, { kind: 'PERMISSION_DENIED' })
      },
    })
    if (entry.controller.signal.aborted) throw new WorkflowError('CANCELLED')
    if (response.stopReason !== 'end_turn') throw new WorkflowError('AGENT_TURN_INCOMPLETE')
    return redactSensitiveText(response.text)
  }
  async #execute(entry: Entry): Promise<void> {
    this.#state(entry, { status: 'RUNNING' })
    try {
      const request = entry.input
      if (request.kind === 'DISCOVERY') {
        await this.#discovery(entry, request)
        this.#state(entry, { status: 'SUCCEEDED', outcome: 'DURABLE_RESULT' })
      } else {
        const snapshot = await this.#snapshot(request.projectId)
        this.#validate(request, snapshot)
        const turnCorrelationId =
          request.kind === 'HELPER'
            ? id('corr')
            : (snapshot.currentTask?.correlationId ?? snapshot.project.correlationId)
        const metadata = {
          schemaVersion: 1,
          projectId: request.projectId,
          taskId: request.taskId,
          correlationId: turnCorrelationId,
          idempotencyKey: id('idem'),
          actor: { kind: 'AGENT', role: request.kind },
          ...(request.kind === 'HELPER' && request.decisionId !== undefined
            ? { decisionId: request.decisionId }
            : {}),
        }
        const text = await this.#invoke(
          entry,
          request.kind,
          snapshot,
          [
            `Core metadata (use a NEW idem_<uuid-v4> for EACH different mutation): ${JSON.stringify(metadata)}`,
            request.kind === 'BUILDER'
              ? 'Read get_builder_task first. Continue the current Task from durable Context/Decision state. If a user Decision was resolved, read and apply its result before continuing. Do not invent completion; use the canonical checkpoint, tests and result manifest contract.'
              : 'Read get_helper_context for this exact Project/Task and question. You are read-only; do not act as Builder or claim to change its state.',
            `Exact user message:\n${request.message}`,
          ].join('\n'),
          turnCorrelationId,
        )
        if (request.kind === 'HELPER') {
          if (!text.trim()) throw new WorkflowError('HELPER_EMPTY_RESPONSE')
          unwrap(
            await this.#application.executeUi({
              ...uiMeta(turnCorrelationId),
              kind: 'UI_RECORD_HELPER_EXCHANGE',
              projectId: request.projectId,
              taskId: request.taskId,
              ...(request.decisionId === undefined ? {} : { decisionId: request.decisionId }),
              idempotencyKey: request.idempotencyKey,
              userMessage: request.message,
              helperResponseSummary: text.trim().slice(-240),
              origin: request.origin,
              closeConversation: true,
            }),
          )
        }
        this.#state(entry, {
          status: 'SUCCEEDED',
          outcome: request.kind === 'HELPER' ? 'HELPER_RECORDED' : 'TURN_ENDED',
        })
      }
    } catch (error) {
      const code =
        error instanceof Error &&
        'code' in error &&
        typeof error.code === 'string' &&
        /^[A-Z0-9_]{1,100}$/.test(error.code)
          ? error.code
          : 'AGENT_RUNTIME_FAILED'
      this.#state(entry, {
        status: entry.controller.signal.aborted ? 'CANCELLED' : 'FAILED',
        outcome: 'NONE',
        errorCode: entry.controller.signal.aborted ? 'CANCELLED' : code,
      })
    }
  }
  async #discovery(
    entry: Entry,
    request: Extract<LocalRunRequest, { kind: 'DISCOVERY' }>,
  ): Promise<void> {
    let before = await this.#snapshot(request.projectId)
    this.#validate(request, before)
    const context = before.discoveryContext
    if (context === null) throw new WorkflowError('DISCOVERY_CONTEXT_REQUIRED')
    // Explicit retry inspects durable state first; it cannot regenerate already stored previews.
    if (request.phase === 'PREVIEW' && context.previewRound === null && context.rounds.length === 0)
      await this.#phase(entry, 'PREVIEW')
    else if (request.phase !== 'PREVIEW' && request.phase !== 'ENRICH_ALL')
      await this.#phase(entry, request.phase)
    if (
      request.phase === 'ENRICH_ALL' ||
      (request.phase === 'PREVIEW' && request.enrichAfterPreview)
    ) {
      for (const phase of ['ENRICH_FIRST', 'ENRICH_SECOND'] as const) {
        before = await this.#snapshot(request.projectId)
        if ((before.discoveryContext?.rounds.length ?? 0) > 0) break
        const batch =
          before.discoveryContext?.previewRound?.previews.filter((p) =>
            phase === 'ENRICH_FIRST' ? p.position <= 5 : p.position > 5,
          ) ?? []
        const enriched = new Set(
          before.discoveryContext?.candidateEnrichments.map((e) => e.candidate.id),
        )
        if (batch.length === 0) throw new WorkflowError('PREVIEWS_REQUIRED')
        if (batch.some((p) => !enriched.has(p.candidateId))) await this.#phase(entry, phase)
      }
    }
  }
  async #phase(entry: Entry, phase: DiscoveryAgentPhase): Promise<void> {
    const request = entry.input
    if (request.kind !== 'DISCOVERY') throw new WorkflowError('INVALID_PHASE')
    const before = await this.#snapshot(request.projectId, true)
    const session = before.discoverySession
    if (session === null || session.id !== request.discoverySessionId)
      throw new WorkflowError('STALE_DISCOVERY_SESSION')
    const selectedIds = request.candidateIds
    if (phase === 'ENRICH_SELECTED' && selectedIds.length === 0)
      throw new WorkflowError('CANDIDATE_IDS_REQUIRED')
    const prompt = [
      `Validated Core context: ${createDiscoveryEphemeralContext(before, phase, selectedIds)}`,
      `Tool metadata: ${JSON.stringify({
        schemaVersion: 1,
        projectId: request.projectId,
        discoverySessionId: session.id,
        correlationId: session.correlationId,
        expectedSessionRevision: session.revision,
        idempotencyKey: id('idem'),
      })}`,
      'Use your exact phase policy and submit the durable result through the permitted tool. Preserve Candidate identity and preview meaning. Do not merely describe what you would submit.',
      request.message === undefined ? '' : `Exact user request:\n${request.message}`,
    ].join('\n')
    await this.#invoke(entry, phase, before, prompt)
    let after = await this.#snapshot(request.projectId)
    const stored = (): boolean => {
      if (after.discoverySession?.id !== session.id) return false
      if (phase === 'PREVIEW')
        return (
          after.discoveryContext?.previewRound !== null &&
          after.discoveryContext?.previewRound !== undefined
        )
      if (phase.startsWith('ENRICH_')) {
        const expected =
          before.discoveryContext?.previewRound?.previews.filter((p) =>
            phase === 'ENRICH_FIRST'
              ? p.position <= 5
              : phase === 'ENRICH_SECOND'
                ? p.position > 5
                : selectedIds.includes(p.candidateId),
          ) ?? []
        const enriched = new Set(
          after.discoveryContext?.candidateEnrichments.map((e) => e.candidate.id),
        )
        return expected.length > 0 && expected.every((p) => enriched.has(p.candidateId))
      }
      if (phase === 'SPEC')
        return (
          (after.learningSpec?.revision ?? 0) > (before.learningSpec?.revision ?? 0) &&
          after.learningSpec?.status === 'DRAFT'
        )
      return (
        (after.discoveryContext?.rounds.length ?? 0) > (before.discoveryContext?.rounds.length ?? 0)
      )
    }
    if (!stored() && phase === 'SPEC') {
      // One explicit no-submit recovery, same expected revisions. Never fabricate a draft.
      await this.#invoke(
        entry,
        'SPEC_RECOVERY',
        before,
        `${prompt}\nThe first turn ended without a newer durable Spec. Re-read Core if needed and submit exactly once; do not repeat a result already stored.`,
      )
      after = await this.#snapshot(request.projectId)
    }
    if (!stored()) throw new WorkflowError('AGENT_RESULT_NOT_STORED')
  }
  async #analyse(): Promise<void> {
    if (this.#closed) return
    const correlationId = id('corr')
    await this.#analyst.recoverExpired(correlationId)
    const job = (await this.#analyst.listPending(correlationId, 1))[0]
    if (job === undefined || this.#closed) return
    const controller = new AbortController()
    let invocation: ReturnType<WorkflowAgentPort['invoke']> | undefined
    const abort = () => controller.abort()
    this.#analystAbort.signal.addEventListener('abort', abort, { once: true })
    try {
      await this.#analyst.runJob(job, {
        runtimeHandle: `local-${this.#instanceId}`,
        idempotencyKey: id('idem'),
        invoke: async (context) => {
          invocation = this.#agents.invoke({
            mode: 'EVIDENCE_ANALYST',
            projectId: job.projectId,
            correlationId: job.correlationId,
            message: JSON.stringify(context),
            signal: controller.signal,
            onEvent: () => undefined,
          })
          return (await invocation).text
        },
      })
    } finally {
      controller.abort()
      // A lease timeout is not process completion. Await owned Agent cleanup.
      await invocation?.catch(() => undefined)
      this.#analystAbort.signal.removeEventListener('abort', abort)
    }
  }
}
