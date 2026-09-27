import { randomUUID } from 'node:crypto'
import type {
  LocalRun,
  LocalRunEvent,
  ProjectEvidenceTrace,
  ProjectSessionSnapshot,
  UiRequest,
} from '@vibe-helper/contracts'

// Pure projections for Builder/Helper/Decision/Evidence screens. They never call Core and
// never decide learned state; Core remains the authority for every mutation and gate.

const TEXT_LIMIT = 320
const OUTPUT_LIMIT = 2_048
const stringOrNull = (value: unknown, limit = TEXT_LIMIT): string | null =>
  typeof value === 'string' && value.length > 0
    ? value.length > limit
      ? `${value.slice(0, limit)}…`
      : value
    : null
const codeOrNull = (value: unknown): string | null =>
  typeof value === 'string' && /^[A-Z0-9_]{1,100}$/.test(value) ? value : null

export function isRunActive(run: Pick<LocalRun, 'status'>): boolean {
  return run.status === 'ACCEPTED' || run.status === 'RUNNING'
}

export type ToolActivityStatus = 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'UNKNOWN'
export type RunEventView =
  | { readonly kind: 'TEXT'; readonly sequence: number; readonly text: string }
  | {
      readonly kind: 'TOOL'
      readonly sequence: number
      /** Stable per tool call within a run when the transport provides one. */
      readonly toolId: string | null
      /** `read` / `search` / `write` / `shell` / `core` or a transport title. */
      readonly tool: string | null
      readonly status: ToolActivityStatus
      readonly relativePath: string | null
      readonly command: string | null
      readonly exitCode: number | null
      readonly coreAction: string | null
      readonly errorCode: string | null
      /** Core-redacted, bounded tool output. Render as text only. */
      readonly output: string | null
      readonly truncated: boolean
    }
  | { readonly kind: 'STATE'; readonly sequence: number; readonly run: LocalRun | null }
  | { readonly kind: 'PERMISSION_DENIED'; readonly sequence: number }

function toolStatus(update: Record<string, unknown>, failed: boolean): ToolActivityStatus {
  const raw = update.nativeStatus ?? update.status
  if (raw === 'failed' || failed) return 'FAILED'
  if (raw === 'completed') return 'SUCCEEDED'
  if (raw === 'pending' || raw === 'in_progress') return 'RUNNING'
  return 'UNKNOWN'
}

/**
 * Map a transient run event to a transport-independent view. Diagnostic fields of the native
 * and CLI transports are intentionally dropped; unknown TOOL shapes degrade to `UNKNOWN`.
 */
export function projectRunEvent(event: LocalRunEvent): RunEventView {
  const { sequence } = event
  if (event.kind === 'TEXT') return { kind: 'TEXT', sequence, text: event.text ?? '' }
  if (event.kind === 'STATE') return { kind: 'STATE', sequence, run: event.run ?? null }
  if (event.kind === 'PERMISSION_DENIED') return { kind: 'PERMISSION_DENIED', sequence }
  const update = event.update ?? {}
  const exitCode =
    typeof update.shellExitCode === 'number' && Number.isSafeInteger(update.shellExitCode)
      ? update.shellExitCode
      : null
  const coreAction = codeOrNull(update.coreAction) ?? stringOrNull(update.coreAction, 80)
  const errorCode = codeOrNull(update.coreErrorCode) ?? codeOrNull(update.bridgeErrorCode)
  const failed =
    update.coreIsError === true ||
    update.coreSuccess === false ||
    errorCode !== null ||
    (exitCode !== null && exitCode !== 0)
  const toolName = stringOrNull(update.toolName, 40)
  return {
    kind: 'TOOL',
    sequence,
    toolId: stringOrNull(update.toolId, 80) ?? stringOrNull(update.toolCallId, 80),
    tool: toolName ?? (coreAction !== null ? 'core' : stringOrNull(update.title, 80)),
    status: update.summary === 'TOOL_OUTPUT_TOO_LARGE' ? 'UNKNOWN' : toolStatus(update, failed),
    relativePath: stringOrNull(update.relativePath, 200),
    command: stringOrNull(update.command, 200),
    exitCode,
    coreAction,
    errorCode,
    output: stringOrNull(update.output, OUTPUT_LIMIT),
    truncated:
      update.outputTruncated === true ||
      update.status === 'truncated' ||
      update.summary === 'TOOL_OUTPUT_TOO_LARGE',
  }
}

