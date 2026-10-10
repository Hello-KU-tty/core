import { Buffer } from 'node:buffer'
import { createHash, randomUUID } from 'node:crypto'

import {
  createMcpHandler,
  type JSONObject,
  type McpHttpHandler,
  McpServer,
} from '@modelcontextprotocol/server'
import { type ApplicationService, createOperationError } from '@vibe-helper/application'
import {
  type AgentRole,
  analystGetEpisodeContextQuerySchema,
  analystSubmitEvidenceProposalsCommandSchema,
  builderApplyDecisionCommandSchema,
  builderApplyDecisionToolInputSchema,
  builderCompleteTaskCommandSchema,
  builderCompleteTaskToolInputSchema,
  builderGetBuildStatusQuerySchema,
  builderGetDecisionResultQuerySchema,
  builderGetTaskQuerySchema,
  builderRequestDecisionCommandSchema,
  builderRequestDecisionToolInputSchema,
  builderResolveDecisionFromChatCommandSchema,
  builderResolveDecisionFromChatToolInputSchema,
  builderStartTaskCommandSchema,
  builderTaskContextSchema,
  builderUpdateLiveContextCommandSchema,
  builderUpdateLiveContextToolInputSchema,
  candidateDraftSchema,
  candidateEnrichmentDraftSchema,
  candidatePreviewDraftSchema,
  discoveryContextSchema,
  discoveryGetContextQuerySchema,
  discoverySubmitCandidateEnrichmentsCommandSchema,
  discoverySubmitCandidateEnrichmentsToolInputBaseSchema,
  discoverySubmitCandidateEnrichmentsToolInputSchema,
  discoverySubmitCandidateMergeToolInputSchema,
  discoverySubmitCandidatePreviewsCommandSchema,
  discoverySubmitCandidatePreviewsToolInputSchema,
  discoverySubmitCandidateRoundCommandSchema,
  discoverySubmitCandidateRoundToolInputSchema,
  discoverySubmitLearningSpecCommandSchema,
  discoverySubmitLearningSpecToolInputSchema,
  helperGetContextQuerySchema,
  helperRequestContextRefreshCommandSchema,
  kiroChatAskChoiceToolInputSchema,
  kiroChatCheckProgressToolInputSchema,
  kiroChatFinishTaskToolInputSchema,
  kiroChatSaveChoiceToolInputSchema,
  kiroChatSaveProgressToolInputSchema,
} from '@vibe-helper/contracts'
import { z } from 'zod'

const MAX_STRINGIFIED_CANDIDATES_BYTES = 512 * 1024
const MAX_STRINGIFIED_PREVIEWS_BYTES = 128 * 1024
const discoverySubmitCandidateRoundTransportInputSchema =
  discoverySubmitCandidateRoundToolInputSchema.omit({ candidates: true }).extend({
    candidates: z.union([
      z.array(candidateDraftSchema).max(30),
      z
        .string()
        .max(MAX_STRINGIFIED_CANDIDATES_BYTES)
        .refine(
          (value) => Buffer.byteLength(value, 'utf8') <= MAX_STRINGIFIED_CANDIDATES_BYTES,
          'Stringified Candidate array exceeds the 512 KiB transport limit',
        ),
    ]),
  })
const discoverySubmitCandidatePreviewsTransportInputSchema =
  discoverySubmitCandidatePreviewsToolInputSchema.omit({ previews: true }).extend({
    previews: z.union([
      z.array(candidatePreviewDraftSchema).length(10),
      z
        .string()
        .max(MAX_STRINGIFIED_PREVIEWS_BYTES)
        .refine(
          (value) => Buffer.byteLength(value, 'utf8') <= MAX_STRINGIFIED_PREVIEWS_BYTES,
          'Stringified Candidate previews exceed the 128 KiB transport limit',
        ),
    ]),
  })
const discoverySubmitCandidateEnrichmentsTransportInputSchema =
  discoverySubmitCandidateEnrichmentsToolInputBaseSchema.omit({ candidates: true }).extend({
    candidates: z.union([
      z.array(candidateEnrichmentDraftSchema).min(1).max(10),
      z
        .string()
        .max(MAX_STRINGIFIED_CANDIDATES_BYTES)
        .refine(
          (value) => Buffer.byteLength(value, 'utf8') <= MAX_STRINGIFIED_CANDIDATES_BYTES,
          'Stringified Candidate enrichments exceed the 512 KiB transport limit',
        ),
    ]),
  })

interface RoleToolDefinition {
  readonly name: string
  readonly title: string
  readonly description: string
  readonly inputSchema: z.ZodType
  readonly readOnly: boolean
}

