import { redactSensitiveText } from '@vibe-helper/application/redaction'
import {
  type CommandReceipt,
  CREW_UI_PROTOCOL_VERSION,
  type ContractError,
  commandReceiptSchema,
  contractErrorSchema,
  type OperationError,
  operationErrorSchema,
  type PreparedBuilderTaskDescriptor,
  type ProjectCandidateRevision,
  type ProjectHistory,
  type ProjectSessionSnapshot,
  preparedBuilderTaskDescriptorSchema,
  projectHistorySchema,
  projectSessionSnapshotSchema,
  type UiRequest,
  uiConfirmLearningSpecCommandSchema,
  uiPrepareBuilderTaskCommandSchema,
  uiRecordDiscoveryFeedbackCommandSchema,
  uiReturnToDiscoveryCommandSchema,
  uiStartDiscoveryCommandSchema,
  uiUpdateLearningSpecCommandSchema,
} from '@vibe-helper/contracts'

export const CREW_CORE_APPLICATION_PATH = '/apps/vibe-helper/api/application'
export const CREW_CHAT_STREAM_PATH = '/api/chat'
export const DISCOVERY_PREVIEW_AGENT_NAME = 'vibe-helper-discovery-preview'
export const DISCOVERY_ENRICHMENT_AGENT_NAME = 'vibe-helper-discovery-enrichment'
export const DISCOVERY_ROUND_AGENT_NAME = 'vibe-helper-discovery-round'
export const DISCOVERY_MERGE_AGENT_NAME = 'vibe-helper-discovery-merge'
export const DISCOVERY_SPEC_AGENT_NAME = 'vibe-helper-discovery-spec'
export const DISCOVERY_SPEC_RECOVERY_AGENT_NAME = 'vibe-helper-discovery-spec-recovery'
export const DISCOVERY_AGENT_NAME = DISCOVERY_ROUND_AGENT_NAME
export type DiscoveryAgentPhase =
  | 'PREVIEW'
  | 'ENRICH_FIRST'
  | 'ENRICH_SECOND'
  | 'ROUND'
  | 'MERGE'
  | 'SPEC'
export type DiscoveryAgentMode = DiscoveryAgentPhase | 'SPEC_RECOVERY'

const CHAT_SLOT_COLLECTION_PATH = '/api/chat/slots'
const MAX_RESTORED_MESSAGES = 100
const MAX_EPHEMERAL_CONTEXT_CHARACTERS = 40_000
const INJECTED_CONTEXT_INSTRUCTION =
  'The Crew host injected a validated VIBE_HELPER_DISCOVERY_CONTEXT snapshot for this exact project, session, and revision. Use that snapshot directly and do not call get_discovery_context unless the snapshot is missing, incomplete, or does not match the identifiers below.'

function candidateReferenceKey(reference: {
  readonly candidateId: string
  readonly revision: number
}): string {
  return `${reference.candidateId}:${String(reference.revision)}`
}

function compactCandidate(candidate: ProjectCandidateRevision): Readonly<Record<string, unknown>> {
  return {
    id: candidate.id,
    revision: candidate.revision,
    parentRevisions: candidate.parentRevisions,
    title: candidate.title,
    summary: candidate.summary,
    targetUsers: candidate.targetUsers,
    coreInteraction: candidate.coreInteraction,
    usageMoment: candidate.usageMoment,
    appeal: candidate.appeal,
    ...(candidate.personalNeedRelationship === undefined
      ? {}
      : { personalNeedRelationship: candidate.personalNeedRelationship }),
    technologyNecessity: candidate.technologyNecessity,
    coreConcepts: candidate.coreConcepts,
    mvpFeatures: candidate.mvpFeatures,
    suggestedScope: candidate.suggestedScope,
    generationTags: candidate.generationTags,
  }
}