export type BuilderTurnOutcome =
  | { readonly kind: 'RUNNING' }
  | { readonly kind: 'CANCELLED' }
  | { readonly kind: 'FAILED'; readonly errorCode: string }
  | { readonly kind: 'TASK_COMPLETED'; readonly completionReportId: string }
  | { readonly kind: 'DECISION_REQUIRED'; readonly decisionIds: readonly string[] }
  | { readonly kind: 'TURN_ENDED_TASK_ACTIVE'; readonly taskStatus: string }
  | { readonly kind: 'TASK_BINDING_CHANGED' }

/**
 * Classify a Builder turn from its run and a snapshot read AFTER the run became terminal.
 * `SUCCEEDED/TURN_ENDED` only means the model turn ended; completion requires the durable
 * Task status and Completion Report of the same Task.
 */
export function classifyBuilderTurn(
  run: Pick<LocalRun, 'kind' | 'status' | 'errorCode' | 'projectId'>,
  after: ProjectSessionSnapshot,
  taskId: string,
): BuilderTurnOutcome {
  if (run.kind !== 'BUILDER' || run.projectId !== after.project.id)
    return { kind: 'TASK_BINDING_CHANGED' }
  if (isRunActive(run)) return { kind: 'RUNNING' }
  if (run.status === 'CANCELLED') return { kind: 'CANCELLED' }
  if (run.status === 'FAILED') return { kind: 'FAILED', errorCode: run.errorCode ?? 'FAILED' }
  const task = after.currentTask
  if (task === null || task.id !== taskId) return { kind: 'TASK_BINDING_CHANGED' }
  if (task.status === 'COMPLETED' && after.completionReport?.taskId === task.id)
    return { kind: 'TASK_COMPLETED', completionReportId: after.completionReport.id }
  const pending = after.pendingDecisions.filter((decision) => decision.taskId === task.id)
  if (pending.length > 0)
    return { kind: 'DECISION_REQUIRED', decisionIds: pending.map((decision) => decision.id) }
  return { kind: 'TURN_ENDED_TASK_ACTIVE', taskStatus: task.status }
}

export type DecisionSelection =
  | { readonly kind: 'OPTION'; readonly optionId: string }
  | { readonly kind: 'RECOMMENDATION' }
  | { readonly kind: 'CUSTOM'; readonly customProposal: string }
export class DecisionInputError extends Error {
  constructor(readonly code: string) {
    super(code)
    this.name = 'DecisionInputError'
  }
}

/**
 * Build a `UI_RESOLVE_DECISION` request from the latest snapshot and explicit user input.
 * `rationale` must be text the user actually typed; never generate it. The Builder is not
 * resumed by this command; start a new Builder run on the user's explicit action.
 */
export function createDecisionResolutionRequest(
  snapshot: ProjectSessionSnapshot,
  input: {
    readonly decisionId: string
    readonly selection: DecisionSelection
    readonly rationale?: string
    readonly helperUsed: boolean
  },
): Extract<UiRequest, { kind: 'UI_RESOLVE_DECISION' }> {
  const decision = snapshot.pendingDecisions.find((item) => item.id === input.decisionId)
  if (decision === undefined) throw new DecisionInputError('DECISION_NOT_PENDING')
  const context = snapshot.liveContext
  if (context === null || context.taskId !== decision.taskId)
    throw new DecisionInputError('DECISION_CONTEXT_REQUIRED')
  const rationale = input.rationale?.trim() ?? ''
  if (rationale.length > 4_000) throw new DecisionInputError('DECISION_RATIONALE_TOO_LONG')
  let selected: { selectedOptionId: string } | { customProposal: string }
  if (input.selection.kind === 'CUSTOM') {
    const customProposal = input.selection.customProposal.trim()
    if (!customProposal || customProposal.length > 4_000)
      throw new DecisionInputError('DECISION_CUSTOM_INVALID')
    selected = { customProposal }
  } else {
    const optionId =
      input.selection.kind === 'RECOMMENDATION'
        ? decision.recommendedOptionId
        : input.selection.optionId
    if (!decision.options.some((option) => option.id === optionId))
      throw new DecisionInputError('DECISION_OPTION_INVALID')
    selected = { selectedOptionId: optionId }
  }
  return {
    schemaVersion: 1,
    correlationId: decision.correlationId,
    actor: { kind: 'UI' },
    kind: 'UI_RESOLVE_DECISION',
    idempotencyKey: `idem_${randomUUID()}`,
    resolution: {
      schemaVersion: 1,
      id: `decision_resolution_${randomUUID()}`,
      decisionId: decision.id,
      projectId: decision.projectId,
      taskId: decision.taskId,
      correlationId: decision.correlationId,
      expectedContextVersion: context.contextVersion,
      selectionKind: input.selection.kind,
      ...selected,
      ...(rationale ? { rationale } : {}),
      helperUsed: input.helperUsed,
      resolvedAt: new Date().toISOString(),
      source: { kind: 'USER' },
      redactionStatus: 'NOT_REQUIRED',
    },
  }
}