export const ROLE_TOOL_CATALOG: Readonly<Record<AgentRole, readonly RoleToolDefinition[]>> = {
  DISCOVERY: [
    {
      name: 'get_discovery_context',
      title: 'Get Discovery context',
      description: 'Read the current validated Discovery aggregate.',
      inputSchema: discoveryGetContextQuerySchema,
      readOnly: true,
    },
    {
      name: 'submit_candidate_previews',
      title: 'Submit Candidate previews',
      description:
        'Submit exactly ten lightweight Candidate previews. Core supplies fixed Candidate and eventual Round identities.',
      inputSchema: discoverySubmitCandidatePreviewsTransportInputSchema,
      readOnly: false,
    },
    {
      name: 'submit_candidate_enrichments',
      title: 'Submit Candidate enrichments',
      description:
        'Complete one assigned fixed Candidate preview batch or only the previews selected by the user.',
      inputSchema: discoverySubmitCandidateEnrichmentsTransportInputSchema,
      readOnly: false,
    },
    {
      name: 'submit_candidate_round',
      title: 'Submit Candidate Round',
      description:
        'Submit Candidate meaning and lineage. Every Candidate requires lineage, suggestedScope with all three arrays, and generationTags; the adapter supplies trusted record metadata.',
      inputSchema: discoverySubmitCandidateRoundTransportInputSchema,
      readOnly: false,
    },
    {
      name: 'submit_candidate_merge',
      title: 'Submit merged Candidate',
      description:
        'Submit one merged Candidate meaning; Core derives pending feedback, lineage, revision, and round metadata.',
      inputSchema: discoverySubmitCandidateMergeToolInputSchema,
      readOnly: false,
    },
    {
      name: 'submit_learning_spec',
      title: 'Submit Learning Spec',
      description: 'Submit a draft Learning Spec for the selected Candidate revision.',
      inputSchema: discoverySubmitLearningSpecToolInputSchema,
      readOnly: false,
    },
  ],
  BUILDER: [
    {
      name: 'get_builder_task',
      title: 'Get Builder Task',
      description: 'Read the current validated Builder Task aggregate.',
      inputSchema: builderGetTaskQuerySchema,
      readOnly: true,
    },
    {
      name: 'get_build_status',
      title: 'Get build status',
      description:
        'Read a small summary: task revision, Live Context version and the Decisions still awaiting the learner or not yet applied, with numbered options.',
      inputSchema: builderGetBuildStatusQuerySchema,
      readOnly: true,
    },
    {
      name: 'start_task',
      title: 'Start Builder Task',
      description: 'Start a pending Builder Task at the expected revision.',
      inputSchema: builderStartTaskCommandSchema,
      readOnly: false,
    },
    {
      name: 'update_build_context',
      title: 'Update build context',
      description: 'Store a workspace-contained Live Project Context snapshot.',
      inputSchema: builderUpdateLiveContextToolInputSchema,
      readOnly: false,
    },
    {
      name: 'request_user_decision',
      title: 'Request user Decision',
      description: 'Open a validated Decision without resolving it for the user.',
      inputSchema: builderRequestDecisionToolInputSchema,
      readOnly: false,
    },
    {
      name: 'get_decision_result',
      title: 'Get Decision result',
      description: 'Read the current resolution and application status of a Decision.',
      inputSchema: builderGetDecisionResultQuerySchema,
      readOnly: true,
    },
    {
      name: 'apply_decision_result',
      title: 'Apply Decision result',
      description: 'Record how the resolved user Decision was applied and resume Context.',
      inputSchema: builderApplyDecisionToolInputSchema,
      readOnly: false,
    },
    {
      name: 'resolve_decision_from_chat',
      title: 'Resolve Decision from learner chat',
      description:
        "Record the learner's own choice for an open Decision, citing verbatim quotes from their chat messages. Core verifies every quote; ask the learner when their choice is unclear.",
      inputSchema: builderResolveDecisionFromChatToolInputSchema,
      readOnly: false,
    },
    {
      name: 'complete_task',
      title: 'Complete Builder Task',
      description: 'Complete a Task with a validated acceptance report.',
      inputSchema: builderCompleteTaskToolInputSchema,
      readOnly: false,
    },
  ],
  HELPER: [
    {
      name: 'get_helper_context',
      title: 'Get Helper context',
      description: 'Read a bounded, read-only learning context.',
      inputSchema: helperGetContextQuerySchema,
      readOnly: true,
    },
    {
      name: 'request_builder_context_refresh',
      title: 'Request Builder context refresh',
      description: 'Record a refresh request without mutating Builder-owned context.',
      inputSchema: helperRequestContextRefreshCommandSchema,
      readOnly: false,
    },
  ],
  EVIDENCE_ANALYST: [
    {
      name: 'get_episode_context',
      title: 'Get Episode context',
      description: 'Read one version-checked Episode and its user Evidence context.',
      inputSchema: analystGetEpisodeContextQuerySchema,
      readOnly: true,
    },
    {
      name: 'submit_evidence_proposals',
      title: 'Submit Evidence Proposals',
      description: 'Submit proposals for deterministic Core evaluation and application.',
      inputSchema: analystSubmitEvidenceProposalsCommandSchema,
      readOnly: false,
    },
  ],
}

interface KiroChatToolDefinition extends RoleToolDefinition {
  readonly command: (input: Record<string, unknown>) => Record<string, unknown>
}

function withoutToolPurpose(input: Record<string, unknown>): Record<string, unknown> {
  const { __tool_use_purpose: _ignored, ...rest } = input
  return rest
}