export function createDiscoveryEphemeralContext(
  snapshot: ProjectSessionSnapshot,
  purpose: DiscoveryAgentPhase,
): string {
  const context = snapshot.discoveryContext
  const session = snapshot.discoverySession
  if (context === null || session === null) return ''
  const latestRound = context.rounds.at(-1)
  const currentCandidateKeys = new Set(latestRound?.candidates.map(candidateReferenceKey) ?? [])
  const appliedFeedbackIds = new Set(context.rounds.flatMap((round) => round.appliedFeedbackIds))
  const currentCandidates = context.candidates
    .filter((candidate) =>
      currentCandidateKeys.has(
        candidateReferenceKey({ candidateId: candidate.id, revision: candidate.revision }),
      ),
    )
    .map(compactCandidate)
  const pendingFeedback = context.feedback
    .filter((feedback) => !appliedFeedbackIds.has(feedback.id))
    .map((feedback) => ({
      id: feedback.id,
      roundId: feedback.roundId,
      intent: feedback.intent,
      targets: feedback.targets,
      ...(feedback.message === undefined ? {} : { message: feedback.message }),
    }))
  const learningSpec = context.learningSpec
  const previewRound = context.previewRound
  const requestedEnrichmentBatch =
    purpose === 'ENRICH_FIRST' ? 'FIRST' : purpose === 'ENRICH_SECOND' ? 'SECOND' : null
  const requestedPreviews =
    requestedEnrichmentBatch === null || previewRound === null
      ? []
      : previewRound.previews.filter((preview) =>
          requestedEnrichmentBatch === 'FIRST' ? preview.position <= 5 : preview.position > 5,
        )

  return JSON.stringify({
    schemaVersion: 1,
    kind: 'VIBE_HELPER_DISCOVERY_CONTEXT',
    purpose,
    expectedSessionRevision: session.revision,
    project: {
      id: context.project.id,
      title: context.project.title,
      learningGoal: context.project.learningGoal,
      status: context.project.status,
    },
    session: {
      id: session.id,
      correlationId: session.correlationId,
      revision: session.revision,
      status: session.status,
      input: session.input,
    },
    latestRound:
      latestRound === undefined
        ? null
        : {
            id: latestRound.id,
            roundIndex: latestRound.roundIndex,
            appliedFeedbackIds: latestRound.appliedFeedbackIds,
            candidates: latestRound.candidates,
          },
    currentCandidates,
    previewRound,
    candidateEnrichments: (context.candidateEnrichments ?? []).map((enrichment) => ({
      candidateId: enrichment.candidate.id,
      previewRoundId: enrichment.previewRoundId,
    })),
    requestedEnrichmentBatch,
    requestedPreviews,
    pendingFeedback,
    selectedCandidate:
      snapshot.selectedCandidate === null ? null : compactCandidate(snapshot.selectedCandidate),
    learningSpec:
      learningSpec === null
        ? null
        : {
            id: learningSpec.id,
            revision: learningSpec.revision,
            status: learningSpec.status,
            selectedCandidate: learningSpec.selectedCandidate,
            productPurpose: learningSpec.productPurpose,
            targetUsers: learningSpec.targetUsers,
            primaryUsageMoment: learningSpec.primaryUsageMoment,
            successMoment: learningSpec.successMoment,
            mvpFeatures: learningSpec.mvpFeatures,
            scope: learningSpec.scope,
            expectedDecisions: learningSpec.expectedDecisions,
            runtimeConstraint: learningSpec.runtimeConstraint,
            deploymentConstraints: learningSpec.deploymentConstraints,
          },
    relevantLedgerEntries: context.relevantLedgerEntries,
  })
}

export interface CrewAppApi {
  get(path: string): Promise<unknown>
  post(path: string, body: Readonly<Record<string, unknown>>): Promise<unknown>
}

export class CrewAppClientError extends Error {
  readonly code: string
  readonly category: 'CONNECTION' | 'CONTRACT' | 'PERMISSION' | 'OPERATION'
  readonly causeDetail: ContractError | OperationError | undefined

  constructor(
    category: CrewAppClientError['category'],
    code: string,
    message: string,
    options?: { readonly cause?: unknown; readonly causeDetail?: ContractError | OperationError },
  ) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause })
    this.name = 'CrewAppClientError'
    this.category = category
    this.code = code
    this.causeDetail = options?.causeDetail
  }
}

interface ApplicationSuccess {
  readonly success: true
  readonly data: unknown
}

function parseApplicationSuccess(response: unknown): ApplicationSuccess {
  if (typeof response !== 'object' || response === null || !('success' in response)) {
    throw new CrewAppClientError(
      'CONTRACT',
      'INVALID_APPLICATION_RESPONSE',
      'Core returned an invalid response.',
    )
  }
  const record = response as Record<string, unknown>
  if (record.success === true && 'data' in record) return { success: true, data: record.data }
  if (record.success === false && 'error' in record) {
    const contractError = contractErrorSchema.safeParse(record.error)
    const operationError = operationErrorSchema.safeParse(record.error)
    const error = contractError.success
      ? contractError.data
      : operationError.success
        ? operationError.data
        : null
    if (error !== null) {
      throw new CrewAppClientError(
        error.category === 'PERMISSION' ? 'PERMISSION' : 'OPERATION',
        error.code,
        error.message,
        { causeDetail: error },
      )
    }
  }
  throw new CrewAppClientError(
    'CONTRACT',
    'INVALID_APPLICATION_RESPONSE',
    'Core returned an invalid response.',
  )
}

