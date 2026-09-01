import { createHash, randomUUID } from 'node:crypto'

import { McpServer, type JSONObject } from '@modelcontextprotocol/server'
import type { ApplicationService } from '@vibe-helper/application'
import {
  analystGetEpisodeContextQuerySchema,
  analystSubmitEvidenceProposalsCommandSchema,
  builderCompleteTaskToolInputSchema,
  builderCompleteTaskCommandSchema,
  builderGetDecisionResultQuerySchema,
  builderGetTaskQuerySchema,
  builderRequestDecisionCommandSchema,
  builderStartTaskCommandSchema,
  builderTaskContextSchema,
  builderUpdateLiveContextToolInputSchema,
  builderUpdateLiveContextCommandSchema,
  discoveryGetContextQuerySchema,
  discoveryContextSchema,
  discoverySubmitCandidateRoundCommandSchema,
  discoverySubmitCandidateRoundToolInputSchema,
  discoverySubmitLearningSpecCommandSchema,
  discoverySubmitLearningSpecToolInputSchema,
  helperGetContextQuerySchema,
  helperRequestContextRefreshCommandSchema,
  type AgentRole,
} from '@vibe-helper/contracts'
import type { z } from 'zod'

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
      name: 'submit_candidate_round',
      title: 'Submit Candidate Round',
      description:
        'Submit Candidate meaning and lineage; the role-bound adapter supplies trusted record metadata.',
      inputSchema: discoverySubmitCandidateRoundToolInputSchema,
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
      inputSchema: builderRequestDecisionCommandSchema,
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

export interface RoleBoundMcpServerOptions {
  readonly role: AgentRole
  readonly application: ApplicationService
  readonly now?: () => Date
  readonly generateId?: (
    prefix: 'candidate' | 'candidate_round' | 'learning_spec' | 'context' | 'completion_report',
  ) => string
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

async function submitCandidateRoundFromTool(options: RoleBoundMcpServerOptions, input: unknown) {
  const toolInput = discoverySubmitCandidateRoundToolInputSchema.parse(input)
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
    ((
      prefix: 'candidate' | 'candidate_round' | 'learning_spec' | 'context' | 'completion_report',
    ) => `${prefix}_${randomUUID()}`)
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

export function createRoleBoundMcpServer(options: RoleBoundMcpServerOptions): McpServer {
  const server = new McpServer({
    name: `vibe-helper-${options.role.toLowerCase().replace('_', '-')}`,
    version: '0.0.0',
  })

  for (const tool of ROLE_TOOL_CATALOG[options.role]) {
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
        const result =
          options.role === 'DISCOVERY' && tool.name === 'submit_candidate_round'
            ? await submitCandidateRoundFromTool(options, input)
            : options.role === 'DISCOVERY' && tool.name === 'submit_learning_spec'
              ? await submitLearningSpecFromTool(options, input)
              : options.role === 'BUILDER' && tool.name === 'update_build_context'
                ? await updateLiveContextFromTool(options, input)
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