/**
 * The Builder tools of the learner's own Kiro chat (K10). Kiro shows each call as
 * `@vibe-helper/<name>`, so the names are plain words. The Agent sends only what it decided;
 * the binding supplies identity and Core reads versions at write time.
 */
export const KIRO_CHAT_BUILDER_TOOLS: readonly KiroChatToolDefinition[] = [
  {
    name: 'check_progress',
    title: 'Check progress',
    description:
      'Read the task, its acceptance criteria and the choices still open with numbered options. Call it when you start and whenever you need the decisionId of an open choice.',
    inputSchema: kiroChatCheckProgressToolInputSchema,
    readOnly: true,
    command: () => ({ kind: 'BUILDER_CHAT_CHECK_PROGRESS' }),
  },
  {
    name: 'save_progress',
    title: 'Save progress',
    description:
      "Save a short progress note that the learner's helper tab reads: your plan, a change of direction, a new plan after an error, or the start of a test run.",
    inputSchema: kiroChatSaveProgressToolInputSchema,
    readOnly: false,
    command: (input) => ({ kind: 'BUILDER_CHAT_SAVE_PROGRESS', note: withoutToolPurpose(input) }),
  },
  {
    name: 'ask_choice',
    title: 'Ask the learner to choose',
    description:
      'Record a real product or technical choice the learner should make, before you ask it in chat. Give 2 to 4 options in the order you will show them (numbered from 1) and your recommendation. Then ask in chat and wait for the learner.',
    inputSchema: kiroChatAskChoiceToolInputSchema,
    readOnly: false,
    command: (input) => ({ kind: 'BUILDER_CHAT_ASK_CHOICE', choice: withoutToolPurpose(input) }),
  },
  {
    name: 'save_choice',
    title: "Save the learner's choice",
    description:
      'Record the learner\'s answer after they reply in this chat: the option number, "recommended", or "custom" with a short summary of their own idea. Vibe Helper links the learner\'s own words, so do not quote them. Call it again if the learner changes their mind.',
    inputSchema: kiroChatSaveChoiceToolInputSchema,
    readOnly: false,
    command: (input) => ({ kind: 'BUILDER_CHAT_SAVE_CHOICE', answer: withoutToolPurpose(input) }),
  },
  {
    name: 'finish_task',
    title: 'Finish the task',
    description:
      'Finish the task when every acceptance criterion passes and you ran at least one check. Say how each chosen option was built. If it is rejected, keep working until the criteria pass.',
    inputSchema: kiroChatFinishTaskToolInputSchema,
    readOnly: false,
    command: (input) => ({ kind: 'BUILDER_CHAT_FINISH_TASK', report: withoutToolPurpose(input) }),
  },
]

export const KIRO_CHAT_BUILDER_TOOL_NAMES: readonly string[] = KIRO_CHAT_BUILDER_TOOLS.map(
  (tool) => tool.name,
)

export interface RoleBoundMcpServerOptions {
  readonly role: AgentRole
  readonly application: ApplicationService
  /** `KIRO_CHAT`: the Builder tools of the learner's Kiro chat; requires a Task binding. */
  readonly surface?: 'KIRO_CHAT'
  readonly toolNames?: readonly string[]
  /** Optional local-runtime scope. Crew retains its existing caller boundary. */
  readonly binding?: {
    readonly projectId: string
    readonly correlationId: string
    readonly discoverySessionId?: string
    readonly taskId?: string
    readonly isActive: () => boolean
  }
  readonly now?: () => Date
  readonly generateId?: (
    prefix:
      | 'candidate'
      | 'candidate_preview_round'
      | 'candidate_round'
      | 'learning_spec'
      | 'context'
      | 'completion_report',
  ) => string
}

export function createRoleBoundMcpHttpHandler(options: RoleBoundMcpServerOptions): McpHttpHandler {
  return createMcpHandler(() => createRoleBoundMcpServer(options), {
    legacy: 'stateless',
    keepAliveMs: 10_000,
    onerror: () => undefined,
  })
}

function toJsonObject(value: unknown): JSONObject {
  const parsed: unknown = JSON.parse(JSON.stringify(value))
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new TypeError('MCP application response must be a JSON object')
  }
  return parsed as JSONObject
}