/**
 * How a Concept may be labelled. Only accepted USER_UNDERSTANDING Evidence supports an
 * understanding claim; Agent explanations, successful runs, card clicks and OBSERVED
 * observations never do.
 */
export type ConceptDisplayState =
  | 'NO_STATE'
  | 'OBSERVED_ONLY'
  | 'USER_EVIDENCE_EXPLAINED'
  | 'USER_EVIDENCE_DEMONSTRATED'
  | 'USER_EVIDENCE_TRANSFERRED'
export type AnalysisDisplayState = 'WAITING' | 'ANALYZING' | 'ANALYZED' | 'ANALYSIS_FAILED'
export interface EvidenceTraceView {
  readonly concepts: readonly {
    readonly id: string
    readonly name: string
    readonly state: string | null
    readonly displayState: ConceptDisplayState
    readonly userUnderstandingCount: number
    readonly openIssueCount: number
    readonly accepted: readonly {
      readonly id: string
      readonly kind: string
      readonly signal: string | null
      readonly strength: string | null
      readonly promptDependence: string | null
      readonly supportsState: string | null
      readonly episodeId: string
      readonly excerpt: string | null
      readonly rationale: string | null
    }[]
    readonly rejected: readonly {
      readonly proposalId: string
      readonly reasonCode: string
      readonly excerpt: string | null
      readonly explanation: string | null
    }[]
  }[]
  readonly analysis: readonly {
    readonly jobId: string
    readonly episodeId: string
    readonly status: string
    readonly displayState: AnalysisDisplayState
    /** A SUCCEEDED job may still have accepted no Evidence. */
    readonly acceptedCount: number | null
    readonly noEvidenceReason: string | null
    readonly failureCode: string | null
  }[]
  readonly userUnderstandingTotal: number
  readonly emptyReason: string | null
}

export function summarizeEvidenceTrace(
  projectId: string,
  trace: ProjectEvidenceTrace,
  options: { readonly redactText?: (text: string) => string } = {},
): EvidenceTraceView {
  if (trace.projectId !== projectId) throw new Error('EVIDENCE_TRACE_PROJECT_MISMATCH')
  const text = (value: unknown) => {
    const bounded = stringOrNull(value)
    return bounded === null || options.redactText === undefined
      ? bounded
      : options.redactText(bounded)
  }
  const concepts = trace.concepts.map((concept) => {
    const understanding = concept.evidence.filter((item) => item.kind === 'USER_UNDERSTANDING')
    const displayState: ConceptDisplayState =
      concept.state === null
        ? 'NO_STATE'
        : understanding.length === 0 || concept.state === 'OBSERVED'
          ? 'OBSERVED_ONLY'
          : `USER_EVIDENCE_${concept.state}`
    return {
      id: concept.conceptId,
      name: concept.conceptName,
      state: concept.state,
      displayState,
      userUnderstandingCount: understanding.length,
      openIssueCount: concept.openIssues.length,
      accepted: concept.evidence.map((item) => ({
        id: item.evidenceId,
        kind: item.kind,
        signal: item.signal ?? null,
        strength: item.strength ?? null,
        promptDependence: item.promptDependence ?? null,
        supportsState: item.supportsState ?? null,
        episodeId: item.episodeId,
        excerpt: text(item.redactedEvidenceExcerpt),
        rationale: text(item.rationale),
      })),
      rejected: concept.rejectedEvidence.map((item) => ({
        proposalId: item.proposalId,
        reasonCode: item.reasonCode,
        excerpt: text(item.redactedEvidenceExcerpt),
        explanation: text(item.explanation),
      })),
    }
  })
  return {
    concepts,
    analysis: trace.analysis.map((item) => ({
      jobId: item.analysisJobId,
      episodeId: item.episodeId,
      status: item.status,
      displayState:
        item.status === 'PENDING'
          ? 'WAITING'
          : item.status === 'RUNNING'
            ? 'ANALYZING'
            : item.status === 'SUCCEEDED'
              ? 'ANALYZED'
              : 'ANALYSIS_FAILED',
      acceptedCount: item.resultSummary?.acceptedCount ?? null,
      noEvidenceReason: text(item.resultSummary?.noEvidenceReason),
      failureCode: codeOrNull(item.lastFailure?.code),
    })),
    userUnderstandingTotal: concepts.reduce((sum, item) => sum + item.userUnderstandingCount, 0),
    emptyReason: text(trace.emptyReason),
  }
}

export interface FinalUpgradeCandidate {
  readonly id: string
  readonly createdAt: string
  readonly basisCount: number
}