export class CrewCoreClient {
  readonly #api: CrewAppApi

  constructor(api: CrewAppApi) {
    this.#api = api
  }

  async listProjects(correlationId: string, limit = 50): Promise<ProjectHistory> {
    const response = await this.#postCore({
      schemaVersion: 1,
      kind: 'UI_LIST_PROJECTS',
      correlationId,
      actor: { kind: 'UI' },
      limit,
    })
    return projectHistorySchema.parse(parseApplicationSuccess(response).data)
  }

  async restoreProjectSession(
    correlationId: string,
    projectId: string,
    helperConversationLimit = 20,
  ): Promise<ProjectSessionSnapshot> {
    const response = await this.#postCore({
      schemaVersion: 1,
      kind: 'UI_RESTORE_PROJECT_SESSION',
      correlationId,
      actor: { kind: 'UI' },
      projectId,
      helperConversationLimit,
    })
    return projectSessionSnapshotSchema.parse(parseApplicationSuccess(response).data)
  }

  async startDiscovery(
    request: Extract<UiRequest, { kind: 'UI_START_DISCOVERY' }>,
  ): Promise<CommandReceipt> {
    return this.#command(uiStartDiscoveryCommandSchema.parse(request))
  }

  async recordDiscoveryFeedback(
    request: Extract<UiRequest, { kind: 'UI_RECORD_DISCOVERY_FEEDBACK' }>,
  ): Promise<CommandReceipt> {
    return this.#command(uiRecordDiscoveryFeedbackCommandSchema.parse(request))
  }

  async updateLearningSpec(
    request: Extract<UiRequest, { kind: 'UI_UPDATE_LEARNING_SPEC' }>,
  ): Promise<CommandReceipt> {
    return this.#command(uiUpdateLearningSpecCommandSchema.parse(request))
  }

  async confirmLearningSpec(
    request: Extract<UiRequest, { kind: 'UI_CONFIRM_LEARNING_SPEC' }>,
  ): Promise<CommandReceipt> {
    return this.#command(uiConfirmLearningSpecCommandSchema.parse(request))
  }

  async prepareBuilderTask(
    request: Extract<UiRequest, { kind: 'UI_PREPARE_BUILDER_TASK' }>,
  ): Promise<PreparedBuilderTaskDescriptor> {
    const response = await this.#postCore(uiPrepareBuilderTaskCommandSchema.parse(request))
    return preparedBuilderTaskDescriptorSchema.parse(parseApplicationSuccess(response).data)
  }

  async returnToDiscovery(
    request: Extract<UiRequest, { kind: 'UI_RETURN_TO_DISCOVERY' }>,
  ): Promise<CommandReceipt> {
    return this.#command(uiReturnToDiscoveryCommandSchema.parse(request))
  }

  async #command(request: UiRequest): Promise<CommandReceipt> {
    const response = await this.#postCore(request as Readonly<Record<string, unknown>>)
    return commandReceiptSchema.parse(parseApplicationSuccess(response).data)
  }

  async #postCore(body: Readonly<Record<string, unknown>>): Promise<unknown> {
    try {
      return await this.#api.post(CREW_CORE_APPLICATION_PATH, {
        ...body,
        clientProtocolVersion: CREW_UI_PROTOCOL_VERSION,
      })
    } catch (error) {
      if (error instanceof CrewAppClientError) throw error
      if (error instanceof Error && /HTTP\s+409/i.test(error.message)) {
        throw new CrewAppClientError(
          'CONTRACT',
          'STALE_UI_PROTOCOL',
          'Vibe Helper가 업데이트되었습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.',
          { cause: error },
        )
      }
      throw new CrewAppClientError(
        'CONNECTION',
        'CORE_CONNECTION_UNAVAILABLE',
        'The local Vibe Helper Core is unavailable.',
        { cause: error },
      )
    }
  }
}

export interface CrewConversationMessage {
  readonly key: string
  readonly role: 'USER' | 'ASSISTANT'
  readonly content: string
}