function deterministicId(prefix: 'context' | 'completion_report', idempotencyKey: string): string {
  const hex = createHash('sha256').update(`${prefix}:${idempotencyKey}`).digest('hex').slice(0, 32)
  const uuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20)}`
  return `${prefix}_${uuid}`
}

function parseStringifiedArray(value: unknown): unknown {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

async function submitCandidatePreviewsFromTool(options: RoleBoundMcpServerOptions, input: unknown) {
  const transportInput = discoverySubmitCandidatePreviewsTransportInputSchema.parse(input)
  const toolInput = discoverySubmitCandidatePreviewsToolInputSchema.parse({
    ...transportInput,
    previews: parseStringifiedArray(transportInput.previews),
  })
  const contextResult = await options.application.executeAgent('DISCOVERY', {
    schemaVersion: 1,
    kind: 'DISCOVERY_GET_CONTEXT',
    correlationId: toolInput.correlationId,
    actor: { kind: 'AGENT', role: 'DISCOVERY' },
    projectId: toolInput.projectId,
    discoverySessionId: toolInput.discoverySessionId,
  })
  if (!contextResult.success) return contextResult
  const context = discoveryContextSchema.parse(contextResult.data)
  const createdAt = (options.now ?? (() => new Date()))().toISOString()
  const generateId =
    options.generateId ??
    ((prefix: Parameters<NonNullable<RoleBoundMcpServerOptions['generateId']>>[0]) =>
      `${prefix}_${randomUUID()}`)
  const previewRound = {
    schemaVersion: 1 as const,
    id: generateId('candidate_preview_round'),
    finalRoundId: generateId('candidate_round'),
    discoverySessionId: toolInput.discoverySessionId,
    correlationId: toolInput.correlationId,
    inputSnapshot: context.session.input,
    previews: toolInput.previews.map((preview, index) => ({
      candidateId: generateId('candidate'),
      position: index + 1,
      ...preview,
    })),
    generationRationale: toolInput.generationRationale,
    createdAt,
    source: { kind: 'AGENT' as const, role: 'DISCOVERY' as const },
    redactionStatus: 'NOT_REQUIRED' as const,
  }
  return options.application.executeAgent(
    'DISCOVERY',
    discoverySubmitCandidatePreviewsCommandSchema.parse({
      schemaVersion: 1,
      kind: 'DISCOVERY_SUBMIT_CANDIDATE_PREVIEWS',
      correlationId: toolInput.correlationId,
      actor: { kind: 'AGENT', role: 'DISCOVERY' },
      idempotencyKey: toolInput.idempotencyKey,
      expectedSessionRevision: toolInput.expectedSessionRevision,
      previewRound,
    }),
  )
}

async function submitCandidateEnrichmentsFromTool(
  options: RoleBoundMcpServerOptions,
  input: unknown,
) {
  const transportInput = discoverySubmitCandidateEnrichmentsTransportInputSchema.parse(input)
  const toolInput = discoverySubmitCandidateEnrichmentsToolInputSchema.parse({
    ...transportInput,
    candidates: parseStringifiedArray(transportInput.candidates),
  })
  const createdAt = (options.now ?? (() => new Date()))().toISOString()
  const enrichments = toolInput.candidates.map(({ candidateId, ...content }) => ({
    schemaVersion: 1 as const,
    previewRoundId: toolInput.previewRoundId,
    discoverySessionId: toolInput.discoverySessionId,
    correlationId: toolInput.correlationId,
    candidate: {
      schemaVersion: 1 as const,
      id: candidateId,
      discoverySessionId: toolInput.discoverySessionId,
      correlationId: toolInput.correlationId,
      revision: 1,
      parentRevisions: [],
      ...content,
      createdAt,
      source: { kind: 'AGENT' as const, role: 'DISCOVERY' as const },
      redactionStatus: 'NOT_REQUIRED' as const,
    },
    createdAt,
    source: { kind: 'AGENT' as const, role: 'DISCOVERY' as const },
    redactionStatus: 'NOT_REQUIRED' as const,
  }))
  return options.application.executeAgent(
    'DISCOVERY',
    discoverySubmitCandidateEnrichmentsCommandSchema.parse({
      schemaVersion: 1,
      kind: 'DISCOVERY_SUBMIT_CANDIDATE_ENRICHMENTS',
      correlationId: toolInput.correlationId,
      actor: { kind: 'AGENT', role: 'DISCOVERY' },
      idempotencyKey: toolInput.idempotencyKey,
      expectedSessionRevision: toolInput.expectedSessionRevision,
      previewRoundId: toolInput.previewRoundId,
      batch: toolInput.batch,
      enrichments,
    }),
  )
}

async function submitCandidateRoundFromTool(options: RoleBoundMcpServerOptions, input: unknown) {
  const transportInput = discoverySubmitCandidateRoundTransportInputSchema.parse(input)
  const toolInput = discoverySubmitCandidateRoundToolInputSchema.parse({
    ...transportInput,
    candidates: parseStringifiedArray(transportInput.candidates),
  })
  const contextResult = await options.application.executeAgent('DISCOVERY', {
    schemaVersion: 1,
    kind: 'DISCOVERY_GET_CONTEXT',
    correlationId: toolInput.correlationId,
    actor: { kind: 'AGENT', role: 'DISCOVERY' },
    projectId: toolInput.projectId,
    discoverySessionId: toolInput.discoverySessionId,
  })
  if (!contextResult.success) return contextResult
  const context = discoveryContextSchema.parse(contextResult.data)
  const createdAt = (options.now ?? (() => new Date()))().toISOString()
  const generateId =
    options.generateId ??
    ((prefix: Parameters<NonNullable<RoleBoundMcpServerOptions['generateId']>>[0]) =>
      `${prefix}_${randomUUID()}`)
  const candidates = toolInput.candidates.map((draft) => {
    const { lineage, ...content } = draft
    const identity =
      lineage.kind === 'NEW'
        ? {
            id: generateId('candidate'),
            revision: 1,
            parentRevisions: [],
          }
        : {
            id: lineage.candidateId,
            revision: lineage.revision,
            parentRevisions: lineage.parentRevisions,
          }
    return {
      schemaVersion: 1 as const,
      ...identity,
      discoverySessionId: toolInput.discoverySessionId,
      correlationId: toolInput.correlationId,
      ...content,
      createdAt,
      source: { kind: 'AGENT' as const, role: 'DISCOVERY' as const },
      redactionStatus: 'NOT_REQUIRED' as const,
    }
  })
  const round = {
    schemaVersion: 1 as const,
    id: generateId('candidate_round'),
    discoverySessionId: toolInput.discoverySessionId,
    correlationId: toolInput.correlationId,
    roundIndex: context.rounds.length + 1,
    inputSnapshot: context.session.input,
    appliedFeedbackIds: toolInput.appliedFeedbackIds,
    candidates: [
      ...toolInput.carriedCandidates,
      ...candidates.map((candidate) => ({
        candidateId: candidate.id,
        revision: candidate.revision,
      })),
    ],
    generationRationale: toolInput.generationRationale,
    diversityCheck: toolInput.diversityCheck,
    createdAt,
    source: { kind: 'AGENT' as const, role: 'DISCOVERY' as const },
    redactionStatus: 'NOT_REQUIRED' as const,
  }
  return options.application.executeAgent(
    'DISCOVERY',
    discoverySubmitCandidateRoundCommandSchema.parse({
      schemaVersion: 1,
      kind: 'DISCOVERY_SUBMIT_CANDIDATE_ROUND',
      correlationId: toolInput.correlationId,
      actor: { kind: 'AGENT', role: 'DISCOVERY' },
      idempotencyKey: toolInput.idempotencyKey,
      expectedSessionRevision: toolInput.expectedSessionRevision,
      round,
      candidates,
    }),
  )
}

async function submitCandidateMergeFromTool(options: RoleBoundMcpServerOptions, input: unknown) {
  const toolInput = discoverySubmitCandidateMergeToolInputSchema.parse(input)
  const contextResult = await options.application.executeAgent('DISCOVERY', {
    schemaVersion: 1,
    kind: 'DISCOVERY_GET_CONTEXT',
    correlationId: toolInput.correlationId,
    actor: { kind: 'AGENT', role: 'DISCOVERY' },
    projectId: toolInput.projectId,
    discoverySessionId: toolInput.discoverySessionId,
  })
  if (!contextResult.success) return contextResult
  const context = discoveryContextSchema.parse(contextResult.data)
  const appliedFeedbackIds = new Set(context.rounds.flatMap((round) => round.appliedFeedbackIds))
  const pendingFeedback = context.feedback.filter(
    (feedback) => !appliedFeedbackIds.has(feedback.id),
  )
  const merge = pendingFeedback.length === 1 ? pendingFeedback[0] : undefined
  if (merge?.intent !== 'MERGE') {
    return options.application.executeAgent('DISCOVERY', {
      schemaVersion: 1,
      kind: 'DISCOVERY_SUBMIT_CANDIDATE_ROUND',
      correlationId: toolInput.correlationId,
      actor: { kind: 'AGENT', role: 'DISCOVERY' },
      idempotencyKey: toolInput.idempotencyKey,
      expectedSessionRevision: toolInput.expectedSessionRevision,
      round: {},
      candidates: [],
    })
  }
  const firstTarget = merge.targets[0]
  if (firstTarget === undefined) throw new TypeError('MERGE feedback has no first target')
  const { candidate, ...roundInput } = toolInput
  return submitCandidateRoundFromTool(options, {
    ...roundInput,
    appliedFeedbackIds: [merge.id],
    carriedCandidates: [],
    candidates: [
      {
        lineage: {
          kind: 'REVISION',
          candidateId: firstTarget.candidateId,
          revision: firstTarget.revision + 1,
          parentRevisions: merge.targets,
        },
        ...candidate,
      },
    ],
  })
}

async function submitLearningSpecFromTool(options: RoleBoundMcpServerOptions, input: unknown) {
  const toolInput = discoverySubmitLearningSpecToolInputSchema.parse(input)
  const contextResult = await options.application.executeAgent('DISCOVERY', {
    schemaVersion: 1,
    kind: 'DISCOVERY_GET_CONTEXT',
    correlationId: toolInput.correlationId,
    actor: { kind: 'AGENT', role: 'DISCOVERY' },
    projectId: toolInput.projectId,
    discoverySessionId: toolInput.discoverySessionId,
  })
  if (!contextResult.success) return contextResult
  const context = discoveryContextSchema.parse(contextResult.data)
  const selection = [...context.feedback].reverse().find((feedback) => feedback.intent === 'SELECT')
  const selectedCandidate = selection?.targets[0]
  if (selectedCandidate === undefined) {
    return options.application.executeAgent('DISCOVERY', {
      schemaVersion: 1,
      kind: 'DISCOVERY_SUBMIT_LEARNING_SPEC',
      correlationId: toolInput.correlationId,
      actor: { kind: 'AGENT', role: 'DISCOVERY' },
      idempotencyKey: toolInput.idempotencyKey,
      expectedSessionRevision: toolInput.expectedSessionRevision,
      expectedSpecRevision: toolInput.expectedSpecRevision,
      learningSpec: {},
    })
  }
  const now = (options.now ?? (() => new Date()))().toISOString()
  const generateId =
    options.generateId ??
    ((
      prefix: 'candidate' | 'candidate_round' | 'learning_spec' | 'context' | 'completion_report',
    ) => `${prefix}_${randomUUID()}`)
  const current = context.learningSpec
  const learningSpec = {
    schemaVersion: 1 as const,
    id: current?.id ?? generateId('learning_spec'),
    projectId: toolInput.projectId,
    correlationId: toolInput.correlationId,
    revision: current === null ? 1 : current.revision + 1,
    ...(current === null ? {} : { parentRevision: current.revision }),
    selectedCandidate,
    ...toolInput.draft,
    status: 'DRAFT' as const,
    createdAt: current?.createdAt ?? now,
    updatedAt: now,
    source: { kind: 'AGENT' as const, role: 'DISCOVERY' as const },
    redactionStatus: 'NOT_REQUIRED' as const,
  }
  return options.application.executeAgent(
    'DISCOVERY',
    discoverySubmitLearningSpecCommandSchema.parse({
      schemaVersion: 1,
      kind: 'DISCOVERY_SUBMIT_LEARNING_SPEC',
      correlationId: toolInput.correlationId,
      actor: { kind: 'AGENT', role: 'DISCOVERY' },
      idempotencyKey: toolInput.idempotencyKey,
      expectedSessionRevision: toolInput.expectedSessionRevision,
      expectedSpecRevision: toolInput.expectedSpecRevision,
      learningSpec,
    }),
  )
}

async function updateLiveContextFromTool(options: RoleBoundMcpServerOptions, input: unknown) {
  const toolInput = builderUpdateLiveContextToolInputSchema.parse(input)
  const contextResult = await options.application.executeAgent('BUILDER', {
    schemaVersion: 1,
    kind: 'BUILDER_GET_TASK',
    correlationId: toolInput.correlationId,
    actor: { kind: 'AGENT', role: 'BUILDER' },
    projectId: toolInput.projectId,
    taskId: toolInput.taskId,
  })
  if (!contextResult.success) return contextResult
  const taskContext = builderTaskContextSchema.parse(contextResult.data)
  const generateId =
    options.generateId ??
    ((
      prefix: 'candidate' | 'candidate_round' | 'learning_spec' | 'context' | 'completion_report',
    ) => `${prefix}_${randomUUID()}`)
  const context = {
    schemaVersion: 1 as const,
    id:
      taskContext.liveContext?.id ??
      (options.generateId === undefined
        ? deterministicId('context', toolInput.idempotencyKey)
        : generateId('context')),
    projectId: toolInput.projectId,
    taskId: toolInput.taskId,
    correlationId: toolInput.correlationId,
    contextVersion: toolInput.expectedPreviousVersion + 1,
    expectedPreviousVersion: toolInput.expectedPreviousVersion,
    checkpoint: toolInput.checkpoint,
    stage: toolInput.stage,
    currentGoal: toolInput.currentGoal,
    recentChanges: toolInput.recentChanges,
    activeDecisionIds: toolInput.activeDecisionIds,
    activeConceptNames: toolInput.activeConceptNames,
    relatedFiles: toolInput.relatedFiles,
    nextActions: toolInput.nextActions,
    ...(toolInput.blockingReason === undefined ? {} : { blockingReason: toolInput.blockingReason }),
    updatedAt:
      taskContext.liveContext?.contextVersion === toolInput.expectedPreviousVersion + 1
        ? taskContext.liveContext.updatedAt
        : (options.now ?? (() => new Date()))().toISOString(),
    source: { kind: 'AGENT' as const, role: 'BUILDER' as const },
    redactionStatus: 'VERIFIED_REDACTED' as const,
  }
  return options.application.executeAgent(
    'BUILDER',
    builderUpdateLiveContextCommandSchema.parse({
      schemaVersion: 1,
      kind: 'BUILDER_UPDATE_LIVE_CONTEXT',
      correlationId: toolInput.correlationId,
      actor: { kind: 'AGENT', role: 'BUILDER' },
      idempotencyKey: toolInput.idempotencyKey,
      context,
    }),
  )
}

async function requestDecisionFromTool(options: RoleBoundMcpServerOptions, input: unknown) {
  const toolInput = builderRequestDecisionToolInputSchema.parse(input)
  return options.application.executeAgent(
    'BUILDER',
    builderRequestDecisionCommandSchema.parse({
      schemaVersion: 1,
      kind: 'BUILDER_REQUEST_DECISION',
      correlationId: toolInput.correlationId,
      actor: { kind: 'AGENT', role: 'BUILDER' },
      idempotencyKey: toolInput.idempotencyKey,
      projectId: toolInput.projectId,
      taskId: toolInput.taskId,
      expectedTaskRevision: toolInput.expectedTaskRevision,
      expectedContextVersion: toolInput.expectedContextVersion,
      decision: toolInput.decision,
      context: toolInput.context,
    }),
  )
}

async function applyDecisionFromTool(options: RoleBoundMcpServerOptions, input: unknown) {
  const toolInput = builderApplyDecisionToolInputSchema.parse(input)
  return options.application.executeAgent(
    'BUILDER',
    builderApplyDecisionCommandSchema.parse({
      schemaVersion: 1,
      kind: 'BUILDER_APPLY_DECISION',
      correlationId: toolInput.correlationId,
      actor: { kind: 'AGENT', role: 'BUILDER' },
      idempotencyKey: toolInput.idempotencyKey,
      projectId: toolInput.projectId,
      taskId: toolInput.taskId,
      decisionId: toolInput.decisionId,
      expectedTaskRevision: toolInput.expectedTaskRevision,
      expectedContextVersion: toolInput.expectedContextVersion,
      appliedResult: toolInput.appliedResult,
      sourceReferences: toolInput.sourceReferences,
      context: toolInput.context,
    }),
  )
}

async function resolveDecisionFromChatTool(options: RoleBoundMcpServerOptions, input: unknown) {
  const toolInput = builderResolveDecisionFromChatToolInputSchema.parse(input)
  return options.application.executeAgent(
    'BUILDER',
    builderResolveDecisionFromChatCommandSchema.parse({
      schemaVersion: 1,
      kind: 'BUILDER_RESOLVE_DECISION_FROM_CHAT',
      correlationId: toolInput.correlationId,
      actor: { kind: 'AGENT', role: 'BUILDER' },
      idempotencyKey: toolInput.idempotencyKey,
      projectId: toolInput.projectId,
      taskId: toolInput.taskId,
      decisionId: toolInput.decisionId,
      selection: toolInput.selection,
      citedUserMessages: toolInput.citedUserMessages,
      ...(toolInput.rationaleQuote === undefined
        ? {}
        : { rationaleQuote: toolInput.rationaleQuote }),
    }),
  )
}

async function completeTaskFromTool(options: RoleBoundMcpServerOptions, input: unknown) {
  const toolInput = builderCompleteTaskToolInputSchema.parse(input)
  const contextResult = await options.application.executeAgent('BUILDER', {
    schemaVersion: 1,
    kind: 'BUILDER_GET_TASK',
    correlationId: toolInput.correlationId,
    actor: { kind: 'AGENT', role: 'BUILDER' },
    projectId: toolInput.projectId,
    taskId: toolInput.taskId,
  })
  if (!contextResult.success) return contextResult
  const taskContext = builderTaskContextSchema.parse(contextResult.data)
  const generateId =
    options.generateId ??
    ((
      prefix: 'candidate' | 'candidate_round' | 'learning_spec' | 'context' | 'completion_report',
    ) => `${prefix}_${randomUUID()}`)
  const report = {
    schemaVersion: 1 as const,
    id:
      options.generateId === undefined
        ? deterministicId('completion_report', toolInput.idempotencyKey)
        : generateId('completion_report'),
    projectId: toolInput.projectId,
    taskId: toolInput.taskId,
    correlationId: toolInput.correlationId,
    expectedTaskRevision: toolInput.expectedTaskRevision,
    ...toolInput.report,
    completedAt:
      taskContext.liveContext?.checkpoint === 'TASK_COMPLETED'
        ? taskContext.liveContext.updatedAt
        : (options.now ?? (() => new Date()))().toISOString(),
    source: { kind: 'AGENT' as const, role: 'BUILDER' as const },
    redactionStatus: 'VERIFIED_REDACTED' as const,
  }
  return options.application.executeAgent(
    'BUILDER',
    builderCompleteTaskCommandSchema.parse({
      schemaVersion: 1,
      kind: 'BUILDER_COMPLETE_TASK',
      correlationId: toolInput.correlationId,
      actor: { kind: 'AGENT', role: 'BUILDER' },
      idempotencyKey: toolInput.idempotencyKey,
      report,
    }),
  )
}

function toolResult(result: Awaited<ReturnType<ApplicationService['executeAgent']>>) {
  const payload = toJsonObject(result.success ? result.data : result.error)
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(payload) }],
    structuredContent: payload,
    ...(result.success ? {} : { isError: true }),
  }
}

/** Registers the Kiro chat Builder tools; every call is scoped to the binding's Task. */
function registerKiroChatTools(server: McpServer, options: RoleBoundMcpServerOptions): void {
  const binding = options.binding
  if (options.role !== 'BUILDER' || binding?.taskId === undefined) {
    throw new TypeError('KIRO_CHAT_SURFACE_REQUIRES_BUILDER_TASK_BINDING')
  }
  const taskId = binding.taskId
  const selected = options.toolNames === undefined ? null : new Set(options.toolNames)
  if (
    selected !== null &&
    [...selected].some((name) => !KIRO_CHAT_BUILDER_TOOL_NAMES.includes(name))
  )
    throw new TypeError('Unknown Kiro chat MCP tool selection')
  for (const tool of KIRO_CHAT_BUILDER_TOOLS.filter(
    (candidate) => selected === null || selected.has(candidate.name),
  )) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: {
          readOnlyHint: tool.readOnly,
          destructiveHint: false,
          idempotentHint: tool.readOnly,
          openWorldHint: false,
        },
      },
      async (input) => {
        if (!binding.isActive()) {
          return toolResult({
            success: false,
            error: createOperationError({
              category: 'PERMISSION',
              code: 'AGENT_RUN_SCOPE_MISMATCH',
              disposition: 'PERMANENT',
              correlationId: binding.correlationId,
              message: 'This Vibe Helper connection is no longer active.',
            }),
          })
        }
        const parsed = tool.inputSchema.parse(input) as Record<string, unknown>
        return toolResult(
          await options.application.executeAgent('BUILDER', {
            schemaVersion: 1,
            correlationId: binding.correlationId,
            actor: { kind: 'AGENT', role: 'BUILDER' },
            projectId: binding.projectId,
            taskId,
            ...(tool.readOnly ? {} : { idempotencyKey: `idem_${randomUUID()}` }),
            ...tool.command(parsed),
          }),
        )
      },
    )
  }
}

export function createRoleBoundMcpServer(options: RoleBoundMcpServerOptions): McpServer {
  const server = new McpServer({
    name: `vibe-helper-${options.role.toLowerCase().replace('_', '-')}`,
    version: '0.0.0',
  })

  if (options.surface === 'KIRO_CHAT') {
    registerKiroChatTools(server, options)
    return server
  }

  const roleTools = ROLE_TOOL_CATALOG[options.role]
  const selectedToolNames = options.toolNames === undefined ? null : new Set(options.toolNames)
  if (
    selectedToolNames !== null &&
    [...selectedToolNames].some((name) => !roleTools.some((tool) => tool.name === name))
  ) {
    throw new TypeError(`Unknown ${options.role} MCP tool selection`)
  }

  for (const tool of roleTools.filter(
    (candidate) => selectedToolNames === null || selectedToolNames.has(candidate.name),
  )) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: {
          readOnlyHint: tool.readOnly,
          destructiveHint: false,
          idempotentHint: tool.readOnly,
          openWorldHint: false,
        },
      },
      async (input) => {
        const binding = options.binding
        const scope =
          typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {}
        if (
          binding !== undefined &&
          (!binding.isActive() ||
            scope.projectId !== binding.projectId ||
            scope.correlationId !== binding.correlationId ||
            (binding.discoverySessionId !== undefined &&
              scope.discoverySessionId !== binding.discoverySessionId) ||
            (binding.taskId !== undefined && scope.taskId !== binding.taskId))
        ) {
          const payload = toJsonObject(
            createOperationError({
              category: 'PERMISSION',
              code: 'AGENT_RUN_SCOPE_MISMATCH',
              disposition: 'PERMANENT',
              correlationId: binding.correlationId,
              message: 'Agent run is inactive or does not own the requested Core scope.',
            }),
          )
          return {
            content: [{ type: 'text', text: JSON.stringify(payload) }],
            structuredContent: payload,
            isError: true,
          }
        }
        const result =
          options.role === 'DISCOVERY' && tool.name === 'submit_candidate_previews'
            ? await submitCandidatePreviewsFromTool(options, input)
            : options.role === 'DISCOVERY' && tool.name === 'submit_candidate_enrichments'
              ? await submitCandidateEnrichmentsFromTool(options, input)
              : options.role === 'DISCOVERY' && tool.name === 'submit_candidate_round'
                ? await submitCandidateRoundFromTool(options, input)
                : options.role === 'DISCOVERY' && tool.name === 'submit_candidate_merge'
                  ? await submitCandidateMergeFromTool(options, input)
                  : options.role === 'DISCOVERY' && tool.name === 'submit_learning_spec'
                    ? await submitLearningSpecFromTool(options, input)
                    : options.role === 'BUILDER' && tool.name === 'update_build_context'
                      ? await updateLiveContextFromTool(options, input)
                      : options.role === 'BUILDER' && tool.name === 'request_user_decision'
                        ? await requestDecisionFromTool(options, input)
                        : options.role === 'BUILDER' && tool.name === 'apply_decision_result'
                          ? await applyDecisionFromTool(options, input)
                          : options.role === 'BUILDER' && tool.name === 'resolve_decision_from_chat'
                            ? await resolveDecisionFromChatTool(options, input)
                            : options.role === 'BUILDER' && tool.name === 'complete_task'
                              ? await completeTaskFromTool(options, input)
                              : await options.application.executeAgent(options.role, input)
        const payload = toJsonObject(result.success ? result.data : result.error)
        return {
          content: [{ type: 'text', text: JSON.stringify(payload) }],
          structuredContent: payload,
          ...(result.success ? {} : { isError: true }),
        }
      },
    )
  }

  return server
}