/**
 * UI pre-filter for `UI_PREPARE_FINAL_UPGRADE_TASK`. A trace qualifies only when its Helper
 * turn has a recorded answer (same correlation). Core re-checks every condition and rejects
 * stale choices with `FINAL_UPGRADE_*` codes; refresh the list on rejection.
 */
export function eligibleFinalUpgradeTraces(
  snapshot: ProjectSessionSnapshot,
  trace: ProjectEvidenceTrace,
): FinalUpgradeCandidate[] {
  const task = snapshot.currentTask
  if (
    snapshot.project.status !== 'BUILDING' ||
    task === null ||
    task.status !== 'COMPLETED' ||
    task.sequence !== 1 ||
    task.finalUpgrade !== undefined ||
    snapshot.completionReport?.taskId !== task.id ||
    trace.projectId !== snapshot.project.id
  )
    return []
  const recorded = new Set(
    snapshot.helperConversations
      .filter((item) => item.taskId === task.id && item.helperResponseSummaries.length > 0)
      .flatMap((item) => (item.correlationId === undefined ? [] : [item.correlationId])),
  )
  return trace.personalization
    .filter(
      (item) =>
        item.projectId === snapshot.project.id &&
        item.target.kind === 'HELPER_TURN' &&
        item.target.taskId === task.id &&
        item.mode === 'EVIDENCE_AWARE' &&
        item.basis.length > 0 &&
        recorded.has(item.correlationId),
    )
    .map((item) => ({ id: item.id, createdAt: item.createdAt, basisCount: item.basis.length }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id))
}

export type NativeWorkerRole = 'DISCOVERY' | 'BUILDER' | 'HELPER' | 'EVIDENCE_ANALYST'
export type NativeWorkerStage =
  | 'STARTING'
  | 'CONNECTED'
  | 'JOB_CLAIMED'
  | 'AGENT_OPENING'
  | 'AGENT_QUEUED'
  | 'AGENT_RUNNING'
  | 'AGENT_ENDED'
  | 'AGENT_FAILED'
  | 'USER_INPUT'
  | 'PERMISSION'
  | 'HELPER_WINDOW_OPENING'
  | 'WORKSPACE_SWITCHING'
  | 'WORKSPACE_SWITCH_FAILED'
  | 'DIAGNOSTIC'
export interface NativeWorkerStatusView {
  readonly stage: NativeWorkerStage
  readonly role: NativeWorkerRole | null
  /** Raw diagnostic code. Display only; do not branch product logic on its suffixes. */
  readonly code: string
}

const ROLE = /_(DISCOVERY|BUILDER|HELPER|EVIDENCE_ANALYST)(?:_|$)/
const EXACT_STAGES: Readonly<Record<string, NativeWorkerStage>> = {
  WORKER_STARTED: 'STARTING',
  WORKER_CONNECTED: 'CONNECTED',
  HELPER_WINDOW_OPENING: 'HELPER_WINDOW_OPENING',
  WORKSPACE_SWITCHING: 'WORKSPACE_SWITCHING',
  WORKSPACE_SWITCH_FAILED: 'WORKSPACE_SWITCH_FAILED',
  WORKSPACE_SWITCH_UNCONFIRMED: 'WORKSPACE_SWITCH_FAILED',
}
const PREFIX_STAGES: readonly (readonly [string, NativeWorkerStage])[] = [
  ['JOB_CLAIMED_', 'JOB_CLAIMED'],
  ['AGENT_OPENING_', 'AGENT_OPENING'],
  ['AGENT_QUEUED_', 'AGENT_QUEUED'],
  ['AGENT_RUNNING_', 'AGENT_RUNNING'],
  ['AGENT_ENDED_', 'AGENT_ENDED'],
  ['AGENT_SESSION_CLOSED_', 'AGENT_ENDED'],
  ['AGENT_FAILED_', 'AGENT_FAILED'],
  ['USER_INPUT_', 'USER_INPUT'],
  ['PERMISSION_', 'PERMISSION'],
]
/** Classify the worker's diagnostic status string (`host.worker.getStatus()`). */
export function classifyNativeWorkerStatus(code: unknown): NativeWorkerStatusView | null {
  if (typeof code !== 'string' || !/^[A-Z0-9_]{1,200}$/.test(code)) return null
  const stage =
    EXACT_STAGES[code] ??
    PREFIX_STAGES.find(([prefix]) => code.startsWith(prefix))?.[1] ??
    'DIAGNOSTIC'
  // AGENT_FAILED_<errorCode> carries an error code, not a role.
  const role =
    stage === 'AGENT_FAILED' ? null : ((code.match(ROLE)?.[1] ?? null) as NativeWorkerRole | null)
  return { stage, role, code }
}