export interface CrewProjectSessions {
  readonly discoverySlotKey: string
  readonly builderSlotKey: string
  readonly helperSlotKey: string
  readonly discoveryMessages: readonly CrewConversationMessage[]
  readonly builderMessages: readonly CrewConversationMessage[]
  readonly helperMessages: readonly CrewConversationMessage[]
}

export function discoverySlotKey(projectId: string): string {
  return `vibe-helper-discovery-${projectId}`
}

export function discoveryRunSlotKey(
  discoverySessionId: string,
  expectedSessionRevision: number,
  phase: DiscoveryAgentMode = 'ROUND',
): string {
  return `vibe-helper-discovery-${phase.toLowerCase().replace('_', '-')}-${discoverySessionId}-${expectedSessionRevision}`
}

function discoveryAgentName(phase: DiscoveryAgentMode): string {
  if (phase === 'PREVIEW') return DISCOVERY_PREVIEW_AGENT_NAME
  if (phase === 'ENRICH_FIRST' || phase === 'ENRICH_SECOND') {
    return DISCOVERY_ENRICHMENT_AGENT_NAME
  }
  if (phase === 'ROUND') return DISCOVERY_ROUND_AGENT_NAME
  if (phase === 'MERGE') return DISCOVERY_MERGE_AGENT_NAME
  return phase === 'SPEC' ? DISCOVERY_SPEC_AGENT_NAME : DISCOVERY_SPEC_RECOVERY_AGENT_NAME
}

export function builderSlotKey(projectId: string): string {
  return `vibe-helper-builder-${projectId}`
}

