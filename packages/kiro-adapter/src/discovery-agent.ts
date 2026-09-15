import {
  type CommandReceipt,
  commandReceiptSchema,
  type DiscoveryContext,
  discoveryContextSchema,
  discoveryGetContextQuerySchema,
  discoverySubmitCandidateEnrichmentsToolInputSchema,
  discoverySubmitCandidateMergeToolInputSchema,
  discoverySubmitCandidatePreviewsToolInputSchema,
  discoverySubmitCandidateRoundToolInputSchema,
  discoverySubmitLearningSpecToolInputSchema,
  type LearningSpecRevision,
} from '@vibe-helper/contracts'

export const DISCOVERY_PROMPT_VERSION = '1.3.5' as const
export const DISCOVERY_PROMPT_SOURCE = 'docs/agent-prompts/discovery.md' as const
export const DISCOVERY_AGENT_NAME = 'vibe-helper-discovery' as const
export const DISCOVERY_MCP_SERVER_NAME = 'vibe-helper-discovery-core' as const
export const DISCOVERY_TOOL_NAMES = [
  'get_discovery_context',
  'submit_candidate_previews',
  'submit_candidate_enrichments',
  'submit_candidate_round',
  'submit_candidate_merge',
  'submit_learning_spec',
] as const

export type DiscoveryToolName = (typeof DISCOVERY_TOOL_NAMES)[number]

export interface DiscoveryAgentDefinition {
  readonly name: typeof DISCOVERY_AGENT_NAME
  readonly description: string
  readonly promptVersion: typeof DISCOVERY_PROMPT_VERSION
  readonly promptSource: typeof DISCOVERY_PROMPT_SOURCE
  readonly prompt: string
  readonly includeMcpJson: false
  readonly tools: readonly [`@${typeof DISCOVERY_MCP_SERVER_NAME}`]
  readonly allowedTools: readonly [`@${typeof DISCOVERY_MCP_SERVER_NAME}`]
}

export interface DiscoveryToolCaller {
  callTool(name: DiscoveryToolName, input: unknown): Promise<unknown>
}

export class DiscoveryAgentAdapterError extends Error {
  readonly code: 'INVALID_PROMPT' | 'TOOL_ERROR' | 'INVALID_TOOL_RESPONSE'

  constructor(code: DiscoveryAgentAdapterError['code'], message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'DiscoveryAgentAdapterError'
    this.code = code
  }
}

function promptVersion(prompt: string): string | null {
  return prompt.match(/^> Prompt version: `([^`]+)`$/m)?.[1] ?? null
}

export function createDiscoveryAgentDefinition(prompt: string): DiscoveryAgentDefinition {
  if (promptVersion(prompt) !== DISCOVERY_PROMPT_VERSION) {
    throw new DiscoveryAgentAdapterError(
      'INVALID_PROMPT',
      `Discovery prompt must declare version ${DISCOVERY_PROMPT_VERSION}.`,
    )
  }
  return {
    name: DISCOVERY_AGENT_NAME,
    description: 'Generates and refines project Candidates through the bounded Discovery Core.',
    promptVersion: DISCOVERY_PROMPT_VERSION,
    promptSource: DISCOVERY_PROMPT_SOURCE,
    prompt,
    includeMcpJson: false,
    tools: [`@${DISCOVERY_MCP_SERVER_NAME}`],
    allowedTools: [`@${DISCOVERY_MCP_SERVER_NAME}`],
  }
}

function unwrapToolResponse(value: unknown): unknown {
  if (typeof value !== 'object' || value === null) return value
  if ('isError' in value && value.isError === true) {
    throw new DiscoveryAgentAdapterError('TOOL_ERROR', 'Discovery Core tool returned an error.')
  }
  if ('structuredContent' in value) return value.structuredContent
  return value
}

function parseToolResponse<T>(
  value: unknown,
  schema: { safeParse(input: unknown): { success: true; data: T } | { success: false } },
): T {
  const parsed = schema.safeParse(unwrapToolResponse(value))
  if (!parsed.success) {
    throw new DiscoveryAgentAdapterError(
      'INVALID_TOOL_RESPONSE',
      'Discovery Core tool returned an invalid response.',
    )
  }
  return parsed.data
}

export class DiscoveryAgentToolAdapter {
  readonly #caller: DiscoveryToolCaller

  constructor(caller: DiscoveryToolCaller) {
    this.#caller = caller
  }

  async getContext(input: unknown): Promise<DiscoveryContext> {
    const request = discoveryGetContextQuerySchema.parse(input)
    const response = await this.#caller.callTool('get_discovery_context', request)
    return parseToolResponse(response, discoveryContextSchema)
  }

  async submitCandidateRound(input: unknown): Promise<CommandReceipt> {
    const request = discoverySubmitCandidateRoundToolInputSchema.parse(input)
    const response = await this.#caller.callTool('submit_candidate_round', request)
    return parseToolResponse(response, commandReceiptSchema)
  }

  async submitCandidatePreviews(input: unknown): Promise<CommandReceipt> {
    const request = discoverySubmitCandidatePreviewsToolInputSchema.parse(input)
    const response = await this.#caller.callTool('submit_candidate_previews', request)
    return parseToolResponse(response, commandReceiptSchema)
  }

  async submitCandidateEnrichments(input: unknown): Promise<CommandReceipt> {
    const request = discoverySubmitCandidateEnrichmentsToolInputSchema.parse(input)
    const response = await this.#caller.callTool('submit_candidate_enrichments', request)
    return parseToolResponse(response, commandReceiptSchema)
  }

  async submitCandidateMerge(input: unknown): Promise<CommandReceipt> {
    const request = discoverySubmitCandidateMergeToolInputSchema.parse(input)
    const response = await this.#caller.callTool('submit_candidate_merge', request)
    return parseToolResponse(response, commandReceiptSchema)
  }

  async submitLearningSpec(input: unknown): Promise<CommandReceipt> {
    const request = discoverySubmitLearningSpecToolInputSchema.parse(input)
    const response = await this.#caller.callTool('submit_learning_spec', request)
    return parseToolResponse(response, commandReceiptSchema)
  }
}

export type DiscoveryLearningSpecDraft = Extract<LearningSpecRevision, { status: 'DRAFT' }>
