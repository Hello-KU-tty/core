import { McpServer, type JSONObject } from '@modelcontextprotocol/server'
import type { ApplicationService } from '@vibe-helper/application'
import {
  analystGetEpisodeContextQuerySchema,
  analystSubmitEvidenceProposalsCommandSchema,
  builderCompleteTaskCommandSchema,
  builderGetDecisionResultQuerySchema,
  builderGetTaskQuerySchema,
  builderRequestDecisionCommandSchema,
  builderStartTaskCommandSchema,
  builderUpdateLiveContextCommandSchema,
  discoveryGetContextQuerySchema,
  discoverySubmitCandidateRoundCommandSchema,
  discoverySubmitLearningSpecCommandSchema,
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
      description: 'Submit a version-checked Candidate Round proposal.',
      inputSchema: discoverySubmitCandidateRoundCommandSchema,
      readOnly: false,
    },
    {
      name: 'submit_learning_spec',
      title: 'Submit Learning Spec',
      description: 'Submit a draft Learning Spec for the selected Candidate revision.',
      inputSchema: discoverySubmitLearningSpecCommandSchema,
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
      inputSchema: builderUpdateLiveContextCommandSchema,
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
      inputSchema: builderCompleteTaskCommandSchema,
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
}

function toJsonObject(value: unknown): JSONObject {
  const parsed: unknown = JSON.parse(JSON.stringify(value))
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new TypeError('MCP application response must be a JSON object')
  }
  return parsed as JSONObject
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
        const result = await options.application.executeAgent(options.role, input)
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