export function helperSlotKey(projectId: string): string {
  return `vibe-helper-helper-${projectId}`
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readSlotKeys(value: unknown): ReadonlySet<string> {
  if (!Array.isArray(value)) {
    throw new CrewAppClientError(
      'CONTRACT',
      'INVALID_SLOT_LIST',
      'Crew returned an invalid slot list.',
    )
  }
  return new Set(
    value.flatMap((slot) => (isRecord(slot) && typeof slot.key === 'string' ? [slot.key] : [])),
  )
}

function readMessages(value: unknown): readonly CrewConversationMessage[] {
  if (!isRecord(value) || !Array.isArray(value.messages)) {
    throw new CrewAppClientError(
      'CONTRACT',
      'INVALID_SLOT_HISTORY',
      'Crew returned an invalid conversation history.',
    )
  }
  return value.messages
    .flatMap((message, index): CrewConversationMessage[] => {
      if (!isRecord(message) || typeof message.content !== 'string') return []
      const key =
        typeof message.id === 'string'
          ? message.id
          : `${index}-${message.role === 'user' ? 'user' : 'assistant'}-${message.content.length}`
      if (message.role === 'user') {
        return [{ key, role: 'USER', content: redactSensitiveText(message.content) }]
      }
      if (message.role === 'assistant' || message.role === 'streaming') {
        return [{ key, role: 'ASSISTANT', content: redactSensitiveText(message.content) }]
      }
      return []
    })
    .slice(-MAX_RESTORED_MESSAGES)
}

export class CrewSessionClient {
  readonly #api: CrewAppApi

  constructor(api: CrewAppApi) {
    this.#api = api
  }

  async restoreProject(projectId: string): Promise<CrewProjectSessions> {
    const discovery = discoverySlotKey(projectId)
    const builder = builderSlotKey(projectId)
    const helper = helperSlotKey(projectId)
    try {
      const slots = readSlotKeys(await this.#api.get(CHAT_SLOT_COLLECTION_PATH))
      const [discoveryMessages, builderMessages, helperMessages] = await Promise.all([
        this.#readHistoryIfPresent(slots, discovery),
        this.#readHistoryIfPresent(slots, builder),
        this.#readHistoryIfPresent(slots, helper),
      ])
      return {
        discoverySlotKey: discovery,
        builderSlotKey: builder,
        helperSlotKey: helper,
        discoveryMessages,
        builderMessages,
        helperMessages,
      }
    } catch (error) {
      if (error instanceof CrewAppClientError) throw error
      throw new CrewAppClientError(
        'CONNECTION',
        'CREW_SESSION_CONNECTION_UNAVAILABLE',
        'Crew conversation history is unavailable.',
        { cause: error },
      )
    }
  }

  async #readHistoryIfPresent(
    slots: ReadonlySet<string>,
    slotKey: string,
  ): Promise<readonly CrewConversationMessage[]> {
    if (!slots.has(slotKey)) return []
    return readMessages(await this.#api.get(`${CHAT_SLOT_COLLECTION_PATH}/${slotKey}?limit=100`))
  }
}

export interface DiscoveryDispatchReceipt {
  readonly slotKey: string
  readonly dispatchMilliseconds: number
  readonly contextInjection: 'INJECTED' | 'FALLBACK' | 'NOT_REQUESTED'
  readonly contextCharacters: number
  readonly completion: Promise<'DONE' | 'TOOL_VALIDATION_FAILED' | 'STREAM_FAILED'>
}

export type DiscoveryRunStatus = 'MISSING' | 'RUNNING' | 'COMPLETED' | 'LEGACY'

export interface DiscoveryRunInspection {
  readonly status: DiscoveryRunStatus
  readonly slotKey?: string
}

export type CrewStreamingFetch = (
  input: string,
  init: RequestInit,
) => Promise<Pick<Response, 'ok' | 'status' | 'text'>>

export class CrewDiscoveryClient {
  readonly #api: CrewAppApi
  readonly #fetch: CrewStreamingFetch
  readonly #now: () => number

  constructor(
    api: CrewAppApi,
    options: { readonly fetch?: CrewStreamingFetch; readonly now?: () => number } = {},
  ) {
    this.#api = api
    this.#fetch = options.fetch ?? ((input, init) => fetch(input, init))
    this.#now = options.now ?? (() => performance.now())
  }

  async dispatch(
    discoverySessionId: string,
    expectedSessionRevision: number,
    message: string,
    ephemeralCoreContext?: string,
    phase: DiscoveryAgentPhase = 'ROUND',
  ): Promise<DiscoveryDispatchReceipt> {
    const contextCharacters = ephemeralCoreContext?.length ?? 0
    let mode: DiscoveryAgentMode =
      phase === 'SPEC' && ephemeralCoreContext === undefined ? 'SPEC_RECOVERY' : phase
    let slotKey = await this.#ensureSlot(discoverySessionId, expectedSessionRevision, mode)
    const contextInjection =
      ephemeralCoreContext === undefined
        ? ('NOT_REQUESTED' as const)
        : await this.#tryInjectContext(slotKey, ephemeralCoreContext)
    if (phase === 'SPEC' && contextInjection !== 'INJECTED' && mode !== 'SPEC_RECOVERY') {
      mode = 'SPEC_RECOVERY'
      slotKey = await this.#ensureSlot(discoverySessionId, expectedSessionRevision, mode)
    }
    const agentName = discoveryAgentName(mode)
    const agentMessage =
      contextInjection === 'INJECTED' ? `${INJECTED_CONTEXT_INSTRUCTION}\n\n${message}` : message
    const startedAt = this.#now()
    let response: Pick<Response, 'ok' | 'status' | 'text'>
    try {
      response = await this.#fetch(CREW_CHAT_STREAM_PATH, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: agentMessage, slot: slotKey, agent: agentName }),
      })
    } catch (error) {
      throw new CrewAppClientError(
        'CONNECTION',
        'DISCOVERY_DISPATCH_UNAVAILABLE',
        'Discovery Agent에 연결할 수 없습니다. 이미 Core에 저장된 프로젝트와 피드백은 유지됩니다.',
        { cause: error },
      )
    }
    if (!response.ok) {
      throw new CrewAppClientError(
        response.status === 403 ? 'PERMISSION' : 'CONNECTION',
        'DISCOVERY_DISPATCH_REJECTED',
        `Discovery Agent dispatch failed with HTTP ${response.status}.`,
      )
    }

    // `/api/chat` streams SSE. Core remains the completion source of truth, but
    // a terminal tool validation error can stop waiting well before the durable timeout.
    const completion = response
      .text()
      .then((body) =>
        /input validation error|tool[_ -]use[_ -]error|tool execution failed/i.test(body)
          ? ('TOOL_VALIDATION_FAILED' as const)
          : ('DONE' as const),
      )
      .catch(() => 'STREAM_FAILED' as const)
    return {
      slotKey,
      dispatchMilliseconds: Math.max(0, this.#now() - startedAt),
      contextInjection,
      contextCharacters,
      completion,
    }
  }

  async inspectRun(
    discoverySessionId: string,
    expectedSessionRevision: number,
    phase: DiscoveryAgentPhase,
  ): Promise<DiscoveryRunInspection> {
    let slots: unknown
    try {
      slots = await this.#api.get(CHAT_SLOT_COLLECTION_PATH)
    } catch (error) {
      throw new CrewAppClientError(
        'CONNECTION',
        'DISCOVERY_SLOT_UNAVAILABLE',
        'Discovery 실행 상태를 복원할 수 없습니다. Core에 저장된 상태는 유지됩니다.',
        { cause: error },
      )
    }
    if (!Array.isArray(slots)) {
      throw new CrewAppClientError(
        'CONTRACT',
        'INVALID_SLOT_LIST',
        'Crew returned an invalid slot list.',
      )
    }

    const modes: readonly DiscoveryAgentMode[] =
      phase === 'SPEC' ? ['SPEC_RECOVERY', 'SPEC'] : [phase]
    const matching = modes.flatMap((mode) => {
      const key = discoveryRunSlotKey(discoverySessionId, expectedSessionRevision, mode)
      return slots.flatMap((slot) =>
        isRecord(slot) && slot.key === key ? [{ slot, key, mode }] : [],
      )
    })
    for (const match of matching) {
      const expectedAgent = discoveryAgentName(match.mode)
      if (
        typeof match.slot.agent === 'string' &&
        match.slot.agent.length > 0 &&
        match.slot.agent !== expectedAgent
      ) {
        throw new CrewAppClientError(
          'CONTRACT',
          'DISCOVERY_SLOT_AGENT_MISMATCH',
          'The saved Discovery conversation belongs to another Agent.',
        )
      }
    }
    const running = matching.find(
      ({ slot }) => slot.running === true || slot.status === 'running' || slot.state === 'running',
    )
    if (running !== undefined) return { status: 'RUNNING', slotKey: running.key }
    const completed = matching.at(0)
    if (completed !== undefined) return { status: 'COMPLETED', slotKey: completed.key }

    const legacyKey = `vibe-helper-discovery-${discoverySessionId}-${String(expectedSessionRevision)}`
    const legacy = slots.find((slot) => isRecord(slot) && slot.key === legacyKey)
    return legacy === undefined ? { status: 'MISSING' } : { status: 'LEGACY', slotKey: legacyKey }
  }

  async #tryInjectContext(slotKey: string, content: string): Promise<'INJECTED' | 'FALLBACK'> {
    if (content.length === 0 || content.length > MAX_EPHEMERAL_CONTEXT_CHARACTERS) {
      return 'FALLBACK'
    }
    try {
      const result = await this.#api.post(`${CHAT_SLOT_COLLECTION_PATH}/${slotKey}/context`, {
        content,
        source: 'vibe-helper-core',
        ephemeral: true,
        maxAge: 300,
      })
      return isRecord(result) && result.ok === true ? 'INJECTED' : 'FALLBACK'
    } catch {
      // Context injection is a latency optimization. The role-bound read-only tool
      // remains the safe fallback when this Crew host does not support App context.
      return 'FALLBACK'
    }
  }

  async #ensureSlot(
    discoverySessionId: string,
    expectedSessionRevision: number,
    phase: DiscoveryAgentMode,
  ): Promise<string> {
    const key = discoveryRunSlotKey(discoverySessionId, expectedSessionRevision, phase)
    const agentName = discoveryAgentName(phase)
    let slots: unknown
    try {
      slots = await this.#api.get(CHAT_SLOT_COLLECTION_PATH)
    } catch (error) {
      throw new CrewAppClientError(
        'CONNECTION',
        'DISCOVERY_SLOT_UNAVAILABLE',
        'Discovery 대화를 복원할 수 없습니다. Core에 저장된 상태는 유지됩니다.',
        { cause: error },
      )
    }
    if (!Array.isArray(slots)) {
      throw new CrewAppClientError(
        'CONTRACT',
        'INVALID_SLOT_LIST',
        'Crew returned an invalid slot list.',
      )
    }
    const existing = slots.find((slot) => isRecord(slot) && slot.key === key)
    if (existing !== undefined) {
      if (
        typeof existing.agent === 'string' &&
        existing.agent.length > 0 &&
        existing.agent !== agentName
      ) {
        throw new CrewAppClientError(
          'CONTRACT',
          'DISCOVERY_SLOT_AGENT_MISMATCH',
          'The saved Discovery conversation belongs to another Agent.',
        )
      }
      return key
    }

    const created = await this.#api.post(CHAT_SLOT_COLLECTION_PATH, {
      name: key,
      agent: agentName,
      memory_mode: 'temporary',
    })
    if (!isRecord(created) || created.key !== key) {
      throw new CrewAppClientError(
        'CONTRACT',
        'INVALID_SLOT_RESPONSE',
        'Crew returned a Discovery slot that does not match the requested project.',
      )
    }
    return created.key
  }
}
